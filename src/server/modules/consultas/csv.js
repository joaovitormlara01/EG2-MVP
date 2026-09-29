// Geração do CSV do histórico (UC12, D16): UTF-8 com BOM, separador ";", fim de linha CRLF,
// decimais com vírgula (abre corretamente no Excel pt-BR).
// Segurança: campos de texto que começam com = + - @ tab ou CR recebem apóstrofo na frente
// (neutraliza fórmulas em planilhas). Aspas, ";" e quebras de linha são escapados.
// Dados pessoais: somente o nome do motorista (sem documento, telefone ou e-mail).

const BOM = String.fromCharCode(0xfeff);
const PERIGOSOS = /^[=+\-@\t\r]/;

export function campoTexto(valor) {
  if (valor === null || valor === undefined) return '';
  let texto = String(valor);
  if (PERIGOSOS.test(texto)) texto = `'${texto}`;
  return escapar(texto);
}

// Números gerados pelo sistema não passam pela neutralização (não são texto do usuário).
function campoNumero(valor) {
  return valor === null || valor === undefined ? '' : escapar(String(valor).replace('.', ','));
}

function escapar(texto) {
  return /[";\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

function formatadorInstante(fusoHorario) {
  const f = new Intl.DateTimeFormat('pt-BR', {
    timeZone: fusoHorario, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  return (iso) => (iso ? f.format(new Date(iso)).replace(',', '') : '');
}

const data = (aaaaMmDd) => {
  const [a, m, d] = aaaaMmDd.split('-');
  return `${d}/${m}/${a}`;
};

// Minutos com 2 casas a partir de segundos inteiros, sem ponto flutuante acumulado.
function minutos(seg) {
  if (seg === null || seg === undefined) return null;
  const centesimos = Math.round((seg * 100) / 60);
  return `${Math.floor(centesimos / 100)}.${String(centesimos % 100).padStart(2, '0')}`;
}

const SITUACAO_ROTEIRO = { em_execucao: 'Em execução', encerrado: 'Encerrado' };
const SITUACAO_PONTO = { pendente: 'Sem chegada', partida: 'Partida', em_andamento: 'Sem saída (incompleto)', concluido: 'Concluído' };

export function gerarCsv({ ocorrencias, totais, filtros, fusoHorario }) {
  const instante = formatadorInstante(fusoHorario);
  const linhas = [];
  const linha = (...campos) => linhas.push(campos.join(';'));

  linha(campoTexto('RotaClara — Histórico de paradas'));
  linha(campoTexto('Período (data do roteiro)'), campoTexto(`${data(filtros.inicio)} a ${data(filtros.fim)}`));
  linha(campoTexto('Fuso dos horários'), campoTexto(fusoHorario));
  linha('');
  linha(...['Data do roteiro', 'Roteiro', 'Situação do roteiro', 'Motorista', 'Equipe', 'Ordem', 'Tipo',
    'Endereço (histórico)', 'Chegada', 'Saída', 'Tempo parado (s)', 'Tempo parado (min)', 'Situação do ponto'].map(campoTexto));
  for (const o of ocorrencias) {
    linha(
      campoTexto(data(o.data)), campoNumero(o.roteiroId), campoTexto(SITUACAO_ROTEIRO[o.situacaoRoteiro] ?? o.situacaoRoteiro),
      campoTexto(o.motorista), campoTexto(o.equipe), campoNumero(o.ordem), campoTexto(o.partida ? 'Partida (não conta)' : 'Parada'),
      campoTexto(o.endereco), campoTexto(instante(o.chegada)), campoTexto(instante(o.saida)),
      campoNumero(o.tempoParadoSeg), campoNumero(minutos(o.tempoParadoSeg)), campoTexto(SITUACAO_PONTO[o.situacao]),
    );
  }
  linha('');
  linha(campoTexto('TOTAIS DO PERÍODO'));
  linha(campoTexto('Ocorrências exportadas'), campoNumero(ocorrencias.length));
  linha(campoTexto('Roteiros (não cancelados, iniciados)'), campoNumero(totais.roteiros));
  linha(campoTexto('Roteiros não encerrados (totais parciais)'), campoNumero(totais.roteirosIncompletos));
  linha(campoTexto('Tempo parado total (s)'), campoNumero(totais.totalParadoSeg));
  linha(campoTexto('Tempo parado total (min)'), campoNumero(minutos(totais.totalParadoSeg)));
  linha(campoTexto('Pares motorista/data com roteiro'), campoNumero(totais.paresMotoristaData));
  linha(campoTexto('Jornada considerada (min) — uma por par motorista/data'), campoNumero(totais.jornadaMinTotal));
  linha(campoTexto('Percentual da jornada (%)'), totais.percentualJornada === null ? campoTexto('Não disponível') : campoNumero(totais.percentualJornada));
  linha(campoTexto('Custo estimado (R$)'), totais.custo.estimado === null ? campoTexto('Não disponível') : campoNumero(totais.custo.estimado));
  linha(campoTexto('Roteiros sem custo disponível'), campoNumero(totais.custo.roteirosSemCusto));
  return `${BOM}${linhas.join('\r\n')}\r\n`;
}
