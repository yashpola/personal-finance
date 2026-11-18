(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FinanceStore = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'personal_finance_tracker_v1';
  const SCHEMA_VERSION = 2;

  const EXPENSE_CATEGORIES = [
    {
      id: 'food',
      label: 'Food',
      color: '#f97316',
      subcategories: [
        { id: 'meals', label: 'Meals' },
        { id: 'snacks', label: 'Snacks' }
      ]
    },
    {
      id: 'shopping',
      label: 'Shopping',
      color: '#ec4899',
      subcategories: [
        { id: 'groceries', label: 'Groceries' },
        { id: 'books', label: 'Books' }
      ]
    },
    {
      id: 'leisure',
      label: 'Leisure',
      color: '#8b5cf6',
      subcategories: [
        { id: 'movies', label: 'Movies' },
        { id: 'friends', label: 'Friends' }
      ]
    },
    {
      id: 'transport',
      label: 'Transport',
      color: '#0ea5e9',
      subcategories: [
        { id: 'public', label: 'Public' },
        { id: 'private', label: 'Private' }
      ]
    },
    {
      id: 'bills',
      label: 'Bills',
      color: '#10b981',
      subcategories: [
        { id: 'apple', label: 'Apple' },
        { id: 'google', label: 'Google' },
        { id: 'xbox', label: 'Xbox' },
        { id: 'car', label: 'Car' },
        { id: 'work', label: 'Work' }
      ]
    }
  ];

  const EXPENSE_TAGS = [
    { id: 'personal', label: 'Personal', color: '#3b82f6' },
    { id: 'family', label: 'Family', color: '#a855f7' }
  ];

  const CUSTOM_TAG_COLORS = [
    '#f59e0b',
    '#14b8a6',
    '#ef4444',
    '#ec4899',
    '#6366f1',
    '#84cc16'
  ];

  const CURRENCIES = [
    { code: 'SGD', symbol: 'S$', label: 'SGD (S$)' },
    { code: 'USD', symbol: '$', label: 'USD ($)' },
    { code: 'EUR', symbol: '€', label: 'EUR (€)' },
    { code: 'GBP', symbol: '£', label: 'GBP (£)' },
    { code: 'INR', symbol: '₹', label: 'INR (₹)' },
    { code: 'CAD', symbol: 'C$', label: 'CAD (C$)' },
    { code: 'AUD', symbol: 'A$', label: 'AUD (A$)' },
    { code: 'JPY', symbol: '¥', label: 'JPY (¥)' }
  ];

  function createId(prefix) {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now().toString(36)}_${rand}`;
  }

  function todayISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function roundMoney(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }

  function toPositiveNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return 0;
    return num;
  }

  function getCurrencyInfo(code) {
    return CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
  }

  function formatCurrency(amount, currencyCode) {
    const info = getCurrencyInfo(currencyCode || 'SGD');
    const num = Number(amount);
    const safeNum = Number.isFinite(num) ? num : 0;
    const isNeg = safeNum < 0;
    const abs = Math.abs(safeNum);
    const decimals = info.code === 'JPY' ? 0 : 2;
    const formatted = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(abs);
    return `${isNeg ? '-' : ''}${info.symbol}${formatted}`;
  }

  function createEmptyCustomSubcategories() {
    const map = {};
    for (const cat of EXPENSE_CATEGORIES) {
      map[cat.id] = [];
    }
    return map;
  }

  function createEmptyState() {
    return {
      version: SCHEMA_VERSION,
      settings: {
        currency: 'SGD',
        deductInvestmentsFromBalance: false,
        theme: 'system'
      },
      customSubcategories: createEmptyCustomSubcategories(),
      customTags: [],
      balance: {
        baseAmount: 0,
        incomes: []
      },
      expenses: [],
      investments: {
        bonds: [],
        etfs: [],
        stocks: [],
        snapshots: []
      }
    };
  }

  function slugifyLabel(label) {
    const slug = String(label || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return slug || `custom_${Date.now().toString(36)}`;
  }

  function getCategory(categoryId) {
    return EXPENSE_CATEGORIES.find((c) => c.id === categoryId) || null;
  }

  function getSubcategoriesForCategory(state, categoryId) {
    const cat = getCategory(categoryId);
    if (!cat) return [];
    const custom = state && state.customSubcategories && Array.isArray(state.customSubcategories[categoryId])
      ? state.customSubcategories[categoryId]
      : [];
    return [
      ...cat.subcategories.map((s) => ({ ...s, isCustom: false })),
      ...custom.map((s) => ({ ...s, isCustom: true }))
    ];
  }

  function getAllTags(state) {
    const custom = state && Array.isArray(state.customTags) ? state.customTags : [];
    return [
      ...EXPENSE_TAGS.map((t) => ({ ...t, isCustom: false })),
      ...custom.map((t) => ({ ...t, isCustom: true }))
    ];
  }

  function getSubcategoryLabel(state, categoryId, subcategoryId) {
    const found = getSubcategoriesForCategory(state, categoryId).find((s) => s.id === subcategoryId);
    return found ? found.label : subcategoryId;
  }

  function getTagInfo(state, tagId) {
    const found = getAllTags(state).find((t) => t.id === tagId);
    return found || { id: tagId, label: tagId, color: '#64748b', isCustom: true };
  }

  function isValidCategorySubcategory(categoryId, subcategoryId, customSubcategories) {
    const cat = getCategory(categoryId);
    if (!cat) return false;
    if (cat.subcategories.some((s) => s.id === subcategoryId)) return true;
    if (customSubcategories && Array.isArray(customSubcategories[categoryId])) {
      return customSubcategories[categoryId].some((s) => s.id === subcategoryId);
    }
    return false;
  }

  function isValidTag(tagId, customTags) {
    if (EXPENSE_TAGS.some((t) => t.id === tagId)) return true;
    if (Array.isArray(customTags)) {
      return customTags.some((t) => t.id === tagId);
    }
    return false;
  }

  function normalizeState(raw) {
    const base = createEmptyState();
    if (!raw || typeof raw !== 'object') return base;

    if (raw.settings && typeof raw.settings === 'object') {
      if (CURRENCIES.some((c) => c.code === raw.settings.currency)) {
        base.settings.currency = raw.settings.currency;
      }
      base.settings.deductInvestmentsFromBalance = Boolean(raw.settings.deductInvestmentsFromBalance);
      if (['light', 'dark', 'system'].includes(raw.settings.theme)) {
        base.settings.theme = raw.settings.theme;
      }
    }

    if (raw.customSubcategories && typeof raw.customSubcategories === 'object') {
      for (const cat of EXPENSE_CATEGORIES) {
        const list = raw.customSubcategories[cat.id];
        if (!Array.isArray(list)) continue;
        const seenIds = new Set(cat.subcategories.map((s) => s.id));
        base.customSubcategories[cat.id] = list
          .filter((s) => s && typeof s === 'object' && String(s.label || '').trim())
          .map((s) => {
            const label = String(s.label).trim().slice(0, 40);
            const id = typeof s.id === 'string' && s.id.trim() ? s.id.trim() : slugifyLabel(label);
            return { id, label };
          })
          .filter((s) => {
            if (seenIds.has(s.id)) return false;
            seenIds.add(s.id);
            return true;
          });
      }
    }

    if (Array.isArray(raw.customTags)) {
      const seenTagIds = new Set(EXPENSE_TAGS.map((t) => t.id));
      base.customTags = raw.customTags
        .filter((t) => t && typeof t === 'object' && String(t.label || '').trim())
        .map((t, idx) => {
          const label = String(t.label).trim().slice(0, 32);
          const id = typeof t.id === 'string' && t.id.trim() ? t.id.trim() : slugifyLabel(label);
          const color = typeof t.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(t.color)
            ? t.color
            : CUSTOM_TAG_COLORS[idx % CUSTOM_TAG_COLORS.length];
          return { id, label, color };
        })
        .filter((t) => {
          if (seenTagIds.has(t.id)) return false;
          seenTagIds.add(t.id);
          return true;
        });
    }

    if (raw.balance && typeof raw.balance === 'object') {
      const baseNum = Number(raw.balance.baseAmount);
      base.balance.baseAmount = Number.isFinite(baseNum) ? roundMoney(baseNum) : 0;
      if (Array.isArray(raw.balance.incomes)) {
        base.balance.incomes = raw.balance.incomes
          .filter((inc) => inc && typeof inc === 'object' && toPositiveNumber(inc.amount) > 0)
          .map((inc) => ({
            id: typeof inc.id === 'string' && inc.id ? inc.id : createId('inc'),
            label: String(inc.label || 'Income').trim().slice(0, 80),
            amount: roundMoney(inc.amount),
            date: typeof inc.date === 'string' && inc.date ? inc.date : todayISO()
          }));
      }
    }

    if (Array.isArray(raw.expenses)) {
      base.expenses = raw.expenses
        .filter((exp) => (
          exp &&
          typeof exp === 'object' &&
          toPositiveNumber(exp.amount) > 0 &&
          isValidCategorySubcategory(exp.category, exp.subcategory, base.customSubcategories) &&
          isValidTag(exp.tag, base.customTags)
        ))
        .map((exp) => ({
          id: typeof exp.id === 'string' && exp.id ? exp.id : createId('exp'),
          amount: roundMoney(exp.amount),
          category: exp.category,
          subcategory: exp.subcategory,
          tag: exp.tag,
          date: typeof exp.date === 'string' && exp.date ? exp.date : todayISO(),
          note: String(exp.note || '').trim().slice(0, 140),
          createdAt: typeof exp.createdAt === 'string' ? exp.createdAt : new Date().toISOString()
        }));
    }

    if (raw.investments && typeof raw.investments === 'object') {
      if (Array.isArray(raw.investments.bonds)) {
        base.investments.bonds = raw.investments.bonds
          .filter((b) => b && typeof b === 'object' && String(b.name || '').trim() && toPositiveNumber(b.amount) > 0)
          .map((b) => {
            const rate = Number(b.yieldRate);
            return {
              id: typeof b.id === 'string' && b.id ? b.id : createId('bond'),
              name: String(b.name).trim().slice(0, 100),
              amount: roundMoney(b.amount),
              yieldRate: b.yieldRate !== null && b.yieldRate !== '' && Number.isFinite(rate) && rate >= 0
                ? Math.round(rate * 100) / 100
                : null,
              maturityDate: typeof b.maturityDate === 'string' ? b.maturityDate : '',
              note: String(b.note || '').trim().slice(0, 140)
            };
          });
      }

      if (Array.isArray(raw.investments.etfs)) {
        base.investments.etfs = raw.investments.etfs
          .filter((e) => e && typeof e === 'object' && String(e.name || '').trim())
          .map((e) => {
            const funds = Array.isArray(e.funds)
              ? e.funds
                  .filter((f) => f && typeof f === 'object' && toPositiveNumber(f.amount) > 0)
                  .map((f) => ({
                    id: typeof f.id === 'string' && f.id ? f.id : createId('fund'),
                    label: String(f.label || 'Fund Contribution').trim().slice(0, 100),
                    amount: roundMoney(f.amount),
                    date: typeof f.date === 'string' && f.date ? f.date : todayISO()
                  }))
              : [];
            const curVal = e.currentValue !== null && e.currentValue !== '' && e.currentValue !== undefined
              ? Number(e.currentValue)
              : null;
            return {
              id: typeof e.id === 'string' && e.id ? e.id : createId('etf'),
              name: String(e.name).trim().slice(0, 100),
              ticker: String(e.ticker || '').trim().toUpperCase().slice(0, 16),
              currentValue: curVal !== null && Number.isFinite(curVal) && curVal >= 0 ? roundMoney(curVal) : null,
              funds
            };
          });
      }

      if (Array.isArray(raw.investments.stocks)) {
        base.investments.stocks = raw.investments.stocks
          .filter((s) => (
            s &&
            typeof s === 'object' &&
            String(s.company || '').trim() &&
            toPositiveNumber(s.shares) > 0 &&
            Number(s.pricePerShare) >= 0
          ))
          .map((s) => {
            const bp = s.buyPrice !== null && s.buyPrice !== '' && s.buyPrice !== undefined
              ? Number(s.buyPrice)
              : null;
            return {
              id: typeof s.id === 'string' && s.id ? s.id : createId('stk'),
              company: String(s.company).trim().slice(0, 100),
              ticker: String(s.ticker || '').trim().toUpperCase().slice(0, 16),
              shares: Math.round(Number(s.shares) * 1000000) / 1000000,
              pricePerShare: roundMoney(s.pricePerShare),
              buyPrice: bp !== null && Number.isFinite(bp) && bp >= 0 ? roundMoney(bp) : null,
              date: typeof s.date === 'string' && s.date ? s.date : todayISO(),
              note: String(s.note || '').trim().slice(0, 140)
            };
          });
      }

      if (Array.isArray(raw.investments.snapshots)) {
        base.investments.snapshots = raw.investments.snapshots
          .filter((snap) => snap && typeof snap === 'object' && typeof snap.date === 'string' && snap.date)
          .map((snap) => {
            const bonds = roundMoney(snap.bonds || 0);
            const etfs = roundMoney(snap.etfs || 0);
            const stocks = roundMoney(snap.stocks || 0);
            const total = snap.total !== undefined && snap.total !== null
              ? roundMoney(snap.total)
              : roundMoney(bonds + etfs + stocks);
            return {
              id: typeof snap.id === 'string' && snap.id ? snap.id : createId('snap'),
              date: snap.date,
              bonds,
              etfs,
              stocks,
              total,
              note: String(snap.note || '').trim().slice(0, 100)
            };
          });
      }
    }

    return base;
  }

  function getEtfTotal(etf) {
    if (!etf || !Array.isArray(etf.funds)) return 0;
    return roundMoney(etf.funds.reduce((sum, f) => sum + roundMoney(f.amount), 0));
  }

  function getEtfCurrentValue(etf) {
    if (!etf) return 0;
    if (etf.currentValue !== null && etf.currentValue !== undefined && Number.isFinite(Number(etf.currentValue))) {
      return roundMoney(etf.currentValue);
    }
    return getEtfTotal(etf);
  }

  function getStockTotal(stock) {
    if (!stock) return 0;
    return roundMoney(Number(stock.shares) * Number(stock.pricePerShare));
  }

  function getStockCostBasis(stock) {
    if (!stock) return 0;
    if (stock.buyPrice !== null && stock.buyPrice !== undefined && Number.isFinite(Number(stock.buyPrice))) {
      return roundMoney(Number(stock.shares) * Number(stock.buyPrice));
    }
    return getStockTotal(stock);
  }

  function computeSummary(state) {
    const baseBalance = roundMoney(state.balance.baseAmount);
    const totalIncome = roundMoney(
      state.balance.incomes.reduce((sum, inc) => sum + roundMoney(inc.amount), 0)
    );
    const totalExpenses = roundMoney(
      state.expenses.reduce((sum, exp) => sum + roundMoney(exp.amount), 0)
    );

    const totalBonds = roundMoney(
      state.investments.bonds.reduce((sum, b) => sum + roundMoney(b.amount), 0)
    );
    const totalEtfsCost = roundMoney(
      state.investments.etfs.reduce((sum, e) => sum + getEtfTotal(e), 0)
    );
    const totalEtfs = roundMoney(
      state.investments.etfs.reduce((sum, e) => sum + getEtfCurrentValue(e), 0)
    );
    const totalStocksCost = roundMoney(
      state.investments.stocks.reduce((sum, s) => sum + getStockCostBasis(s), 0)
    );
    const totalStocks = roundMoney(
      state.investments.stocks.reduce((sum, s) => sum + getStockTotal(s), 0)
    );
    const totalInvestments = roundMoney(totalBonds + totalEtfs + totalStocks);
    const totalInvestmentsCost = roundMoney(totalBonds + totalEtfsCost + totalStocksCost);

    const deduct = Boolean(state.settings && state.settings.deductInvestmentsFromBalance);
    const cashBalance = roundMoney(
      baseBalance + totalIncome - totalExpenses - (deduct ? totalInvestments : 0)
    );
    const netWorth = roundMoney(cashBalance + totalInvestments);

    const allTags = getAllTags(state);
    const byCategory = {};
    for (const cat of EXPENSE_CATEGORIES) {
      const subTotals = {};
      for (const sub of getSubcategoriesForCategory(state, cat.id)) {
        subTotals[sub.id] = 0;
      }
      const catTagTotals = {};
      for (const t of allTags) {
        catTagTotals[t.id] = 0;
      }
      byCategory[cat.id] = {
        id: cat.id,
        label: cat.label,
        color: cat.color,
        total: 0,
        count: 0,
        personal: 0,
        family: 0,
        tags: catTagTotals,
        subcategories: subTotals
      };
    }

    const byTag = {};
    for (const t of allTags) {
      byTag[t.id] = 0;
    }

    for (const exp of state.expenses) {
      const amt = roundMoney(exp.amount);
      const bucket = byCategory[exp.category];
      if (bucket) {
        bucket.total = roundMoney(bucket.total + amt);
        bucket.count += 1;
        if (exp.tag === 'personal') bucket.personal = roundMoney(bucket.personal + amt);
        if (exp.tag === 'family') bucket.family = roundMoney(bucket.family + amt);
        bucket.tags[exp.tag] = roundMoney((bucket.tags[exp.tag] || 0) + amt);
        bucket.subcategories[exp.subcategory] = roundMoney((bucket.subcategories[exp.subcategory] || 0) + amt);
      }
      byTag[exp.tag] = roundMoney((byTag[exp.tag] || 0) + amt);
    }

    return {
      baseBalance,
      totalIncome,
      totalExpenses,
      cashBalance,
      totalBonds,
      totalEtfs,
      totalEtfsCost,
      totalStocks,
      totalStocksCost,
      totalInvestments,
      totalInvestmentsCost,
      netWorth,
      byCategory,
      byTag
    };
  }

  function computeAnalysis(state) {
    const summary = computeSummary(state);
    const expenseCount = state.expenses.length;
    const averageExpense = expenseCount > 0 ? roundMoney(summary.totalExpenses / expenseCount) : 0;
    const netCashFlow = roundMoney(summary.totalIncome - summary.totalExpenses);
    const savingsRate = summary.totalIncome > 0
      ? Math.round(((summary.totalIncome - summary.totalExpenses) / summary.totalIncome) * 1000) / 10
      : null;

    const categoryMatrix = EXPENSE_CATEGORIES.map((cat) => {
      const b = summary.byCategory[cat.id];
      const sharePct = summary.totalExpenses > 0
        ? Math.round((b.total / summary.totalExpenses) * 1000) / 10
        : 0;
      const avg = b.count > 0 ? roundMoney(b.total / b.count) : 0;
      const subs = getSubcategoriesForCategory(state, cat.id)
        .map((s) => ({
          id: s.id,
          label: s.label,
          total: b.subcategories[s.id] || 0
        }))
        .sort((a, z) => z.total - a.total);
      return {
        id: cat.id,
        label: cat.label,
        color: cat.color,
        total: b.total,
        count: b.count,
        average: avg,
        sharePct,
        personal: b.personal,
        family: b.family,
        tags: b.tags,
        subcategories: subs
      };
    }).sort((a, b) => b.total - a.total);

    const topCategory = categoryMatrix.find((c) => c.total > 0) || null;

    const allSubs = [];
    for (const cat of categoryMatrix) {
      for (const sub of cat.subcategories) {
        if (sub.total > 0) {
          allSubs.push({
            categoryLabel: cat.label,
            label: sub.label,
            total: sub.total
          });
        }
      }
    }
    allSubs.sort((a, b) => b.total - a.total);
    const topSubcategory = allSubs[0] || null;

    const monthMap = new Map();
    for (const exp of state.expenses) {
      const ym = String(exp.date || '').slice(0, 7);
      if (!ym) continue;
      if (!monthMap.has(ym)) {
        monthMap.set(ym, { month: ym, total: 0, personal: 0, family: 0, tags: {}, count: 0 });
      }
      const m = monthMap.get(ym);
      const amt = roundMoney(exp.amount);
      m.total = roundMoney(m.total + amt);
      m.count += 1;
      if (exp.tag === 'personal') m.personal = roundMoney(m.personal + amt);
      if (exp.tag === 'family') m.family = roundMoney(m.family + amt);
      m.tags[exp.tag] = roundMoney((m.tags[exp.tag] || 0) + amt);
    }
    const monthlyExpenses = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

    // Investment growth & return analysis
    const projectedAnnualBondIncome = roundMoney(
      state.investments.bonds.reduce((sum, b) => {
        if (b.yieldRate === null || b.yieldRate === undefined) return sum;
        return sum + (roundMoney(b.amount) * Number(b.yieldRate)) / 100;
      }, 0)
    );

    const etfsGain = roundMoney(summary.totalEtfs - summary.totalEtfsCost);
    const etfsGainPct = summary.totalEtfsCost > 0
      ? Math.round((etfsGain / summary.totalEtfsCost) * 1000) / 10
      : 0;

    const stocksGain = roundMoney(summary.totalStocks - summary.totalStocksCost);
    const stocksGainPct = summary.totalStocksCost > 0
      ? Math.round((stocksGain / summary.totalStocksCost) * 1000) / 10
      : 0;

    const totalUnrealizedGain = roundMoney(summary.totalInvestments - summary.totalInvestmentsCost);
    const totalUnrealizedGainPct = summary.totalInvestmentsCost > 0
      ? Math.round((totalUnrealizedGain / summary.totalInvestmentsCost) * 1000) / 10
      : 0;

    const snapshots = (state.investments.snapshots || [])
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    let snapshotGrowth = null;
    if (snapshots.length >= 1) {
      const first = snapshots[0];
      const latest = snapshots.length >= 2 ? snapshots[snapshots.length - 1] : { total: summary.totalInvestments, date: todayISO() };
      const delta = roundMoney(latest.total - first.total);
      const pct = first.total > 0 ? Math.round((delta / first.total) * 1000) / 10 : 0;
      snapshotGrowth = {
        startTotal: first.total,
        startDate: first.date,
        endTotal: latest.total,
        endDate: latest.date,
        delta,
        pct
      };
    }

    return {
      summary,
      expenseCount,
      averageExpense,
      netCashFlow,
      savingsRate,
      topCategory,
      topSubcategory,
      categoryMatrix,
      monthlyExpenses,
      investments: {
        projectedAnnualBondIncome,
        etfsGain,
        etfsGainPct,
        stocksGain,
        stocksGainPct,
        totalUnrealizedGain,
        totalUnrealizedGainPct,
        snapshots,
        snapshotGrowth
      }
    };
  }

  function addCustomSubcategory(state, categoryId, label) {
    const cat = getCategory(categoryId);
    if (!cat) throw new Error('Invalid expense category.');
    const cleanLabel = String(label || '').trim().slice(0, 40);
    if (!cleanLabel) throw new Error('Subcategory name is required.');

    const existing = getSubcategoriesForCategory(state, categoryId);
    const duplicate = existing.find((s) => s.label.toLowerCase() === cleanLabel.toLowerCase());
    if (duplicate) {
      return { state, subcategory: duplicate };
    }

    let id = slugifyLabel(cleanLabel);
    const usedIds = new Set(existing.map((s) => s.id));
    if (usedIds.has(id)) {
      let n = 2;
      while (usedIds.has(`${id}_${n}`)) n += 1;
      id = `${id}_${n}`;
    }

    const nextSub = { id, label: cleanLabel };
    const prevCustom = (state.customSubcategories && state.customSubcategories[categoryId]) || [];
    const nextState = {
      ...state,
      customSubcategories: {
        ...(state.customSubcategories || createEmptyCustomSubcategories()),
        [categoryId]: [...prevCustom, nextSub]
      }
    };
    return { state: nextState, subcategory: nextSub };
  }

  function deleteCustomSubcategory(state, categoryId, subcategoryId) {
    const prevCustom = (state.customSubcategories && state.customSubcategories[categoryId]) || [];
    return {
      ...state,
      customSubcategories: {
        ...(state.customSubcategories || createEmptyCustomSubcategories()),
        [categoryId]: prevCustom.filter((s) => s.id !== subcategoryId)
      }
    };
  }

  function addCustomTag(state, label) {
    const cleanLabel = String(label || '').trim().slice(0, 32);
    if (!cleanLabel) throw new Error('Tag name is required.');

    const existing = getAllTags(state);
    const duplicate = existing.find((t) => t.label.toLowerCase() === cleanLabel.toLowerCase());
    if (duplicate) {
      return { state, tag: duplicate };
    }

    let id = slugifyLabel(cleanLabel);
    const usedIds = new Set(existing.map((t) => t.id));
    if (usedIds.has(id)) {
      let n = 2;
      while (usedIds.has(`${id}_${n}`)) n += 1;
      id = `${id}_${n}`;
    }

    const prevCustom = Array.isArray(state.customTags) ? state.customTags : [];
    const color = CUSTOM_TAG_COLORS[prevCustom.length % CUSTOM_TAG_COLORS.length];
    const nextTag = { id, label: cleanLabel, color };
    return {
      state: {
        ...state,
        customTags: [...prevCustom, nextTag]
      },
      tag: nextTag
    };
  }

  function deleteCustomTag(state, tagId) {
    const prevCustom = Array.isArray(state.customTags) ? state.customTags : [];
    return {
      ...state,
      customTags: prevCustom.filter((t) => t.id !== tagId)
    };
  }

  function addExpense(state, input) {
    const amount = roundMoney(input.amount);
    if (amount <= 0) throw new Error('Expense amount must be greater than zero.');
    if (!isValidCategorySubcategory(input.category, input.subcategory, state.customSubcategories)) {
      throw new Error('Invalid expense category or subcategory.');
    }
    if (!isValidTag(input.tag, state.customTags)) {
      throw new Error('Invalid expense tag.');
    }

    const expense = {
      id: createId('exp'),
      amount,
      category: input.category,
      subcategory: input.subcategory,
      tag: input.tag,
      date: input.date || todayISO(),
      note: String(input.note || '').trim().slice(0, 140),
      createdAt: new Date().toISOString()
    };

    return {
      ...state,
      expenses: [expense, ...state.expenses]
    };
  }

  function updateExpense(state, id, updates) {
    const idx = state.expenses.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error('Expense not found.');
    const existing = state.expenses[idx];
    const next = {
      ...existing,
      amount: updates.amount !== undefined ? roundMoney(updates.amount) : existing.amount,
      category: updates.category !== undefined ? updates.category : existing.category,
      subcategory: updates.subcategory !== undefined ? updates.subcategory : existing.subcategory,
      tag: updates.tag !== undefined ? updates.tag : existing.tag,
      date: updates.date !== undefined ? updates.date : existing.date,
      note: updates.note !== undefined ? String(updates.note).trim().slice(0, 140) : existing.note
    };

    if (next.amount <= 0) throw new Error('Expense amount must be greater than zero.');
    if (!isValidCategorySubcategory(next.category, next.subcategory, state.customSubcategories)) {
      throw new Error('Invalid expense category or subcategory.');
    }
    if (!isValidTag(next.tag, state.customTags)) {
      throw new Error('Invalid expense tag.');
    }

    const expenses = state.expenses.slice();
    expenses[idx] = next;
    return { ...state, expenses };
  }

  function deleteExpense(state, id) {
    return {
      ...state,
      expenses: state.expenses.filter((e) => e.id !== id)
    };
  }

  function setBaseBalance(state, amount) {
    const num = Number(amount);
    if (!Number.isFinite(num)) throw new Error('Base balance must be a valid number.');
    return {
      ...state,
      balance: {
        ...state.balance,
        baseAmount: roundMoney(num)
      }
    };
  }

  function addIncome(state, input) {
    const amount = roundMoney(input.amount);
    if (amount <= 0) throw new Error('Income amount must be greater than zero.');
    const label = String(input.label || 'Income').trim().slice(0, 80) || 'Income';
    const income = {
      id: createId('inc'),
      label,
      amount,
      date: input.date || todayISO()
    };
    return {
      ...state,
      balance: {
        ...state.balance,
        incomes: [income, ...state.balance.incomes]
      }
    };
  }

  function deleteIncome(state, id) {
    return {
      ...state,
      balance: {
        ...state.balance,
        incomes: state.balance.incomes.filter((inc) => inc.id !== id)
      }
    };
  }

  function addBond(state, input) {
    const name = String(input.name || '').trim().slice(0, 100);
    const amount = roundMoney(input.amount);
    if (!name) throw new Error('Bond name is required.');
    if (amount <= 0) throw new Error('Bond amount must be greater than zero.');
    const yieldVal = input.yieldRate !== '' && input.yieldRate !== null && input.yieldRate !== undefined
      ? Number(input.yieldRate)
      : null;
    if (yieldVal !== null && (!Number.isFinite(yieldVal) || yieldVal < 0)) {
      throw new Error('Yield rate must be zero or positive.');
    }

    const bond = {
      id: createId('bond'),
      name,
      amount,
      yieldRate: yieldVal !== null ? Math.round(yieldVal * 100) / 100 : null,
      maturityDate: String(input.maturityDate || ''),
      note: String(input.note || '').trim().slice(0, 140)
    };

    return {
      ...state,
      investments: {
        ...state.investments,
        bonds: [bond, ...state.investments.bonds]
      }
    };
  }

  function deleteBond(state, id) {
    return {
      ...state,
      investments: {
        ...state.investments,
        bonds: state.investments.bonds.filter((b) => b.id !== id)
      }
    };
  }

  function addEtf(state, input) {
    const name = String(input.name || '').trim().slice(0, 100);
    if (!name) throw new Error('ETF name is required.');
    const ticker = String(input.ticker || '').trim().toUpperCase().slice(0, 16);

    const funds = [];
    if (input.initialAmount !== undefined && input.initialAmount !== '' && input.initialAmount !== null) {
      const amt = roundMoney(input.initialAmount);
      if (amt <= 0) throw new Error('Initial ETF fund amount must be greater than zero.');
      funds.push({
        id: createId('fund'),
        label: String(input.fundLabel || 'Initial Investment').trim().slice(0, 100) || 'Initial Investment',
        amount: amt,
        date: input.date || todayISO()
      });
    }

    const curVal = input.currentValue !== undefined && input.currentValue !== '' && input.currentValue !== null
      ? Number(input.currentValue)
      : null;
    if (curVal !== null && (!Number.isFinite(curVal) || curVal < 0)) {
      throw new Error('ETF current value must be zero or positive.');
    }

    const etf = {
      id: createId('etf'),
      name,
      ticker,
      currentValue: curVal !== null ? roundMoney(curVal) : null,
      funds
    };

    return {
      ...state,
      investments: {
        ...state.investments,
        etfs: [etf, ...state.investments.etfs]
      }
    };
  }

  function setEtfCurrentValue(state, etfId, value) {
    const idx = state.investments.etfs.findIndex((e) => e.id === etfId);
    if (idx === -1) throw new Error('ETF not found.');
    const parsed = value === '' || value === null || value === undefined ? null : Number(value);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      throw new Error('ETF current value must be zero or positive.');
    }
    const etfs = state.investments.etfs.slice();
    etfs[idx] = {
      ...etfs[idx],
      currentValue: parsed !== null ? roundMoney(parsed) : null
    };
    return {
      ...state,
      investments: {
        ...state.investments,
        etfs
      }
    };
  }

  function addEtfFund(state, etfId, input) {
    const idx = state.investments.etfs.findIndex((e) => e.id === etfId);
    if (idx === -1) throw new Error('ETF not found.');
    const amount = roundMoney(input.amount);
    if (amount <= 0) throw new Error('Fund amount must be greater than zero.');
    const label = String(input.label || 'Fund Contribution').trim().slice(0, 100) || 'Fund Contribution';

    const fund = {
      id: createId('fund'),
      label,
      amount,
      date: input.date || todayISO()
    };

    const existing = state.investments.etfs[idx];
    const etfs = state.investments.etfs.slice();
    etfs[idx] = {
      ...existing,
      currentValue: existing.currentValue !== null && existing.currentValue !== undefined
        ? roundMoney(existing.currentValue + amount)
        : null,
      funds: [fund, ...existing.funds]
    };

    return {
      ...state,
      investments: {
        ...state.investments,
        etfs
      }
    };
  }

  function deleteEtfFund(state, etfId, fundId) {
    const idx = state.investments.etfs.findIndex((e) => e.id === etfId);
    if (idx === -1) return state;
    const etfs = state.investments.etfs.slice();
    etfs[idx] = {
      ...etfs[idx],
      funds: etfs[idx].funds.filter((f) => f.id !== fundId)
    };
    return {
      ...state,
      investments: {
        ...state.investments,
        etfs
      }
    };
  }

  function deleteEtf(state, etfId) {
    return {
      ...state,
      investments: {
        ...state.investments,
        etfs: state.investments.etfs.filter((e) => e.id !== etfId)
      }
    };
  }

  function addStock(state, input) {
    const company = String(input.company || '').trim().slice(0, 100);
    const shares = Number(input.shares);
    const pricePerShare = Number(input.pricePerShare);
    const buyPrice = input.buyPrice !== undefined && input.buyPrice !== '' && input.buyPrice !== null
      ? Number(input.buyPrice)
      : null;

    if (!company) throw new Error('Company name is required.');
    if (!Number.isFinite(shares) || shares <= 0) throw new Error('Shares must be greater than zero.');
    if (!Number.isFinite(pricePerShare) || pricePerShare < 0) throw new Error('Price per share must be zero or positive.');
    if (buyPrice !== null && (!Number.isFinite(buyPrice) || buyPrice < 0)) {
      throw new Error('Average buy price must be zero or positive.');
    }

    const stock = {
      id: createId('stk'),
      company,
      ticker: String(input.ticker || '').trim().toUpperCase().slice(0, 16),
      shares: Math.round(shares * 1000000) / 1000000,
      pricePerShare: roundMoney(pricePerShare),
      buyPrice: buyPrice !== null ? roundMoney(buyPrice) : null,
      date: input.date || todayISO(),
      note: String(input.note || '').trim().slice(0, 140)
    };

    return {
      ...state,
      investments: {
        ...state.investments,
        stocks: [stock, ...state.investments.stocks]
      }
    };
  }

  function updateStock(state, id, updates) {
    const idx = state.investments.stocks.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error('Stock holding not found.');
    const existing = state.investments.stocks[idx];

    let nextBuyPrice = existing.buyPrice;
    if (updates.buyPrice !== undefined) {
      nextBuyPrice = updates.buyPrice === '' || updates.buyPrice === null ? null : roundMoney(updates.buyPrice);
    }

    const next = {
      ...existing,
      company: updates.company !== undefined ? String(updates.company).trim().slice(0, 100) : existing.company,
      ticker: updates.ticker !== undefined ? String(updates.ticker).trim().toUpperCase().slice(0, 16) : existing.ticker,
      shares: updates.shares !== undefined ? Math.round(Number(updates.shares) * 1000000) / 1000000 : existing.shares,
      pricePerShare: updates.pricePerShare !== undefined ? roundMoney(updates.pricePerShare) : existing.pricePerShare,
      buyPrice: nextBuyPrice,
      date: updates.date !== undefined ? updates.date : existing.date,
      note: updates.note !== undefined ? String(updates.note).trim().slice(0, 140) : existing.note
    };
    if (!next.company) throw new Error('Company name is required.');
    if (!Number.isFinite(next.shares) || next.shares <= 0) throw new Error('Shares must be greater than zero.');
    if (!Number.isFinite(next.pricePerShare) || next.pricePerShare < 0) throw new Error('Price per share must be zero or positive.');

    const stocks = state.investments.stocks.slice();
    stocks[idx] = next;
    return {
      ...state,
      investments: {
        ...state.investments,
        stocks
      }
    };
  }

  function deleteStock(state, id) {
    return {
      ...state,
      investments: {
        ...state.investments,
        stocks: state.investments.stocks.filter((s) => s.id !== id)
      }
    };
  }

  function addInvestmentSnapshot(state, input) {
    const summary = computeSummary(state);
    const date = (input && input.date) || todayISO();
    const hasCustomTotal = input && input.total !== undefined && input.total !== '' && input.total !== null;
    const bonds = input && input.bonds !== undefined ? roundMoney(input.bonds) : summary.totalBonds;
    const etfs = input && input.etfs !== undefined ? roundMoney(input.etfs) : summary.totalEtfs;
    const stocks = input && input.stocks !== undefined ? roundMoney(input.stocks) : summary.totalStocks;
    const total = hasCustomTotal ? roundMoney(input.total) : roundMoney(bonds + etfs + stocks);
    if (!Number.isFinite(total) || total < 0) {
      throw new Error('Snapshot total must be zero or positive.');
    }

    const existingIdx = (state.investments.snapshots || []).findIndex((s) => s.date === date);
    const nextSnap = {
      id: existingIdx >= 0 ? state.investments.snapshots[existingIdx].id : createId('snap'),
      date,
      bonds: hasCustomTotal ? 0 : bonds,
      etfs: hasCustomTotal ? 0 : etfs,
      stocks: hasCustomTotal ? 0 : stocks,
      total,
      note: String((input && input.note) || '').trim().slice(0, 100)
    };

    const snapshots = (state.investments.snapshots || []).slice();
    if (existingIdx >= 0) {
      snapshots[existingIdx] = nextSnap;
    } else {
      snapshots.push(nextSnap);
    }

    return {
      ...state,
      investments: {
        ...state.investments,
        snapshots
      }
    };
  }

  function deleteInvestmentSnapshot(state, id) {
    return {
      ...state,
      investments: {
        ...state.investments,
        snapshots: (state.investments.snapshots || []).filter((s) => s.id !== id)
      }
    };
  }

  function createSampleState() {
    const today = todayISO();
    const d = new Date();
    const prevDate = (monthsAgo) => {
      const copy = new Date(d.getFullYear(), d.getMonth() - monthsAgo, 15);
      const y = copy.getFullYear();
      const m = String(copy.getMonth() + 1).padStart(2, '0');
      const day = String(copy.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const ym = today.slice(0, 7);
    const prevYm = prevDate(1).slice(0, 7);

    return normalizeState({
      version: SCHEMA_VERSION,
      settings: {
        currency: 'SGD',
        deductInvestmentsFromBalance: false,
        theme: 'system'
      },
      balance: {
        baseAmount: 6500,
        incomes: [
          { id: createId('inc'), label: 'Monthly Salary', amount: 5200, date: `${ym}-01` },
          { id: createId('inc'), label: 'Freelance Advisory', amount: 850, date: `${ym}-08` }
        ]
      },
      expenses: [
        { id: createId('exp'), amount: 14.5, category: 'food', subcategory: 'meals', tag: 'personal', date: today, note: 'Hawker lunch & drink' },
        { id: createId('exp'), amount: 6.8, category: 'food', subcategory: 'snacks', tag: 'personal', date: today, note: 'Kopi & kaya toast' },
        { id: createId('exp'), amount: 142.3, category: 'shopping', subcategory: 'groceries', tag: 'family', date: `${ym}-12`, note: 'Weekly NTUC FairPrice run' },
        { id: createId('exp'), amount: 38.0, category: 'shopping', subcategory: 'books', tag: 'personal', date: `${ym}-10`, note: 'Design & investing books' },
        { id: createId('exp'), amount: 48.0, category: 'leisure', subcategory: 'movies', tag: 'family', date: `${ym}-09`, note: 'Weekend cinema tickets' },
        { id: createId('exp'), amount: 74.0, category: 'leisure', subcategory: 'friends', tag: 'personal', date: `${ym}-07`, note: 'Dinner hangout' },
        { id: createId('exp'), amount: 42.0, category: 'transport', subcategory: 'public', tag: 'personal', date: `${ym}-06`, note: 'MRT SimplyGo top-up' },
        { id: createId('exp'), amount: 65.5, category: 'transport', subcategory: 'private', tag: 'family', date: `${ym}-05`, note: 'Weekend Grab & petrol' },
        { id: createId('exp'), amount: 19.98, category: 'bills', subcategory: 'apple', tag: 'personal', date: `${ym}-04`, note: 'Apple One & iCloud+' },
        { id: createId('exp'), amount: 13.98, category: 'bills', subcategory: 'google', tag: 'family', date: `${ym}-03`, note: 'Google One 2TB family plan' },
        { id: createId('exp'), amount: 19.9, category: 'bills', subcategory: 'xbox', tag: 'personal', date: `${ym}-03`, note: 'Xbox Game Pass' },
        { id: createId('exp'), amount: 185.0, category: 'bills', subcategory: 'car', tag: 'family', date: `${ym}-02`, note: 'Parking & road tax reserve' },
        { id: createId('exp'), amount: 55.0, category: 'bills', subcategory: 'work', tag: 'personal', date: `${ym}-01`, note: 'Software & productivity tools' },
        { id: createId('exp'), amount: 135.0, category: 'shopping', subcategory: 'groceries', tag: 'family', date: `${prevYm}-18`, note: 'Household supplies' },
        { id: createId('exp'), amount: 24.0, category: 'food', subcategory: 'meals', tag: 'personal', date: `${prevYm}-12`, note: 'Dinner with colleagues' }
      ],
      investments: {
        bonds: [
          { id: createId('bond'), name: 'Singapore Savings Bond (SSB)', amount: 8000, yieldRate: 3.15, maturityDate: '2034-06-01', note: '10-year step-up' },
          { id: createId('bond'), name: '6-Month Singapore T-Bill', amount: 4000, yieldRate: 3.4, maturityDate: '2027-04-15', note: 'Cash reserve' }
        ],
        etfs: [
          {
            id: createId('etf'),
            name: 'Vanguard S&P 500 ETF',
            ticker: 'VOO',
            currentValue: 6420,
            funds: [
              { id: createId('fund'), label: 'Core S&P 500 Index Fund', amount: 4200, date: prevDate(2) },
              { id: createId('fund'), label: 'Monthly DCA', amount: 1500, date: `${ym}-01` }
            ]
          },
          {
            id: createId('etf'),
            name: 'Straits Times Index ETF',
            ticker: 'ES3',
            currentValue: 2980,
            funds: [
              { id: createId('fund'), label: 'SG Equity Core Fund', amount: 2800, date: prevDate(1) }
            ]
          }
        ],
        stocks: [
          { id: createId('stk'), company: 'DBS Group Holdings', ticker: 'D05', shares: 120, pricePerShare: 41.5, buyPrice: 36.2, date: prevDate(3), note: 'Dividend core' },
          { id: createId('stk'), company: 'Apple Inc.', ticker: 'AAPL', shares: 15, pricePerShare: 298.0, buyPrice: 255.0, date: prevDate(2), note: 'US tech hold' }
        ],
        snapshots: [
          { id: createId('snap'), date: prevDate(3), bonds: 8000, etfs: 4200, stocks: 6100, total: 18300, note: 'Q3 baseline' },
          { id: createId('snap'), date: prevDate(2), bonds: 10000, etfs: 5700, stocks: 7200, total: 22900, note: 'Added T-Bills & AAPL' },
          { id: createId('snap'), date: prevDate(1), bonds: 12000, etfs: 7500, stocks: 8400, total: 27900, note: 'Added ES3' },
          { id: createId('snap'), date: today, bonds: 12000, etfs: 9400, stocks: 9450, total: 30850, note: 'Current portfolio' }
        ]
      }
    });
  }

  function loadFromStorage(storage) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return createEmptyState();
    try {
      const raw = store.getItem(STORAGE_KEY);
      if (!raw) return createEmptyState();
      return normalizeState(JSON.parse(raw));
    } catch (_err) {
      return createEmptyState();
    }
  }

  function saveToStorage(state, storage) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return false;
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (_err) {
      return false;
    }
  }

  function exportExpensesCsv(expenses) {
    const escape = (val) => {
      const str = String(val === undefined || val === null ? '' : val);
      if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const rows = [['Date', 'Category', 'Subcategory', 'Tag', 'Amount', 'Note']];
    for (const exp of expenses) {
      rows.push([exp.date, exp.category, exp.subcategory, exp.tag, exp.amount.toFixed(2), exp.note]);
    }
    return rows.map((r) => r.map(escape).join(',')).join('\n');
  }

  return {
    STORAGE_KEY,
    SCHEMA_VERSION,
    EXPENSE_CATEGORIES,
    EXPENSE_TAGS,
    CURRENCIES,
    todayISO,
    roundMoney,
    getCurrencyInfo,
    formatCurrency,
    createEmptyState,
    createSampleState,
    normalizeState,
    getCategory,
    getSubcategoriesForCategory,
    getAllTags,
    getSubcategoryLabel,
    getTagInfo,
    isValidCategorySubcategory,
    isValidTag,
    addCustomSubcategory,
    deleteCustomSubcategory,
    addCustomTag,
    deleteCustomTag,
    getEtfTotal,
    getEtfCurrentValue,
    getStockTotal,
    getStockCostBasis,
    computeSummary,
    computeAnalysis,
    addExpense,
    updateExpense,
    deleteExpense,
    setBaseBalance,
    addIncome,
    deleteIncome,
    addBond,
    deleteBond,
    addEtf,
    setEtfCurrentValue,
    addEtfFund,
    deleteEtfFund,
    deleteEtf,
    addStock,
    updateStock,
    deleteStock,
    addInvestmentSnapshot,
    deleteInvestmentSnapshot,
    loadFromStorage,
    saveToStorage,
    exportExpensesCsv
  };
}));
