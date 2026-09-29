// npm run dados:demo       → conjunto pequeno para demonstração (últimos 60 dias)
// npm run dados:desempenho → 12 meses para medir o RNF03 (padrão: 50 motoristas)
//
// Segurança e repetibilidade:
//  - usa DADOS_DATABASE_URL (ou DATABASE_URL) e RECUSA rodar se o banco já tiver roteiros;
//  - aplica as migrações pendentes (somente para frente; nunca apaga dados);
//  - gerador pseudoaleatório com semente fixa: a mesma execução gera os mesmos dados;
//  - tempos, totais e custos usam as MESMAS funções de domínio do sistema (shared/calculos.js).
// Os dados são fictícios. A senha dos usuários de demonstração vem de DEMO_SENHA (obrigatória,
// definida só na sessão do terminal — nunca no .env de produção). Recusa NODE_ENV=production.
//
// Parâmetros: --modo demo|desempenho  --motoristas N  --meses N  --fim AAAA-MM-DD  --semente N

import { parseArgs } from 'node:util';
import { carregarConfig } from '../src/server/config.js';
import { migrar } from '../src/server/db/migrador.js';
import { criarPool, emTransacao } from '../src/server/db/pool.js';
import { registrarAuditoria } from '../src/server/shared/auditoria.js';
import { calcularCusto, dataLocal, tempoParadoSeg, totaisDoRoteiro } from '../src/server/shared/calculos.js';
import { gerarHashSenha } from '../src/server/shared/senha.js';

const { values: args } = parseArgs({
  options: {
    modo: { type: 'string', default: 'demo' },
    motoristas: { type: 'string' },
    meses: { type: 'string' },
    fim: { type: 'string' },
    semente: { type: 'string', default: '20260929' },
  },
});

const config = carregarConfig();
const DEMO = args.modo === 'demo';
const MOTORISTAS = Number(args.motoristas ?? (DEMO ? 4 : 50));
const MESES = Number(args.meses ?? (DEMO ? 2 : 12));
// Demo termina ONTEM: o dia de hoje fica livre para a demonstração ao vivo (custo, coleta, parâmetros).
const HOJE = dataLocal(new Date(), config.fusoHorario);
const FIM = args.fim ?? (DEMO ? somarDiasSimples(HOJE, -1) : HOJE);
function somarDiasSimples(aaaaMmDd, dias) {
  const d = new Date(`${aaaaMmDd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const SENHA = process.env.DEMO_SENHA;
if (config.ambiente === 'production') {
  console.error('Dados sintéticos não podem ser gerados com NODE_ENV=production.');
  process.exit(1);
}
if (!SENHA || SENHA.length < 8) {
  console.error('Defina DEMO_SENHA (mínimo 8 caracteres) na sessão do terminal antes de gerar os dados.');
  process.exit(1);
}
const URL_BANCO = process.env.DADOS_DATABASE_URL || config.databaseUrl;

// mulberry32: determinístico a partir da semente.
let estado = Number(args.semente) >>> 0;
function aleatorio() {
  estado = (estado + 0x6d2b79f5) >>> 0;
  let t = estado;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const inteiro = (min, max) => min + Math.floor(aleatorio() * (max - min + 1));
const escolher = (lista) => lista[Math.floor(aleatorio() * lista.length)];

const RUAS = ['Rua da Bahia', 'Av. Afonso Pena', 'Rua Espírito Santo', 'Av. Amazonas', 'Rua Guajajaras', 'Rua dos Timbiras',
  'Av. do Contorno', 'Rua São Paulo', 'Rua Tupis', 'Av. Augusto de Lima', 'Rua Curitiba', 'Rua Rio de Janeiro',
  'Av. Brasil', 'Rua Pernambuco', 'Rua Sergipe', 'Av. Getúlio Vargas', 'Rua Aimorés', 'Rua Goitacazes'];
const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Heitor', 'Íris', 'Júlio', 'Karen', 'Lucas',
  'Marina', 'Nicolas', 'Olívia', 'Paulo', 'Quitéria', 'Rafael', 'Sofia', 'Tiago', 'Úrsula', 'Vítor', 'Wanda', 'Yuri'];
const SOBRENOMES = ['Silva', 'Souza', 'Oliveira', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo'];

function somarDias(aaaaMmDd, dias) {
  const d = new Date(`${aaaaMmDd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
// Instante de uma hora local (fuso -03:00, sem horário de verão desde 2019).
const instanteLocal = (data, minutosDoDia) =>
  new Date(`${data}T${String(Math.floor(minutosDoDia / 60)).padStart(2, '0')}:${String(minutosDoDia % 60).padStart(2, '0')}:00-03:00`);

async function inserirUsuario(db, { nome, email, perfil, hash, telefone }) {
  const { rows } = await db.query(
    'insert into usuario (nome, email, telefone, perfil, senha_hash) values ($1, $2, $3, $4, $5) returning id',
    [nome, email, telefone ?? null, perfil, hash],
  );
  return rows[0].id;
}

async function principal() {
  const pool = criarPool(URL_BANCO);
  try {
    await migrar(pool);
    const { rows: [{ n }] } = await pool.query('select count(*) as n from roteiro');
    if (n > 0) {
      throw new Error(`O banco já tem ${n} roteiro(s). Os dados sintéticos só são gerados em banco sem roteiros (use um banco separado).`);
    }
    const inicio = somarDias(FIM, -Math.round(MESES * 30.44) + 1);
    const meio = somarDias(inicio, Math.floor((Date.parse(FIM) - Date.parse(inicio)) / 86_400_000 / 2));
    console.log(`Gerando modo=${args.modo}, ${MOTORISTAS} motoristas, ${inicio} a ${FIM}, semente ${args.semente}...`);
    const hash = await gerarHashSenha(SENHA);
    const t0 = Date.now();

    const base = await emTransacao(pool, async (db) => {
      const adminId = await inserirUsuario(db, { nome: 'Administração Demo', email: 'admin@demo.rotaclara', perfil: 'admin', hash });
      // Duas versões de parâmetros: a segunda muda jornada e combustível no meio do período.
      const { rows: [p2] } = await db.query(
        `insert into parametro_sistema (versao, vigente_desde, jornada_min, valor_combustivel, criado_por)
         values ((select max(versao) + 1 from parametro_sistema), $1, 480, 6.000, $2) returning id`, [inicio, adminId]);
      const { rows: [p3] } = await db.query(
        `insert into parametro_sistema (versao, vigente_desde, jornada_min, valor_combustivel, criado_por)
         values ((select max(versao) + 1 from parametro_sistema), $1, 420, 6.290, $2) returning id`, [meio, adminId]);
      const equipes = [];
      const gerentes = [];
      const numEquipes = Math.max(2, Math.ceil(MOTORISTAS / 12));
      for (let e = 0; e < numEquipes; e += 1) {
        const g = await inserirUsuario(db, { nome: `Gerente ${escolher(NOMES)} ${String.fromCharCode(65 + e)}`, email: `gerente${e + 1}@demo.rotaclara`, perfil: 'gerente', hash });
        const { rows: [{ id }] } = await db.query('insert into equipe (nome, gerente_id) values ($1, $2) returning id', [`Equipe ${['Centro', 'Norte', 'Sul', 'Leste', 'Oeste', 'Pampulha'][e % 6]}${e >= 6 ? ` ${e}` : ''}`, g]);
        equipes.push(id);
        gerentes.push(g);
      }
      const veiculos = [];
      for (let v = 0; v < MOTORISTAS; v += 1) {
        const { rows: [{ id }] } = await db.query(
          'insert into veiculo (placa, descricao, rendimento_km_l) values ($1, $2, $3) returning id',
          [`DEM${String(v).padStart(4, '0')}`, v % 3 === 0 ? 'Carro utilitário' : 'Moto de entrega', v % 3 === 0 ? (9 + inteiro(0, 300) / 100).toFixed(2) : (28 + inteiro(0, 900) / 100).toFixed(2)]);
        veiculos.push({ id, rendimento: null });
      }
      const { rows: vs } = await db.query('select id, rendimento_km_l from veiculo where id = any($1::bigint[])', [veiculos.map((v) => v.id)]);
      const rendimento = new Map(vs.map((v) => [v.id, v.rendimento_km_l]));
      const motoristas = [];
      for (let m = 0; m < MOTORISTAS; m += 1) {
        const nome = `${NOMES[m % NOMES.length]} ${escolher(SOBRENOMES)}`;
        const id = await inserirUsuario(db, { nome, email: null, perfil: 'motorista', hash, telefone: '(31) 90000-0000' });
        const equipeId = equipes[m % equipes.length];
        await db.query('insert into motorista (usuario_id, documento, equipe_id, veiculo_id) values ($1, $2, $3, $4)',
          [id, `DEMO${String(m + 1).padStart(5, '0')}`, equipeId, veiculos[m].id]);
        motoristas.push({ id, equipeId, veiculoId: veiculos[m].id, rendimento: rendimento.get(veiculos[m].id), gerente: gerentes[m % gerentes.length] });
      }
      const pontos = [];
      for (let p = 0; p < Math.max(12, MOTORISTAS * 3); p += 1) {
        const endereco = `${escolher(RUAS)}, ${inteiro(10, 2500)} — Belo Horizonte/MG`;
        const lat = (-19.97 + aleatorio() * 0.12).toFixed(6);
        const lon = (-44.02 + aleatorio() * 0.12).toFixed(6);
        const { rows: [{ id }] } = await db.query(
          'insert into ponto (nome, endereco, latitude, longitude) values ($1, $2, $3, $4) returning id',
          [p === 0 ? 'Centro de distribuição' : `Cliente ${p}`, endereco, lat, lon]);
        pontos.push({ id, endereco, latitude: lat, longitude: lon });
      }
      await registrarAuditoria(db, { usuarioId: adminId, entidade: 'dados_sinteticos', acao: 'carga', novo: { modo: args.modo, motoristas: MOTORISTAS, inicio, fim: FIM, semente: args.semente } });
      return { adminId, p2: { id: p2.id, jornada: 480, combustivel: '6.000' }, p3: { id: p3.id, jornada: 420, combustivel: '6.290' }, motoristas, pontos };
    });

    // Roteiros por mês, cada mês numa transação (gatilhos de ordem verificados no commit).
    let totalRoteiros = 0;
    let totalPontos = 0;
    let data = inicio;
    while (data <= FIM) {
      const mes = data.slice(0, 7);
      await emTransacao(pool, async (db) => {
        while (data <= FIM && data.slice(0, 7) === mes) {
          const domingo = new Date(`${data}T12:00:00Z`).getUTCDay() === 0;
          for (const m of base.motoristas) {
            if (domingo || aleatorio() < 0.12) continue; // folgas
            const quantos = aleatorio() < 0.1 ? 2 : 1; // às vezes dois roteiros no mesmo dia
            for (let k = 0; k < quantos; k += 1) {
              const parametro = data >= meio ? base.p3 : base.p2;
              const ultimoDia = data === FIM;
              const situacao = aleatorio() < 0.02 ? 'cancelado' : ultimoDia && aleatorio() < 0.5 ? 'em_execucao' : 'encerrado';
              const n = inteiro(DEMO ? 3 : 5, DEMO ? 6 : 12);
              const escolhidos = [base.pontos[0], ...Array.from({ length: n - 1 }, () => escolher(base.pontos.slice(1)))];
              let minuto = (k === 0 ? 7 * 60 : 13 * 60) + inteiro(0, 60);
              const ocorrencias = escolhidos.map((p, i) => {
                const chegada = instanteLocal(data, minuto);
                const parada = i === 0 ? inteiro(5, 25) : inteiro(2, 45);
                const incompleto = situacao === 'em_execucao' && i >= n - 2;
                const saida = incompleto && i === n - 1 ? null : instanteLocal(data, minuto + parada);
                const semChegada = situacao === 'em_execucao' && i === n - 1 && aleatorio() < 0.5;
                minuto += parada + inteiro(8, 35);
                return { ordem: i + 1, ponto: p, chegada: semChegada ? null : chegada, saida: semChegada ? null : saida };
              });
              const distancia = (n * inteiro(18, 60) / 10).toFixed(2);
              const custo = calcularCusto({ valorCombustivel: parametro.combustivel, rendimentoKmL: m.rendimento, distanciaKm: distancia });
              const total = totaisDoRoteiro(ocorrencias).totalParadoSeg;
              const fimDia = instanteLocal(data, 20 * 60);
              const { rows: [{ id }] } = await db.query(
                `insert into roteiro (motorista_id, equipe_id, data, situacao, distancia_km, veiculo_id, parametro_id,
                   valor_combustivel, rendimento_km_l, custo_estimado, total_parado_seg, criado_por, iniciado_em,
                   encerrado_em, cancelado_em, criado_em)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
                [m.id, m.equipeId, data, situacao, distancia, m.veiculoId, parametro.id, parametro.combustivel, m.rendimento,
                  custo.custoEstimado, total, m.gerente, ocorrencias[0].chegada,
                  situacao === 'encerrado' ? fimDia : null, situacao === 'cancelado' ? fimDia : null, instanteLocal(somarDias(data, -1), 18 * 60)],
              );
              const valores = [];
              const params = [];
              for (const o of ocorrencias) {
                const b = params.length;
                valores.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`);
                params.push(id, o.ponto.id, o.ordem, o.ponto.endereco, o.ponto.latitude, o.ponto.longitude, o.chegada, o.saida, tempoParadoSeg(o));
              }
              await db.query(
                `insert into roteiro_ponto (roteiro_id, ponto_id, ordem, endereco, latitude, longitude, chegada, saida, tempo_parado_seg)
                 values ${valores.join(',')}`, params);
              totalRoteiros += 1;
              totalPontos += ocorrencias.length;
            }
          }
          data = somarDias(data, 1);
        }
      });
      process.stdout.write(`  ${mes}: ${totalRoteiros} roteiros acumulados\n`);
    }
    await pool.query('analyze');
    console.log(`Concluído em ${((Date.now() - t0) / 1000).toFixed(1)} s: ${totalRoteiros} roteiros, ${totalPontos} ocorrências de pontos.`);
    console.log('Usuários de demonstração (senha = DEMO_SENHA desta sessão):');
    console.log('  admin@demo.rotaclara · gerente1@demo.rotaclara · motorista: documento DEMO00001');
  } finally {
    await pool.end();
  }
}

principal().catch((erro) => {
  console.error(erro.message);
  process.exitCode = 1;
});
