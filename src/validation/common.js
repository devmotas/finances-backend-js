const { z } = require('zod');

const NAME_MIN = 2;
const NAME_MAX = 120;
const CATEGORY_NAME_MAX = 120;
const DESCRIPTION_MAX = 500;
const PASSWORD_MIN = 8;
const PREFERENCE_MONTHS_MAX = 120;
const SERIES_MONTHS_MAX = 600;
const YEAR_MIN = 2000;
const YEAR_MAX = 2100;
const MONTHS_IN_YEAR = 12;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BIGINT_ID = /^\d{1,18}$/;

const idParamSchema = z.object({
  id: z.string().regex(BIGINT_ID, 'Id inválido.'),
});

const yearMonthSchema = z.object({
  year: z.coerce.number().int().min(YEAR_MIN).max(YEAR_MAX),
  month: z.coerce.number().int().min(1).max(MONTHS_IN_YEAR),
});

function parseId(params) {
  return BigInt(idParamSchema.parse(params).id);
}

function parseYearMonth(query) {
  return yearMonthSchema.parse(query);
}

module.exports = {
  parseId,
  parseYearMonth,
  NAME_MIN,
  NAME_MAX,
  CATEGORY_NAME_MAX,
  DESCRIPTION_MAX,
  PASSWORD_MIN,
  PREFERENCE_MONTHS_MAX,
  SERIES_MONTHS_MAX,
  ISO_DATE,
};
