import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { advanceMonth, forecast } from '../src/simulation.js';
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
    set(value) {
      for (const option of this.options) option.selected = option.value === String(value);
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
  const units = (value) => Math.round(value).toLocaleString('en-US');
  const waitFor = async (predicate, message) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (predicate()) return;
      await new Promise((resolve) => nativeSetTimeout(resolve, 5));
    }
    assert.fail(message);
  };
  const tableValue = (label) => {
    const row = $$('#modal-content tbody tr').find((row) => row.children[0]?.textContent === label);
    assert.ok(row, `Missing financial statement row ${label}`);
    return row.children[1].textContent;
  };

  await import('../src/main.js');

  await t.test('initializes the briefing and autosave despite unavailable WebGL', () => {
    assert.match($('#command-panel').textContent, /A new season/);
    assert.equal($$('#main-nav [data-tab]').length, 5);
    assert.equal(saved().state.month, 0);
    assert.equal(saved().drafts.length, 2);
    assert.match($('#save-indicator').textContent, /Saved on this device/);
    assert.ok($('#world .fallback-world'), 'missing-WebGL fallback should preserve business controls');
    assert.ok(diagnostics.some((message) => /3D world initialization failed/.test(message)));
  });

  await t.test('numerical edits recompute the forecast without advancing; invalid inputs block commitment', () => {
    click('[data-action="open-plan"]');
    const initialProjection = $('#forecast-panel').textContent;
    edit('#field-tractorPrice', 160);
    assert.notEqual($('#forecast-panel').textContent, initialProjection);
    assert.equal(saved().plan.tractorPrice, 160);
    assert.equal(saved().state.month, 0);
    const expected = forecast(saved().state, saved().plan);
    assert.equal($('#forecast-panel .forecast-grid strong').textContent, money(expected.state.cash));
    edit('#field-tractorPrice', -1);
    assert.match($('#plan-errors').textContent, /must be between/);
    assert.equal($('#forecast-panel').textContent, '');
    click('[data-action="commit-preview"]');
    assert.equal(dialog.open, false);
    assert.equal(saved().state.month, 0);
    assert.equal(saved().plan.tractorPrice, 160, 'invalid edits must not replace the usable autosave');
    edit('#field-tractorPrice', 160);
  });

  await t.test('saves an alternative and compares model forecasts under shared assumptions', () => {
    click('[data-action="save-draft"]');
    $('#draft-name').value = 'Pricing & cash test';
    click('[data-action="confirm-save-draft"]');
    assert.equal(saved().drafts.length, 3);
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

  await t.test('commits exactly one month and displays actual production and deliveries from the model', async () => {
    const before = saved();
    const expected = advanceMonth(before.state, before.plan);
    const projection = forecast(before.state, before.plan);
    click('[data-action="commit-preview"]');
    assert.match($('#modal-content').textContent, /Commit your January plan/);
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
    assert.match($('#modal-content').textContent, /January, in perspective/);
    const rows = $$('#modal-content table tbody tr');
    assert.equal(rows.length, 3);
    for (const [index, product] of report.products.entries()) {
      assert.equal(rows[index].children[1].textContent, units(product.target));
      assert.equal(rows[index].children[2].textContent, units(product.production), 'completed units must use the actual production field');
      assert.equal(rows[index].children[3].textContent, units(product.deliveries), 'shipped units must use the actual deliveries field');
      assert.equal(rows[index].children[4].textContent, units(product.retailSales));
    }
    assert.ok(report.products.some((product) => product.production > 0 && product.deliveries > 0));
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
    assert.match($('#modal-content').textContent, /January, in perspective/);
    assert.equal($$('#modal-content table tbody tr').length, 3);
  });
});
