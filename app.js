(function () {
  'use strict';

  const Store = window.FinanceStore;
  let state = Store.loadFromStorage();

  const ui = {
    activeTab: 'expenses',
    tagFilter: 'all',
    categoryFilter: 'all',
    monthFilter: 'all',
    searchFilter: '',
    analysisSubCategoryFilter: 'all',
    lastRepeatedExpense: null,
    invFold: 'all',
    editingExpenseId: null,
    editingStockId: null
  };

  function $(id) {
    return document.getElementById(id);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function svgEl(tag, attrs) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      node.setAttribute(k, String(v));
    }
    return node;
  }

  function baseCurrency() {
    return (state.settings && state.settings.baseCurrency) || 'SGD';
  }

  function displayCurrency() {
    return (state.settings && state.settings.currency) || 'SGD';
  }

  function fxRates() {
    return (state.settings && state.settings.fxRates) || Store.DEFAULT_FX_RATES;
  }

  function displayAmount(baseAmt) {
    return Store.convertAmount(baseAmt, baseCurrency(), displayCurrency(), fxRates());
  }

  function toBaseAmount(dispAmt) {
    return Store.convertAmount(dispAmt, displayCurrency(), baseCurrency(), fxRates());
  }

  function formatDisplayOnly(dispAmt) {
    return Store.formatCurrency(dispAmt, displayCurrency());
  }

  function formatMoney(amount) {
    return Store.formatCurrency(displayAmount(amount), displayCurrency());
  }

  function formatSignedMoney(amount) {
    const converted = displayAmount(amount);
    const prefix = converted > 0 ? '+' : '';
    return `${prefix}${Store.formatCurrency(converted, displayCurrency())}`;
  }

  function formatShares(shares) {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6
    }).format(shares);
  }

  function persistAndRender() {
    Store.saveToStorage(state);
    render();
  }

  /* Theme */
  function applyTheme() {
    const pref = (state.settings && state.settings.theme) || 'system';
    const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const effective = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
    document.documentElement.setAttribute('data-theme', effective);
    const btn = $('theme-toggle');
    if (btn) {
      btn.textContent = effective === 'dark' ? 'Light Mode' : 'Dark Mode';
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    state = {
      ...state,
      settings: {
        ...state.settings,
        theme: current === 'dark' ? 'light' : 'dark'
      }
    };
    persistAndRender();
  }

  /* Currency & Category Select Initialization */
  function initStaticControls() {
    const currencySelect = $('currency-select');
    currencySelect.textContent = '';
    for (const c of Store.CURRENCIES) {
      const opt = el('option', '', c.label);
      opt.value = c.code;
      currencySelect.appendChild(opt);
    }
    currencySelect.value = state.settings.currency || 'SGD';

    const catSelect = $('expense-category');
    const filterCat = $('filter-category');
    const analysisSubCat = $('analysis-sub-category-filter');
    const dialogCat = $('dialog-sub-category');
    catSelect.textContent = '';
    dialogCat.textContent = '';
    for (const cat of Store.EXPENSE_CATEGORIES) {
      const opt = el('option', '', cat.label);
      opt.value = cat.id;
      catSelect.appendChild(opt);

      const fOpt = el('option', '', cat.label);
      fOpt.value = cat.id;
      filterCat.appendChild(fOpt);

      const aOpt = el('option', '', cat.label);
      aOpt.value = cat.id;
      analysisSubCat.appendChild(aOpt);

      const dOpt = el('option', '', cat.label);
      dOpt.value = cat.id;
      dialogCat.appendChild(dOpt);
    }

    syncSubcategoryOptions();
    renderExpenseTagOptions('personal');
    $('expense-date').value = Store.todayISO();
    $('income-date').value = Store.todayISO();
    $('snapshot-date').value = Store.todayISO();
  }

  function syncSubcategoryOptions(selectedSub) {
    const catId = $('expense-category').value;
    const subs = Store.getSubcategoriesForCategory(state, catId);
    const subSelect = $('expense-subcategory');
    const prev = selectedSub || subSelect.value;
    subSelect.textContent = '';
    for (const sub of subs) {
      const opt = el('option', '', sub.label);
      opt.value = sub.id;
      subSelect.appendChild(opt);
    }
    if (prev && subs.some((s) => s.id === prev)) {
      subSelect.value = prev;
    }
  }

  function renderExpenseTagOptions(selectedTag) {
    const group = $('expense-tag-group');
    const checked = document.querySelector('input[name="tag"]:checked');
    const tags = Store.getAllTags(state);
    const targetTag = selectedTag || (checked ? checked.value : 'personal');
    const validTarget = tags.some((t) => t.id === targetTag) ? targetTag : 'personal';

    group.textContent = '';
    for (const tag of tags) {
      const lbl = el('label', 'segment-option');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'tag';
      input.value = tag.id;
      if (tag.id === validTarget) input.checked = true;

      const span = el('span');
      const dot = el('i', 'dot');
      dot.style.backgroundColor = tag.color;
      span.appendChild(dot);
      span.appendChild(document.createTextNode(tag.label));

      lbl.appendChild(input);
      lbl.appendChild(span);
      group.appendChild(lbl);
    }
  }

  /* Tabs */
  function setActiveTab(tabName) {
    ui.activeTab = tabName;
    const tabs = document.querySelectorAll('[role="tab"]');
    tabs.forEach((btn) => {
      const active = btn.dataset.tab === tabName;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
    });

    const panels = {
      expenses: $('panel-expenses'),
      investments: $('panel-investments'),
      analysis: $('panel-analysis')
    };
    for (const [key, panel] of Object.entries(panels)) {
      const show = key === tabName;
      panel.classList.toggle('hidden', !show);
      panel.hidden = !show;
    }
  }

  /* Hero Rendering */
  function renderHero(summary) {
    const heroEl = $('hero-balance');
    heroEl.textContent = formatMoney(summary.cashBalance);
    heroEl.classList.toggle('is-negative', summary.cashBalance < 0);

    const deduct = Boolean(state.settings.deductInvestmentsFromBalance);
    $('balance-mode-badge').textContent = deduct
      ? 'After Investments'
      : state.settings.syncInvestmentsWithBalance
        ? 'Cash (Synced)'
        : 'Cash Available';

    const tx = summary.totalInvestmentTransfers || 0;
    const txPart = tx > 0
      ? ` + Sold Inv ${formatMoney(tx)}`
      : tx < 0
        ? ` − Invested ${formatMoney(Math.abs(tx))}`
        : '';
    const baseStr = `Starting ${formatMoney(summary.baseBalance)} + Income ${formatMoney(summary.totalIncome)} − Expenses ${formatMoney(summary.totalExpenses)}${txPart}`;
    $('hero-formula').textContent = deduct
      ? `${baseStr} − Investments ${formatMoney(summary.totalInvestments)}`
      : baseStr;

    $('metric-networth').textContent = formatMoney(summary.netWorth);
    $('metric-expenses').textContent = formatMoney(summary.totalExpenses);
    $('metric-expenses-sub').textContent = `${state.expenses.length} ${state.expenses.length === 1 ? 'entry' : 'entries'}`;
    $('metric-investments').textContent = formatMoney(summary.totalInvestments);

    const invCount = state.investments.bonds.length + state.investments.etfs.length + state.investments.stocks.length;
    $('metric-investments-sub').textContent = `${invCount} ${invCount === 1 ? 'holding' : 'holdings'}`;

    $('tab-expenses-count').textContent = String(state.expenses.length);
    $('tab-investments-count').textContent = String(invCount);
  }

  /* Expenses Rendering */
  function getFilteredExpenses() {
    const search = ui.searchFilter.trim().toLowerCase();
    return state.expenses.filter((exp) => {
      if (ui.tagFilter !== 'all' && exp.tag !== ui.tagFilter) return false;
      if (ui.categoryFilter !== 'all' && exp.category !== ui.categoryFilter) return false;
      if (ui.monthFilter !== 'all' && !String(exp.date).startsWith(ui.monthFilter)) return false;
      if (search) {
        const hay = `${exp.note} ${exp.category} ${exp.subcategory} ${exp.tag}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function syncMonthFilterOptions() {
    const select = $('filter-month');
    const prev = ui.monthFilter;
    const months = Array.from(
      new Set(state.expenses.map((e) => String(e.date || '').slice(0, 7)).filter(Boolean))
    ).sort().reverse();

    select.textContent = '';
    const allOpt = el('option', '', 'All Months');
    allOpt.value = 'all';
    select.appendChild(allOpt);

    for (const ym of months) {
      const opt = el('option', '', ym);
      opt.value = ym;
      select.appendChild(opt);
    }

    if (prev !== 'all' && months.includes(prev)) {
      select.value = prev;
    } else {
      ui.monthFilter = 'all';
      select.value = 'all';
    }
  }

  function renderExpenseBreakdown(summary) {
    const total = summary.totalExpenses;
    const allTags = Store.getAllTags(state);

    const bar = $('tag-split-bar');
    const legend = $('tag-split-legend');
    bar.textContent = '';
    legend.textContent = '';

    if (total > 0) {
      const parts = [];
      for (const tag of allTags) {
        const amt = summary.byTag[tag.id] || 0;
        const pct = Math.round((amt / total) * 100);
        if (amt > 0) {
          const seg = el('div', 'bar-segment');
          seg.style.width = `${(amt / total) * 100}%`;
          seg.style.backgroundColor = tag.color;
          bar.appendChild(seg);
          parts.push(`${pct}% ${tag.label}`);
        }
      }
      $('tag-split-summary').textContent = parts.join(' • ');
    } else {
      const equalWidth = `${100 / Math.max(allTags.length, 1)}%`;
      for (const tag of allTags) {
        const seg = el('div', 'bar-segment');
        seg.style.width = equalWidth;
        seg.style.backgroundColor = tag.color;
        bar.appendChild(seg);
      }
      $('tag-split-summary').textContent = 'No expenses yet';
    }

    for (const tag of allTags) {
      const amt = summary.byTag[tag.id] || 0;
      const item = el('span', 'legend-item');
      const dot = el('i', 'dot');
      dot.style.backgroundColor = tag.color;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(`${tag.label} `));
      item.appendChild(el('strong', 'tabular-nums', formatMoney(amt)));
      legend.appendChild(item);
    }

    const container = $('category-breakdown');
    container.textContent = '';

    for (const cat of Store.EXPENSE_CATEGORIES) {
      const data = summary.byCategory[cat.id];
      const pct = total > 0 ? Math.round((data.total / total) * 100) : 0;

      const row = el('div', 'cat-row');

      const top = el('div', 'cat-row-top');
      const left = el('span', 'cat-name-wrap');
      const dot = el('i', 'dot');
      dot.style.backgroundColor = cat.color;
      left.appendChild(dot);
      left.appendChild(document.createTextNode(cat.label));

      const right = el('span', 'tabular-nums', `${formatMoney(data.total)} (${pct}%)`);
      top.appendChild(left);
      top.appendChild(right);

      const track = el('div', 'cat-track');
      const fill = el('div', 'cat-fill');
      fill.style.width = `${pct}%`;
      fill.style.backgroundColor = cat.color;
      track.appendChild(fill);

      const subs = el('div', 'cat-subs');
      for (const sub of Store.getSubcategoriesForCategory(state, cat.id)) {
        const subAmt = data.subcategories[sub.id] || 0;
        subs.appendChild(el('span', 'sub-chip tabular-nums', `${sub.label}: ${formatMoney(subAmt)}`));
      }

      row.appendChild(top);
      row.appendChild(track);
      row.appendChild(subs);
      container.appendChild(row);
    }
  }

  function renderTagFilterPills() {
    const wrap = $('tag-filter-pills');
    const allTags = Store.getAllTags(state);
    if (ui.tagFilter !== 'all' && !allTags.some((t) => t.id === ui.tagFilter)) {
      ui.tagFilter = 'all';
    }

    wrap.textContent = '';
    const options = [{ id: 'all', label: 'All' }, ...allTags];
    for (const opt of options) {
      const btn = el(
        'button',
        `pill-filter${ui.tagFilter === opt.id ? ' is-active' : ''}`,
        opt.label
      );
      btn.type = 'button';
      btn.addEventListener('click', () => {
        ui.tagFilter = opt.id;
        renderTagFilterPills();
        renderExpenseList();
      });
      wrap.appendChild(btn);
    }
  }

  function triggerRepeatExpense(exp) {
    state = Store.repeatExpense(state, exp.id, Store.todayISO());
    const created = state.expenses[0];
    const subLabel = Store.getSubcategoryLabel(state, exp.category, exp.subcategory);
    const labelText = exp.note ? `${exp.note} (${subLabel})` : subLabel;
    ui.lastRepeatedExpense = {
      id: created.id,
      text: `Re-logged "${labelText}" (${formatMoney(created.amount)}) for ${created.date}`
    };
    persistAndRender();
  }

  function renderQuickRepeatStrip() {
    const strip = $('quick-repeat-strip');
    strip.textContent = '';
    if (state.expenses.length === 0) {
      strip.classList.add('hidden');
      return;
    }

    const seen = new Set();
    const presets = [];
    for (const exp of state.expenses) {
      const key = `${exp.category}|${exp.subcategory}|${exp.tag}|${exp.amount}|${exp.note}`;
      if (seen.has(key)) continue;
      seen.add(key);
      presets.push(exp);
      if (presets.length >= 4) break;
    }

    strip.classList.remove('hidden');
    strip.appendChild(el('span', 'quick-repeat-label', 'Quick repeat:'));
    for (const exp of presets) {
      const cat = Store.getCategory(exp.category);
      const subLabel = Store.getSubcategoryLabel(state, exp.category, exp.subcategory);
      const btn = el('button', 'quick-repeat-chip tabular-nums');
      btn.type = 'button';
      const dot = el('i', 'dot');
      dot.style.backgroundColor = cat ? cat.color : '#64748b';
      btn.appendChild(dot);
      const label = exp.note ? `${exp.note} · ${formatMoney(exp.amount)}` : `${subLabel} · ${formatMoney(exp.amount)}`;
      btn.appendChild(document.createTextNode(label));
      btn.title = `Re-log ${cat ? cat.label : exp.category} · ${subLabel} (${formatMoney(exp.amount)}) for today`;
      btn.addEventListener('click', () => triggerRepeatExpense(exp));
      strip.appendChild(btn);
    }
  }

  function renderRepeatBanner() {
    const banner = $('repeat-banner');
    if (!ui.lastRepeatedExpense || !state.expenses.some((e) => e.id === ui.lastRepeatedExpense.id)) {
      banner.classList.add('hidden');
      ui.lastRepeatedExpense = null;
      return;
    }
    $('repeat-banner-text').textContent = ui.lastRepeatedExpense.text;
    banner.classList.remove('hidden');
  }

  function renderExpenseList() {
    syncMonthFilterOptions();
    renderTagFilterPills();
    renderQuickRepeatStrip();
    renderRepeatBanner();
    const list = $('expense-list');
    list.textContent = '';
    const filtered = getFilteredExpenses();
    const filteredTotal = filtered.reduce((sum, e) => sum + e.amount, 0);

    $('expense-filter-summary').textContent = `${filtered.length} ${filtered.length === 1 ? 'expense' : 'expenses'} • ${formatMoney(filteredTotal)}`;

    if (filtered.length === 0) {
      list.appendChild(el('div', 'empty-state', 'No expenses match your filters yet.'));
      return;
    }

    for (const exp of filtered) {
      const cat = Store.getCategory(exp.category);
      const subLabel = Store.getSubcategoryLabel(state, exp.category, exp.subcategory);
      const tagInfo = Store.getTagInfo(state, exp.tag);

      const row = el('div', 'item-row');
      const main = el('div', 'item-main');

      const titleLine = el('div', 'item-title-line');
      const dot = el('i', 'dot');
      dot.style.backgroundColor = cat ? cat.color : '#64748b';
      titleLine.appendChild(dot);
      titleLine.appendChild(document.createTextNode(`${cat ? cat.label : exp.category} · ${subLabel}`));

      const tagBadge = el('span', 'tag-badge', tagInfo.label);
      tagBadge.style.color = tagInfo.color;
      tagBadge.style.backgroundColor = `${tagInfo.color}22`;
      titleLine.appendChild(tagBadge);

      const metaText = exp.note ? `${exp.date} • ${exp.note}` : exp.date;
      const meta = el('div', 'item-meta', metaText);

      main.appendChild(titleLine);
      main.appendChild(meta);

      const right = el('div', 'item-right');
      right.appendChild(el('span', 'item-amount tabular-nums', `−${formatMoney(exp.amount)}`));

      const actions = el('div', 'item-actions');
      const repeatBtn = el('button', 'btn btn-ghost btn-xs', 'Repeat');
      repeatBtn.type = 'button';
      repeatBtn.title = 'Re-log this expense for today';
      repeatBtn.addEventListener('click', () => triggerRepeatExpense(exp));

      const editBtn = el('button', 'btn btn-ghost btn-xs', 'Edit');
      editBtn.type = 'button';
      editBtn.addEventListener('click', () => startEditExpense(exp));

      const delBtn = el('button', 'btn btn-ghost btn-xs', 'Delete');
      delBtn.type = 'button';
      delBtn.addEventListener('click', () => {
        if (ui.editingExpenseId === exp.id) cancelEditExpense();
        state = Store.deleteExpense(state, exp.id);
        persistAndRender();
      });

      actions.appendChild(repeatBtn);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      right.appendChild(actions);

      row.appendChild(main);
      row.appendChild(right);
      list.appendChild(row);
    }
  }

  function startEditExpense(exp) {
    ui.editingExpenseId = exp.id;
    $('expense-edit-id').value = exp.id;
    $('expense-amount').value = displayAmount(exp.amount);
    $('expense-date').value = exp.date;
    $('expense-category').value = exp.category;
    syncSubcategoryOptions(exp.subcategory);
    renderExpenseTagOptions(exp.tag);
    $('expense-note').value = exp.note || '';
    $('expense-form-title').textContent = 'Edit Expense';
    $('expense-submit-btn').textContent = 'Save Changes';
    $('cancel-edit-expense').classList.remove('hidden');
    $('expense-amount').focus();
  }

  function cancelEditExpense() {
    ui.editingExpenseId = null;
    $('expense-edit-id').value = '';
    $('expense-form').reset();
    $('expense-date').value = Store.todayISO();
    syncSubcategoryOptions();
    renderExpenseTagOptions('personal');
    $('expense-form-title').textContent = 'Log Expense';
    $('expense-submit-btn').textContent = 'Add Expense';
    $('cancel-edit-expense').classList.add('hidden');
  }

  /* Investments Rendering */
  function renderInvestments(summary) {
    const total = summary.totalInvestments;
    const bondsPct = total > 0 ? Math.round((summary.totalBonds / total) * 100) : 0;
    const etfsPct = total > 0 ? Math.round((summary.totalEtfs / total) * 100) : 0;
    const stocksPct = total > 0 ? Math.max(0, 100 - bondsPct - etfsPct) : 0;

    $('bar-bonds').style.width = `${bondsPct}%`;
    $('bar-etfs').style.width = `${etfsPct}%`;
    $('bar-stocks').style.width = `${stocksPct}%`;

    $('inv-total-bonds').textContent = formatMoney(summary.totalBonds);
    $('inv-pct-bonds').textContent = `${bondsPct}%`;
    $('inv-total-etfs').textContent = formatMoney(summary.totalEtfs);
    $('inv-pct-etfs').textContent = `${etfsPct}%`;
    $('inv-total-stocks').textContent = formatMoney(summary.totalStocks);
    $('inv-pct-stocks').textContent = `${stocksPct}%`;

    $('bonds-badge-total').textContent = formatMoney(summary.totalBonds);
    $('etfs-badge-total').textContent = formatMoney(summary.totalEtfs);
    $('stocks-badge-total').textContent = formatMoney(summary.totalStocks);

    const grid = document.querySelector('.investments-grid');
    grid.classList.toggle('is-focused', ui.invFold !== 'all');
    $('fold-bonds').classList.toggle('hidden', ui.invFold !== 'all' && ui.invFold !== 'bonds');
    $('fold-etfs').classList.toggle('hidden', ui.invFold !== 'all' && ui.invFold !== 'etfs');
    $('fold-stocks').classList.toggle('hidden', ui.invFold !== 'all' && ui.invFold !== 'stocks');

    document.querySelectorAll('[data-inv-fold]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.invFold === ui.invFold);
    });
    document.querySelectorAll('[data-inv-fold-card]').forEach((card) => {
      card.classList.toggle('is-active', card.dataset.invFoldCard === ui.invFold);
    });

    const syncEnabled = Boolean(state.settings.syncInvestmentsWithBalance);
    $('sync-investments-toggle').checked = syncEnabled;
    $('bond-adjust-balance').checked = syncEnabled;
    $('etf-adjust-balance').checked = syncEnabled;
    if (!ui.editingStockId) {
      $('stock-adjust-balance').checked = syncEnabled;
      updateStockPreview();
    }

    renderBondsList();
    renderEtfsList();
    renderStocksList();
  }

  function renderBondsList() {
    const list = $('bonds-list');
    list.textContent = '';
    if (state.investments.bonds.length === 0) {
      list.appendChild(el('div', 'empty-state', 'No bonds added yet.'));
      return;
    }

    for (const bond of state.investments.bonds) {
      const row = el('div', 'item-row');
      const main = el('div', 'item-main');
      const title = el('div', 'item-title-line', bond.name);
      if (bond.yieldRate !== null) {
        title.appendChild(el('span', 'pill-badge tabular-nums', `${bond.yieldRate}% yield`));
      }
      const metaParts = [];
      if (bond.maturityDate) metaParts.push(`Matures ${bond.maturityDate}`);
      if (bond.note) metaParts.push(bond.note);
      main.appendChild(title);
      if (metaParts.length > 0) {
        main.appendChild(el('div', 'item-meta', metaParts.join(' • ')));
      }

      const right = el('div', 'item-right');
      right.appendChild(el('span', 'item-amount tabular-nums', formatMoney(bond.amount)));
      const actions = el('div', 'item-actions');
      const sellBtn = el('button', 'btn btn-ghost btn-xs', 'Redeem');
      sellBtn.type = 'button';
      sellBtn.title = 'Remove bond and add principal back to Main Balance';
      sellBtn.addEventListener('click', () => {
        state = Store.sellBond(state, bond.id, true);
        persistAndRender();
      });
      const delBtn = el('button', 'btn btn-ghost btn-xs', 'Delete');
      delBtn.type = 'button';
      delBtn.addEventListener('click', () => {
        state = Store.deleteBond(state, bond.id);
        persistAndRender();
      });
      actions.appendChild(sellBtn);
      actions.appendChild(delBtn);
      right.appendChild(actions);

      row.appendChild(main);
      row.appendChild(right);
      list.appendChild(row);
    }
  }

  function renderEtfsList() {
    const list = $('etfs-list');
    list.textContent = '';
    if (state.investments.etfs.length === 0) {
      list.appendChild(el('div', 'empty-state', 'No ETFs added yet.'));
      return;
    }

    for (const etf of state.investments.etfs) {
      const card = el('div', 'etf-card');
      const header = el('div', 'etf-card-header');

      const cost = Store.getEtfTotal(etf);
      const currentVal = Store.getEtfCurrentValue(etf);
      const gain = Store.roundMoney(currentVal - cost);
      const gainPct = cost > 0 ? Math.round((gain / cost) * 1000) / 10 : 0;

      const left = el('div', 'item-main');
      const titleLine = el('div', 'item-title-line', etf.name);
      if (etf.ticker) {
        titleLine.appendChild(el('span', 'pill-badge', etf.ticker));
      }
      left.appendChild(titleLine);

      const metaStr = `${etf.funds.length} ${etf.funds.length === 1 ? 'fund' : 'funds'} • Invested ${formatMoney(cost)}`;
      left.appendChild(el('div', 'item-meta tabular-nums', metaStr));

      const right = el('div', 'item-right');
      right.appendChild(el('span', 'item-amount tabular-nums', formatMoney(currentVal)));
      const actions = el('div', 'item-actions');
      const sellEtfBtn = el('button', 'btn btn-ghost btn-xs', 'Sell');
      sellEtfBtn.type = 'button';
      sellEtfBtn.title = 'Remove ETF and add current value to Main Balance';
      sellEtfBtn.addEventListener('click', () => {
        state = Store.sellEtf(state, etf.id, true);
        persistAndRender();
      });
      const delEtfBtn = el('button', 'btn btn-ghost btn-xs', 'Remove');
      delEtfBtn.type = 'button';
      delEtfBtn.addEventListener('click', () => {
        state = Store.deleteEtf(state, etf.id);
        persistAndRender();
      });
      actions.appendChild(sellEtfBtn);
      actions.appendChild(delEtfBtn);
      right.appendChild(actions);

      header.appendChild(left);
      header.appendChild(right);
      card.appendChild(header);

      const valRow = el('div', 'etf-value-row');
      const gainSpan = el(
        'span',
        gain > 0 ? 'gain-positive tabular-nums' : gain < 0 ? 'gain-negative tabular-nums' : 'muted tabular-nums',
        gain === 0 ? 'Market value = Invested' : `Gain: ${formatSignedMoney(gain)} (${gain > 0 ? '+' : ''}${gainPct}%)`
      );
      const valForm = el('form', 'etf-value-form');
      const valInput = el('input');
      valInput.type = 'number';
      valInput.step = '0.01';
      valInput.min = '0';
      valInput.placeholder = 'Market val';
      valInput.value = etf.currentValue !== null && etf.currentValue !== undefined ? displayAmount(etf.currentValue) : '';
      valInput.setAttribute('aria-label', `Current market value for ${etf.name}`);
      const valBtn = el('button', 'btn btn-secondary btn-xs', 'Update Val');
      valBtn.type = 'submit';
      valForm.appendChild(valInput);
      valForm.appendChild(valBtn);
      valForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nextVal = valInput.value === '' ? '' : toBaseAmount(valInput.value);
        state = Store.setEtfCurrentValue(state, etf.id, nextVal);
        persistAndRender();
      });
      valRow.appendChild(gainSpan);
      valRow.appendChild(valForm);
      card.appendChild(valRow);

      const fundsWrap = el('div', 'etf-funds-list');
      if (etf.funds.length === 0) {
        fundsWrap.appendChild(el('div', 'muted', 'No funds logged in this ETF yet. Add funds below.'));
      } else {
        for (const fund of etf.funds) {
          const fRow = el('div', 'etf-fund-row');
          const fInfo = el('span', '', `${fund.label} (${fund.date})`);
          const fRight = el('span', 'item-right');
          fRight.appendChild(el('strong', 'tabular-nums', formatMoney(fund.amount)));
          const delFundBtn = el('button', 'btn btn-ghost btn-xs', '✕');
          delFundBtn.type = 'button';
          delFundBtn.setAttribute('aria-label', `Remove fund ${fund.label}`);
          delFundBtn.addEventListener('click', () => {
            state = Store.deleteEtfFund(state, etf.id, fund.id);
            persistAndRender();
          });
          fRight.appendChild(delFundBtn);
          fRow.appendChild(fInfo);
          fRow.appendChild(fRight);
          fundsWrap.appendChild(fRow);
        }
      }
      card.appendChild(fundsWrap);

      const addFundForm = el('form', 'etf-add-fund-form');
      const inputsRow = el('div', 'etf-fund-inputs');

      const modeSelect = el('select');
      modeSelect.setAttribute('aria-label', `Action for ${etf.name}`);
      const optBuy = el('option', '', 'Invest');
      optBuy.value = 'invest';
      const optSell = el('option', '', 'Withdraw');
      optSell.value = 'withdraw';
      modeSelect.appendChild(optBuy);
      modeSelect.appendChild(optSell);

      const labelInput = el('input');
      labelInput.type = 'text';
      labelInput.placeholder = 'Fund / tranche label';
      labelInput.required = true;
      labelInput.setAttribute('aria-label', `Fund label for ${etf.name}`);

      const amtInput = el('input');
      amtInput.type = 'number';
      amtInput.step = '0.01';
      amtInput.min = '0.01';
      amtInput.placeholder = 'Amount';
      amtInput.required = true;
      amtInput.setAttribute('aria-label', `Fund amount for ${etf.name}`);

      const addBtn = el('button', 'btn btn-secondary btn-xs', 'Apply');
      addBtn.type = 'submit';

      inputsRow.appendChild(modeSelect);
      inputsRow.appendChild(labelInput);
      inputsRow.appendChild(amtInput);
      inputsRow.appendChild(addBtn);

      const adjustLabel = el('label', 'checkbox-row checkbox-compact');
      const adjustCheck = el('input');
      adjustCheck.type = 'checkbox';
      adjustCheck.checked = Boolean(state.settings.syncInvestmentsWithBalance);
      const adjustSpan = el('span', '', 'Subtract from Main Balance');
      adjustLabel.appendChild(adjustCheck);
      adjustLabel.appendChild(adjustSpan);

      modeSelect.addEventListener('change', () => {
        adjustSpan.textContent = modeSelect.value === 'withdraw'
          ? 'Add withdrawal back to Main Balance'
          : 'Subtract from Main Balance';
      });

      addFundForm.appendChild(inputsRow);
      addFundForm.appendChild(adjustLabel);

      addFundForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const baseAmt = toBaseAmount(amtInput.value);
        if (modeSelect.value === 'withdraw') {
          state = Store.withdrawEtf(state, etf.id, {
            label: labelInput.value,
            amount: baseAmt,
            date: Store.todayISO(),
            adjustBalance: adjustCheck.checked
          });
        } else {
          state = Store.addEtfFund(state, etf.id, {
            label: labelInput.value,
            amount: baseAmt,
            date: Store.todayISO(),
            adjustBalance: adjustCheck.checked
          });
        }
        persistAndRender();
      });

      card.appendChild(addFundForm);
      list.appendChild(card);
    }
  }

  function renderStocksList() {
    const list = $('stocks-list');
    list.textContent = '';
    if (state.investments.stocks.length === 0) {
      list.appendChild(el('div', 'empty-state', 'No stocks added yet.'));
      return;
    }

    for (const stock of state.investments.stocks) {
      const row = el('div', 'item-row');
      const main = el('div', 'item-main');

      const titleLine = el('div', 'item-title-line', stock.company);
      if (stock.ticker) {
        titleLine.appendChild(el('span', 'pill-badge', stock.ticker));
      }

      const curTotal = Store.getStockTotal(stock);
      const costTotal = Store.getStockCostBasis(stock);
      const gain = Store.roundMoney(curTotal - costTotal);
      let sharesText = `${formatShares(stock.shares)} ${stock.shares === 1 ? 'share' : 'shares'} @ ${formatMoney(stock.pricePerShare)}`;
      if (stock.buyPrice !== null && stock.buyPrice !== undefined && gain !== 0) {
        const gainPct = costTotal > 0 ? Math.round((gain / costTotal) * 1000) / 10 : 0;
        sharesText += ` • ${formatSignedMoney(gain)} (${gain > 0 ? '+' : ''}${gainPct}%)`;
      }

      main.appendChild(titleLine);
      main.appendChild(el('div', 'item-meta tabular-nums', sharesText));

      const right = el('div', 'item-right');
      right.appendChild(el('span', 'item-amount tabular-nums', formatMoney(curTotal)));

      const actions = el('div', 'item-actions');
      const editBtn = el('button', 'btn btn-ghost btn-xs', 'Edit');
      editBtn.type = 'button';
      editBtn.addEventListener('click', () => startEditStock(stock));

      const sellBtn = el('button', 'btn btn-ghost btn-xs', 'Sell');
      sellBtn.type = 'button';
      sellBtn.title = 'Sell all shares and add proceeds to Main Balance';
      sellBtn.addEventListener('click', () => {
        if (ui.editingStockId === stock.id) cancelEditStock();
        state = Store.sellStock(state, stock.id, true);
        persistAndRender();
      });

      const delBtn = el('button', 'btn btn-ghost btn-xs', 'Delete');
      delBtn.type = 'button';
      delBtn.addEventListener('click', () => {
        if (ui.editingStockId === stock.id) cancelEditStock();
        state = Store.deleteStock(state, stock.id);
        persistAndRender();
      });

      actions.appendChild(editBtn);
      actions.appendChild(sellBtn);
      actions.appendChild(delBtn);
      right.appendChild(actions);

      row.appendChild(main);
      row.appendChild(right);
      list.appendChild(row);
    }
  }

  function updateStockPreview() {
    const shares = Number($('stock-shares').value);
    const price = Number($('stock-price').value);
    const buyPriceVal = $('stock-buy-price').value;
    const buyPrice = buyPriceVal !== '' ? Number(buyPriceVal) : null;
    const total = Number.isFinite(shares) && shares > 0 && Number.isFinite(price) && price >= 0
      ? Store.roundMoney(shares * price)
      : 0;
    $('stock-preview-total').textContent = formatDisplayOnly(total);

    const impactEl = $('stock-cash-impact');
    if (!impactEl) return;

    if (ui.editingStockId) {
      const existing = state.investments.stocks.find((s) => s.id === ui.editingStockId);
      if (existing && Number.isFinite(shares) && shares > 0 && Number.isFinite(price) && price >= 0) {
        const delta = Math.round((shares - existing.shares) * 1000000) / 1000000;
        if (delta > 0) {
          const cost = Store.roundMoney(delta * price);
          impactEl.textContent = `Adjust Main Balance (buying +${formatShares(delta)} → −${formatDisplayOnly(cost)})`;
        } else if (delta < 0) {
          const proceeds = Store.roundMoney(Math.abs(delta) * price);
          impactEl.textContent = `Adjust Main Balance (selling ${formatShares(Math.abs(delta))} → +${formatDisplayOnly(proceeds)})`;
        } else {
          impactEl.textContent = `Price update only (${formatDisplayOnly(0)} Main Balance change)`;
        }
        return;
      }
    }

    const unitCost = buyPrice !== null && Number.isFinite(buyPrice) && buyPrice >= 0 ? buyPrice : price;
    const cost = Number.isFinite(shares) && shares > 0 && Number.isFinite(unitCost) && unitCost >= 0
      ? Store.roundMoney(shares * unitCost)
      : 0;
    impactEl.textContent = cost > 0
      ? `Subtract ${formatDisplayOnly(cost)} from Main Balance`
      : 'Subtract purchase cost from Main Balance';
  }

  function startEditStock(stock) {
    ui.editingStockId = stock.id;
    $('stock-edit-id').value = stock.id;
    $('stock-company').value = stock.company;
    $('stock-ticker').value = stock.ticker || '';
    $('stock-shares').value = stock.shares;
    $('stock-price').value = displayAmount(stock.pricePerShare);
    $('stock-buy-price').value = stock.buyPrice !== null && stock.buyPrice !== undefined ? displayAmount(stock.buyPrice) : '';
    $('stock-adjust-balance').checked = Boolean(state.settings.syncInvestmentsWithBalance);
    $('stock-submit-btn').textContent = 'Save Stock';
    $('cancel-edit-stock').classList.remove('hidden');
    updateStockPreview();
    $('stock-shares').focus();
  }

  function cancelEditStock() {
    ui.editingStockId = null;
    $('stock-edit-id').value = '';
    $('stock-form').reset();
    $('stock-adjust-balance').checked = Boolean(state.settings.syncInvestmentsWithBalance);
    $('stock-submit-btn').textContent = 'Add Stock';
    $('cancel-edit-stock').classList.add('hidden');
    updateStockPreview();
  }

  /* Analysis Rendering */
  function renderGrowthChart(snapshots) {
    const wrap = $('growth-chart-wrap');
    wrap.textContent = '';

    if (snapshots.length === 0) {
      wrap.appendChild(el('div', 'empty-state', 'No snapshots yet. Click "Record Today\'s Snapshot" or add historical checkpoints below to track growth over time.'));
      return;
    }

    const width = 680;
    const height = 210;
    const padL = 68;
    const padR = 24;
    const padT = 20;
    const padB = 34;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;

    const values = snapshots.map((s) => s.total);
    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);
    if (minVal === maxVal) {
      minVal = Math.max(0, minVal * 0.9);
      maxVal = maxVal === 0 ? 100 : maxVal * 1.1;
    } else {
      const span = maxVal - minVal;
      minVal = Math.max(0, minVal - span * 0.12);
      maxVal = maxVal + span * 0.12;
    }

    const svg = svgEl('svg', {
      viewBox: `0 0 ${width} ${height}`,
      class: 'growth-svg',
      role: 'img',
      'aria-label': 'Portfolio value growth chart'
    });

    const defs = svgEl('defs');
    const grad = svgEl('linearGradient', { id: 'growthGrad', x1: '0', y1: '0', x2: '0', y2: '1' });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#10b981', 'stop-opacity': '0.32' }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#10b981', 'stop-opacity': '0.02' }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    const gridSteps = 3;
    for (let i = 0; i <= gridSteps; i += 1) {
      const frac = i / gridSteps;
      const y = padT + innerH * (1 - frac);
      const val = minVal + (maxVal - minVal) * frac;
      svg.appendChild(svgEl('line', {
        x1: padL,
        y1: y,
        x2: width - padR,
        y2: y,
        stroke: 'currentColor',
        'stroke-opacity': '0.12',
        'stroke-dasharray': i === 0 ? 'none' : '3 3'
      }));
      const lbl = svgEl('text', {
        x: padL - 8,
        y: y + 4,
        'text-anchor': 'end',
        'font-size': '11',
        fill: 'currentColor',
        opacity: '0.65'
      });
      lbl.textContent = formatMoney(val);
      svg.appendChild(lbl);
    }

    const coords = snapshots.map((s, idx) => {
      const x = snapshots.length === 1
        ? padL + innerW / 2
        : padL + (idx / (snapshots.length - 1)) * innerW;
      const y = padT + innerH - ((s.total - minVal) / (maxVal - minVal)) * innerH;
      return { x, y, snap: s };
    });

    if (coords.length >= 2) {
      const lineD = coords.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      const areaD = `${lineD} L ${coords[coords.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;
      svg.appendChild(svgEl('path', { d: areaD, fill: 'url(#growthGrad)' }));
      svg.appendChild(svgEl('path', {
        d: lineD,
        fill: 'none',
        stroke: '#10b981',
        'stroke-width': '2.5',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      }));
    }

    coords.forEach((p, idx) => {
      const circle = svgEl('circle', {
        cx: p.x,
        cy: p.y,
        r: '4.5',
        fill: '#10b981',
        stroke: '#ffffff',
        'stroke-width': '1.5'
      });
      const title = svgEl('title');
      title.textContent = `${p.snap.date}: ${formatMoney(p.snap.total)}${p.snap.note ? ` (${p.snap.note})` : ''}`;
      circle.appendChild(title);
      svg.appendChild(circle);

      if (coords.length <= 8 || idx === 0 || idx === coords.length - 1 || idx % Math.ceil(coords.length / 5) === 0) {
        const xLbl = svgEl('text', {
          x: p.x,
          y: height - 10,
          'text-anchor': 'middle',
          'font-size': '11',
          fill: 'currentColor',
          opacity: '0.68'
        });
        xLbl.textContent = p.snap.date.slice(2);
        svg.appendChild(xLbl);
      }
    });

    wrap.appendChild(svg);
  }

  function renderAnalysis() {
    const an = Store.computeAnalysis(state);
    const { summary } = an;

    // Expense KPIs
    $('an-avg-expense').textContent = formatMoney(an.averageExpense);
    $('an-expense-count').textContent = `${an.expenseCount} ${an.expenseCount === 1 ? 'entry' : 'entries'}`;

    if (an.topCategory) {
      $('an-top-category').textContent = an.topCategory.label;
      $('an-top-category-sub').textContent = `${formatMoney(an.topCategory.total)} (${an.topCategory.sharePct}%)`;
    } else {
      $('an-top-category').textContent = '—';
      $('an-top-category-sub').textContent = 'No expenses yet';
    }

    if (an.topSubcategory) {
      $('an-top-subcategory').textContent = an.topSubcategory.label;
      $('an-top-subcategory-sub').textContent = `${an.topSubcategory.categoryLabel} • ${formatMoney(an.topSubcategory.total)}`;
    } else {
      $('an-top-subcategory').textContent = '—';
      $('an-top-subcategory-sub').textContent = 'No expenses yet';
    }

    const cfEl = $('an-net-cashflow');
    cfEl.textContent = formatSignedMoney(an.netCashFlow);
    cfEl.className = `metric-value tabular-nums ${an.netCashFlow >= 0 ? 'metric-accent' : 'metric-danger'}`;
    $('an-savings-rate').textContent = an.savingsRate !== null
      ? `Savings rate: ${an.savingsRate}%`
      : 'Add income to see savings rate';

    // Category Summary Table
    const catTableWrap = $('analysis-category-table');
    catTableWrap.textContent = '';
    const table = el('table', 'data-table');
    const thead = el('thead');
    const hRow = el('tr');
    ['Category', 'Entries', 'Personal', 'Family', 'Total', 'Share', 'Top Subcategory'].forEach((h, i) => {
      const th = el('th', i >= 1 && i <= 5 ? 'num' : '', h);
      hRow.appendChild(th);
    });
    thead.appendChild(hRow);
    table.appendChild(thead);

    const tbody = el('tbody');
    for (const row of an.categoryMatrix) {
      const tr = el('tr');

      const nameTd = el('td');
      const nameWrap = el('span', 'cat-name-wrap');
      const dot = el('i', 'dot');
      dot.style.backgroundColor = row.color;
      nameWrap.appendChild(dot);
      nameWrap.appendChild(document.createTextNode(row.label));
      nameTd.appendChild(nameWrap);

      const topSub = row.subcategories[0] && row.subcategories[0].total > 0
        ? `${row.subcategories[0].label} (${formatMoney(row.subcategories[0].total)})`
        : '—';

      tr.appendChild(nameTd);
      tr.appendChild(el('td', 'num tabular-nums', row.count));
      tr.appendChild(el('td', 'num tabular-nums', formatMoney(row.personal)));
      tr.appendChild(el('td', 'num tabular-nums', formatMoney(row.family)));
      tr.appendChild(el('td', 'num tabular-nums', formatMoney(row.total)));
      tr.appendChild(el('td', 'num tabular-nums', `${row.sharePct}%`));
      tr.appendChild(el('td', 'muted tabular-nums', topSub));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    catTableWrap.appendChild(table);

    // Subcategory Breakdown & Analysis
    const subFilter = ui.analysisSubCategoryFilter || 'all';
    const filteredSubs = an.subcategoryMatrix.filter(
      (s) => subFilter === 'all' || s.categoryId === subFilter
    );
    const activeSubs = filteredSubs.filter((s) => s.total > 0);
    const subBarsWrap = $('analysis-subcategory-bars');
    const subTableWrap = $('analysis-subcategory-table');
    subBarsWrap.textContent = '';
    subTableWrap.textContent = '';

    if (activeSubs.length === 0) {
      subBarsWrap.appendChild(el('div', 'empty-state', 'No subcategory spending recorded for this selection yet.'));
    } else {
      const maxSub = Math.max(...activeSubs.map((s) => s.total), 1);
      for (const s of activeSubs) {
        const barRow = el('div', 'sub-bar-row');
        const label = el('span', 'sub-bar-label');
        const dot = el('i', 'dot');
        dot.style.backgroundColor = s.categoryColor;
        label.appendChild(dot);
        label.appendChild(document.createTextNode(
          subFilter === 'all' ? `${s.label} (${s.categoryLabel})` : s.label
        ));

        const track = el('div', 'cat-track');
        const fill = el('div', 'cat-fill');
        fill.style.width = `${(s.total / maxSub) * 100}%`;
        fill.style.backgroundColor = s.categoryColor;
        track.appendChild(fill);

        const valLabel = el(
          'strong',
          'tabular-nums',
          `${formatMoney(s.total)} (${subFilter === 'all' ? s.shareOfTotalPct : s.shareOfCategoryPct}%)`
        );

        barRow.appendChild(label);
        barRow.appendChild(track);
        barRow.appendChild(valLabel);
        subBarsWrap.appendChild(barRow);
      }
    }

    const subTable = el('table', 'data-table');
    const subThead = el('thead');
    const subHRow = el('tr');
    ['Subcategory', 'Category', 'Entries', 'Avg', 'Personal', 'Family', 'Total', '% of Cat', '% of Total'].forEach((h, i) => {
      subHRow.appendChild(el('th', i >= 2 ? 'num' : '', h));
    });
    subThead.appendChild(subHRow);
    subTable.appendChild(subThead);

    const subTbody = el('tbody');
    for (const s of filteredSubs) {
      const tr = el('tr');
      const nameTd = el('td');
      const wrap = el('span', 'cat-name-wrap');
      const dot = el('i', 'dot');
      dot.style.backgroundColor = s.categoryColor;
      wrap.appendChild(dot);
      wrap.appendChild(document.createTextNode(s.label));
      nameTd.appendChild(wrap);

      tr.appendChild(nameTd);
      tr.appendChild(el('td', 'muted', s.categoryLabel));
      tr.appendChild(el('td', 'num tabular-nums', s.count));
      tr.appendChild(el('td', 'num tabular-nums', formatMoney(s.average)));
      tr.appendChild(el('td', 'num tabular-nums', formatMoney(s.personal)));
      tr.appendChild(el('td', 'num tabular-nums', formatMoney(s.family)));
      tr.appendChild(el('td', 'num tabular-nums', formatMoney(s.total)));
      tr.appendChild(el('td', 'num tabular-nums', `${s.shareOfCategoryPct}%`));
      tr.appendChild(el('td', 'num tabular-nums', `${s.shareOfTotalPct}%`));
      subTbody.appendChild(tr);
    }
    subTable.appendChild(subTbody);
    subTableWrap.appendChild(subTable);

    // Monthly Spending Trend
    const monthlyWrap = $('analysis-monthly-trend');
    monthlyWrap.textContent = '';
    if (an.monthlyExpenses.length === 0) {
      monthlyWrap.appendChild(el('div', 'empty-state', 'Add expenses to see monthly spending trends.'));
    } else {
      const maxMonth = Math.max(...an.monthlyExpenses.map((m) => m.total), 1);
      const allTags = Store.getAllTags(state);
      for (const m of an.monthlyExpenses) {
        const row = el('div', 'month-bar-row');
        row.appendChild(el('span', 'tabular-nums', m.month));

        const track = el('div', 'month-track');
        for (const tag of allTags) {
          const amt = (m.tags && m.tags[tag.id]) || 0;
          if (amt <= 0) continue;
          const bar = el('div', 'bar-segment');
          bar.style.width = `${(amt / maxMonth) * 100}%`;
          bar.style.backgroundColor = tag.color;
          track.appendChild(bar);
        }

        row.appendChild(track);
        row.appendChild(el('strong', 'tabular-nums', formatMoney(m.total)));
        monthlyWrap.appendChild(row);
      }
    }

    // Investment Growth KPIs
    $('an-inv-current').textContent = formatMoney(summary.totalInvestments);
    $('an-inv-cost').textContent = `Invested: ${formatMoney(summary.totalInvestmentsCost)}`;

    const inv = an.investments;
    const gainEl = $('an-inv-gain');
    gainEl.textContent = formatSignedMoney(inv.totalUnrealizedGain);
    gainEl.className = `metric-value tabular-nums ${inv.totalUnrealizedGain >= 0 ? 'metric-accent' : 'metric-danger'}`;
    $('an-inv-gain-pct').textContent = `${inv.totalUnrealizedGain >= 0 ? '+' : ''}${inv.totalUnrealizedGainPct}% vs cost basis`;

    const snapEl = $('an-snap-growth');
    if (inv.snapshotGrowth) {
      snapEl.textContent = formatSignedMoney(inv.snapshotGrowth.delta);
      snapEl.className = `metric-value tabular-nums ${inv.snapshotGrowth.delta >= 0 ? 'metric-accent' : 'metric-danger'}`;
      $('an-snap-range').textContent = `${inv.snapshotGrowth.pct >= 0 ? '+' : ''}${inv.snapshotGrowth.pct}% (${inv.snapshotGrowth.startDate} → ${inv.snapshotGrowth.endDate})`;
      $('an-chart-subtitle').textContent = `${inv.snapshots.length} ${inv.snapshots.length === 1 ? 'snapshot' : 'snapshots'} logged`;
    } else {
      snapEl.textContent = '—';
      snapEl.className = 'metric-value tabular-nums';
      $('an-snap-range').textContent = 'Record snapshots below';
      $('an-chart-subtitle').textContent = 'Record snapshots to plot growth';
    }

    $('an-bond-yield').textContent = formatMoney(inv.projectedAnnualBondIncome);

    renderGrowthChart(inv.snapshots);

    // 3-Fold Investment Growth Table
    const invTableWrap = $('analysis-investment-table');
    invTableWrap.textContent = '';
    const invTable = el('table', 'data-table');
    const invHead = el('thead');
    const invHRow = el('tr');
    ['Asset Class', 'Holdings', 'Invested Cost', 'Current Value', 'Gain / Loss', 'Allocation'].forEach((h, i) => {
      invHRow.appendChild(el('th', i >= 1 ? 'num' : '', h));
    });
    invHead.appendChild(invHRow);
    invTable.appendChild(invHead);

    const totalInv = summary.totalInvestments;
    const rowsData = [
      {
        label: 'Bonds',
        dotClass: 'dot-bonds',
        count: state.investments.bonds.length,
        cost: summary.totalBonds,
        value: summary.totalBonds,
        gain: 0,
        gainPct: 0
      },
      {
        label: 'ETFs',
        dotClass: 'dot-etfs',
        count: state.investments.etfs.length,
        cost: summary.totalEtfsCost,
        value: summary.totalEtfs,
        gain: inv.etfsGain,
        gainPct: inv.etfsGainPct
      },
      {
        label: 'Stocks',
        dotClass: 'dot-stocks',
        count: state.investments.stocks.length,
        cost: summary.totalStocksCost,
        value: summary.totalStocks,
        gain: inv.stocksGain,
        gainPct: inv.stocksGainPct
      }
    ];

    const invBody = el('tbody');
    for (const r of rowsData) {
      const tr = el('tr');
      const labelTd = el('td');
      const wrap = el('span', 'cat-name-wrap');
      wrap.appendChild(el('i', `dot ${r.dotClass}`));
      wrap.appendChild(document.createTextNode(r.label));
      labelTd.appendChild(wrap);

      const allocPct = totalInv > 0 ? Math.round((r.value / totalInv) * 1000) / 10 : 0;
      const gainText = `${formatSignedMoney(r.gain)} (${r.gain >= 0 ? '+' : ''}${r.gainPct}%)`;
      const gainClass = `num tabular-nums ${r.gain > 0 ? 'gain-positive' : r.gain < 0 ? 'gain-negative' : ''}`;

      tr.appendChild(labelTd);
      tr.appendChild(el('td', 'num tabular-nums', r.count));
      tr.appendChild(el('td', 'num tabular-nums', formatMoney(r.cost)));
      tr.appendChild(el('td', 'num tabular-nums', formatMoney(r.value)));
      tr.appendChild(el('td', gainClass, gainText));
      tr.appendChild(el('td', 'num tabular-nums', `${allocPct}%`));
      invBody.appendChild(tr);
    }
    invTable.appendChild(invBody);
    invTableWrap.appendChild(invTable);

    // Snapshot History List
    const snapList = $('snapshot-list');
    snapList.textContent = '';
    const descSnaps = inv.snapshots.slice().reverse();
    for (const snap of descSnaps) {
      const row = el('div', 'item-row');
      const main = el('div', 'item-main');
      main.appendChild(el('div', 'item-title-line tabular-nums', `${snap.date}${snap.note ? ` • ${snap.note}` : ''}`));
      if (snap.bonds || snap.etfs || snap.stocks) {
        main.appendChild(el(
          'div',
          'item-meta tabular-nums',
          `Bonds ${formatMoney(snap.bonds)} • ETFs ${formatMoney(snap.etfs)} • Stocks ${formatMoney(snap.stocks)}`
        ));
      }
      const right = el('div', 'item-right');
      right.appendChild(el('span', 'item-amount tabular-nums', formatMoney(snap.total)));
      const delBtn = el('button', 'btn btn-ghost btn-xs', 'Delete');
      delBtn.type = 'button';
      delBtn.addEventListener('click', () => {
        state = Store.deleteInvestmentSnapshot(state, snap.id);
        persistAndRender();
      });
      right.appendChild(delBtn);
      row.appendChild(main);
      row.appendChild(right);
      snapList.appendChild(row);
    }
  }

  /* Balance & Income Dialog */
  function renderBalanceDialog() {
    $('base-balance-input').value = displayAmount(state.balance.baseAmount);
    $('deduct-investments-toggle').checked = Boolean(state.settings.deductInvestmentsFromBalance);

    const list = $('income-list');
    list.textContent = '';
    if (state.balance.incomes.length === 0) {
      list.appendChild(el('div', 'empty-state', 'No income entries logged yet.'));
    } else {
      for (const inc of state.balance.incomes) {
        const row = el('div', 'item-row');
        const main = el('div', 'item-main');
        main.appendChild(el('div', 'item-title-line', inc.label));
        main.appendChild(el('div', 'item-meta', inc.date));

        const right = el('div', 'item-right');
        right.appendChild(el('span', 'item-amount metric-accent tabular-nums', `+${formatMoney(inc.amount)}`));
        const delBtn = el('button', 'btn btn-ghost btn-xs', 'Delete');
        delBtn.type = 'button';
        delBtn.addEventListener('click', () => {
          state = Store.deleteIncome(state, inc.id);
          persistAndRender();
        });
        right.appendChild(delBtn);

        row.appendChild(main);
        row.appendChild(right);
        list.appendChild(row);
      }
    }

    const txList = $('transfer-list');
    txList.textContent = '';
    const transfers = state.balance.investmentTransfers || [];
    if (transfers.length === 0) {
      txList.appendChild(el('div', 'empty-state', 'No investment cash transfers yet.'));
    } else {
      for (const tx of transfers) {
        const row = el('div', 'item-row');
        const main = el('div', 'item-main');
        main.appendChild(el('div', 'item-title-line', tx.label));
        main.appendChild(el('div', 'item-meta', tx.date));

        const right = el('div', 'item-right');
        const amtClass = `item-amount tabular-nums ${tx.amount >= 0 ? 'metric-accent' : 'metric-danger'}`;
        right.appendChild(el('span', amtClass, formatSignedMoney(tx.amount)));
        const delBtn = el('button', 'btn btn-ghost btn-xs', 'Undo');
        delBtn.type = 'button';
        delBtn.addEventListener('click', () => {
          state = Store.deleteInvestmentTransfer(state, tx.id);
          persistAndRender();
        });
        right.appendChild(delBtn);

        row.appendChild(main);
        row.appendChild(right);
        txList.appendChild(row);
      }
    }
  }

  function showDataFeedback(msg, isError) {
    const box = $('data-feedback');
    box.textContent = msg;
    box.classList.remove('hidden', 'is-error');
    if (isError) box.classList.add('is-error');
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderTaxonomyDialog() {
    const subWrap = $('custom-subcategories-list');
    subWrap.textContent = '';
    let hasCustomSubs = false;
    for (const cat of Store.EXPENSE_CATEGORIES) {
      const customSubs = (state.customSubcategories && state.customSubcategories[cat.id]) || [];
      for (const sub of customSubs) {
        hasCustomSubs = true;
        const chip = el('span', 'manage-chip');
        chip.appendChild(document.createTextNode(`${cat.label} · ${sub.label}`));
        const delBtn = el('button', '', '✕');
        delBtn.type = 'button';
        delBtn.setAttribute('aria-label', `Remove subcategory ${sub.label}`);
        delBtn.addEventListener('click', () => {
          state = Store.deleteCustomSubcategory(state, cat.id, sub.id);
          persistAndRender();
        });
        chip.appendChild(delBtn);
        subWrap.appendChild(chip);
      }
    }
    if (!hasCustomSubs) {
      subWrap.appendChild(el('span', 'muted', 'No custom subcategories added yet.'));
    }

    const tagWrap = $('custom-tags-list');
    tagWrap.textContent = '';
    const customTags = state.customTags || [];
    if (customTags.length === 0) {
      tagWrap.appendChild(el('span', 'muted', 'No custom tags added yet.'));
    } else {
      for (const tag of customTags) {
        const chip = el('span', 'manage-chip');
        const dot = el('i', 'dot');
        dot.style.backgroundColor = tag.color;
        chip.appendChild(dot);
        chip.appendChild(document.createTextNode(tag.label));
        const delBtn = el('button', '', '✕');
        delBtn.type = 'button';
        delBtn.setAttribute('aria-label', `Remove tag ${tag.label}`);
        delBtn.addEventListener('click', () => {
          state = Store.deleteCustomTag(state, tag.id);
          persistAndRender();
        });
        chip.appendChild(delBtn);
        tagWrap.appendChild(chip);
      }
    }
  }

  async function fetchJsonWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function refreshFxRates(manual) {
    const btn = $('refresh-fx-btn');
    if (btn && manual) btn.textContent = '...';

    try {
      try {
        const data = await fetchJsonWithTimeout('https://open.er-api.com/v6/latest/SGD', 5000);
        if (data && data.rates) {
          state = Store.updateFxRates(state, data.rates, 'live', Store.todayISO());
          persistAndRender();
          return;
        }
      } catch (_err) {
        // Fallback to Frankfurter API
      }

      try {
        const data = await fetchJsonWithTimeout('https://api.frankfurter.app/latest?from=SGD', 5000);
        if (data && data.rates) {
          state = Store.updateFxRates(state, { ...data.rates, SGD: 1 }, 'live', data.date || Store.todayISO());
          persistAndRender();
          return;
        }
      } catch (_err) {
        // Fallback to static rates.json
      }

      try {
        const data = await fetchJsonWithTimeout('rates.json', 3000);
        if (data && data.rates) {
          state = Store.updateFxRates(state, data.rates, 'static', data.updatedAt || Store.todayISO());
          persistAndRender();
          return;
        }
      } catch (_err) {
        // Keep cached or embedded DEFAULT_FX_RATES
      }
    } finally {
      if (btn) btn.textContent = '↻ FX';
    }
  }

  function renderFxBadge() {
    const badge = $('fx-rate-badge');
    const base = baseCurrency();
    const cur = displayCurrency();
    const src = (state.settings && state.settings.fxSource) || 'static';
    if (cur === base) {
      badge.textContent = src === 'live' ? 'Live FX' : '';
      badge.classList.toggle('hidden', src !== 'live');
      return;
    }
    const rate = Store.getExchangeRate(base, cur, fxRates());
    const formattedRate = rate >= 10 ? rate.toFixed(2) : rate.toFixed(4);
    badge.textContent = `1 ${base} = ${formattedRate} ${cur} • ${src}`;
    badge.classList.remove('hidden');
  }

  function render() {
    applyTheme();
    $('currency-select').value = state.settings.currency || 'SGD';
    renderFxBadge();
    syncSubcategoryOptions();
    renderExpenseTagOptions();
    const summary = Store.computeSummary(state);
    renderHero(summary);
    renderExpenseBreakdown(summary);
    renderExpenseList();
    renderInvestments(summary);
    renderAnalysis();
    renderBalanceDialog();
    renderTaxonomyDialog();
  }

  /* Event Bindings */
  function bindEvents() {
    $('currency-select').addEventListener('change', (e) => {
      state = {
        ...state,
        settings: { ...state.settings, currency: e.target.value }
      };
      if (ui.editingStockId) {
        const st = state.investments.stocks.find((s) => s.id === ui.editingStockId);
        if (st) startEditStock(st);
      }
      if (ui.editingExpenseId) {
        const ex = state.expenses.find((x) => x.id === ui.editingExpenseId);
        if (ex) startEditExpense(ex);
      }
      persistAndRender();
    });

    $('refresh-fx-btn').addEventListener('click', () => {
      refreshFxRates(true);
    });

    $('theme-toggle').addEventListener('click', toggleTheme);

    // Tabs + keyboard arrow navigation
    const tabBtns = Array.from(document.querySelectorAll('[role="tab"]'));
    tabBtns.forEach((btn, idx) => {
      btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const nextIdx = e.key === 'ArrowRight'
            ? (idx + 1) % tabBtns.length
            : (idx - 1 + tabBtns.length) % tabBtns.length;
          tabBtns[nextIdx].focus();
          setActiveTab(tabBtns[nextIdx].dataset.tab);
        }
      });
    });

    // Expense Form & Custom Subcategories/Tags
    $('expense-category').addEventListener('change', () => syncSubcategoryOptions());
    $('cancel-edit-expense').addEventListener('click', cancelEditExpense);

    function commitInlineSubcategory() {
      const catId = $('expense-category').value;
      const label = $('new-subcategory-input').value.trim();
      if (!label) return;
      const res = Store.addCustomSubcategory(state, catId, label);
      state = res.state;
      $('new-subcategory-input').value = '';
      $('inline-subcategory-box').classList.add('hidden');
      Store.saveToStorage(state);
      render();
      syncSubcategoryOptions(res.subcategory.id);
    }

    $('toggle-add-subcategory').addEventListener('click', () => {
      const box = $('inline-subcategory-box');
      box.classList.toggle('hidden');
      if (!box.classList.contains('hidden')) $('new-subcategory-input').focus();
    });
    $('cancel-new-subcategory').addEventListener('click', () => {
      $('new-subcategory-input').value = '';
      $('inline-subcategory-box').classList.add('hidden');
    });
    $('save-new-subcategory').addEventListener('click', commitInlineSubcategory);
    $('new-subcategory-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitInlineSubcategory();
      }
    });

    function commitInlineTag() {
      const label = $('new-tag-input').value.trim();
      if (!label) return;
      const res = Store.addCustomTag(state, label);
      state = res.state;
      $('new-tag-input').value = '';
      $('inline-tag-box').classList.add('hidden');
      Store.saveToStorage(state);
      render();
      renderExpenseTagOptions(res.tag.id);
    }

    $('toggle-add-tag').addEventListener('click', () => {
      const box = $('inline-tag-box');
      box.classList.toggle('hidden');
      if (!box.classList.contains('hidden')) $('new-tag-input').focus();
    });
    $('cancel-new-tag').addEventListener('click', () => {
      $('new-tag-input').value = '';
      $('inline-tag-box').classList.add('hidden');
    });
    $('save-new-tag').addEventListener('click', commitInlineTag);
    $('new-tag-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitInlineTag();
      }
    });

    $('open-taxonomy-dialog').addEventListener('click', () => {
      renderTaxonomyDialog();
      $('taxonomy-dialog').showModal();
    });
    $('dialog-subcategory-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const catId = $('dialog-sub-category').value;
      const res = Store.addCustomSubcategory(state, catId, $('dialog-sub-label').value);
      state = res.state;
      $('dialog-sub-label').value = '';
      persistAndRender();
    });
    $('dialog-tag-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const res = Store.addCustomTag(state, $('dialog-tag-label').value);
      state = res.state;
      $('dialog-tag-label').value = '';
      persistAndRender();
    });

    $('expense-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const tagChecked = document.querySelector('input[name="tag"]:checked');
      const payload = {
        amount: toBaseAmount($('expense-amount').value),
        date: $('expense-date').value,
        category: $('expense-category').value,
        subcategory: $('expense-subcategory').value,
        tag: tagChecked ? tagChecked.value : 'personal',
        note: $('expense-note').value
      };

      if (ui.editingExpenseId) {
        state = Store.updateExpense(state, ui.editingExpenseId, payload);
        cancelEditExpense();
      } else {
        state = Store.addExpense(state, payload);
        $('expense-amount').value = '';
        $('expense-note').value = '';
      }
      persistAndRender();
    });

    // Expense Filters
    $('filter-category').addEventListener('change', (e) => {
      ui.categoryFilter = e.target.value;
      renderExpenseList();
    });
    $('filter-month').addEventListener('change', (e) => {
      ui.monthFilter = e.target.value;
      renderExpenseList();
    });
    $('filter-search').addEventListener('input', (e) => {
      ui.searchFilter = e.target.value;
      renderExpenseList();
    });

    $('repeat-undo-btn').addEventListener('click', () => {
      if (!ui.lastRepeatedExpense) return;
      state = Store.deleteExpense(state, ui.lastRepeatedExpense.id);
      ui.lastRepeatedExpense = null;
      persistAndRender();
    });
    $('repeat-dismiss-btn').addEventListener('click', () => {
      ui.lastRepeatedExpense = null;
      renderRepeatBanner();
    });

    $('analysis-sub-category-filter').addEventListener('change', (e) => {
      ui.analysisSubCategoryFilter = e.target.value;
      renderAnalysis();
    });

    // Investments Fold Switcher
    document.querySelectorAll('[data-inv-fold]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.invFold = btn.dataset.invFold;
        renderInvestments(Store.computeSummary(state));
      });
    });
    document.querySelectorAll('[data-inv-fold-card]').forEach((card) => {
      card.addEventListener('click', () => {
        const target = card.dataset.invFoldCard;
        ui.invFold = ui.invFold === target ? 'all' : target;
        renderInvestments(Store.computeSummary(state));
      });
    });

    $('sync-investments-toggle').addEventListener('change', (e) => {
      state = {
        ...state,
        settings: {
          ...state.settings,
          syncInvestmentsWithBalance: e.target.checked
        }
      };
      persistAndRender();
    });

    // Bond Form
    $('bond-form').addEventListener('submit', (e) => {
      e.preventDefault();
      state = Store.addBond(state, {
        name: $('bond-name').value,
        amount: toBaseAmount($('bond-amount').value),
        yieldRate: $('bond-yield').value,
        maturityDate: $('bond-maturity').value,
        note: $('bond-note').value,
        adjustBalance: $('bond-adjust-balance').checked
      });
      e.target.reset();
      persistAndRender();
    });

    // ETF Form
    $('etf-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const rawInit = $('etf-initial-amount').value;
      state = Store.addEtf(state, {
        name: $('etf-name').value,
        ticker: $('etf-ticker').value,
        fundLabel: $('etf-fund-label').value,
        initialAmount: rawInit !== '' ? toBaseAmount(rawInit) : '',
        date: Store.todayISO(),
        adjustBalance: $('etf-adjust-balance').checked
      });
      e.target.reset();
      persistAndRender();
    });

    // Stock Form
    $('stock-shares').addEventListener('input', updateStockPreview);
    $('stock-price').addEventListener('input', updateStockPreview);
    $('stock-buy-price').addEventListener('input', updateStockPreview);
    $('cancel-edit-stock').addEventListener('click', cancelEditStock);
    $('stock-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const rawBuy = $('stock-buy-price').value;
      const payload = {
        company: $('stock-company').value,
        ticker: $('stock-ticker').value,
        shares: $('stock-shares').value,
        pricePerShare: toBaseAmount($('stock-price').value),
        buyPrice: rawBuy !== '' ? toBaseAmount(rawBuy) : '',
        adjustBalance: $('stock-adjust-balance').checked
      };
      if (ui.editingStockId) {
        state = Store.updateStock(state, ui.editingStockId, payload);
        cancelEditStock();
      } else {
        state = Store.addStock(state, payload);
        e.target.reset();
        updateStockPreview();
      }
      persistAndRender();
    });

    // Analysis Snapshot Actions
    $('record-snapshot-now').addEventListener('click', () => {
      state = Store.addInvestmentSnapshot(state, {
        date: Store.todayISO(),
        note: 'Manual snapshot'
      });
      persistAndRender();
    });

    $('snapshot-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const rawSnapTotal = $('snapshot-total').value;
      state = Store.addInvestmentSnapshot(state, {
        date: $('snapshot-date').value,
        total: rawSnapTotal !== '' ? toBaseAmount(rawSnapTotal) : '',
        note: $('snapshot-note').value
      });
      $('snapshot-total').value = '';
      $('snapshot-note').value = '';
      persistAndRender();
    });

    // Dialog Open/Close
    $('open-balance-dialog').addEventListener('click', () => {
      renderBalanceDialog();
      $('balance-dialog').showModal();
      $('base-balance-input').focus();
    });
    $('open-income-dialog').addEventListener('click', () => {
      renderBalanceDialog();
      $('balance-dialog').showModal();
      $('income-label').focus();
    });
    $('open-data-dialog').addEventListener('click', () => {
      $('data-feedback').classList.add('hidden');
      $('data-dialog').showModal();
    });

    document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dlg = $(btn.dataset.closeDialog);
        if (dlg) dlg.close();
      });
    });

    document.querySelectorAll('dialog.modal-dialog').forEach((dlg) => {
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) dlg.close();
      });
    });

    // Balance & Income Actions
    $('base-balance-form').addEventListener('submit', (e) => {
      e.preventDefault();
      state = Store.setBaseBalance(state, toBaseAmount($('base-balance-input').value));
      persistAndRender();
    });

    $('deduct-investments-toggle').addEventListener('change', (e) => {
      state = {
        ...state,
        settings: {
          ...state.settings,
          deductInvestmentsFromBalance: e.target.checked
        }
      };
      persistAndRender();
    });

    $('income-form').addEventListener('submit', (e) => {
      e.preventDefault();
      state = Store.addIncome(state, {
        label: $('income-label').value,
        amount: toBaseAmount($('income-amount').value),
        date: $('income-date').value
      });
      $('income-label').value = '';
      $('income-amount').value = '';
      persistAndRender();
    });

    // Data & Backup Actions
    $('export-json-btn').addEventListener('click', () => {
      downloadFile(
        `ledger-backup-${Store.todayISO()}.json`,
        JSON.stringify(state, null, 2),
        'application/json'
      );
      showDataFeedback('Exported JSON backup.', false);
    });

    $('export-csv-btn').addEventListener('click', () => {
      downloadFile(
        `ledger-expenses-${Store.todayISO()}.csv`,
        Store.exportExpensesCsv(state.expenses),
        'text/csv;charset=utf-8'
      );
      showDataFeedback('Exported expenses CSV.', false);
    });

    $('import-json-input').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          state = Store.normalizeState(parsed);
          persistAndRender();
          showDataFeedback('Backup restored successfully.', false);
        } catch (_err) {
          showDataFeedback('Invalid JSON backup file.', true);
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    });

    $('load-sample-btn').addEventListener('click', () => {
      state = Store.createSampleState();
      persistAndRender();
      showDataFeedback('Sample data loaded.', false);
    });

    $('reset-data-btn').addEventListener('click', () => {
      if (!window.confirm('Clear all balances, expenses, and investments? This cannot be undone unless you exported a backup.')) {
        return;
      }
      state = Store.createEmptyState();
      persistAndRender();
      showDataFeedback('All data cleared.', false);
    });
  }

  initStaticControls();
  bindEvents();
  render();
  refreshFxRates(false);
})();
