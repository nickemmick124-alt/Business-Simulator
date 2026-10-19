import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { PLAN_FIELDS, PRODUCTS, advanceMonth, balanceSheet, createInitialState, defaultPlan, forecast } from '../src/simulation.js';
import { getMarketIntelligence, projectBusiness } from '../src/business-intelligence.js';
import { getUnitEconomics } from '../src/unit-economics.js';
import { getInvestmentOptions } from '../src/investments.js';
import { getMarketPosition } from '../src/market-position.js';
import { getFactoryDiagnostics, getCostLedger } from '../src/factory-diagnostics.js';
import { getFinancingInsights, getMonthlyBalanceSheet } from '../src/financial-learning.js';
import { getBoardDashboard, getBoardReview } from '../src/board-mandate.js';
import { ADVISORS, getConsultedAdvisorIds } from '../src/executive-intelligence.js';
import { getStrategyAdviser } from '../src/strategy-adviser.js';
import { STORAGE_KEY, exportSave, parseSave } from '../src/persistence.js';

// In-process DOM integration only. This exercises the real application/model and
// the real missing-WebGL fallback; it does not render or automate a browser.
test('CEO controls integrate with forecasts, commits, reports, and campaign saves', async (t) => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const { document, window } = parseHTML(html);
  const originals = new Map();
  const restore = (key) => {
    const descriptor = originals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  };
  const install = (key, value) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  };
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const timers = new Set();
  install('window', window);
  install('document', document);
  install('localStorage', storage);
  install('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  install('setTimeout', (callback, milliseconds, ...args) => {
    const timer = nativeSetTimeout(() => { timers.delete(timer); callback(...args); }, milliseconds);
    timers.add(timer);
    return timer;
  });
  const selectDescriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
    ...selectDescriptor,
    get() {
      // Browsers select the first enabled option by default; Linkedom leaves
      // value undefined when no explicit selected attribute was supplied.
      return selectDescriptor.get.call(this) ?? [...this.options].find(option => !option.disabled)?.value ?? '';
    },
    set(value) {
      // Linkedom clears selection when any option.selected is assigned. Clear
      // the old attributes first, then select the matching option once.
      for (const option of this.options) option.removeAttribute('selected');
      const option = [...this.options].find(candidate => candidate.value === String(value));
      if (option) option.selected = true;
    },
  });
  const dialog = document.querySelector('#modal');
  Object.defineProperty(dialog, 'open', { get() { return this.hasAttribute('open'); } });
  dialog.showModal = function () { this.setAttribute('open', ''); };
  dialog.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  const diagnostics = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = (...args) => diagnostics.push(args.join(' '));
  console.error = (...args) => diagnostics.push(args.join(' '));
  t.after(() => {
    for (const timer of timers) nativeClearTimeout(timer);
    console.warn = originalWarn;
    console.error = originalError;
    Object.defineProperty(window.HTMLSelectElement.prototype, 'value', selectDescriptor);
    for (const key of [...originals.keys()].reverse()) restore(key);
  });
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const click = (selector) => {
    const element = $(selector);
    assert.ok(element, `Missing control ${selector}`);
    element.click();
  };
  const edit = (selector, value) => {
    const input = $(selector);
    assert.ok(input, `Missing input ${selector}`);
    input.value = String(value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  const importFile = (input, contents) => {
    Object.defineProperty(input, 'files', { configurable: true, value: [{ size: contents.length, text: async () => contents }] });
    const event = new window.Event('change', { bubbles: true });
    // Native Event.target persists after dispatch. Linkedom clears its property,
    // so retain that native behavior for the file handler's awaited file.text().
    input.dispatchEvent(event);
    event.target = input;
  };
  const saved = () => parseSave(storage.getItem(STORAGE_KEY));
  const money = (value) => `${value < 0 ? '−' : ''}$${Math.abs(value).toFixed(1)}m`;
  const statementMoney = value => `${value < 0 ? '−' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}m`;
  const unitMoney = (value) => value == null ? '—' : `${value < 0 ? '−' : ''}$${Math.abs(value).toFixed(1)}k`;
  const marketMoney = value => value >= 1000 ? `$${(value / 1000).toFixed(2)}bn` : money(value);
  const share = value => `${(value * 100).toFixed(1)}%`;
  const change = value => value == null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value * 100).toFixed(1)}%`;
  const units = (value) => Math.round(value).toLocaleString('en-US');
  const waitFor = async (predicate, message) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (predicate()) return;
      await new Promise((resolve) => nativeSetTimeout(resolve, 5));
    }
    assert.fail(message);
  };
  const restoreCampaign = async (state, plan = defaultPlan(state)) => {
    $('#toast').textContent = '';
    importFile($('#import-file'), exportSave({ ...saved(), state, plan }));
    await waitFor(() => $('#toast').textContent === 'Campaign restored.', 'campaign fixture import did not complete');
    assert.deepEqual(saved().state, state);
    assert.deepEqual(saved().plan, plan);
  };
  const sustainablePlan = state => {
    const plan = { ...defaultPlan(state), quality: 1.5, maintenance: 1.2, training: 0.8, partsBuffer: 5 };
    const expected = forecast(state, plan);
    for (const product of PRODUCTS) {
      const flow = expected.report.products.find(candidate => candidate.id === product.id);
      plan[`${product.id}Production`] = Math.min(Math.ceil(product.capacity * 1.4), Math.max(0, Math.ceil(flow.dealerOrders + 8 - state.products[product.id].finishedGoods)));
    }
    return plan;
  };
  const tableValue = (label) => {
    const row = $$('#modal-content tbody tr').find((row) => row.children[0]?.textContent === label);
    assert.ok(row, `Missing financial statement row ${label}`);
    return row.children[1].textContent;
  };
  const balanceValue = (key, column = 1) => {
    const row = $(`#modal-content [data-balance-key="${key}"]`);
    assert.ok(row, `Missing balance-sheet row ${key}`);
    return row.children[column].textContent;
  };
  const verifyMonthlyBalanceSheet = (state, month) => {
    const statement = getMonthlyBalanceSheet(state, month);
    assert.equal(statement.available, true);
    const view = $(`[data-monthly-balance-sheet="${month}"]`);
    assert.ok(view, `Missing actual balance sheet for month ${month}`);
    for (const expected of statement.rows) {
      const row = view.querySelector(`[data-balance-row="${expected.key}"]`);
      assert.ok(row, `Missing monthly account ${expected.key}`);
      assert.equal(row.children[1].textContent, statementMoney(expected.opening));
      assert.equal(row.querySelector('[data-balance-closing]').textContent, statementMoney(expected.closing));
      const change = row.querySelector('[data-balance-change]');
      assert.ok(change.classList.contains(`financial-${expected.tone}`), `${expected.key} movement color should match its accounting meaning`);
      assert.ok(change.textContent.includes(expected.movement), 'movement must be described in words as well as color');
    }
    assert.ok(view.querySelector('[data-balance-reconciliation]'));
    assert.ok(view.querySelector('[data-monthly-income]'));
    assert.ok(view.querySelector('[data-monthly-cash-bridge]'));
    assert.equal(Math.abs(statement.reconciliation) < 1e-6, true);
  };
  const verifyBoardReview = (expected, scope = document) => {
    assert.equal(expected.available, true);
    const selector = `[data-board-review="${expected.month}"][data-board-kind="${expected.kind}"]`;
    const view = scope.matches?.(selector) ? scope : scope.querySelector(selector);
    assert.ok(view, `Missing ${expected.kind} board review for month ${expected.month}`);
    assert.equal(Number(view.querySelector('[data-board-score]').textContent), expected.score);
    assert.equal(view.querySelector('[data-board-grade]').textContent, expected.grade);
    assert.equal(view.querySelector('[data-board-status]').textContent, expected.status);
    for (const component of expected.components) {
      const row = view.querySelector(`[data-board-metric="${component.id}"]`);
      assert.ok(row, `Missing board objective ${component.id}`);
      assert.equal(row.querySelector('[data-board-actual]').dataset.value, component.actual == null ? '' : String(component.actual));
      assert.equal(Number(row.querySelector('[data-board-target]').dataset.value), component.target);
      assert.equal(row.querySelector('[data-board-status]').textContent, component.status);
      assert.doesNotMatch(row.textContent, /NaN|Infinity|undefined/);
    }
    return view;
  };
  let januaryLesson;
  let januaryBoardReview;

  await import('../src/main.js');

  await t.test('initializes the briefing and autosave despite unavailable WebGL', () => {
    assert.match($('#command-panel').textContent, /A new season/);
    assert.equal($$('#main-nav [data-tab]').length, 6);
    assert.equal(saved().state.month, 0);
    assert.equal(saved().state.version, '1.3.0', 'new campaigns should use the executive challenge model');
    assert.equal(saved().state.difficulty, 'medium');
    assert.equal(saved().state.campaignMonths, 36);
    assert.ok(saved().drafts.length >= 2, 'the opening campaign should offer meaningful plan alternatives');
    assert.match($('#save-indicator').textContent, /Saved on this device/);
    assert.ok($('#world .fallback-world'), 'missing-WebGL fallback should preserve business controls');
    assert.ok(diagnostics.some((message) => /3D world initialization failed/.test(message)));
  });

  await t.test('monthly conversations reveal actionable briefings, persist visits and unlock explicitly applied strategies', async () => {
    const original = saved();
    const fixture = createInitialState(4821, { marketRegime: 'flat', campaignMonths: 36, difficulty: 'medium' });
    await restoreCampaign(fixture);
    click('[data-tab="briefing"]');
    const beforeVisits = saved();
    const locked = getStrategyAdviser(beforeVisits.state, beforeVisits.plan);
    click('[data-action="executive-team"]');
    assert.equal($$('[data-advisor]').length, 6);
    assert.match($('#modal-content').textContent, /Headquarters/);
    assert.match($('#modal-content').textContent, /Factory floor/);
    click('[data-find-advisor="cfo"]');
    assert.ok($('[data-advisor-meeting="cfo"]'), 'the missing-WebGL fallback must offer the same consultation');
    assert.deepEqual(getConsultedAdvisorIds(saved().state), ['cfo']);
    assert.match($('#modal-content').textContent, /break.even|Interest on new customer loans/);
    assert.doesNotMatch($('#modal-content').textContent, /NaN|Infinity|undefined/);
    for (const advisor of ADVISORS.filter(person => person.id !== 'cfo')) {
      click('[data-action="executive-team"]');
      click(`[data-meet-advisor="${advisor.id}"]`);
      assert.ok($(`[data-advisor-meeting="${advisor.id}"]`));
      assert.ok($('[data-advisor-lever]'), 'every conversation must connect findings to an operating decision');
      assert.doesNotMatch($('#modal-content').textContent, /NaN|Infinity|undefined/);
    }
    const informed = saved();
    assert.equal(getConsultedAdvisorIds(informed.state).length, 6);
    assert.deepEqual(informed.plan, beforeVisits.plan, 'consulting a colleague must not change the operating numbers');
    assert.equal(informed.state.month, 0, 'consultations must not advance the campaign');
    assert.deepEqual(informed.state.employment, beforeVisits.state.employment, 'attendance must not earn board forgiveness');
    const unlocked = getStrategyAdviser(informed.state, informed.plan);
    assert.ok(unlocked.candidates.length > locked.candidates.length);
    click('[data-action="strategy-adviser"]');
    assert.ok($('[data-strategy-adviser="current"]'));
    assert.equal($$('[data-strategy-row]').length, unlocked.candidates.length);
    assert.match($('#modal-content').textContent, /not a global optimum|not a guaranteed/i);
    click('[data-strategy-objective="growth"]');
    assert.equal($('[data-strategy-objective="growth"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(saved().plan, informed.plan, 'changing comparison priority is not authorization to apply a plan');
    const growth = getStrategyAdviser(informed.state, informed.plan, { objective: 'growth' });
    const candidate = growth.candidates.find(item => item.canApply && item.changes.length);
    assert.ok(candidate);
    click(`[data-strategy-apply="${candidate.id}"]`);
    assert.equal(dialog.open, false);
    assert.deepEqual(saved().state, informed.state);
    assert.deepEqual(saved().plan, candidate.plan);
    click('[data-action="commit-preview"]');
    assert.match($('[data-consultation-warning]').textContent, /team has been heard/);
    click('[data-action="commit"]');
    await waitFor(() => saved().state.month === 1 && !document.body.classList.contains('resolving'), 'consulted month did not commit');
    const after = saved();
    assert.deepEqual(getConsultedAdvisorIds(after.state), [], 'a new month needs fresh conversations');
    assert.equal(getConsultedAdvisorIds(after.state, 1).length, 6, 'completed consultation history must remain recorded');
    assert.ok($('[data-employment-status]'));
    assert.ok($('[data-board-summary]'), 'consultations must not invalidate historical board replay');
    click('[data-action="close-modal"]');
    await restoreCampaign(after.state, after.plan);
    assert.equal(getConsultedAdvisorIds(saved().state, 1).length, 6, 'export/import must retain the consultation record');
    click('[data-tab="briefing"]');
    assert.match($('[data-consultation-count]').textContent, /0 \/ 6/);
    click('[data-action="strategy-adviser"]');
    click('[data-strategy-history="1"]');
    assert.ok($('[data-strategy-adviser="historical"]'));
    assert.equal($$('[data-strategy-apply]').length, 0, 'historical advice must not overwrite the next month');
    assert.match($('#modal-content').textContent, /6\/6 colleagues consulted/);
    click('[data-action="close-modal"]');
    await restoreCampaign(original.state, original.plan);
    click('[data-tab="briefing"]');
  });

  await t.test('competitor comparisons are accessible and separate fictional benchmarks from actual share', () => {
    const before = saved();
    click('[data-tab="markets"]');
    click('[data-action="competitors"]');
    assert.ok($('[data-competitors]'));
    assert.equal($$('[data-competitor-table] tbody tr').length, 4);
    assert.match($('#modal-content').textContent, /fictional competitors/i);
    assert.match($('#modal-content').textContent, /Estimated allocation/);
    assert.match($('#modal-content').textContent, /Technology index/);
    assert.doesNotMatch($('#modal-content').textContent, /NaN|Infinity|undefined/);
    assert.deepEqual(saved().state, before.state);
    assert.deepEqual(saved().plan, before.plan);
    click('[data-action="close-modal"]');
    click('[data-tab="briefing"]');
  });

  await t.test('new supplier and dealer levers save their costs and recompute the working forecast before commitment', async () => {
    const original = saved();
    click('[data-tab="plan"]');
    click('[data-plan-group="Commercial"]');
    assert.ok($('#field-dealerSupport'));
    edit('#field-dealerSupport', 0.8);
    assert.equal(saved().plan.dealerSupport, 0.8);
    click('[data-plan-group="Operations"]');
    assert.ok($('#field-supplierSupport'));
    edit('#field-supplierSupport', 0.6);
    assert.equal(saved().plan.supplierSupport, 0.6);
    const expected = forecast(saved().state, saved().plan);
    assert.equal(expected.report.income.dealerSupport, 0.8);
    assert.equal(expected.report.income.supplierSupport, 0.6);
    assert.equal($('#forecast-panel .forecast-grid strong').textContent, money(expected.state.cash));
    assert.deepEqual(saved().state, original.state, 'commercial and supplier support are pending decisions until commitment');
    await restoreCampaign(original.state, original.plan);
    click('[data-tab="briefing"]');
  });

  await t.test('opening market intelligence distinguishes the addressable market from unobserved company share', () => {
    const before = saved();
    const market = getMarketIntelligence(before.state, before.plan);
    click('[data-action="open-markets"]');
    assert.equal($('#main-nav [aria-current="page"]').dataset.tab, 'markets');
    assert.equal($('[data-kpi="annual-market-value"]').textContent, marketMoney(market.annual.value));
    assert.equal($('[data-kpi="current-unit-share"]').textContent, '—');
    assert.match($('[data-kpi="current-unit-share"]').parentElement.textContent, /No completed month/);
    assert.equal($('[data-kpi="next-market-change"]').textContent, '—', 'January must not invent a prior December comparison');
    assert.equal($('[data-kpi="next-retail-change"]').textContent, '—');
    assert.equal($('[data-kpi="expected-retail-sales"]').textContent, units(market.next.expectedRetailSales));
    assert.equal($$('[data-market-product]').length, 3);
    assert.doesNotMatch($('#command-panel').textContent, /NaN|Infinity|undefined/);
    click('[data-action="market-detail"]');
    assert.equal(dialog.open, true);
    assert.equal($$('[data-market-timeline] tbody tr').length, market.timeline.length);
    assert.match($('#modal-content').textContent, /illustrative|scenario|simulated/i);
    assert.deepEqual(saved().state, before.state);
    assert.deepEqual(saved().plan, before.plan);
    click('[data-action="close-modal"]');
  });

  await t.test('the board publishes measurable monthly and quarterly goals before the first decision', async () => {
    const before = saved();
    const board = getBoardDashboard(before.state, before.plan);
    click('[data-tab="briefing"]');
    click('[data-action="board-review"]');
    assert.ok($('[data-board-dashboard]'));
    assert.equal(board.current, null, 'opening goals cannot be reported as achieved actual results');
    assert.equal(board.next.month, 1);
    verifyBoardReview(board.next, $('#modal-content'));
    assert.equal($$('#modal-content [data-board-kind="actual"]').length, 0);
    assert.match($('#modal-content').textContent, /target|goal/i);
    assert.match($('#modal-content').textContent, /quarter/i);
    assert.equal($$('[data-board-monthly-goals] tbody tr').length, 36, 'publish goals for each month of the full mandate');
    assert.equal($$('[data-board-quarterly-goals] tbody tr').length, 12);
    assert.match($('#modal-content').textContent, /forecast|projected|expected/i);
    assert.match($('#modal-content').textContent, /share/i);
    assert.doesNotMatch($('#modal-content').textContent, /NaN|Infinity/);
    assert.deepEqual(saved().state, before.state);
    assert.deepEqual(saved().plan, before.plan);
    click('[data-action="close-modal"]');
  });

  await t.test('opening finances expose current and projected balances before a round is committed', () => {
    const before = saved();
    const current = balanceSheet(before.state);
    const next = forecast(before.state, before.plan).report.balanceSheet;
    const projection = projectBusiness(before.state, before.plan, 3);
    click('[data-tab="briefing"]');
    click('[data-action="open-finance"]');
    assert.equal($('#main-nav [aria-current="page"]').dataset.tab, 'finance');
    click('[data-action="financial-plan"]');
    assert.equal(dialog.open, true);
    for (const key of ['cash', 'assets', 'liabilitiesAndEquity']) {
      assert.equal(balanceValue(key), money(current[key]), `opening ${key}`);
      assert.equal(balanceValue(key, 2), money(next[key]), `projected ${key}`);
    }
    const revenueCells = [...$('[data-projection-table="income"] [data-metric="revenue"]').children].slice(1);
    assert.deepEqual(revenueCells.map(cell => cell.textContent), projection.months.map(month => money(month.report.income.revenue)));
    const cashCells = [...$('[data-projection-table="cash"] [data-metric="closing"]').children].slice(1);
    assert.deepEqual(cashCells.map(cell => cell.textContent), projection.months.map(month => money(month.report.cashFlow.closing)));
    const threeMonthContent = $('#modal-content').textContent;
    click('[data-horizon="12"]');
    assert.notEqual($('#modal-content').textContent, threeMonthContent);
    const fullYear = projectBusiness(before.state, before.plan, 12);
    for (const type of ['income', 'cash']) {
      assert.equal($(`[data-projection-table="${type}"]`).querySelectorAll('thead th').length, fullYear.months.length + 1);
    }
    assert.equal($('#modal-content [data-kpi="ending-cash"]').textContent, money(fullYear.ending.cash));
    click('[data-horizon="36"]');
    const fullCampaign = projectBusiness(before.state, before.plan, 36);
    assert.equal($('[data-projection-table="income"]').querySelectorAll('thead th').length, fullCampaign.months.length + 1);
    assert.equal($('#modal-content [data-kpi="ending-cash"]').textContent, money(fullCampaign.ending.cash));
    if (fullCampaign.months.some(month => month.month > 12)) assert.match($('#modal-content').textContent, /Year 2/);
    if (fullCampaign.months.some(month => month.month > 24)) assert.match($('#modal-content').textContent, /Year 3/);
    assert.doesNotMatch($('#modal-content').textContent, /NaN|Infinity|undefined/);
    assert.deepEqual(saved().state, before.state, 'changing projection horizon must not commit rounds');
    assert.deepEqual(saved().plan, before.plan, 'projections must not replace player decisions');
    click('[data-horizon="3"]');
    assert.equal($('#modal-content').textContent, threeMonthContent);
    click('[data-action="close-modal"]');
    click('[data-tab="reports"]');
    click('[data-action="statements"]');
    assert.equal(dialog.open, true, 'opening statements should be available before the first result');
    assert.equal(balanceValue('cash'), money(current.cash));
    click('[data-action="close-modal"]');
  });

  await t.test('operational learning views expose the working company without changing decisions or inventing actuals', () => {
    const before = saved();
    for (const [tab, action, marker] of [
      ['operations', 'factory-diagnostics', 'data-factory-diagnostics'],
      ['finance', 'cost-ledger', 'data-cost-ledger'],
      ['markets', 'market-position', 'data-market-position'],
    ]) {
      click(`[data-tab="${tab}"]`);
      click(`[data-action="${action}"]`);
      assert.equal(dialog.open, true);
      assert.ok($(`#modal-content [${marker}]`), `Missing ${action} view`);
      assert.doesNotMatch($('#modal-content').textContent, /NaN|Infinity|undefined/);
      if (action === 'factory-diagnostics') {
        assert.match($('#modal-content').textContent, /capacity/i);
        assert.match($('#modal-content').textContent, /skill|training/i);
        assert.match($('#modal-content').textContent, /controller|component/i);
        for (const product of getFactoryDiagnostics(before.state, before.plan).products) {
          const displayed = $$(`[data-factory-product="${product.id}"] .factory-flow strong`).map(element => element.textContent);
          assert.deepEqual(displayed, ['target', 'capacity', 'assemblyCapacity', 'assembled', 'production'].map(key => units(product.flow[key])));
        }
      } else if (action === 'cost-ledger') {
        assert.match($('#modal-content').textContent, /inventory/i);
        assert.match($('#modal-content').textContent, /warranty/i);
        assert.match($('#modal-content').textContent, /expense|income|profit/i);
        const ledger = getCostLedger(before.state, before.plan);
        const total = $$('[data-inventory-ledger] tbody tr').at(-1);
        assert.equal(total.children[1].textContent, money(ledger.inventory.currentM));
        assert.equal(total.children[2].textContent, money(ledger.inventory.forecastM));
        const qualityExpense = $$('[data-quality-ledger] tbody tr').find(row => row.children[0].textContent === 'Quality expense subtotal');
        assert.equal(qualityExpense.children[1].textContent, money(ledger.forecastQuality.qualityExpenseM));
      } else {
        assert.equal($('[data-market-position-current-share]').textContent, '—');
        assert.equal($('[data-market-position-share-change]').textContent, '—');
        assert.match($('#modal-content').textContent, /reputation/i);
        assert.match($('#modal-content').textContent, /technology/i);
        assert.match($('#modal-content').textContent, /forecast|expected|projected/i);
      }
      assert.deepEqual(saved().state, before.state, `${action} must not advance the campaign`);
      assert.deepEqual(saved().plan, before.plan, `${action} must not change the working plan`);
      click('[data-action="close-modal"]');
    }
  });

  await t.test('customer APR and long-term investment guides explain the working decisions without applying alternatives', () => {
    const before = saved();
    const financing = getFinancingInsights(before.state, before.plan);
    click('[data-tab="plan"]');
    click('[data-plan-group="Commercial"]');
    click('[data-action="financing-guide"]');
    assert.ok($('[data-financing-guide]'));
    assert.match($('[data-financing-rate-rules]').textContent, /7\.25%.*customer APR/);
    assert.match($('[data-financing-rate-rules]').textContent, /7\.50% corporate/);
    assert.match($('[data-financing-rate-rules]').textContent, /5\.50%.*funding/);
    assert.equal($('[data-financing-demand-multiplier]').textContent, `${financing.selected.demandMultiplier.toFixed(3)}×`);
    assert.match($('#modal-content').textContent, /existing loan cohorts keep their original APR/i);
    assert.match($('#modal-content').textContent, /interest.*following month|interest.*next month/i);
    const nextRows = $$('[data-financing-next-month] tbody tr');
    const interest = nextRows.find(row => row.children[0].textContent === 'Interest from existing customer loans');
    assert.deepEqual([...interest.children].slice(1).map(cell => cell.textContent), financing.options.map(option => statementMoney(option.next.interestIncome)));
    const retail = nextRows.find(row => row.children[0].textContent === 'Customer retail sales');
    assert.deepEqual([...retail.children].slice(1).map(cell => cell.textContent), financing.options.map(option => units(option.next.retailSales)));
    assert.deepEqual(saved().state, before.state);
    assert.deepEqual(saved().plan, before.plan);
    click('[data-action="close-modal"]');
    edit('#field-financingApr', 6.25);
    click('[data-action="financing-guide"]');
    const lowerRate = getFinancingInsights(before.state, saved().plan);
    assert.equal($('[data-financing-demand-multiplier]').textContent, `${lowerRate.selected.demandMultiplier.toFixed(3)}×`);
    assert.notEqual(lowerRate.selected.demandMultiplier, financing.selected.demandMultiplier, 'changing the working customer rate should change its demand effect');
    assert.match($('[data-financing-rate-rules]').textContent, /6\.25%.*customer APR/);
    assert.deepEqual(saved().state, before.state, 'explaining a new rate must not originate loans or commit the month');
    click('[data-action="close-modal"]');
    edit('#field-financingApr', before.plan.financingApr);
    click('[data-plan-group="Investment"]');
    click('[data-action="investment-guide"]');
    assert.ok($('[data-investment-guide]'));
    const explanations = $('[data-investment-explanation]').textContent;
    assert.match(explanations, /capital expenditure/);
    assert.match(explanations, /operating expense/);
    assert.match(explanations, /0\.4 percentage points/);
    assert.match(explanations, /0\.007/);
    assert.match($('#modal-content').textContent, /April/);
    assert.match($('#modal-content').textContent, /cash.*commit|cash.*spending/i);
    assert.deepEqual(saved().state, before.state);
    assert.deepEqual(saved().plan, before.plan);
    assert.doesNotMatch($('#modal-content').textContent, /NaN|Infinity|undefined/);
    click('[data-action="close-modal"]');
    click('[data-plan-group="Commercial"]');
  });

  await t.test('investment experiments compare horizons and explicitly apply only the selected budget to the working plan', () => {
    click('[data-tab="operations"]');
    const before = saved();
    click('[data-action="investment-lab"]');
    assert.ok($('[data-investment-lab]'));
    assert.equal($$('[data-investment-option]').length, 6, 'show the working baseline plus five targeted experiments');
    assert.equal($('[data-investment-horizon="6"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(new Set($$('[data-investment-apply]').map(button => button.dataset.investmentApply)), new Set(['training', 'quality', 'maintenance', 'capacity', 'engineering']));
    for (const horizon of ['3', 'year-end', 'campaign-end', '6', '3']) {
      click(`[data-investment-horizon="${horizon}"]`);
      assert.equal($(`[data-investment-horizon="${horizon}"]`).getAttribute('aria-pressed'), 'true');
      assert.deepEqual(saved().state, before.state, 'comparing investments must not commit a month');
      assert.deepEqual(saved().plan, before.plan, 'comparing investments must not adopt a suggestion');
      assert.doesNotMatch($('#modal-content').textContent, /NaN|Infinity|undefined/);
    }
    const expected = getInvestmentOptions(before.state, before.plan, 3).options.find(option => option.id === 'training');
    click('[data-investment-apply="training"]');
    assert.deepEqual(saved().plan, expected.plan, 'apply should change exactly the selected candidate budget');
    assert.deepEqual(saved().state, before.state, 'adopting a budget is a working-plan edit, not a committed round');
    assert.deepEqual(saved().drafts, before.drafts, 'investment experiments must preserve saved alternatives');
    assert.ok($('[data-investment-lab]'), 'keep the comparison visible with the newly edited baseline');
    assert.ok(saved().plan.training > before.plan.training);
    click('[data-action="close-modal"]');
    click('[data-tab="plan"]');
  });

  await t.test('numerical edits recompute the forecast without advancing; invalid inputs block commitment', () => {
    click('[data-tab="briefing"]');
    click('[data-action="open-plan"]');
    const initialDemand = forecast(saved().state, saved().plan).report.products.find(product => product.id === 'tractor').expectedDemand;
    edit('#field-tractorPrice', 160);
    assert.equal(saved().plan.tractorPrice, 160);
    assert.equal(saved().state.month, 0);
    const expected = forecast(saved().state, saved().plan);
    assert.notEqual(expected.report.products.find(product => product.id === 'tractor').expectedDemand, initialDemand);
    assert.equal($('#forecast-panel .forecast-grid strong').textContent, money(expected.state.cash));
    click('#forecast-panel [data-action="financial-plan"]');
    assert.equal(balanceValue('cash', 2), money(expected.state.cash));
    click('[data-action="close-modal"]');
    const validSave = saved();
    edit('#field-tractorPrice', -1);
    assert.match($('#plan-errors').textContent, /must be between/);
    assert.equal($('#forecast-panel').textContent, '');
    click('[data-action="commit-preview"]');
    assert.equal(dialog.open, false);
    assert.equal(saved().state.month, 0);
    assert.equal(saved().plan.tractorPrice, 160, 'invalid edits must not replace the usable autosave');
    click('[data-tab="finance"]');
    click('[data-action="financial-plan"]');
    assert.equal(balanceValue('cash'), money(saved().state.cash));
    assert.equal(balanceValue('cash', 2), '—');
    assert.match($('#modal-content').textContent, /must be between|correct|invalid|unavailable/i);
    assert.equal($$('[data-projection-table]').length, 0, 'invalid decisions must not produce a plausible projection');
    assert.deepEqual(saved().state, validSave.state);
    assert.deepEqual(saved().plan, validSave.plan);
    click('[data-action="close-modal"]');
    click('[data-action="unit-economics"]');
    assert.equal($$('[data-economics-product]').length, 0, 'invalid current decisions must not produce stale or plausible unit costs');
    assert.match($('#modal-content').textContent, /check|correct|invalid|must be between/i);
    assert.deepEqual(saved().state, validSave.state);
    click('[data-action="close-modal"]');
    for (const [tab, action, marker] of [
      ['operations', 'factory-diagnostics', 'data-factory-diagnostics'],
      ['finance', 'cost-ledger', 'data-cost-ledger'],
      ['markets', 'market-position', 'data-market-position'],
      ['operations', 'investment-lab', 'data-investment-lab'],
      ['finance', 'financing-guide', 'data-financing-guide'],
      ['finance', 'board-review', 'data-board-dashboard'],
    ]) {
      click(`[data-tab="${tab}"]`);
      click(`[data-action="${action}"]`);
      assert.ok($(`#modal-content [${marker}]`), `${action} should still explain an invalid working plan`);
      assert.match($('#modal-content').textContent, /must be between|correct|invalid|unavailable/i);
      assert.ok($$('[data-investment-apply]').every(button => button.disabled), 'an invalid baseline cannot produce actionable investment comparisons');
      assert.doesNotMatch($('#modal-content').textContent, action === 'board-review' ? /NaN|Infinity/ : /NaN|Infinity|undefined/);
      assert.deepEqual(saved().state, validSave.state);
      assert.deepEqual(saved().plan, validSave.plan);
      click('[data-action="close-modal"]');
    }
    click('[data-tab="plan"]');
    click('[data-plan-group="Investment"]');
    click('[data-action="investment-guide"]');
    assert.match($('#modal-content').textContent, /must be between|correct|invalid|unavailable/i);
    assert.deepEqual(saved().state, validSave.state);
    assert.deepEqual(saved().plan, validSave.plan);
    click('[data-action="close-modal"]');
    click('[data-plan-group="Commercial"]');
    edit('#field-tractorPrice', 160);
  });

  await t.test('saves an alternative and compares model forecasts under shared assumptions', () => {
    const previousDraftCount = saved().drafts.length;
    click('[data-action="save-draft"]');
    $('#draft-name').value = 'Pricing & cash test';
    click('[data-action="confirm-save-draft"]');
    assert.equal(saved().drafts.length, previousDraftCount + 1);
    assert.equal(saved().drafts.at(-1).name, 'Pricing & cash test');
    click('[data-action="compare"]');
    assert.equal(dialog.open, true);
    assert.match($('#modal-content').textContent, /Pricing & cash test/);
    const cells = $$('.comparison-table tbody tr')[0].children;
    const payload = saved();
    assert.equal(cells[1].textContent, money(forecast(payload.state, payload.plan).state.cash));
    assert.equal(cells[2].textContent, money(forecast(payload.state, payload.drafts[0].plan).state.cash));
    assert.equal(saved().state.month, 0);
    click('[data-action="back-to-plan"]');
  });

  await t.test('unit economics explain the current tractor plan and update when its price changes', () => {
    const before = saved();
    const inspect = () => {
      const expected = getUnitEconomics(saved().state, saved().plan);
      click('[data-action="unit-economics"]');
      assert.equal(dialog.open, true);
      assert.equal($$('[data-economics-product]').length, 3);
      const tractor = expected.products.find(product => product.id === 'tractor');
      for (const field of ['listPriceK', 'manufacturerPriceK', 'standardCostK', 'contributionPerUnitK', 'indicativeBreakEvenListPriceK']) {
        const value = $(`[data-economics-product="tractor"] [data-economics-field="${field}"]`).cloneNode(true);
        value.querySelector('small')?.remove();
        assert.equal(value.textContent, unitMoney(tractor[field]), field);
      }
      assert.match($('#modal-content').textContent, /break.even/i);
      assert.match($('#modal-content').textContent, /cash/i);
      assert.match($('#modal-content').textContent, /assumptions|allocation|allocated/i);
      assert.doesNotMatch($('#modal-content').textContent, /NaN|Infinity|undefined/);
      const contribution = $('[data-economics-product="tractor"] [data-economics-field="contributionPerUnitK"]').textContent;
      click('[data-action="close-modal"]');
      return contribution;
    };
    const originalContribution = inspect();
    assert.deepEqual(saved().state, before.state);
    assert.deepEqual(saved().plan, before.plan);
    edit('#field-tractorPrice', 170);
    assert.notEqual(inspect(), originalContribution, 'a changed selling price must flow into the displayed unit contribution');
    assert.deepEqual(saved().state, before.state, 'reading unit costs must never advance a round');
    edit('#field-tractorPrice', before.plan.tractorPrice);
    assert.equal(inspect(), originalContribution);
    assert.deepEqual(saved().plan, before.plan);
  });

  await t.test('commits exactly one month and displays actual production and deliveries from the model', async () => {
    const before = saved();
    const expected = advanceMonth(before.state, before.plan);
    const projection = forecast(before.state, before.plan);
    click('[data-action="commit-preview"]');
    assert.match($('#modal-content').textContent, /Commit your January.*plan/);
    assert.equal(saved().state.month, 0, 'opening the commitment dialog must not advance time');
    click('[data-action="commit"]');
    click('#advance-button'); // A second click while the first commit resolves must be ignored.
    await waitFor(() => saved().state.month === 1 && !document.body.classList.contains('resolving'), 'commit did not finish');
    const report = saved().state.history[0];
    assert.equal(saved().state.month, 1);
    assert.deepEqual(report.metrics, expected.report.metrics);
    assert.deepEqual(report.plan, before.plan);
    assert.deepEqual(report.planningForecast, projection.report.metrics);
    assert.match($('#round-badge').textContent, /ROUND 02/);
    assert.match($('#modal-content').textContent, /January.*in perspective/);
    const rows = $$('#modal-content [data-report-production] tbody tr');
    assert.equal(rows.length, 3);
    for (const [index, product] of report.products.entries()) {
      assert.equal(rows[index].children[1].textContent, units(product.target));
      assert.equal(rows[index].children[2].textContent, units(product.production), 'completed units must use the actual production field');
      assert.equal(rows[index].children[3].textContent, units(product.deliveries), 'shipped units must use the actual deliveries field');
      assert.equal(rows[index].children[4].textContent, units(product.retailSales));
    }
    assert.ok(report.products.some((product) => product.production > 0 && product.deliveries > 0));
    assert.ok($('[data-board-summary]'), 'every completed month should include a board response');
    verifyMonthlyBalanceSheet(saved().state, 1);
  });

  await t.test('the monthly board response matches actual results against the announced targets separately from coaching', () => {
    const before = saved();
    januaryBoardReview = getBoardReview(before.state, 1);
    const summary = $('[data-board-summary="1"]');
    verifyBoardReview(januaryBoardReview, summary);
    assert.ok($('[data-kpi="coaching-score"]'), 'decision coaching remains separately labeled alongside actual board performance');
    click('[data-board-month="1"]');
    assert.ok($('[data-board-dashboard]'));
    verifyBoardReview(januaryBoardReview, $('#modal-content'));
    const next = getBoardDashboard(before.state, before.plan).next;
    verifyBoardReview(next, $('#modal-content'));
    assert.match($('#modal-content').textContent, /75\/100|target earns 75/);
    assert.match($('#modal-content').textContent, /stretch/i);
    assert.deepEqual(saved().state, before.state);
    assert.deepEqual(saved().plan, before.plan);
    click('[data-action="close-modal"]');
    click('[data-tab="reports"]');
    click('[data-action="last-report"]');
  });

  await t.test('a completed month provides a decision grade, coaching, and clearly scoped alternative plans', async () => {
    const { getMonthlyCoaching } = await import('../src/coaching.js');
    const before = saved();
    const expected = getMonthlyCoaching(before.state, 1);
    assert.equal(expected.available, true);
    assert.equal(parseFloat($('[data-kpi="coaching-score"]').textContent), expected.score);
    assert.equal($('[data-kpi="coaching-grade"]').textContent, expected.grade);
    click('[data-coaching-month="1"]');
    assert.equal(dialog.open, true);
    assert.equal(parseFloat($('[data-kpi="coaching-score"]').textContent), expected.score);
    assert.equal($('[data-kpi="coaching-grade"]').textContent, expected.grade);
    assert.ok($('[data-coaching-alternatives]'), 'historical coaching should expose the candidate comparison');
    assert.ok($$('[data-coaching-alternative]').length >= 2, 'players should be able to inspect multiple historical alternatives');
    assert.match($('#modal-content').textContent, /tested|candidate|compared/i, 'best-plan claims must state their candidate scope');
    assert.match($('#modal-content').textContent, /forecast|expected/i, 'decision quality must distinguish information available before the outcome');
    assert.match($('#modal-content').textContent, /actual|realized|hindsight/i);
    assert.match($('#modal-content').textContent, /strength|good|well|what worked/i);
    assert.match($('#modal-content').textContent, /improv|better|next/i);
    assert.doesNotMatch($('#modal-content').textContent, /NaN|Infinity|undefined/);
    assert.ok($('#modal-content').textContent.includes(expected.shockContext.summary));
    assert.ok($('#modal-content').textContent.includes(expected.shockContext.publicOutlook.summary));
    for (const event of expected.shockContext.events) {
      assert.ok($('#modal-content').textContent.includes(event.title));
    }
    januaryLesson = $('#modal-content').textContent;
    const alternative = expected.alternatives.find(candidate => candidate.id !== expected.hindsightBest.id && candidate.planChanges.length);
    assert.ok(alternative);
    click(`[data-coaching-alternative="${alternative.id}"]`);
    assert.equal($(`[data-coaching-alternative="${alternative.id}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal($$('[data-coaching-plan-changes] tbody tr').length, alternative.planChanges.length);
    assert.equal(parseFloat($('[data-kpi="coaching-score"]').textContent), expected.score, 'inspecting an alternative must not replace the player decision grade');
    assert.deepEqual(saved().state, before.state, 'candidate replays must not replace the player campaign');
    assert.deepEqual(saved().plan, before.plan);
    click('[data-action="close-modal"]');
    click('[data-tab="reports"]');
    click('[data-action="last-report"]');
  });

  await t.test('cash explanations lead to the factory and financial statements use the recorded balances', () => {
    const month = saved().state.month;
    click('[data-review-focus="supply"]');
    assert.equal(dialog.open, false);
    assert.equal($('#location-title').textContent, 'The factory floor');
    click('[data-tab="operations"]');
    const cards = $$('.plant-card');
    assert.equal(cards.length, 3);
    for (const [index, product] of saved().state.history[0].products.entries()) {
      const quantities = [...cards[index].querySelectorAll('.plant-stats strong')].map((element) => element.textContent);
      assert.deepEqual(quantities, [product.closing.incomplete, product.closing.finishedGoods, product.closing.rework].map(units));
    }
    click('[data-tab="reports"]');
    click('[data-action="statements"]');
    const report = saved().state.history[0];
    assert.equal(tableValue('Total revenue'), money(report.income.revenue));
    assert.equal(tableValue('Total assets'), money(report.balanceSheet.assets));
    assert.equal(tableValue('Liabilities + equity'), money(report.balanceSheet.liabilitiesAndEquity));
    assert.equal(tableValue('Closing cash'), money(report.cashFlow.closing));
    assert.equal(saved().state.month, month, 'navigation and statements must not advance the simulation');
    click('[data-action="close-modal"]');
  });

  await t.test('after a completed round market share and financial outlook use the actual closing company', () => {
    const before = saved();
    const expected = forecast(before.state, before.plan);
    const market = getMarketIntelligence(before.state, before.plan);
    click('[data-tab="markets"]');
    const actualShare = $('[data-kpi="current-unit-share"]').textContent;
    assert.equal(actualShare, share(market.current.unitShare));
    assert.doesNotMatch(actualShare, /No completed month/);
    assert.equal($('[data-kpi="next-market-change"]').textContent, change(market.next.marketChange));
    assert.equal($('[data-kpi="expected-retail-sales"]').textContent, units(market.next.expectedRetailSales));
    assert.equal($('[data-kpi="next-retail-change"]').textContent, change(market.next.retailSalesChange));
    click('[data-tab="finance"]');
    click('[data-action="financial-plan"]');
    assert.equal(balanceValue('cash'), money(before.state.cash));
    assert.equal(balanceValue('cash', 2), money(expected.state.cash));
    assert.equal(balanceValue('assets'), money(balanceSheet(before.state).assets));
    assert.equal(balanceValue('assets', 2), money(expected.report.balanceSheet.assets));
    const revenueRow = $('[data-projection-table="income"] [data-metric="revenue"]');
    assert.equal(revenueRow.children[1].textContent, money(before.state.history.at(-1).income.revenue), 'latest actual appears before the projections');
    assert.equal(revenueRow.children[2].textContent, money(expected.report.income.revenue), 'next month uses the edited current policy');
    assert.deepEqual(saved().state, before.state);
    assert.deepEqual(saved().plan, before.plan);
    click('[data-action="close-modal"]');
  });

  await t.test('imports an exported campaign through the file control and preserves a valid campaign on bad import', async () => {
    const before = saved();
    const portable = exportSave(before);
    assert.deepEqual(parseSave(portable).state, before.state);
    const importControl = $('#import-file');
    importFile(importControl, portable);
    await waitFor(() => $('#toast').textContent === 'Campaign restored.', 'campaign import did not complete');
    assert.deepEqual(saved().state, before.state);
    assert.deepEqual(saved().plan, before.plan);
    assert.deepEqual(saved().drafts, before.drafts);
    importFile(importControl, '{invalid}');
    await waitFor(() => $('#toast').textContent.startsWith('Import failed:'), 'bad import did not produce feedback');
    assert.deepEqual(saved().state, before.state);
    assert.deepEqual(saved().plan, before.plan);
  });

  await t.test('incomplete historical reports are rejected before they can replace a playable campaign', async () => {
    const before = saved();
    const corruptions = [
      (report) => { delete report.events; },
      (report) => { report.products = []; },
      (report) => { report.drivers = null; },
      (report) => { delete report.income.wholesaleRevenue; },
      (report) => { report.products[0].production = '12'; },
      (report) => { report.planningForecast = { cash: 10 }; },
    ];
    for (const corrupt of corruptions) {
      const malformed = JSON.parse(exportSave(before));
      corrupt(malformed.state.history[0]);
      $('#toast').textContent = '';
      importFile($('#import-file'), JSON.stringify(malformed));
      await waitFor(() => $('#toast').textContent.startsWith('Import failed:'), 'incomplete report was not rejected');
      assert.deepEqual(saved().state, before.state);
      assert.deepEqual(saved().plan, before.plan);
    }
    click('[data-tab="reports"]');
    click('[data-action="last-report"]');
    assert.match($('#modal-content').textContent, /January.*in perspective/);
    assert.equal($$('#modal-content [data-report-production] tbody tr').length, 3);
  });

  await t.test('past-month lessons stay anchored to that month after later results and new decisions', async () => {
    click('[data-action="next-plan"]');
    click('[data-action="commit-preview"]');
    click('[data-action="commit"]');
    await waitFor(() => saved().state.month === 2 && !document.body.classList.contains('resolving'), 'second commit did not finish');
    click('[data-action="next-plan"]');
    edit('#field-tractorPrice', 175);
    const before = saved();
    click('[data-tab="reports"]');
    click('[data-report="1"]');
    assert.match($('#modal-content').textContent, /January.*in perspective/);
    click('[data-coaching-month="1"]');
    assert.equal($('#modal-content').textContent, januaryLesson, 'January coaching must not acquire future results or current-plan edits');
    assert.deepEqual(saved().state, before.state);
    assert.deepEqual(saved().plan, before.plan);
  });

  await t.test('market position compares completed months separately from the edited next-month forecast', () => {
    click('[data-action="close-modal"]');
    const before = saved();
    const expected = getMarketPosition(before.state, before.plan);
    assert.equal(before.state.month, 2);
    click('[data-tab="markets"]');
    click('[data-action="market-position"]');
    assert.equal($('[data-market-position-current-share]').textContent, share(expected.aggregate.current.unitShare));
    const percentagePoints = expected.aggregate.changePP * 100;
    const displayedChange = $('[data-market-position-share-change]').textContent.replace('−', '-');
    assert.equal(parseFloat(displayedChange), Number(percentagePoints.toFixed(1)));
    assert.match(displayedChange, /pp|point/i, 'share movement is percentage points, not sales growth');
    assert.match($('#modal-content').textContent, /actual/i);
    assert.match($('#modal-content').textContent, /forecast|expected|projected/i);
    assert.deepEqual(saved().state, before.state);
    assert.deepEqual(saved().plan, before.plan);
  });

  await t.test('historical board reviews and balance sheets stay attached to their original month', () => {
    click('[data-action="close-modal"]');
    const before = saved();
    click('[data-tab="finance"]');
    click('[data-action="board-review"]');
    verifyBoardReview(getBoardReview(before.state, 2), $('#modal-content'));
    click('[data-board-month="1"]');
    assert.equal($('[data-board-month="1"]').getAttribute('aria-pressed'), 'true');
    verifyBoardReview(januaryBoardReview, $('#modal-content'));
    assert.equal($$('[data-board-kind="forecast"]').length, 0, 'a historical review must not mix in the current next-month plan');
    assert.deepEqual(saved().state, before.state);
    assert.deepEqual(saved().plan, before.plan);
    click('[data-action="close-modal"]');
    click('[data-tab="reports"]');
    click('[data-report="1"]');
    verifyMonthlyBalanceSheet(before.state, 1);
    verifyBoardReview(januaryBoardReview, $('[data-board-summary="1"]'));
  });

  await t.test('completed, distressed and dismissed campaigns retain financial visibility without inventing another round', async () => {
    click('[data-action="close-modal"]');
    for (const status of ['completed', 'distressed', 'dismissed']) {
      let terminal = status === 'dismissed'
        ? createInitialState(4821, { marketRegime: 'flat', campaignMonths: 36, difficulty: 'difficult' })
        : createInitialState(status === 'distressed' ? 41 : 4821);
      while (terminal.status === 'active') {
        const decisions = defaultPlan(terminal);
        if (status === 'distressed') {
          for (const field of PLAN_FIELDS) decisions[field.key] = field.max;
          decisions.debtChange = 0;
        }
        if (status === 'dismissed') Object.assign(decisions, {
          tractorProduction: 0, harvesterProduction: 0, loaderProduction: 0,
          marketing: 0, quality: 0, maintenance: 0, training: 0, rd: 0,
        });
        terminal = advanceMonth(terminal, decisions).state;
      }
      assert.equal(terminal.status, status);
      const before = saved();
      const portable = exportSave({ ...before, state: terminal, plan: defaultPlan(terminal) });
      $('#toast').textContent = '';
      importFile($('#import-file'), portable);
      await waitFor(() => $('#toast').textContent === 'Campaign restored.', `${status} campaign import did not complete`);
      click('[data-tab="finance"]');
      click('[data-action="financial-plan"]');
      assert.match($('#modal-content').textContent, /Campaign ended/);
      assert.equal(balanceValue('cash'), money(terminal.cash));
      assert.equal(balanceValue('cash', 2), '—');
      assert.equal($$('[data-projection-table]').length, 2, 'actual statements remain available after the campaign ends');
      for (const table of $$('[data-projection-table]')) {
        assert.doesNotMatch(table.querySelector('thead').textContent, /Forecast/);
        assert.equal(table.querySelectorAll('thead th').length, 2, 'only the latest actual column should remain');
      }
      assert.doesNotMatch($('#modal-content').textContent, /NaN|Infinity|undefined/);
      assert.deepEqual(saved().state, terminal);
      click('[data-action="close-modal"]');
      click('[data-tab="markets"]');
      assert.doesNotMatch($('#command-panel').textContent, /NaN|Infinity|undefined/);
      assert.deepEqual(saved().state, terminal);
      for (const [tab, action, marker] of [
        ['operations', 'factory-diagnostics', 'data-factory-diagnostics'],
        ['finance', 'cost-ledger', 'data-cost-ledger'],
        ['markets', 'market-position', 'data-market-position'],
        ['operations', 'investment-lab', 'data-investment-lab'],
      ]) {
        click(`[data-tab="${tab}"]`);
        click(`[data-action="${action}"]`);
        assert.ok($(`#modal-content [${marker}]`), `${status} campaigns retain access to ${action}`);
        assert.doesNotMatch($('#modal-content').textContent, /NaN|Infinity|undefined/);
        assert.ok($$('[data-investment-apply]').every(button => button.disabled), 'ended campaigns cannot apply a future investment');
        assert.deepEqual(saved().state, terminal);
        if (action === 'market-position') {
          const position = getMarketPosition(terminal, saved().plan);
          assert.equal($('[data-market-position-current-share]').textContent, share(position.aggregate.current.unitShare));
        }
        click('[data-action="close-modal"]');
      }
      if (status === 'dismissed') {
        click('[data-tab="briefing"]');
        assert.ok($('[data-employment-status="dismissed"]'));
        assert.match($('#command-panel').textContent, /dismissed|ended your tenure/i);
        assert.equal($('#command-panel [data-action="commit-preview"]'), null);
        click('[data-tab="plan"]');
        assert.equal($('#command-panel [data-action="commit-preview"]'), null);
        click('[data-action="outcome"]');
        assert.ok($('#modal-content [data-employment-status="dismissed"]'));
        assert.match($('#modal-content').textContent, /ended your tenure/);
        assert.equal($$('#modal-content [data-board-kind="forecast"]').length, 0);
        assert.deepEqual(saved().state, terminal);
        click('[data-action="close-modal"]');
      }
    }
  });

  await t.test('easy and difficult campaign choices persist and repeat without rewriting an existing save', async () => {
    const original = saved();
    for (const difficulty of ['easy', 'difficult']) {
      click('[data-action="settings"]');
      click('[data-action="restart"]');
      assert.deepEqual(new Set([...$('#new-difficulty').options].map(option => option.value)), new Set(['medium', 'easy', 'difficult']));
      const before = saved();
      edit('#new-difficulty', difficulty);
      edit('#new-campaign-length', '12');
      edit('#new-market-regime', 'flat');
      edit('#new-seed', 4821);
      assert.deepEqual(saved(), before, 'selecting difficulty is only a pending setup change');
      click('[data-action="confirm-restart"]');
      const campaign = saved();
      assert.equal(campaign.state.version, '1.3.0');
      assert.equal(campaign.state.difficulty, difficulty);
      assert.equal(campaign.state.campaignMonths, 12);
      assert.ok($('[data-employment-status="secure"]'));
      click('[data-action="settings"]');
      click('[data-action="restart"]');
      click('[data-action="repeat-scenario"]');
      assert.equal($('#new-difficulty').value, difficulty);
      assert.equal($('#new-campaign-length').value, '12');
      assert.equal($('#new-market-regime').value, 'flat');
      click('[data-action="confirm-restart"]');
      assert.deepEqual(saved().state, campaign.state);
    }
    await restoreCampaign(original.state, original.plan);
  });

  await t.test('new campaigns offer fresh seeds and explicit market regimes without changing a save until confirmation', () => {
    click('[data-action="settings"]');
    click('[data-action="restart"]');
    const before = saved();
    assert.ok($('#new-market-regime'));
    assert.ok($('#new-campaign-length'));
    assert.deepEqual(new Set([...$('#new-campaign-length').options].map(option => option.value)), new Set(['12', '36']));
    assert.equal($('#new-campaign-length').value, '36', 'a fresh mandate should default to three years');
    assert.deepEqual(new Set([...$('#new-market-regime').options].map(option => option.value)), new Set(['random', 'soft', 'flat', 'upswing', 'legacy']));
    const originalSeed = $('#new-seed').value;
    click('[data-action="randomize-seed"]');
    const newSeed = Number($('#new-seed').value);
    assert.ok(Number.isInteger(newSeed) && newSeed >= 0 && newSeed <= 4294967295);
    assert.notEqual($('#new-seed').value, originalSeed, 'asking for another scenario should provide a different seed');
    assert.deepEqual(saved().state, before.state);
    edit('#new-seed', -1);
    click('[data-action="confirm-restart"]');
    assert.equal(dialog.open, true);
    assert.match($('#restart-error').textContent, /whole.number|between|valid/i);
    assert.deepEqual(saved().state, before.state);
    edit('#new-seed', 98765);
    edit('#new-market-regime', 'soft');
    click('[data-action="confirm-restart"]');
    assert.equal(dialog.open, false);
    const soft = saved();
    assert.equal(soft.state.seed, 98765);
    assert.equal(soft.state.month, 0);
    assert.equal(soft.state.campaignMonths, 36);
    assert.equal(soft.state.version, '1.3.0');
    assert.equal(soft.state.difficulty, 'medium');
    assert.equal(soft.state.marketCycle.initialRegime, 'soft');
    assert.equal(soft.state.history.length, 0);
    click('[data-tab="markets"]');
    assert.match($('#command-panel').textContent, /soft|downturn/i, 'the selected cycle should be visible to the player');
    click('[data-action="settings"]');
    click('[data-action="restart"]');
    click('[data-action="repeat-scenario"]');
    assert.equal(Number($('#new-seed').value), soft.state.seed);
    assert.equal($('#new-market-regime').value, 'soft');
    assert.equal($('#new-campaign-length').value, '36', 'repeat-scenario must preserve the campaign horizon');
    click('[data-action="confirm-restart"]');
    assert.deepEqual(saved().state, soft.state, 'replaying a scenario should reproduce the same opening state');
    click('[data-action="settings"]');
    click('[data-action="restart"]');
    edit('#new-seed', 98765);
    edit('#new-market-regime', 'upswing');
    click('[data-action="confirm-restart"]');
    assert.equal(saved().state.marketCycle.initialRegime, 'upswing');
    assert.notDeepEqual(getMarketIntelligence(saved().state, saved().plan).timeline, getMarketIntelligence(soft.state, soft.plan).timeline, 'market forecasts must reflect the selected cycle');
  });

  await t.test('classic and one-year campaign selections preserve their original horizons', () => {
    click('[data-action="settings"]');
    click('[data-action="restart"]');
    edit('#new-seed', 4821);
    edit('#new-market-regime', 'legacy');
    click('[data-action="confirm-restart"]');
    assert.equal(dialog.open, false);
    assert.equal(saved().state.version, '1.0.0');
    assert.equal(saved().state.campaignMonths ?? 12, 12);
    click('[data-action="settings"]');
    click('[data-action="restart"]');
    click('[data-action="repeat-scenario"]');
    assert.equal($('#new-campaign-length').value, '12');
    assert.equal($('#new-market-regime').value, 'legacy');
    edit('#new-market-regime', 'flat');
    edit('#new-campaign-length', '12');
    click('[data-action="confirm-restart"]');
    assert.equal(saved().state.version, '1.1.0');
    assert.equal(saved().state.campaignMonths ?? 12, 12);
    const annualOpening = saved().state;
    click('[data-action="settings"]');
    click('[data-action="restart"]');
    click('[data-action="repeat-scenario"]');
    assert.equal($('#new-campaign-length').value, '12');
    click('[data-action="confirm-restart"]');
    assert.deepEqual(saved().state, annualOpening);
  });

  await t.test('three-year saves continue beyond December and complete only after month 36', async () => {
    let company = createInitialState(4821, { marketRegime: 'flat', campaignMonths: 36 });
    while (company.month < 12 && company.status === 'active') company = advanceMonth(company, sustainablePlan(company)).state;
    assert.equal(company.status, 'active');
    assert.equal(company.month, 12);
    await restoreCampaign(company, sustainablePlan(company));
    assert.match($('#round-badge').textContent, /13/);
    assert.match($('#round-badge').textContent, /JAN.*YEAR 2/);
    click('[data-tab="finance"]');
    click('[data-action="board-review"]');
    const quarterEnd = getBoardReview(company, 12);
    const actualReviews = $$('#modal-content [data-board-review="12"][data-board-kind="actual"]');
    assert.equal(actualReviews.length, 2, 'a quarter-end review should show monthly results and the whole-quarter checkpoint');
    verifyBoardReview(quarterEnd, actualReviews[0]);
    verifyBoardReview(quarterEnd.quarterReview, actualReviews[1]);
    assert.match(actualReviews[1].textContent, /Q4.*Year 1/);
    click('[data-action="close-modal"]');
    click('[data-tab="plan"]');
    const expectedThirteen = advanceMonth(company, saved().plan);
    click('[data-action="commit-preview"]');
    assert.match($('#modal-content').textContent, /January/);
    assert.match($('#modal-content').textContent, /Year 2/);
    click('[data-action="commit"]');
    await waitFor(() => saved().state.month === 13 && !document.body.classList.contains('resolving'), 'first month of year two did not finish');
    assert.equal(saved().state.status, 'active');
    assert.deepEqual(saved().state.history.at(-1).metrics, expectedThirteen.report.metrics);
    assert.match($('#modal-content').textContent, /January.*Year 2|Year 2.*January/);
    assert.ok($('[data-board-summary]'));
    click('[data-action="close-modal"]');

    company = saved().state;
    while (company.month < 35 && company.status === 'active') company = advanceMonth(company, sustainablePlan(company)).state;
    assert.equal(company.month, 35);
    assert.equal(company.status, 'active');
    await restoreCampaign(company, sustainablePlan(company));
    assert.match($('#round-badge').textContent, /36/);
    assert.match($('#round-badge').textContent, /DEC.*YEAR 3/);
    click('[data-tab="plan"]');
    const expectedFinal = advanceMonth(company, saved().plan);
    click('[data-action="commit-preview"]');
    click('[data-action="commit"]');
    await waitFor(() => saved().state.month === 36 && !document.body.classList.contains('resolving'), 'final month did not finish');
    assert.equal(saved().state.status, 'completed');
    assert.deepEqual(saved().state.history.at(-1).metrics, expectedFinal.report.metrics);
    assert.match($('#modal-content').textContent, /December.*Year 3|Year 3.*December/);
    assert.ok($('[data-board-summary]'));
    verifyMonthlyBalanceSheet(saved().state, 36);
    click('[data-action="close-modal"]');
    click('[data-tab="finance"]');
    click('[data-action="financial-plan"]');
    assert.equal(balanceValue('cash', 2), '—');
    assert.match($('#modal-content').textContent, /Campaign ended/);
    assert.doesNotMatch($('#modal-content').textContent, /NaN|Infinity|undefined/);
    assert.deepEqual(saved().state.history.map(report => report.month), Array.from({ length: 36 }, (_, index) => index + 1));
    click('[data-action="close-modal"]');
  });
});
