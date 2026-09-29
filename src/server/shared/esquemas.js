// Fragmentos de JSON Schema usados na validação das rotas (Fastify/AJV).
// Decimais trafegam como texto para não perder precisão.

export const id = { type: 'integer', minimum: 1 };
export const texto = (max, min = 1) => ({ type: 'string', minLength: min, maxLength: max, pattern: '\\S' });
export const textoOpcional = (max) => ({ type: ['string', 'null'], maxLength: max });
export const email = { type: 'string', maxLength: 254, pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' };
export const senha = { type: 'string', minLength: 8, maxLength: 128 };
export const data = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
export const instante = { type: 'string', format: 'date-time' };
export const decimal = (inteiros, casas) => ({
  type: 'string',
  pattern: `^\\d{1,${inteiros}}(\\.\\d{1,${casas}})?$`,
});
export const decimalOpcional = (inteiros, casas) => ({
  anyOf: [decimal(inteiros, casas), { type: 'null' }],
});
export const versao = { type: 'integer', minimum: 1 };

export const paramsId = {
  type: 'object',
  required: ['id'],
  properties: { id },
};

export function objeto(propriedades, obrigatorios = []) {
  return {
    type: 'object',
    additionalProperties: false,
    required: obrigatorios,
    properties: propriedades,
  };
}

// Datas AAAA-MM-DD válidas no calendário (o padrão acima só confere o formato).
export function dataValida(valor) {
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}
