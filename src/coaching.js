/** Read-only business coaching. Decisions use public forecasts; replay uses the same shocks. */
import {
  PRODUCTS, getPlanFields, advanceMonth, createReplayInitialState, defaultPlan,
  forecast, getMarketOutlook, validatePlan, validateState,
} from './simulation.js';
import { campaignLength } from './campaign-calendar.js';

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const sum = values => values.reduce((a, b) => a + b, 0);
const clone = value => JSON.parse(JSON.stringify(value));
const round = n => Math.round(n * 100) / 100;
export const COACHING_METHODOLOGY_VERSION = '3.0';
export const LEGACY_COACHING_METHODOLOGY_VERSION = '2.0';
const executiveRubric = state => state?.version === '1.3.0';
const methodologyVersion = state => executiveRubric(state) ? COACHING_METHODOLOGY_VERSION : LEGACY_COACHING_METHODOLOGY_VERSION;
const DEFINITIONS = [
  { id: 'economics', label: 'Earnings discipline', maximum: 25 },
  { id: 'workingCapital', label: 'Cash & inventory discipline', maximum: 20 },
  { id: 'service', label: 'Serving customers', maximum: 20 },
  { id: 'capability', label: 'Quality & future capability', maximum: 20 },
  { id: 'risk', label: 'Liquidity resilience', maximum: 15 },
];
const EXECUTIVE_DEFINITIONS = DEFINITIONS.map(definition => ({ ...definition,
  maximum: definition.id === 'economics' ? 30 : definition.id === 'risk' ? 10 : definition.maximum,
}));
const definitionsFor = state => executiveRubric(state) ? EXECUTIVE_DEFINITIONS : DEFINITIONS;
const letter = score => score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
const unavailable = (month, reason) => ({ available: false, month, reason, score: null, grade: null, components: [], alternatives: [] });
const workingCapital = sheet => sheet.receivables + sheet.inventory - sheet.payables;

function feasible(opening, plan) {
  const result = {};
  for (const field of getPlanFields(opening)) {
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

// Published operating standards: meeting the standard earns 75%, while an A
// requires measurable progress toward the stretch level. These thresholds do
// not depend on the candidate set, difficulty, seed or the player's visit count.
function standard(value, floor, meets, stretch) {
  return clamp(value <= meets ? 75 * (value - floor) / (meets - floor)
    : 75 + 25 * (value - meets) / (stretch - meets), 0, 100);
}

function executiveAssessment(opening, result) {
  const { state: ending, report } = result;
  const revenueScale = Math.max(20, sum(PRODUCTS.map(product => product.baseDemand * product.basePrice * 0.86 / 1000)));
  const economics = clamp(40 + report.income.operatingProfit / revenueScale * 300, 0, 100);
  const inventoryCover = report.balanceSheet.inventory / Math.max(8, report.income.cogs);
  const changeInWorkingCapital = workingCapital(report.balanceSheet) - workingCapital(report.openingBalanceSheet);
  const inventoryDiscipline = standard(-inventoryCover, -3, -0.9, -0.3);
  const cashConversion = standard(-changeInWorkingCapital / revenueScale, -0.35, 0, 0.1);
  const orders = sum(report.products.map(product => product.dealerOrders));
  const demand = sum(report.products.map(product => product.demand));
  const service = orders || demand ? 100 * (0.7 * (orders ? report.metrics.deliveries / orders : 1)
    + 0.3 * (demand ? report.metrics.retailSales / demand : 1)) : 0;
  const serviceScore = standard(service / 100, 0.5, 0.95, 0.99);

  // Score the capability produced by investment, not dollars spent. Engineering
  // is credited only through technology already funded and due within three
  // months of the campaign; no unfunded future spending is assumed. Reproduce
  // the engine's completion-before-obsolescence order and technology ceiling.
  const horizon = Math.min(3, Math.max(0, campaignLength(ending) - ending.month));
  const capabilityFacts = PRODUCTS.map(product => {
    const current = ending.products[product.id];
    let fundedTechnology = current.technology;
    for (let offset = 1; offset <= horizon; offset += 1) {
      const completed = sum(ending.rdPipeline.filter(project => project.remaining === offset).map(project => project.amount));
      fundedTechnology = clamp(fundedTechnology + completed * 0.007 - 0.0025, 0.82, 1.25);
    }
    return { condition: current.condition, skill: current.skill, quality: current.quality, fundedTechnology };
  });
  const mean = key => sum(capabilityFacts.map(product => product[key])) / capabilityFacts.length;
  const processQuality = mean('quality');
  const achievedQuality = 0.7 * processQuality + 0.3 * report.metrics.qualityRate;
  const condition = mean('condition');
  const skill = mean('skill');
  const fundedTechnology = mean('fundedTechnology');
  const capability = 0.4 * standard(achievedQuality, 0.90, 0.975, 0.99)
    + 0.2 * standard(condition, 0.70, 0.95, 1)
    + 0.15 * standard(skill, 0.75, 1, 1.08)
    + 0.25 * standard(fundedTechnology, 0.85, 1.03, 1.15);

  const resources = ending.cash + Math.max(0, 160 - ending.corporateDebt);
  const monthlyCommitments = Math.max(6.25, report.income.operatingExpense + report.income.interestExpense);
  const liquidityMonths = resources / monthlyCommitments;
  let risk = standard(liquidityMonths, 0, 6, 12);
  if (ending.cash < 0) risk = Math.min(risk, clamp(40 + ending.cash * 2, 0, 40));
  if (ending.status === 'distressed') risk = 0;
  const guardrail = ending.status === 'distressed'
    ? { maximum: 39, reason: 'Projected financial distress limits the decision score to 39.' }
    : ending.cash < 0 ? { maximum: 59, reason: 'A projected cash deficit limits the decision score to 59.' } : null;
  return {
    definitions: EXECUTIVE_DEFINITIONS, guardrail,
    values: { economics, workingCapital: inventoryDiscipline * 0.65 + cashConversion * 0.35,
      service: serviceScore, capability, risk },
    facts: { executive: true, operatingProfit: report.income.operatingProfit, revenue: report.income.wholesaleRevenue,
      inventoryCover, changeInWorkingCapital, inventory: report.balanceSheet.inventory, service,
      quality: report.metrics.qualityRate, achievedQuality, processQuality, condition, skill, fundedTechnology,
      capabilityHorizon: horizon, revenueScale, cash: ending.cash, resources, liquidityMonths, monthlyCommitments,
      status: ending.status },
  };
}

function rawAssessment(opening, result) {
  if (executiveRubric(opening)) return executiveAssessment(opening, result);
  const { state: ending, report } = result;
  const plan = report.plan;
  const revenue = report.income.wholesaleRevenue;
  // Operating earnings exclude corporate funding and its interest. A $1m
  // improvement has the same effect for every plan facing this opening position.
  const revenueScale = Math.max(20, sum(PRODUCTS.map(product => product.baseDemand * product.basePrice * 0.86 / 1000)));
  // Break-even is the midpoint, not a passing earnings grade. Five points of
  // operating return on the fixed revenue scale earn 65; ten earn 80. A weak
  // opportunity set cannot turn a loss into excellent earnings discipline.
  const economics = clamp(50 + report.income.operatingProfit / revenueScale * 300, 0, 100);
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
      revenueScale, cash: ending.cash, resources, status: ending.status },
  };
}

function gradeAssessment(assessment, benchmarks) {
  const components = (assessment.definitions ?? DEFINITIONS).map(definition => {
    const absolute = assessment.values[definition.id];
    const regret = Math.max(0, benchmarks[definition.id] - absolute);
    // Keep an operating-standard anchor even when every tested policy is poor.
    // Comparison may reduce at most a quarter of the criterion score; being
    // the least bad policy never awards a free 100% comparative component.
    const comparisonAdjusted = clamp(absolute - 2 * regret, 0, 100);
    const percentage = 0.75 * absolute + 0.25 * comparisonAdjusted;
    return { ...definition, score: round(percentage / 100 * definition.maximum), absoluteScore: round(absolute),
      benchmarkScore: round(benchmarks[definition.id]), opportunityPenalty: round((absolute - percentage) / 100 * definition.maximum) };
  });
  const uncapped = sum(components.map(component => component.score));
  if (assessment.guardrail && uncapped > assessment.guardrail.maximum) {
    for (const component of components) {
      const adjusted = round(component.score * assessment.guardrail.maximum / uncapped);
      component.guardrailPenalty = round(component.score - adjusted);
      component.score = adjusted;
    }
  }
  const score = Math.round(clamp(sum(components.map(component => component.score)), 0, 100));
  return { score, grade: letter(score), components,
    ...(assessment.guardrail ? { guardrail: assessment.guardrail } : {}) };
}

const planChanges = (opening, from, to) => getPlanFields(opening).filter(field => Math.abs(from[field.key] - to[field.key]) > 1e-8).map(field => ({ key: field.key, label: field.label, from: from[field.key], to: to[field.key], unit: field.unit }));
const resultMetrics = result => ({ ...result.report.metrics, operatingProfit: result.report.income.operatingProfit,
  operatingWorkingCapital: workingCapital(result.report.balanceSheet), inventoryValue: result.report.balanceSheet.inventory });

function assessPlans(opening, plan) {
  const checked = validatePlan(plan, opening);
  if (!checked.valid) throw new Error(checked.errors.join(' '));
  const candidates = candidatePlans(opening, checked.plan).map(candidate => {
    const result = forecast(opening, candidate.plan);
    return { ...candidate, result, assessment: rawAssessment(opening, result) };
  });
  const benchmarks = Object.fromEntries(definitionsFor(opening).map(definition => [definition.id, Math.max(...candidates.map(candidate => candidate.assessment.values[definition.id]))]));
  const alternatives = candidates.map(candidate => ({
    id: candidate.id, name: candidate.name, rationale: candidate.rationale, plan: clone(candidate.plan),
    ...gradeAssessment(candidate.assessment, benchmarks), forecast: resultMetrics(candidate.result),
    planChanges: planChanges(opening, plan, candidate.plan),
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
    return { available: true, methodologyVersion: methodologyVersion(state), month: state.month + 1, score: chosen.score, grade: chosen.grade,
      components: chosen.components, alternatives: assessment.alternatives, forecastBest: assessment.forecastBest };
  } catch (error) { return unavailable(state.month + 1, error.message); }
}

// Ignore explanatory wording and extra UI metadata; verify every generated
// numerical/physical field, plan, identifier, model version and status.
const narrativeKeys = new Set(['title', 'detail', 'explanation', 'summary', 'name', 'segment', 'label', 'cycleSummary', 'regimeLabel']);
function matchesGenerated(saved, generated, key = '') {
  // Visits are persistent interface metadata, never financial inputs. The
  // simulator validates their structure; replay must not invent past visits.
  if (key === 'ceoJournal') return true;
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
  if (facts.executive) {
    const details = {
      economics: `Expected operating profit is $${facts.operatingProfit.toFixed(1)}m against a fixed $${facts.revenueScale.toFixed(1)}m reference revenue scale. Break-even earns 40% of earnings points; a 10% reference return earns 70%, and 20% earns 100%.`,
      workingCapital: `Expected inventory covers ${facts.inventoryCover.toFixed(2)} months of current shipment cost; 0.9 earns 75% of inventory points and 0.3 earns 100%. Operating working capital ${facts.changeInWorkingCapital >= 0 ? 'absorbs' : 'releases'} $${Math.abs(facts.changeInWorkingCapital).toFixed(1)}m. Inventory savings must be weighed against service risk.`,
      service: `Expected dealer and retail fulfillment is ${facts.service.toFixed(1)}% on the combined measure. 95% earns 75% of service points; 99% earns 100%. A 90% service rate still leaves one in ten orders or purchases unfilled.`,
      capability: `Expected process quality is ${(facts.processQuality * 100).toFixed(1)}%, plant condition ${(facts.condition * 100).toFixed(1)}%, workforce skill ${(facts.skill * 100).toFixed(1)}%, and technology after already-funded engineering within ${facts.capabilityHorizon} months is ${facts.fundedTechnology.toFixed(3)}. Meeting standards are 97.5% blended quality, 95% condition, 100% skill and 1.03 technology. Spending itself earns no points; unused capacity earns none either.`,
      risk: `Expected cash is $${facts.cash.toFixed(1)}m; cash plus undrawn credit is $${facts.resources.toFixed(1)}m, covering ${facts.liquidityMonths.toFixed(1)} months of current operating expense and interest. Six months earns 75% and twelve earns 100% of liquidity points. This is a spending buffer, not a cash-flow forecast or a promise of survival.`,
    };
    return components.map(component => ({ ...component, detail: details[component.id]
      + (component.guardrailPenalty ? ` The company-wide liquidity guardrail removes ${component.guardrailPenalty.toFixed(1)} additional points here.` : '') }));
  }
  const details = {
    economics: `Expected operating profit is $${facts.operatingProfit.toFixed(1)}m, ${(facts.operatingProfit / facts.revenueScale * 100).toFixed(1)}% of the fixed $${facts.revenueScale.toFixed(1)}m reference revenue scale. Break-even earns 50% of earnings points; a 10% return earns 80%. Borrowing does not increase earnings.`,
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
    capability: facts.executive ? 'Inspect the plant and workforce constraints. Fund improvements that address the actual weakness; check engineering completion dates and expected technology before paying for additional capacity.' : 'Compare maintenance, training and quality support with the rate of deterioration; preserve engineering for future products.',
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
      available: true, methodologyVersion: methodologyVersion(opening), month, score: selected.score, grade: selected.grade, components,
      ...teaching(explained, forecastBest, expectedFacts), alternatives, forecastBest, hindsightBest,
      planChanges: hindsightBest.planChanges,
      actualVsForecast: { forecast: expected, actual, variance, outcomeScore: selected.actualScore, outcomeGrade: selected.actualGrade },
      shockContext: { publicOutlook, events: clone(marketEvents), demandChange,
        summary: demandChange === null ? 'There was no expected demand to compare.' : `Customer demand was ${Math.abs(demandChange * 100).toFixed(1)}% ${demandChange >= 0 ? 'above' : 'below'} the public forecast. The decision grade was fixed before these outcomes were known.` },
      methodology: executiveRubric(opening)
        ? 'Decision-quality rubric 3.0 uses only the public forecast, with earnings (30 points), inventory and cash conversion (20), customer service (20), achieved and already-funded capability (20), and liquidity (10). Meeting an operating standard generally earns 75% of its points; stretch performance is needed for 100%. Break-even earns 40% of earnings points. Spending, new capacity, borrowed cash and advisor attendance earn no points by themselves. Already-funded engineering is evaluated within three remaining campaign months; unfunded future spending is not assumed. A cash deficit caps the total at 59; financial distress caps it at 39. Nine feasible test policies can only deduct points for avoidable gaps, by at most a quarter of each criterion score. A ≥90; B ≥80; C ≥70; D ≥60; F <60. Actual outcomes are scored separately using the same benchmarks; the board separately assesses realized performance and employment against its published goals. Older campaigns retain rubric 2.0. Hindsight compares these tested plans from the identical opening position and realized shocks; it is not a global optimum or a promise about later months. The separate strategy comparison evaluates longer-term value and forecasts.'
        : 'Decision-quality rubric 2.0 uses the public expected outcome, with five weighted operating standards. Each blends 75% of its criterion score with 25% of that same score reduced for avoidable shortfalls against nine feasible test policies. Comparison can only deduct points; equally weak alternatives do not create a high grade. Break-even earns half of earnings points. A ≥90; B ≥80; C ≥70; D ≥60; F <60. Actual outcomes are scored separately using the same benchmarks; the board separately assesses realized performance against its published goals. Historical decision grades are recalculated with this rubric without changing any saved result. Hindsight compares only these tested plans from the identical opening position and realized shocks; it is not a global optimum or a promise about later months.',
    };
  } catch (error) {
    return unavailable(month, `A trustworthy historical comparison is unavailable. ${error.message}`);
  }
}
