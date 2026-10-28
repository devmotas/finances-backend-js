const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Decimal } = require('@prisma/client/runtime/library');
const { emptyTotals, addRow } = require('../../src/domain/totals');
const { netCash, ledgerCash, cashBalanceOf, projectedBalance } = require('../../src/domain/balances');
const { accountPosition } = require('../../src/domain/investmentPosition');
const { referenceExpense } = require('../../src/domain/reserve');
const {
  WALLET_CATEGORY,
  walletAdjustment,
  walletSpendingWindow,
  averageWalletSpending,
  remainingWalletSpending,
  expectedWalletSpending,
} = require('../../src/domain/wallet');

const date = (text) => new Date(`${text}T00:00:00Z`);
const WALLET_OPENING = '391.66';
const WALLET_OPENING_DATE = date('2026-10-18');

const salary = { flow: 'income', expense_group: null, direction: null, to_wallet: false, from_wallet: false, total: '1000', count: 1 };
const transferIn = { flow: 'investment', expense_group: null, direction: 'contribution', to_wallet: true, from_wallet: false, total: '750', count: 1 };

function walletSpendingRow(amount) {
  return { flow: 'expense', expense_group: 'nonEssential', direction: null, to_wallet: false, from_wallet: true, total: amount, count: 1 };
}

function totalsOf(rows) {
  return rows.reduce(addRow, emptyTotals());
}

function wallet(movements) {
  return { initialBalance: WALLET_OPENING, initialBalanceDate: WALLET_OPENING_DATE, movements, balanceUpdates: [] };
}

const transferMovement = { date: date('2026-11-02'), direction: 'contribution', amount: '750', flow: 'investment' };

test('transferência para a carteira não mexe no saldo em caixa nem no saldo do mês', () => {
  const before = totalsOf([salary]);
  const after = totalsOf([salary, transferIn]);
  const walletBefore = accountPosition(wallet([]), date('2026-11-30')).position;
  const walletAfter = accountPosition(wallet([transferMovement]), date('2026-11-30')).position;

  assert.equal(after.contributions.toNumber(), 0);
  assert.equal(netCash(after).toNumber(), netCash(before).toNumber());
  assert.equal(ledgerCash(after).toNumber(), 250);
  assert.equal(
    cashBalanceOf(ledgerCash(after), [walletAfter]).toNumber(),
    cashBalanceOf(ledgerCash(before), [walletBefore]).toNumber()
  );
});

test('saldo real abaixo do esperado vira gasto não essencial; caixa = conta corrente + saldo real da carteira', () => {
  const realBalance = '300';
  const expected = accountPosition(wallet([transferMovement]), date('2026-11-20')).book;
  const adjustment = walletAdjustment(realBalance, expected);
  assert.equal(adjustment.flow, 'expense');
  assert.equal(adjustment.amount.toNumber(), 841.66);
  assert.equal(WALLET_CATEGORY.expense.expenseGroup, 'nonEssential');

  const spending = { date: date('2026-11-20'), direction: null, amount: adjustment.amount, flow: 'expense' };
  const walletBalance = accountPosition(wallet([transferMovement, spending]), date('2026-11-30'));
  assert.equal(walletBalance.position.toNumber(), 300);
  assert.equal(walletBalance.spending.toNumber(), 841.66);

  const totals = totalsOf([salary, transferIn, walletSpendingRow(adjustment.amount)]);
  assert.equal(totals.nonEssential.toNumber(), 841.66);
  assert.equal(ledgerCash(totals).toNumber(), 250);
  assert.equal(cashBalanceOf(ledgerCash(totals), [walletBalance.position]).toNumber(), 550);
});

test('saldo real acima do esperado vira entrada na carteira; igual não gera lançamento', () => {
  const adjustment = walletAdjustment('500', '391.66');
  assert.equal(adjustment.flow, 'income');
  assert.equal(adjustment.amount.toNumber(), 108.34);
  assert.equal(WALLET_CATEGORY.income.name, 'Entrada na carteira');
  assert.equal(walletAdjustment('391.66', new Decimal(WALLET_OPENING)), null);
});

test('carteira só conta o saldo inicial a partir da data dele', () => {
  assert.equal(accountPosition(wallet([]), date('2026-09-30')).position.toNumber(), 0);
  assert.equal(accountPosition(wallet([]), date('2026-10-31')).position.toNumber(), 391.66);
});

test('despesa de referência da reserva ignora os gastos da carteira', () => {
  const essentialBill = { flow: 'expense', expense_group: 'essential', direction: null, to_wallet: false, from_wallet: false, total: '1000', count: 1 };
  const month = totalsOf([essentialBill, walletSpendingRow('600')]);
  const reference = referenceExpense([{ essential: month.essential, hasActivity: month.count > 0 }]);
  assert.equal(reference.toNumber(), 1000);
});

test('próximo mês desconta a média dos gastos da carteira dos três meses fechados', () => {
  assert.deepEqual(walletSpendingWindow({ year: 2027, month: 2 }), {
    from: { year: 2026, month: 11 },
    to: { year: 2027, month: 1 },
  });
  const window = [totalsOf([walletSpendingRow('300')]), totalsOf([walletSpendingRow('600')]), totalsOf([salary])];
  const average = averageWalletSpending(window);
  assert.equal(average.toNumber(), 450);

  const next = totalsOf([salary, transferIn]);
  const expected = remainingWalletSpending(average, next);
  assert.equal(projectedBalance(new Decimal(100), next, expected).toNumber(), 650);

  const alreadySpent = totalsOf([walletSpendingRow('100')]);
  assert.equal(remainingWalletSpending(average, alreadySpent).toNumber(), 350);
});

test('sem histórico de meses fechados a previsão usa o gasto da carteira do mês selecionado', () => {
  const history = [emptyTotals(), totalsOf([salary]), emptyTotals()];
  const selected = totalsOf([salary, walletSpendingRow('890.10')]);
  assert.equal(expectedWalletSpending(history, selected, totalsOf([salary])).toNumber(), 890.1);
});

test('a previsão desconta no mínimo o que vai entrar na carteira no próximo mês', () => {
  const history = [totalsOf([walletSpendingRow('300')]), emptyTotals(), emptyTotals()];
  const next = totalsOf([salary, transferIn]);
  assert.equal(expectedWalletSpending(history, emptyTotals(), next).toNumber(), 750);
  assert.equal(expectedWalletSpending([emptyTotals()], emptyTotals(), next).toNumber(), 750);
  assert.equal(projectedBalance(new Decimal(100), next, expectedWalletSpending(history, emptyTotals(), next)).toNumber(), 350);
});

test('o que já foi gasto da carteira no próximo mês sai do previsto', () => {
  const history = [totalsOf([walletSpendingRow('900')])];
  const next = totalsOf([transferIn, walletSpendingRow('200')]);
  assert.equal(expectedWalletSpending(history, emptyTotals(), next).toNumber(), 700);
});

test('sem histórico, sem gasto no mês e sem transferência a previsão não desconta nada', () => {
  assert.equal(expectedWalletSpending([emptyTotals()], totalsOf([salary]), emptyTotals()).toNumber(), 0);
});
