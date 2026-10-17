const { z } = require('zod');

const idParamSchema = z.object({
  id: z.string().regex(/^\d{1,18}$/, 'Id inválido.'),
});

const yearMonthSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

const PASSWORD_MIN = 8;
const NAME_MAX = 120;

function parseId(params) {
  return BigInt(idParamSchema.parse(params).id);
}

function parseYearMonth(query) {
  return yearMonthSchema.parse(query);
}

module.exports = { parseId, parseYearMonth, PASSWORD_MIN, NAME_MAX };
