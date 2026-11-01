const { test } = require('node:test');
const assert = require('node:assert/strict');
const { accountPosition, missingToTarget } = require('../../src/domain/investmentPosition');

const date = (text) => new Date(`${text}T00:00:00Z`);
const movements = [
  { date: date('2026-04-02'), direction: 'contribution', amount: '1000' },
  { date: date('2026-05-02'), direction: 'withdrawal', amount: '300' },
  { date: date('2026-07-02'), direction: 'contribution', amount: '500' },
];

test('sem atualização de saldo: posição = saldo inicial + aportes − resgates, rendimento zero', () => {
  const p = accountPosition({ initialBalance: '2000', movements, balanceUpdates: [] }, date('2026-06-30'));
  assert.equal(p.contributions.toNumber(), 1000);
  assert.equal(p.withdrawals.toNumber(), 300);
  assert.equal(p.yield.toNumber(), 0);
  assert.equal(p.position.toNumber(), 2700);
});

test('rendimento pela última atualização até a data; aportes depois dela somam por cima', () => {
  const balanceUpdates = [
    { date: date('2026-05-31'), balance: '2750' },
    { date: date('2026-06-30'), balance: '2800' },
  ];
  const june = accountPosition({ initialBalance: '2000', movements, balanceUpdates }, date('2026-06-30'));
  assert.equal(june.yield.toNumber(), 100);
  assert.equal(june.position.toNumber(), 2800);

  const july = accountPosition({ initialBalance: '2000', movements, balanceUpdates }, date('2026-07-31'));
  assert.equal(july.yield.toNumber(), 100);
  assert.equal(july.position.toNumber(), 3300);

  const may = accountPosition({ initialBalance: '2000', movements, balanceUpdates }, date('2026-05-31'));
  assert.equal(may.yield.toNumber(), 50);
});

test('resgate no mesmo dia, registrado depois da atualização de saldo, sai da conta', () => {
  const update = { date: date('2026-11-01'), balance: '1000', created_at: new Date('2026-11-01T10:00:00Z') };
  const withdrawal = (createdAt) => ({
    date: date('2026-11-01'),
    direction: 'withdrawal',
    amount: '700',
    created_at: new Date(createdAt),
  });

  const after = accountPosition(
    { initialBalance: '1000', movements: [withdrawal('2026-11-01T11:00:00Z')], balanceUpdates: [update] },
    date('2026-11-30')
  );
  assert.equal(after.yield.toNumber(), 0);
  assert.equal(after.position.toNumber(), 300);

  const before = accountPosition(
    { initialBalance: '1000', movements: [withdrawal('2026-11-01T09:00:00Z')], balanceUpdates: [update] },
    date('2026-11-30')
  );
  assert.equal(before.yield.toNumber(), 700);
  assert.equal(before.position.toNumber(), 1000);
});

test('ajuste gerado pela atualização de saldo conta antes dela mesmo registrado depois', () => {
  const update = { date: date('2026-11-01'), balance: '800', created_at: new Date('2026-11-01T10:00:00Z') };
  const adjustment = {
    date: date('2026-11-01'),
    flow: 'expense',
    amount: '200',
    balance_update_id: 1n,
    created_at: new Date('2026-11-01T10:00:01Z'),
  };
  const p = accountPosition({ initialBalance: '1000', movements: [adjustment], balanceUpdates: [update] }, date('2026-11-30'));
  assert.equal(p.yield.toNumber(), 0);
  assert.equal(p.position.toNumber(), 800);
});

test('quanto falta para o valor-alvo nunca é negativo', () => {
  assert.equal(missingToTarget('1000', 600).toNumber(), 400);
  assert.equal(missingToTarget('1000', 1500).toNumber(), 0);
  assert.equal(missingToTarget(null, 1500), null);
});
