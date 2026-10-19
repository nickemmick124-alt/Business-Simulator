import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, defaultPlan, advanceMonth, forecast, validateState } from '../src/simulation.js';
import { ADVISORS, getConsultedAdvisorIds, getExecutiveBriefing, visitAdvisor } from '../src/executive-intelligence.js';
import { getCompetitiveIntelligence, getCompetitivePressure } from '../src/competitive-intelligence.js';
import { getMarketIntelligence } from '../src/business-intelligence.js';

const create = (seed = 4821, options = {}) => createInitialState(seed, { marketRegime: 'flat', campaignMonths: 36, difficulty: 'medium', ...options });
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-10, message ?? `${actual} != ${expected}`);
const consultAll = state => ADVISORS.reduce((current, advisor) => visitAdvisor(current, advisor.id), state);

test('six specialists have stable locations and give no detailed briefing before consultation', () => {
  const state = create();
  const briefing = getExecutiveBriefing(state, defaultPlan(state));
  assert.deepEqual(ADVISORS.map(advisor => advisor.id), ['cfo', 'sales', 'strategy', 'operations', 'quality', 'supply']);
  assert.equal(ADVISORS.filter(advisor => advisor.location === 'headquarters').length, 3);
  assert.equal(ADVISORS.filter(advisor => advisor.location === 'factory').length, 3);
  assert.equal(briefing.month, 1);
  assert.equal(briefing.count, 0);
  assert.equal(briefing.total, 6);
  for (const advisor of briefing.advisors) {
    assert.equal(advisor.consulted, false);
    assert.equal(advisor.summary, advisor.teaser);
    assert.deepEqual(advisor.findings, []);
    assert.deepEqual(advisor.levers, []);
  }
  assert.match(briefing.unknowns.join(' '), /never adds points/);
});

test('visits are immutable, idempotent and reveal current actionable evidence for only that role', () => {
  const opening = create();
  const before = JSON.stringify(opening);
  const visited = visitAdvisor(opening, 'cfo');
  assert.equal(JSON.stringify(opening), before);
  assert.notEqual(visited.products, opening.products);
  assert.deepEqual(visited.ceoJournal, [{ month: 1, visited: ['cfo'] }]);
  assert.deepEqual(visitAdvisor(visited, 'cfo'), visited);
  assert.equal(validateState(visited).valid, true);
  const briefing = getExecutiveBriefing(visited, defaultPlan(visited));
  assert.equal(briefing.count, 1);
  assert.equal(briefing.coverage, 1 / 6);
  assert.ok(briefing.advisors.find(advisor => advisor.id === 'cfo').findings.length >= 3);
  assert.equal(briefing.advisors.filter(advisor => advisor.findings.length).length, 1);
  assert.match(briefing.advisors[0].levers.map(item => item.detail).join(' '), /liquidity/);
});

test('all conversations unlock substantive findings without changing a single economic outcome', () => {
  const state = create();
  const plan = defaultPlan(state);
  const informed = consultAll(state);
  const briefing = getExecutiveBriefing(informed, plan);
  assert.equal(briefing.count, 6);
  assert.equal(briefing.coverage, 1);
  assert.match(briefing.confidence, /still uncertain/);
  assert.ok(briefing.advisors.every(advisor => advisor.findings.length >= 3 && advisor.levers.length >= 2));
  const noVisits = advanceMonth(state, plan);
  const withVisits = advanceMonth(informed, plan);
  assert.deepEqual(withVisits.report, noVisits.report, 'attendance has no score, cash, demand, quality or employment bonus');
  const cfo = briefing.advisors.find(advisor => advisor.id === 'cfo');
  assert.match(cfo.findings.find(item => item.label === 'Expected closing cash').value, /^\$/);
  assert.match(cfo.findings.find(item => item.label === 'Interest on new customer loans').detail, /not our borrowing rate/);
});

test('new planning months require refreshed meetings while prior visits remain inspectable', () => {
  const opening = consultAll(create());
  const state = advanceMonth(opening, defaultPlan(opening)).state;
  const briefing = getExecutiveBriefing(state, defaultPlan(state));
  assert.equal(briefing.month, 2);
  assert.equal(briefing.count, 0);
  assert.deepEqual(getConsultedAdvisorIds(state, 1), ADVISORS.map(advisor => advisor.id));
  const next = visitAdvisor(state, 'supply');
  assert.deepEqual(next.ceoJournal, [{ month: 1, visited: ADVISORS.map(advisor => advisor.id) }, { month: 2, visited: ['supply'] }]);
  assert.deepEqual(getConsultedAdvisorIds(next), ['supply']);
});

test('consultations respond to revised plans and do not expose future random outcomes', () => {
  const state = consultAll(create(4821));
  const plan = defaultPlan(state);
  const before = JSON.stringify(state);
  const ordinary = getExecutiveBriefing(state, plan);
  const revised = getExecutiveBriefing(state, { ...plan, capex: 20, rd: 7, financingApr: 4.5 });
  assert.notEqual(ordinary.advisors[0].summary, revised.advisors[0].summary);
  assert.match(revised.advisors.find(advisor => advisor.id === 'strategy').levers.find(item => item.key === 'rd').cost, /7\.0/);
  assert.equal(JSON.stringify(state), before);
  const otherSeed = { ...structuredClone(state), seed: 1999981 };
  assert.deepEqual(getExecutiveBriefing(otherSeed, plan), ordinary, 'identical public facts produce identical briefings even when future shocks differ');
});

test('invalid plans retain observed discussion without inventing a plan forecast', () => {
  const state = consultAll(create());
  const briefing = getExecutiveBriefing(state, { ...defaultPlan(state), tractorPrice: NaN });
  assert.match(briefing.forecastError, /price/i);
  const cfo = briefing.advisors.find(advisor => advisor.id === 'cfo');
  assert.equal(cfo.findings.some(item => item.label === 'Expected closing cash'), false);
  assert.ok(cfo.findings.some(item => item.label === 'Cash and undrawn corporate credit'));
});

test('unknown roles, terminal campaigns and future journal months cannot become visits', () => {
  const state = create();
  assert.throws(() => visitAdvisor(state, 'fortune-teller'), /Choose a member/);
  assert.throws(() => visitAdvisor({ ...state, status: 'completed' }, 'cfo'));
  const forged = { ...state, ceoJournal: [{ month: 2, visited: ['cfo'] }] };
  assert.throws(() => visitAdvisor(forged, 'sales'), /Invalid simulation state/);
  assert.deepEqual(getConsultedAdvisorIds(state, 100), []);
});

test('new paid levers have explicit immediate costs and bounded operational effects', () => {
  const state = consultAll(create());
  const briefing = getExecutiveBriefing(state, { ...defaultPlan(state), supplierSupport: 2.5, dealerSupport: 1.3 });
  const supply = briefing.advisors.find(advisor => advisor.id === 'supply').levers.find(item => item.key === 'supplierSupport');
  const sales = briefing.advisors.find(advisor => advisor.id === 'sales').levers.find(item => item.key === 'dealerSupport');
  assert.match(supply.cost, /2\.5/);
  assert.match(supply.detail, /4 percentage points/);
  assert.match(supply.detail, /100%/);
  assert.match(sales.cost, /1\.3/);
  assert.match(sales.detail, /0\.0015/);
});

test('opening competitor comparison does not invent observed company or rival sales', () => {
  const data = getCompetitiveIntelligence(create());
  assert.equal(data.observed, null);
  assert.equal(data.projection, null);
  assert.equal(data.rivals.length, 3);
  assert.equal(data.player.dealerReach, null);
  assert.equal(data.player.reputation, 0.94);
  assert.ok(data.rivals.every(rival => rival.basis.includes('Fictional')));
  assert.match(data.interpretation.join(' '), /not an industry survey/);
});

test('rival allocations conserve the same market used by the existing market panel', () => {
  let state = create();
  for (let month = 0; month < 5 && state.status === 'active'; month += 1) {
    state = advanceMonth(state, defaultPlan(state)).state;
    const market = getMarketIntelligence(state);
    const data = getCompetitiveIntelligence(state);
    assert.equal(data.observed.marketUnits, market.current.marketUnits);
    assert.equal(data.observed.playerUnits, market.current.retailSales);
    close(data.observed.playerShare, market.current.unitShare);
    close(data.observed.totalShare, 1);
    assert.equal(data.observed.rivals.reduce((total, rival) => total + rival.units, data.observed.playerUnits), data.observed.marketUnits);
    assert.ok(data.observed.rivals.every(rival => rival.kind === 'estimated-rival-allocation'));
  }
});

test('competitor projections remain separate from actual sales and use the supplied public forecast', () => {
  let state = create();
  state = advanceMonth(state, defaultPlan(state)).state;
  const report = forecast(state, defaultPlan(state)).report;
  const market = getMarketIntelligence(state);
  const data = getCompetitiveIntelligence(state, { market, projectedReport: report });
  assert.equal(data.observed.month, 1);
  assert.equal(data.projection.month, 2);
  assert.equal(data.projection.kind, 'forecast-player-estimated-rivals');
  close(data.projection.totalShare, 1);
  close(data.projection.playerShare, report.metrics.retailSales / market.next.marketUnits);
  assert.equal(getCompetitiveIntelligence(state, { projectedReport: state.history[0] }).projection, null, 'an actual report cannot be mislabeled as forecast');
});

test('rival progression is seed-blind, lowers relative demand and leaves legacy rules untouched', () => {
  const state = create();
  const later = { ...state, month: 24 };
  assert.ok(getCompetitivePressure(later) < getCompetitivePressure(state));
  assert.ok(getCompetitiveIntelligence(later).benchmark.technology > getCompetitiveIntelligence(state).benchmark.technology);
  assert.equal(getCompetitivePressure({ ...later, seed: 999999 }), getCompetitivePressure(later));
  for (const version of ['1.0.0', '1.1.0', '1.2.0']) assert.equal(getCompetitivePressure({ ...later, version }), 1);
  assert.ok(getCompetitivePressure(later) >= 0.82);
});

test('closing the technology gap improves the forecast through the engine, without counting technology twice', () => {
  const state = create();
  const plan = defaultPlan(state);
  const better = structuredClone(state);
  for (const product of Object.values(better.products)) product.technology = 1.15;
  const current = getCompetitiveIntelligence(state);
  const improved = getCompetitiveIntelligence(better);
  assert.ok(improved.gaps.technology > current.gaps.technology);
  assert.equal(getCompetitivePressure(better), getCompetitivePressure(state), 'the rival-only factor must not multiply player technology again');
  const baseDemand = forecast(state, plan).report.products.reduce((total, row) => total + row.expectedDemand, 0);
  const betterDemand = forecast(better, plan).report.products.reduce((total, row) => total + row.expectedDemand, 0);
  assert.ok(betterDemand > baseDemand);
});

test('legacy campaigns can use meetings without changing their model version or showing new spending levers', () => {
  const original = createInitialState(4821, { marketRegime: 'flat' });
  const state = consultAll(original);
  const briefing = getExecutiveBriefing(state, defaultPlan(state));
  assert.equal(state.version, '1.1.0');
  assert.equal(briefing.advisors.flatMap(advisor => advisor.levers).some(lever => ['supplierSupport', 'dealerSupport'].includes(lever.key)), false);
  assert.equal(getCompetitiveIntelligence(state).mechanicsActive, false);
  assert.deepEqual(advanceMonth(state, defaultPlan(state)).report, advanceMonth(original, defaultPlan(original)).report);
});
