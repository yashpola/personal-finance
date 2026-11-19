"use strict";

const assert = require("node:assert/strict");
const Store = require("../store.js");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("defaults currency to SGD and formats S$ amounts cleanly", () => {
  const empty = Store.createEmptyState();
  const sample = Store.createSampleState();
  assert.equal(empty.settings.currency, "SGD");
  assert.equal(sample.settings.currency, "SGD");
  assert.equal(Store.formatCurrency(1234.5, "SGD"), "S$1,234.50");
  assert.equal(Store.formatCurrency(-42.1, "SGD"), "-S$42.10");
});

test("defines the exact 5 expense categories and subcategories", () => {
  const expected = {
    food: ["meals", "snacks"],
    shopping: ["groceries", "books"],
    leisure: ["movies", "friends"],
    transport: ["public", "private"],
    bills: ["apple", "google", "xbox", "car", "work"],
  };

  assert.equal(Store.EXPENSE_CATEGORIES.length, 5);
  for (const cat of Store.EXPENSE_CATEGORIES) {
    assert.deepEqual(
      cat.subcategories.map((s) => s.id),
      expected[cat.id],
    );
  }
});

test("defines the exact 2 expense tags: personal and family", () => {
  assert.deepEqual(
    Store.EXPENSE_TAGS.map((t) => t.id),
    ["personal", "family"],
  );
});

test("computes main balance, expenses, and net worth accurately", () => {
  let state = Store.createEmptyState();
  state = Store.setBaseBalance(state, 1000);
  state = Store.addIncome(state, {
    label: "Salary",
    amount: 2500,
    date: "2026-11-01",
  });
  state = Store.addExpense(state, {
    amount: 45.5,
    category: "food",
    subcategory: "meals",
    tag: "personal",
    date: "2026-11-02",
    note: "Dinner",
  });
  state = Store.addExpense(state, {
    amount: 120.25,
    category: "bills",
    subcategory: "car",
    tag: "family",
    date: "2026-11-03",
  });

  const summary = Store.computeSummary(state);
  assert.equal(summary.baseBalance, 1000);
  assert.equal(summary.totalIncome, 2500);
  assert.equal(summary.totalExpenses, 165.75);
  assert.equal(summary.cashBalance, 3334.25);
  assert.equal(summary.byTag.personal, 45.5);
  assert.equal(summary.byTag.family, 120.25);
  assert.equal(summary.byCategory.food.subcategories.meals, 45.5);
  assert.equal(summary.byCategory.bills.subcategories.car, 120.25);
});

test("rejects invalid category, subcategory, or tag on addExpense", () => {
  const state = Store.createEmptyState();
  assert.throws(() => {
    Store.addExpense(state, {
      amount: 10,
      category: "food",
      subcategory: "xbox",
      tag: "personal",
    });
  }, /Invalid expense category or subcategory/);

  assert.throws(() => {
    Store.addExpense(state, {
      amount: 10,
      category: "food",
      subcategory: "meals",
      tag: "business",
    });
  }, /Invalid expense tag/);
});

test("supports updating and deleting expenses", () => {
  let state = Store.createEmptyState();
  state = Store.addExpense(state, {
    amount: 20,
    category: "leisure",
    subcategory: "movies",
    tag: "personal",
    date: "2026-11-05",
  });
  const id = state.expenses[0].id;
  state = Store.updateExpense(state, id, {
    amount: 35,
    subcategory: "friends",
    tag: "family",
  });

  assert.equal(state.expenses[0].amount, 35);
  assert.equal(state.expenses[0].subcategory, "friends");
  assert.equal(state.expenses[0].tag, "family");

  state = Store.deleteExpense(state, id);
  assert.equal(state.expenses.length, 0);
});

test("handles 3-fold investments: bonds, ETFs with nested funds, and stocks with shares & company", () => {
  let state = Store.createEmptyState();
  state = Store.setBaseBalance(state, 5000);

  state = Store.addBond(state, {
    name: "Singapore Savings Bond",
    amount: 2000,
    yieldRate: 3.5,
    maturityDate: "2035-01-01",
  });

  state = Store.addEtf(state, {
    name: "Vanguard S&P 500",
    ticker: "VOO",
    fundLabel: "Initial Index Fund",
    initialAmount: 1000,
    date: "2026-11-01",
  });
  const etfId = state.investments.etfs[0].id;
  state = Store.addEtfFund(state, etfId, {
    label: "Monthly DCA",
    amount: 500.5,
    date: "2026-11-10",
  });

  state = Store.addStock(state, {
    company: "DBS Group",
    ticker: "D05",
    shares: 2.5,
    pricePerShare: 200,
  });
  const stockId = state.investments.stocks[0].id;
  state = Store.updateStock(state, stockId, { shares: 3.5 });

  const summary = Store.computeSummary(state);
  assert.equal(summary.totalBonds, 2000);
  assert.equal(summary.totalEtfs, 1500.5);
  assert.equal(summary.totalStocks, 700);
  assert.equal(summary.totalInvestments, 4200.5);
  assert.equal(summary.cashBalance, 5000);
  assert.equal(summary.netWorth, 9200.5);

  state.settings.deductInvestmentsFromBalance = true;
  const deducted = Store.computeSummary(state);
  assert.equal(deducted.cashBalance, 799.5);
  assert.equal(deducted.netWorth, 5000);
});

test("computes category analysis and investment growth tracking", () => {
  let state = Store.createEmptyState();
  state = Store.addIncome(state, {
    label: "Salary",
    amount: 4000,
    date: "2026-10-01",
  });
  state = Store.addExpense(state, {
    amount: 100,
    category: "food",
    subcategory: "meals",
    tag: "personal",
    date: "2026-10-05",
  });
  state = Store.addExpense(state, {
    amount: 300,
    category: "bills",
    subcategory: "car",
    tag: "family",
    date: "2026-11-05",
  });

  state = Store.addBond(state, { name: "SSB", amount: 2000, yieldRate: 3.0 });
  state = Store.addEtf(state, {
    name: "VOO",
    ticker: "VOO",
    fundLabel: "Core",
    initialAmount: 1000,
    currentValue: 1200,
    date: "2026-10-01",
  });
  state = Store.addStock(state, {
    company: "Apple Inc.",
    ticker: "AAPL",
    shares: 10,
    pricePerShare: 150,
    buyPrice: 120,
  });

  state = Store.addInvestmentSnapshot(state, {
    date: "2026-10-01",
    total: 4000,
    note: "Start",
  });
  state = Store.addInvestmentSnapshot(state, {
    date: "2026-11-18",
    note: "Current",
  });

  const analysis = Store.computeAnalysis(state);
  assert.equal(analysis.averageExpense, 200);
  assert.equal(analysis.netCashFlow, 3600);
  assert.equal(analysis.savingsRate, 90);
  assert.equal(analysis.topCategory.id, "bills");
  assert.equal(analysis.topSubcategory.label, "Car");
  assert.equal(analysis.monthlyExpenses.length, 2);
  assert.equal(analysis.investments.projectedAnnualBondIncome, 60);
  assert.equal(analysis.investments.etfsGain, 200);
  assert.equal(analysis.investments.stocksGain, 300);
  assert.equal(analysis.investments.totalUnrealizedGain, 500);
  assert.equal(analysis.investments.snapshotGrowth.delta, 700);
});

test("persists to storage interface and exports valid CSV", () => {
  const memory = new Map();
  const mockStorage = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
  };

  const sample = Store.createSampleState();
  assert.equal(Store.saveToStorage(sample, mockStorage), true);
  const loaded = Store.loadFromStorage(mockStorage);
  assert.equal(loaded.expenses.length, sample.expenses.length);
  assert.equal(loaded.investments.etfs.length, sample.investments.etfs.length);
  assert.equal(
    loaded.investments.snapshots.length,
    sample.investments.snapshots.length,
  );

  const csv = Store.exportExpensesCsv(loaded.expenses);
  assert.ok(csv.startsWith("Date,Category,Subcategory,Tag,Amount,Note\n"));
  assert.ok(csv.includes(",food,meals,personal,"));
});

test("supports adding, deleting, and persisting custom subcategories and tags", () => {
  let state = Store.createEmptyState();
  const subRes = Store.addCustomSubcategory(state, "food", "Coffee");
  state = subRes.state;
  const tagRes = Store.addCustomTag(state, "Work");
  state = tagRes.state;

  assert.equal(subRes.subcategory.id, "coffee");
  assert.equal(tagRes.tag.id, "work");

  state = Store.addExpense(state, {
    amount: 7.5,
    category: "food",
    subcategory: "coffee",
    tag: "work",
    date: "2026-11-18",
    note: "Client coffee",
  });

  const restored = Store.normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.expenses.length, 1);
  assert.equal(restored.expenses[0].subcategory, "coffee");
  assert.equal(restored.expenses[0].tag, "work");

  const summary = Store.computeSummary(restored);
  assert.equal(summary.byTag.work, 7.5);
  assert.equal(summary.byCategory.food.subcategories.coffee, 7.5);

  const analysis = Store.computeAnalysis(restored);
  assert.equal(analysis.topSubcategory.label, "Coffee");
  assert.equal(analysis.monthlyExpenses[0].tags.work, 7.5);

  state = Store.deleteCustomSubcategory(restored, "food", "coffee");
  state = Store.deleteCustomTag(state, "work");
  assert.equal(state.customSubcategories.food.length, 0);
  assert.equal(state.customTags.length, 0);
});

test("adjusts main balance for future stock and ETF buys/sells while keeping existing holdings frozen", () => {
  let state = Store.createEmptyState();
  state = Store.setBaseBalance(state, 5000);

  // Existing holdings added without balance deduction stay frozen
  state = Store.addStock(state, {
    company: "DBS Group",
    ticker: "D05",
    shares: 10,
    pricePerShare: 40,
    adjustBalance: false,
  });
  state = Store.addEtf(state, {
    name: "Vanguard S&P 500",
    ticker: "VOO",
    fundLabel: "Frozen Existing",
    initialAmount: 2000,
    adjustBalance: false,
  });

  assert.equal(Store.computeSummary(state).cashBalance, 5000);

  // Future stock share increase subtracts cash; price-only update does not; share decrease adds cash
  const stockId = state.investments.stocks[0].id;
  state = Store.updateStock(state, stockId, {
    shares: 15,
    pricePerShare: 40,
    adjustBalance: true,
  });
  assert.equal(Store.computeSummary(state).cashBalance, 4800);

  state = Store.updateStock(state, stockId, {
    shares: 15,
    pricePerShare: 50,
    adjustBalance: true,
  });
  assert.equal(Store.computeSummary(state).cashBalance, 4800);

  state = Store.updateStock(state, stockId, {
    shares: 13,
    pricePerShare: 50,
    adjustBalance: true,
  });
  assert.equal(Store.computeSummary(state).cashBalance, 4900);

  // Future ETF fund add subtracts cash; withdraw adds cash back
  const etfId = state.investments.etfs[0].id;
  state = Store.addEtfFund(state, etfId, {
    label: "New DCA",
    amount: 500,
    adjustBalance: true,
  });
  assert.equal(Store.computeSummary(state).cashBalance, 4400);

  state = Store.withdrawEtf(state, etfId, {
    label: "Partial sell",
    amount: 300,
    adjustBalance: true,
  });
  assert.equal(Store.computeSummary(state).cashBalance, 4700);
  assert.equal(Store.getEtfTotal(state.investments.etfs[0]), 2200);

  // Persists transfers across JSON normalize round-trip
  const restored = Store.normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(Store.computeSummary(restored).cashBalance, 4700);
  assert.equal(restored.balance.investmentTransfers.length, 4);
});

test('supports repeating an expense and computing detailed subcategory analysis', () => {
  let state = Store.createEmptyState();
  state = Store.setBaseBalance(state, 1000);
  state = Store.addExpense(state, {
    amount: 15,
    category: 'food',
    subcategory: 'meals',
    tag: 'personal',
    date: '2026-11-01',
    note: 'Hawker lunch'
  });
  const origId = state.expenses[0].id;
  state = Store.repeatExpense(state, origId, '2026-11-19');

  assert.equal(state.expenses.length, 2);
  assert.notEqual(state.expenses[0].id, origId);
  assert.equal(state.expenses[0].date, '2026-11-19');
  assert.equal(state.expenses[0].amount, 15);
  assert.equal(state.expenses[0].note, 'Hawker lunch');

  state = Store.addExpense(state, {
    amount: 10,
    category: 'food',
    subcategory: 'snacks',
    tag: 'family',
    date: '2026-11-19',
    note: 'Pastries'
  });

  const subRes = Store.addCustomSubcategory(state, 'bills', 'Internet');
  state = subRes.state;
  state = Store.addExpense(state, {
    amount: 60,
    category: 'bills',
    subcategory: 'internet',
    tag: 'family',
    date: '2026-11-19'
  });

  const analysis = Store.computeAnalysis(state);
  const mealsRow = analysis.subcategoryMatrix.find((s) => s.categoryId === 'food' && s.id === 'meals');
  const internetRow = analysis.subcategoryMatrix.find((s) => s.categoryId === 'bills' && s.id === 'internet');

  assert.equal(mealsRow.count, 2);
  assert.equal(mealsRow.total, 30);
  assert.equal(mealsRow.average, 15);
  assert.equal(mealsRow.personal, 30);
  assert.equal(mealsRow.family, 0);
  assert.equal(mealsRow.shareOfCategoryPct, 75);
  assert.equal(mealsRow.shareOfTotalPct, 30);

  assert.equal(internetRow.label, 'Internet');
  assert.equal(internetRow.total, 60);
  assert.equal(internetRow.shareOfCategoryPct, 100);
  assert.equal(internetRow.shareOfTotalPct, 60);
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed += 1;
    console.log(`PASS: ${t.name}`);
  } catch (err) {
    console.error(`FAIL: ${t.name}`);
    console.error(err);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} tests passed.`);
