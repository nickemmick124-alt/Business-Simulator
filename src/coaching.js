/** Read-only business coaching. Decisions use public forecasts; replay uses the same shocks. */
import {
  PRODUCTS, PLAN_FIELDS, advanceMonth, createReplayInitialState, defaultPlan,
  forecast, getMarketOutlook, validatePlan, validateState,
} from './simulation.js';

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const sum = values => values.reduce((a, b) => a + b, 0);
const clone = value => JSON.parse(JSON.stringify(value));
const round = n => Math.round(n * 100) / 100;
const DEFINITIONS = [
  { id: 'economics', label: 'Earnings discipline', maximum: 25 },
  { id: 'workingCapital', label: 'Cash & inventory discipline', maximum: 20 },
  { id: 'service', label: 'Serving customers', maximum: 20 },
  { id: 'capability', label: 'Quality & future capability', maximum: 20 },
  { id: 'risk', label: 'Liquidity resilience', maximum: 15 },
];
const letter = score => score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
const unavailable = (month, reason) => ({ available: false, month, reason, score: null, grade: null, components: [], alternatives: [] });
const workingCapital = sheet => sheet.receivables + sheet.inventory - sheet.payables;

function feasible(opening, plan) {
  const result = {};
  for (const field of PLAN_FIELDS) {
    const value = Number.isFinite(plan[field.key]) ? plan[field.key] : defaultPlan(opening)[field.key];
    result[field.key] = clamp(value, field.min, field.max);
    if (field.key.endsWith('Production')) result[field.key] = Math.round(result[field.key]);
  }
  result.debtChange = clamp(result.debtChange, -Math.min(40, opening.corporateDebt), Math.min(40, 160 - opening.corporateDebt));
  return result;
}

function demandMatched(opening, input, cushion = 0.1) {
  const plan = feasible(opening, input);
  const expected = forecast(opening, plan).report;
  for (const product of expected.products) {
    const definition = PRODUCTS.find(item => item.id === product.id);
    const recovered = Math.min(product.opening.rework, Math.floor(definition.capacity * 0.035 + plan.quality * 4 + plan.training * 2));
    const required = Math.max(0, product.dealerOrders + cushion * product.expectedDemand - product.opening.finishedGoods - recovered);
    plan[`${product.id}Production`] = Math.ceil(required / Math.max(0.85, product.qualityRate));
  }
  return feasible(opening, plan);
}

/** Candidate construction deliberately has no advanceMonth call or random lookup. */
function candidatePlans(opening, original) {
  const candidates = [];
  const add = (id, name, plan, rationale) => candidates.push({ id, name, plan: feasible(opening, plan), rationale });
  add('committed', 'Your committed plan', original, 'The plan you chose, evaluated using the information available at the time.');
  add('match-demand', 'Match output to demand', demandMatched(opening, original), 'Use existing stock and expected dealer orders before scheduling more assembly.');
  add('lean-stock', 'Lean component inventory', demandMatched(opening, { ...original, partsBuffer: 0, capex: 0 }, 0.05), 'Test a smaller stock buffer and defer new capacity to preserve working capital.');
  add('protect-cash', 'Protect cash', demandMatched(opening, {
    ...original, marketing: Math.min(original.marketing, 1.2), partsBuffer: 5, capex: 0, overtime: 0,
  }, 0), 'Trim demand spending and new capacity while matching output to the revised order forecast.');
  add('support-service', 'Protect quality & delivery', demandMatched(opening, {
    ...original, quality: Math.max(original.quality, 1.5), maintenance: Math.max(original.maintenance, 1),
    training: Math.max(original.training, 0.5), partsBuffer: Math.max(original.partsBuffer, 15),
  }, 0.15), 'Protect plant and workforce capability, allowing a modest delivery cushion.');
  for (const [id, name, multiplier] of [['firmer-price', 'Test firmer prices', 1.04], ['support-demand', 'Test lower prices', 0.96]]) {
    const revised = { ...original };
    for (const product of PRODUCTS) revised[`${product.id}Price`] = Math.round(original[`${product.id}Price`] * multiplier);
    add(id, name, demandMatched(opening, revised), 'A four-percent list-price experiment, with output resized to its own public demand forecast.');
  }
  const steady = { ...defaultPlan(opening), marketing: 1.5, quality: 1.3, maintenance: 1, training: 0.5, rd: 1.5, partsBuffer: 5, overtime: 0, capex: 0, debtChange: 0, financingApr: 7.25 };
  for (const product of PRODUCTS) steady[`${product.id}Price`] = product.basePrice;
  add('steady-business', 'Steady operating policy', demandMatched(opening, steady), 'Reference prices, continuing engineering, and maintenance of existing capabilities.');
  const liquid = { ...demandMatched(opening, { ...original, partsBuffer: 5, capex: 0 }), debtChange: 0 };
  const liquidForecast = forecast(opening, feasible(opening, liquid)).report;
  if (liquidForecast.metrics.cash < 10) liquid.debtChange = Math.ceil(10 - liquidForecast.metrics.cash);
  add('liquidity', 'Preserve liquidity', liquid, 'Only draw corporate credit when the expected cash balance needs a cushion; borrowing is not earnings.');
  return candidates;
}

function rawAssessment(opening, result) {
  const { state: ending, report } = result;
  const plan = report.plan;
  const revenue = report.income.wholesaleRevenue;
  // Operating earnings exclude corporate funding and its interest. A $1m
  // improvement has the same effect for every plan facing this opening position.
  const revenueScale = Math.max(20, sum(PRODUCTS.map(product => product.baseDemand * product.basePrice * 0.86 / 1000)));
  const economics = clamp(65 + report.income.operatingProfit / revenueScale * 210, 0, 100);
  const inventoryCover = report.balanceSheet.inventory / Math.max(8, report.income.cogs);
  const changeInWorkingCapital = workingCapital(report.balanceSheet) - workingCapital(report.openingBalanceSheet);
  const inventoryDiscipline = clamp(100 - Math.max(0, inventoryCover - 0.65) * 45, 0, 100);
  const cashConversion = clamp(85 - changeInWorkingCapital / revenueScale * 110, 0, 100);
  const workingCapitalScore = inventoryDiscipline * 0.65 + cashConversion * 0.35;
  const orders = sum(report.products.map(product => product.dealerOrders));
  const demand = sum(report.products.map(product => product.demand));
  const service = orders || demand ? 100 * (0.7 * (orders ? report.metrics.deliveries / orders : 1)
    + 0.3 * (demand ? report.metrics.retailSales / demand : 1)) : 0;
  const maintenanceNeed = (0.017 + plan.overtime * 0.00035) / 0.018;
  const trainingNeed = 0.007 / 0.018;
  const qualityNeed = Math.max(0.25, (0.0032 + plan.overtime * 0.00018 - plan.training * 0.0015) / 0.0025);
  const stewardship = 100 * (0.35 * clamp(plan.maintenance / maintenanceNeed, 0, 1)
    + 0.2 * clamp(plan.training / trainingNeed, 0, 1)
    + 0.25 * clamp(plan.quality / qualityNeed, 0, 1)
    + 0.2 * clamp(plan.rd / 1, 0, 1));
  const quality = clamp((report.metrics.qualityRate - 0.86) / 0.125 * 100, 0, 100);
  const capability = 0.45 * quality + 0.55 * stewardship;
  // cash + undrawn corporate credit is unchanged by a draw or repayment.
  // Cash below zero is still a real operating failure, so an appropriate
  // liquidity draw can remove that penalty without rewarding idle borrowed cash.
  const resources = ending.cash + Math.max(0, 160 - ending.corporateDebt);
  let risk = clamp(resources / 35 * 100, 0, 100);
  if (ending.cash < 0) risk = Math.min(risk, clamp(45 + ending.cash * 2, 0, 45));
  if (ending.status === 'distressed') risk = 0;
  return {
    values: { economics, workingCapital: workingCapitalScore, service, capability, risk },
    facts: { operatingProfit: report.income.operatingProfit, revenue, inventoryCover, changeInWorkingCapital,
      inventory: report.balanceSheet.inventory, service, quality: report.metrics.qualityRate, stewardship,
      cash: ending.cash, resources, status: ending.status },
  };
}

function gradeAssessment(assessment, benchmarks) {
  const components = DEFINITIONS.map(definition => {
    const absolute = assessment.values[definition.id];
    const regret = Math.max(0, benchmarks[definition.id] - absolute);
    const percentage = 0.35 * absolute + 0.65 * clamp(100 - 2 * regret, 0, 100);
    return { ...definition, score: round(percentage / 100 * definition.maximum), absoluteScore: round(absolute), benchmarkScore: round(benchmarks[definition.id]) };
  });
  const score = Math.round(clamp(sum(components.map(component => component.score)), 0, 100));
  return { score, grade: letter(score), components };
}

const planChanges = (from, to) => PLAN_FIELDS.filter(field => Math.abs(from[field.key] - to[field.key]) > 1e-8).map(field => ({ key: field.key, label: field.label, from: from[field.key], to: to[field.key], unit: field.unit }));
const resultMetrics = result => ({ ...result.report.metrics, operatingProfit: result.report.income.operatingProfit,
  operatingWorkingCapital: workingCapital(result.report.balanceSheet), inventoryValue: result.report.balanceSheet.inventory });

function assessPlans(opening, plan) {
  const checked = validatePlan(plan, opening);
  if (!checked.valid) throw new Error(checked.errors.join(' '));
  const candidates = candidatePlans(opening, checked.plan).map(candidate => {
    const result = forecast(opening, candidate.plan);
    return { ...candidate, result, assessment: rawAssessment(opening, result) };
  });
  const benchmarks = Object.fromEntries(DEFINITIONS.map(definition => [definition.id, Math.max(...candidates.map(candidate => candidate.assessment.values[definition.id]))]));
  const alternatives = candidates.map(candidate => ({
    id: candidate.id, name: candidate.name, rationale: candidate.rationale, plan: clone(candidate.plan),
    ...gradeAssessment(candidate.assessment, benchmarks), forecast: resultMetrics(candidate.result),
    planChanges: planChanges(plan, candidate.plan),
  }));
  // Stable tie-breaking prefers the committed plan: do not claim an alternative
  // was superior when its visible score and economics were equivalent.
  const best = alternatives.reduce((winner, option) => option.score > winner.score ? option : winner);
  return { candidates, benchmarks, alternatives, forecastBest: best };
}

/** Useful for a planning preview; contains no realized shocks or hindsight. */
export function getPlanCoaching(state, plan) {
  const checked = validateState(state);
  if (!checked.valid) return unavailable(state?.month + 1, 'This campaign cannot be evaluated because its state is invalid.');
  try {
    const assessment = assessPlans(state, plan);
    const chosen = assessment.alternatives[0];
    return { available: true, month: state.month + 1, score: chosen.score, grade: chosen.grade,
      components: chosen.components, alternatives: assessment.alternatives, forecastBest: assessment.forecastBest };
  } catch (error) { return unavailable(state.month + 1, error.message); }
}

// Ignore explanatory wording and extra UI metadata; verify every generated
// numerical/physical field, plan, identifier, model version and status.
const narrativeKeys = new Set(['title', 'detail', 'explanation', 'summary', 'name', 'segment', 'label', 'cycleSummary', 'regimeLabel']);
function matchesGenerated(saved, generated, key = '') {
  if (narrativeKeys.has(key)) return true;
  if (typeof generated === 'number') return typeof saved === 'number' && Number.isFinite(saved) && Math.abs(saved - generated) < 1e-7;
  if (generated === null || typeof generated !== 'object') return saved === generated;
  if (Array.isArray(generated)) return Array.isArray(saved) && saved.length === generated.length && generated.every((item, index) => matchesGenerated(saved[index], item));
  return saved && typeof saved === 'object' && Object.keys(generated).every(child => matchesGenerated(saved[child], generated[child], child));
}

function replayOpening(state, month) {
  let replay = createReplayInitialState(state);
  let opening;
  let chosen;
  for (let index = 0; index < month; index += 1) {
    const saved = state.history[index];
    if (saved.isForecast || saved.forecast) throw new Error('This history contains a planning projection rather than a committed month.');
    opening = replay;
    chosen = advanceMonth(opening, saved.plan);
    if (!matchesGenerated(saved, chosen.report)) throw new Error(`Month ${index + 1} cannot be reproduced from its original opening position and recorded plan.`);
    replay = chosen.state;
  }
  if (month === state.month && !matchesGenerated(state, replay)) throw new Error('The current position differs from the recorded campaign replay.');
  return { opening, chosen };
}

function explainComponents(components, facts) {
  const details = {
    economics: `Expected operating profit is $${facts.operatingProfit.toFixed(1)}m. Borrowing does not increase earnings.`,
    workingCapital: `Expected inventory is $${facts.inventory.toFixed(1)}m; operating working capital ${facts.changeInWorkingCapital >= 0 ? 'increases' : 'decreases'} by $${Math.abs(facts.changeInWorkingCapital).toFixed(1)}m.`,
    service: `Expected customer and dealer fulfillment is ${facts.service.toFixed(0)}% on the combined service measure.`,
    capability: `Expected first-pass quality is ${(facts.quality * 100).toFixed(1)}%; maintenance, training, quality support and engineering also protect the next period.`,
    risk: `Expected cash is $${facts.cash.toFixed(1)}m, with $${facts.resources.toFixed(1)}m of cash plus undrawn corporate credit.`,
  };
  return components.map(component => ({ ...component, detail: details[component.id] }));
}

function teaching(chosen, best, facts) {
  const ordered = [...chosen.components].sort((a, b) => b.score / b.maximum - a.score / a.maximum);
  const strengths = ordered.filter(component => component.score / component.maximum >= 0.75).slice(0, 2).map(component => ({ title: component.label, detail: component.detail }));
  if (!strengths.length) strengths.push({ title: 'A useful diagnostic month', detail: 'The forecast exposed several operating tradeoffs. Start with liquidity and profitable demand before expanding output.' });
  const recommendations = {
    economics: 'Compare manufacturer revenue after the dealer discount with unit cost and warranty provision. Then check whether contribution covers shared overhead.',
    workingCapital: 'Use existing finished stock before scheduling assembly. Test a lower component buffer against the forecast delivery risk.',
    service: 'Check each product’s dealer orders, finished stock and controller supply before increasing marketing or accepting lost sales.',
    capability: 'Compare maintenance, training and quality support with the rate of deterioration; preserve engineering for future products.',
    risk: 'Review the cash projection before committing. Reduce avoidable purchases and investments, then use available borrowing if liquidity still falls below zero.',
  };
  const improvements = [...ordered].reverse().filter(component => component.score / component.maximum < 0.92).slice(0, 2).map(component => ({ title: component.label, detail: component.detail, action: recommendations[component.id] }));
  if (!improvements.length) improvements.push({ title: 'Stress-test the strong plan', detail: 'This plan performs well under the expected case.', action: 'Keep a buffer for demand or supply surprises; an excellent forecast is still not a promise.' });
  if (best.id !== 'committed' && best.score > chosen.score) improvements.unshift({ title: `Compare “${best.name}”`, detail: `It scores ${best.score}/100 versus ${chosen.score}/100 using the same public forecast.`, action: best.rationale });
  const lesson = facts.changeInWorkingCapital > 5 ? 'Profit and cash are different: unsold equipment, unpaid dealer invoices and component purchases can absorb cash even when each sale has a positive margin.'
    : facts.operatingProfit < 0 ? 'A positive unit margin is only the first hurdle. The total contribution from dealer shipments must also cover factory overhead, corporate costs and ongoing business investment.'
      : 'A good decision balances earnings, cash, customer service and future capability. Judge the plan using what was knowable, then learn separately from the surprises.';
  return { strengths, improvements: improvements.slice(0, 3), lesson };
}

export function getMonthlyCoaching(state, month = state?.month) {
  if (!Number.isInteger(month) || month < 1 || month > state?.month) return unavailable(month, 'Choose a completed month to review.');
  const checked = validateState(state);
  if (!checked.valid) return unavailable(month, 'This saved campaign has invalid or unsupported data; a reliable replay is unavailable.');
  try {
    const { opening, chosen: realized } = replayOpening(state, month);
    const assessed = assessPlans(opening, realized.report.plan);
    // Forecast rankings are already fixed. Only now reveal the actual results.
    const alternatives = assessed.alternatives.map(candidate => {
      const result = candidate.id === 'committed' ? realized : advanceMonth(opening, candidate.plan);
      const outcome = gradeAssessment(rawAssessment(opening, result), assessed.benchmarks);
      return { ...candidate, actual: resultMetrics(result), actualScore: outcome.score, actualGrade: outcome.grade };
    });
    const selected = alternatives[0];
    const forecastBest = alternatives.find(candidate => candidate.id === assessed.forecastBest.id);
    const hindsightBest = alternatives.reduce((winner, option) => option.actualScore > winner.actualScore ? option : winner);
    const expectedFacts = assessed.candidates[0].assessment.facts;
    const components = explainComponents(selected.components, expectedFacts);
    const explained = { ...selected, components };
    const actual = selected.actual;
    const expected = selected.forecast;
    const variance = Object.fromEntries(Object.keys(expected).map(key => [key, actual[key] - expected[key]]));
    const publicOutlook = getMarketOutlook(opening);
    const marketEvents = realized.report.marketContext?.events ?? [];
    const demandActual = sum(realized.report.products.map(product => product.demand));
    const demandExpected = sum(assessed.candidates[0].result.report.products.map(product => product.demand));
    const demandChange = demandExpected ? (demandActual - demandExpected) / demandExpected : null;
    return {
      available: true, month, score: selected.score, grade: selected.grade, components,
      ...teaching(explained, forecastBest, expectedFacts), alternatives, forecastBest, hindsightBest,
      planChanges: hindsightBest.planChanges,
      actualVsForecast: { forecast: expected, actual, variance, outcomeScore: selected.actualScore, outcomeGrade: selected.actualGrade },
      shockContext: { publicOutlook, events: clone(marketEvents), demandChange,
        summary: demandChange === null ? 'There was no expected demand to compare.' : `Customer demand was ${Math.abs(demandChange * 100).toFixed(1)}% ${demandChange >= 0 ? 'above' : 'below'} the public forecast. The decision grade was fixed before these outcomes were known.` },
      methodology: 'Decision grade uses the public expected outcome, with five weighted dimensions. Each blends 35% absolute operating standards and 65% comparison with the strongest value of that dimension among nine feasible test policies. A ≥90; B ≥80; C ≥70; D ≥60; F <60. Actual outcomes are scored separately using the same benchmarks. Hindsight compares only these tested plans from the identical opening position and realized shocks; it is not a global optimum or a promise about later months.',
    };
  } catch (error) {
    return unavailable(month, `A trustworthy historical comparison is unavailable. ${error.message}`);
  }
}
