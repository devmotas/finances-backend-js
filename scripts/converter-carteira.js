require('dotenv').config();
const prisma = require('../src/db/prisma');
const { INTERACTIVE_TRANSACTION_OPTIONS } = require('../src/db/transactionOptions');
const seriesService = require('../src/services/seriesService');
const { summary } = require('../src/services/summaryService');
const { ACCOUNT_ROLE, SERIES_KIND } = require('../src/domain/constants');
const { addMonths, firstDay, monthOf, monthsDiff, parseMonth, formatMonth, formatDate } = require('../src/domain/months');

const APPLY_FLAG = '--apply';
const ENV_PREFIX = 'CONVERTER_';
const DATABASE_HOST = /@([^/:?]+)/;

const OPTIONS = Object.freeze({
  user: 'usuario',
  walletName: 'carteira',
  initialBalance: 'saldo-inicial',
  initialDate: 'data-inicial',
  oldSeriesId: 'serie-antiga',
  lastOldMonth: 'ultimo-mes',
  amount: 'valor',
  startDate: 'inicio',
  description: 'descricao',
});

function envName(name) {
  return ENV_PREFIX + name.replace(/-/g, '_').toUpperCase();
}

function option(name) {
  const prefix = `--${name}=`;
  const fromArgs = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const value = fromArgs ?? process.env[envName(name)];
  if (value == null || value === '') throw new Error(`Informe --${name}=... (ou ${envName(name)}).`);
  return value;
}

function readParams() {
  return {
    userId: BigInt(option(OPTIONS.user)),
    walletName: option(OPTIONS.walletName),
    initialBalance: Number(option(OPTIONS.initialBalance)),
    initialDate: option(OPTIONS.initialDate),
    oldSeriesId: BigInt(option(OPTIONS.oldSeriesId)),
    lastOldMonth: parseMonth(option(OPTIONS.lastOldMonth)),
    amount: Number(option(OPTIONS.amount)),
    startDate: option(OPTIONS.startDate),
    description: option(OPTIONS.description),
    apply: process.argv.includes(APPLY_FLAG),
  };
}

function log(message) {
  console.log(message);
}

async function printNumbers(label, userId, month) {
  const result = await summary(userId, month.year, month.month);
  log(`\n[${label}] resumo de ${formatMonth(month)}`);
  log(`  saldo em caixa (cashBalance) .......... ${result.cashBalance}`);
  log(`  conta corrente (ledgerBalance) ........ ${result.ledgerBalance}`);
  log(`  carteira (walletBalance) .............. ${result.walletBalance}`);
  log(`  saídas do mês (essenciais/não ess.) ... ${result.totalEssential} / ${result.totalNonEssential}`);
  log(`  reserva: despesa de referência ........ ${result.reserve.referenceExpense}`);
  const next = result.nextMonth;
  log(`  próximo mês ${formatMonth(next)}: entradas ${next.committedIncome}, essenciais ${next.committedEssential}, ` +
    `não essenciais ${next.committedNonEssential}, investimento ${next.committedInvestment}, ` +
    `gastos previstos da carteira ${next.expectedWalletSpending}, saldo previsto ${next.projectedBalance}`);
}

async function findWallet(params) {
  return prisma.investment_accounts.findFirst({
    where: { user_id: params.userId, name: { equals: params.walletName, mode: 'insensitive' } },
  });
}

async function ensureWallet(params) {
  const existing = await findWallet(params);
  if (existing) {
    if (existing.role !== ACCOUNT_ROLE.WALLET) throw new Error(`A conta '${existing.name}' existe e não é carteira.`);
    log(`= Carteira '${existing.name}' já existe (id ${existing.id}).`);
    return existing;
  }
  log(`+ Criar carteira '${params.walletName}': saldo inicial ${params.initialBalance} em ${params.initialDate}.`);
  if (!params.apply) return null;
  return prisma.investment_accounts.create({
    data: {
      user_id: params.userId,
      name: params.walletName,
      role: ACCOUNT_ROLE.WALLET,
      initial_balance: params.initialBalance,
      initial_balance_date: new Date(params.initialDate),
    },
  });
}

function endsBy(recurrence, month) {
  return recurrence.end_month != null && monthsDiff(monthOf(recurrence.end_month), month) >= 0;
}

async function closeOldSeries(params) {
  const recurrence = await prisma.recurrences.findFirst({ where: { id: params.oldSeriesId, user_id: params.userId } });
  if (!recurrence) throw new Error(`Série ${params.oldSeriesId} não encontrada para o usuário.`);
  const firstNewMonth = firstDay(addMonths(params.lastOldMonth, 1));
  const toDelete = await prisma.transactions.findMany({
    where: { recurrence_id: recurrence.id, date: { gte: firstNewMonth } },
    orderBy: { date: 'asc' },
  });
  if (endsBy(recurrence, params.lastOldMonth) && toDelete.length === 0) {
    log(`= Série ${recurrence.id} '${recurrence.description}' já termina em ${formatMonth(monthOf(recurrence.end_month))}.`);
    return;
  }
  log(`- Encerrar série ${recurrence.id} '${recurrence.description}' (${recurrence.amount}) em ${formatMonth(params.lastOldMonth)}: ` +
    `apagar ${toDelete.length} lançamentos de ${formatDate(firstNewMonth)} em diante ` +
    `(${toDelete.map((t) => formatDate(t.date)).join(', ')}).`);
  if (!params.apply) return;
  await prisma.$transaction(async (db) => {
    await db.transactions.deleteMany({ where: { id: { in: toDelete.map((t) => t.id) } } });
    await seriesService.closeSeries(db, recurrence, firstNewMonth);
  }, INTERACTIVE_TRANSACTION_OPTIONS);
}

async function createTransferSeries(params, wallet) {
  const existing = wallet && await prisma.recurrences.findFirst({
    where: { user_id: params.userId, destination_account_id: wallet.id, category_id: null, start_date: new Date(params.startDate) },
  });
  if (existing) {
    log(`= Série de transferência '${existing.description}' já existe (id ${existing.id}).`);
    return;
  }
  log(`+ Criar série de transferência '${params.description}': ${params.amount} todo mês a partir de ${params.startDate} para a carteira.`);
  if (!params.apply) return;
  const created = await seriesService.create(params.userId, {
    kind: SERIES_KIND.FIXED,
    destinationAccountId: Number(wallet.id),
    amount: params.amount,
    startDate: params.startDate,
    description: params.description,
  });
  log(`  série ${created.recurrenceId} criada com ${created.createdCount} transferências.`);
}

async function main() {
  const params = readParams();
  const host = (process.env.DATABASE_URL ?? '').match(DATABASE_HOST)?.[1] ?? 'desconhecido';
  log(`Banco: ${host}`);
  log(params.apply ? 'Modo: APLICAR (--apply)' : `Modo: ensaio (nada é gravado; use ${APPLY_FLAG} para aplicar)`);

  await printNumbers('antes', params.userId, params.lastOldMonth);
  log('');
  const wallet = await ensureWallet(params);
  await closeOldSeries(params);
  await createTransferSeries(params, wallet);
  if (params.apply) await printNumbers('depois', params.userId, params.lastOldMonth);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
