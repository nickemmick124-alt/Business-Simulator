/**
 * Original educational business simulation. All operational parameters are
 * synthetic; none represents an actual CNH factory, forecast or financial result.
 * Money is in USD millions, except price controls (USD thousands). No IO.
 */
export const MODEL_VERSION = '1.0.0';
export const CYCLICAL_MODEL_VERSION = '1.1.0';
const MARKET_REGIMES = ['soft', 'flat', 'upswing'];
const REGIME_LABELS = { soft: 'Soft market', flat: 'Flat market', upswing: 'Upswing market' };
export const PRODUCTS = Object.freeze([
  { id: 'tractor', name: 'Row-crop tractor', segment: 'Agriculture', basePrice: 145, capacity: 260, color: '#d74436', materialCost: 0.075, conversionCost: 0.013, baseDemand: 158 },
  { id: 'harvester', name: 'Combine harvester', segment: 'Agriculture', basePrice: 360, capacity: 95, color: '#e9bb49', materialCost: 0.192, conversionCost: 0.029, baseDemand: 57 },
  { id: 'loader', name: 'Wheel loader', segment: 'Construction', basePrice: 195, capacity: 180, color: '#cfaa63', materialCost: 0.101, conversionCost: 0.018, baseDemand: 149 },
].map(Object.freeze));

export const PLAN_FIELDS = Object.freeze([
  ...PRODUCTS.flatMap(p => [
    { key: `${p.id}Price`, label: `${p.name} price`, group: 'Commercial', min: Math.round(p.basePrice * 0.72), max: Math.round(p.basePrice * 1.32), step: 1, unit: '$000', help: 'Customer list price. Dealers buy at 86% of this price; higher prices reduce demand.' },
    { key: `${p.id}Production`, label: `${p.name} production`, group: 'Production', min: 0, max: Math.ceil(p.capacity * 1.4), step: 1, unit: 'units', help: 'Requested assembly output this month. Components, capacity and quality can constrain good units.' },
  ]),
  { key: 'marketing', label: 'Marketing & dealer support', group: 'Commercial', min: 0, max: 8, step: 0.1, unit: '$m', help: 'Supports retail demand with diminishing returns; cannot make dealers accept unlimited inventory.' },
  { key: 'financingApr', label: 'Customer financing APR', group: 'Commercial', min: 2, max: 14, step: 0.25, unit: '%', help: 'Rate on new 24-month customer loans. Lower rates support demand but reduce future interest income.' },
  { key: 'quality', label: 'Quality & supplier development', group: 'Operations', min: 0, max: 5, step: 0.1, unit: '$m', help: 'Improves first-pass quality and rework recovery; reliability affects future warranty and demand.' },
  { key: 'maintenance', label: 'Preventive maintenance', group: 'Operations', min: 0, max: 4, step: 0.1, unit: '$m', help: 'Maintains plant condition. Neglect and sustained overtime reduce future capacity.' },
  { key: 'training', label: 'Workforce training', group: 'Operations', min: 0, max: 3, step: 0.1, unit: '$m', help: 'Builds workforce capability over time and improves first-pass quality.' },
  { key: 'overtime', label: 'Overtime', group: 'Operations', min: 0, max: 40, step: 5, unit: '%', help: 'Adds capacity at a cash premium and increases fatigue and defect risk.' },
  { key: 'partsBuffer', label: 'Component stock buffer', group: 'Operations', min: 0, max: 60, step: 5, unit: '%', help: 'Orders extra kits and controllers against the production target. Purchases consume working capital.' },
  { key: 'rd', label: 'Product engineering', group: 'Investment', min: 0, max: 7, step: 0.1, unit: '$m', help: 'Expense now; product capability improves after a three-month development delay.' },
  { key: 'capex', label: 'Factory investment', group: 'Investment', min: 0, max: 20, step: 0.5, unit: '$m', help: 'Cash investment in fixed assets. Additional operating capacity arrives after three months.' },
  { key: 'debtChange', label: 'Corporate borrowing / repayment', group: 'Finance', min: -40, max: 40, step: 1, unit: '$m', help: 'Positive draws, negative repays corporate debt, within a $160m facility. Financing loans have separate matched funding.' },
].map(Object.freeze));

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const sum = values => values.reduce((a, b) => a + b, 0);
const copy = value => JSON.parse(JSON.stringify(value));
const money = n => Math.round((n + Number.EPSILON) * 1e9) / 1e9;
const totalCost = p => p.materialCost + p.conversionCost;
const kitCost = p => p.materialCost * 0.78;
const controllerCost = p => p.materialCost * 0.22;
const wipCost = p => kitCost(p) + p.conversionCost * 0.6;
const finite = n => typeof n === 'number' && Number.isFinite(n);

function random(seed, month, channel) {
  let x = (seed ^ Math.imul(month + 19, 0x45d9f3b) ^ Math.imul(channel + 31, 0x27d4eb2d)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function inventoryValue(products) {
  return money(sum(PRODUCTS.map(p => {
    const s = products[p.id];
    return s.parts * kitCost(p) + s.controllers * controllerCost(p)
      + s.incomplete * wipCost(p) + (s.finishedGoods + s.rework) * totalCost(p);
  })));
}

export function balanceSheet(state) {
  const assets = money(state.cash + state.receivables + state.inventoryValue + state.fixedAssets + state.loanBook);
  const liabilities = money(state.debt + state.payables + state.warrantyReserve);
  return {
    cash: state.cash, receivables: state.receivables, inventory: state.inventoryValue,
    fixedAssets: state.fixedAssets, loanBook: state.loanBook, assets,
    debt: state.debt, corporateDebt: state.corporateDebt, financeDebt: state.financeDebt,
    payables: state.payables, warrantyReserve: state.warrantyReserve,
    liabilities, equity: state.equity, liabilitiesAndEquity: money(liabilities + state.equity),
    reconciliation: money(assets - liabilities - state.equity),
  };
}

export function createInitialState(seed = 4821, options = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('Seed must be an unsigned 32-bit integer.');
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Campaign options must be an object.');
  if (options.marketRegime !== undefined && ![...MARKET_REGIMES, 'random'].includes(options.marketRegime)) throw new Error('Market regime must be soft, flat, upswing, or random.');
  const opening = {
    tractor: { finishedGoods: 62, dealerStock: 310, incomplete: 26, parts: 45, controllers: 9, rework: 7, installedBase: 4600 },
    harvester: { finishedGoods: 19, dealerStock: 112, incomplete: 11, parts: 16, controllers: 3, rework: 3, installedBase: 1750 },
    loader: { finishedGoods: 38, dealerStock: 157, incomplete: 15, parts: 30, controllers: 6, rework: 5, installedBase: 3400 },
  };
  const state = {
    version: MODEL_VERSION, seed, month: 0, cash: 125, corporateDebt: 80, financeDebt: 96, debt: 176,
    receivables: 38, payables: 45, fixedAssets: 210, loanBook: 120, warrantyReserve: 4.8,
    equity: 0, inventoryValue: 0, capacityBonus: 0, rdPipeline: [], capexPipeline: [],
    loanCohorts: [4, 8, 12, 16, 20, 24].map(monthsRemaining => ({ balance: 20, monthsRemaining, apr: 7.25 })),
    products: Object.fromEntries(PRODUCTS.map(p => [p.id, {
      ...opening[p.id], quality: 0.956, reputation: 0.94, technology: 1,
      condition: 0.93, skill: 0.92, warrantyQuality: 0.952, lastPrice: p.basePrice,
    }])),
    history: [], status: 'active',
  };
  state.inventoryValue = inventoryValue(state.products);
  state.equity = money(state.cash + state.receivables + state.fixedAssets + state.loanBook + state.inventoryValue - state.debt - state.payables - state.warrantyReserve);
  state.initialEquity = state.equity;
  state.initialAdjustedEquity = adjustedEquity(state);
  // Older saves and the one-argument API retain their original exact mechanics.
  // Resolve the initial public scenario once, rather than on every preview.
  if (options.marketRegime !== undefined) {
    const initialRegime = options.marketRegime === 'random' ? MARKET_REGIMES[Math.floor(random(seed, 0, 200) * MARKET_REGIMES.length)] : options.marketRegime;
    state.version = CYCLICAL_MODEL_VERSION;
    state.marketCycle = { initialRegime, observedMonth: 0, agricultureIndex: 1, constructionIndex: 1, supplyIndex: 1 };
  }
  return state;
}

/** Reconstruct the exact starting rules and public scenario of a saved campaign. */
export function createReplayInitialState(state) {
  const checked = validateState(state);
  if (!checked.valid) throw new Error(`Invalid simulation state: ${checked.errors.join(' ')}`);
  return createInitialState(state.seed, state.version === CYCLICAL_MODEL_VERSION ? { marketRegime: state.marketCycle.initialRegime } : {});
}

export function defaultPlan(state = createInitialState()) {
  return {
    tractorPrice: 145, tractorProduction: 205,
    harvesterPrice: 360, harvesterProduction: 72,
    loaderPrice: 195, loaderProduction: 156,
    marketing: 1.8, quality: 1.1, rd: 1.5, maintenance: 0.9, training: 0.5,
    financingApr: 7.25, overtime: 0, partsBuffer: 15,
    ...(state.history?.length ? state.history[state.history.length - 1].plan : {}),
    // Borrowing and capital spending are one-time commitments, not subscriptions.
    debtChange: 0, capex: 0,
  };
}

export function validatePlan(plan, state) {
  const errors = [];
  const normalized = {};
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return { valid: false, errors: ['A numeric operating plan is required.'], plan: normalized };
  for (const field of PLAN_FIELDS) {
    const value = plan[field.key];
    if (!finite(value)) errors.push(`${field.label} must be a finite number.`);
    else if (value < field.min || value > field.max) errors.push(`${field.label} must be between ${field.min} and ${field.max} ${field.unit}.`);
    else if (field.key.endsWith('Production') && !Number.isInteger(value)) errors.push(`${field.label} must be a whole number of units.`);
    normalized[field.key] = value;
  }
  if (state && finite(plan.debtChange)) {
    if (state.corporateDebt + plan.debtChange < -1e-8) errors.push('Repayment cannot exceed outstanding corporate debt.');
    if (state.corporateDebt + plan.debtChange > 160 + 1e-8) errors.push('The corporate credit facility is limited to $160m.');
    if (state.month >= 12 || state.status !== 'active') errors.push('This campaign is complete. Start a new campaign to make decisions.');
  }
  return { valid: errors.length === 0, errors, plan: normalized };
}

function legacyMarketOutlook(state) {
  const month = Math.min(12, state.month + 1);
  const agriculturalSeason = [0.94, 0.98, 1.06, 1.12, 1.14, 1.04, 0.94, 1.03, 1.15, 1.1, 0.91, 0.85][month - 1];
  const constructionSeason = [0.92, 0.96, 1.05, 1.1, 1.12, 1.1, 1.06, 1.05, 1.02, 0.98, 0.92, 0.88][month - 1];
  return {
    month,
    agriculture: agriculturalSeason * (0.91 + month * 0.006),
    construction: constructionSeason * (1 + month * 0.006),
    controllerSupply: month <= 2 ? 0.79 : month === 3 ? 0.88 : 0.98,
    competitorPressure: month >= 7 ? 0.96 : 1,
    summary: month <= 2 ? 'Soft agricultural demand and a constrained controller supplier; construction remains resilient.'
      : month <= 6 ? 'Controller supply is recovering. Spring demand rewards a reliable dealer network.'
        : 'Competition is intensifying. Balance inventory and customer uptime as seasonal demand changes.',
  };
}

// Factors are relative to the original public category seasonality. They are
// synthetic scenarios, not estimates of historical industry growth.
function scenarioIndex(regime, month) {
  const agricultureIndex = regime === 'soft' ? 0.93 - Math.min(month, 6) * 0.015 + Math.max(0, month - 6) * 0.008
    : regime === 'upswing' ? 1.04 + Math.min(month, 8) * 0.014 - Math.max(0, month - 8) * 0.003 : 1;
  return { agricultureIndex, constructionIndex: 1 + (agricultureIndex - 1) * 0.65, supplyIndex: 1 };
}

function publicCycleIndex(state, month) {
  const cycle = state.marketCycle;
  const baseline = scenarioIndex(cycle.initialRegime, month);
  if (!cycle.observedMonth) return baseline;
  const distance = Math.max(0, month - cycle.observedMonth);
  const previousBaseline = scenarioIndex(cycle.initialRegime, cycle.observedMonth);
  return {
    agricultureIndex: baseline.agricultureIndex * Math.pow(cycle.agricultureIndex / previousBaseline.agricultureIndex, Math.pow(0.82, distance)),
    constructionIndex: baseline.constructionIndex * Math.pow(cycle.constructionIndex / previousBaseline.constructionIndex, Math.pow(0.82, distance)),
    supplyIndex: 1 + (cycle.supplyIndex - 1) * Math.pow(0.45, distance),
  };
}

function categoryFactors(month, indices) {
  const base = legacyMarketOutlook({ month: month - 1 });
  return {
    agriculture: base.agriculture * indices.agricultureIndex,
    construction: base.construction * indices.constructionIndex,
    controllerSupply: base.controllerSupply * indices.supplyIndex,
  };
}

function expectedCategoryFactors(state, month) {
  // Completed months are observed. Future months use only the latest public
  // observation and the declared scenario, never the campaign's hidden seed.
  const observed = state.history?.[month - 1]?.marketContext?.realized;
  return observed ? { ...observed } : categoryFactors(month, publicCycleIndex(state, month));
}

function industryUnits(factors) {
  return Math.round(158 / 0.20 * factors.agriculture) + Math.round(57 / 0.18 * factors.agriculture) + Math.round(149 / 0.16 * factors.construction);
}

/** Public monthly outlook, also used by the planning forecast. No future random draw. */
export function getMarketOutlook(state) {
  const base = legacyMarketOutlook(state);
  if (state.version !== CYCLICAL_MODEL_VERSION) return base;
  const factors = expectedCategoryFactors(state, base.month);
  const annual = sum(Array.from({ length: 12 }, (_, index) => industryUnits(expectedCategoryFactors(state, index + 1))));
  const flatAnnual = sum(Array.from({ length: 12 }, (_, index) => industryUnits(categoryFactors(index + 1, scenarioIndex('flat', index + 1)))));
  const expectedAnnualChange = annual / flatAnnual - 1;
  const regime = expectedAnnualChange < -0.04 ? 'soft' : expectedAnnualChange > 0.04 ? 'upswing' : 'flat';
  const prior = base.month > 1 ? expectedCategoryFactors(state, base.month - 1) : null;
  const expectedMonthChange = prior ? industryUnits(factors) / industryUnits(prior) - 1 : null;
  const cycleSummary = `${REGIME_LABELS[regime]}: full-year industry units are projected ${Math.abs(expectedAnnualChange * 100).toFixed(1)}% ${expectedAnnualChange < 0 ? 'below' : 'above'} the flat-scenario reference. The outlook updates with observed conditions; recoveries and downturns can persist for several months.`;
  return {
    ...base, ...factors, regime, regimeLabel: REGIME_LABELS[regime], initialRegime: state.marketCycle.initialRegime,
    cycleSummary, expectedAnnualChange, expectedMonthChange,
    summary: `${cycleSummary} ${base.summary}`,
  };
}

function realizedCycleIndex(state, month) {
  // Rebuild the exogenous path independently of operating decisions. Comparing
  // alternate plans therefore exposes them to exactly the same month's shocks.
  let momentum = 0, supplyDeviation = 0, indices, demandPulse = 0, supplierShock = false;
  for (let current = 1; current <= month; current += 1) {
    const turn = random(state.seed, current, 102);
    demandPulse = turn < 0.075 ? -0.15 - random(state.seed, current, 103) * 0.08
      : turn > 0.925 ? 0.12 + random(state.seed, current, 103) * 0.07 : 0;
    momentum = clamp(momentum * 0.82 + (random(state.seed, current, 101) - 0.5) * 0.07 + demandPulse, -0.35, 0.35);
    supplierShock = random(state.seed, current, 105) < 0.12;
    supplyDeviation = clamp(supplyDeviation * 0.45 - (supplierShock ? 0.18 + random(state.seed, current, 106) * 0.08 : 0), -0.45, 0);
    const baseline = scenarioIndex(state.marketCycle.initialRegime, current);
    indices = {
      agricultureIndex: baseline.agricultureIndex * (1 + momentum),
      constructionIndex: baseline.constructionIndex * (1 + momentum * 0.75 + (random(state.seed, current, 104) - 0.5) * 0.025),
      supplyIndex: 1 + supplyDeviation,
    };
  }
  return { indices, demandPulse, supplierShock };
}

function resolveMarket(state, outlook, isForecast) {
  if (state.version !== CYCLICAL_MODEL_VERSION) return null;
  const expected = { agriculture: outlook.agriculture, construction: outlook.construction, controllerSupply: outlook.controllerSupply };
  const draw = isForecast ? { indices: publicCycleIndex(state, outlook.month), demandPulse: 0, supplierShock: false } : realizedCycleIndex(state, outlook.month);
  const realized = isForecast ? { ...expected } : categoryFactors(outlook.month, draw.indices);
  const demandSurprise = industryUnits(realized) / industryUnits(expected) - 1;
  const supplySurprise = realized.controllerSupply / expected.controllerSupply - 1;
  const events = [];
  if (draw.demandPulse) events.push({
    id: `cycle-demand-${outlook.month}`, title: draw.demandPulse < 0 ? 'Equipment buyers defer replacement' : 'Replacement demand accelerates',
    detail: `A broad change in customer confidence moved industry demand ${Math.abs(demandSurprise * 100).toFixed(1)}% ${demandSurprise < 0 ? 'below' : 'above'} the opening forecast. Dealers adjust replenishment; the change can carry into later months.`,
    type: draw.demandPulse < 0 ? 'warning' : 'positive', location: 'headquarters',
  });
  if (draw.supplierShock) events.push({
    id: `cycle-supply-${outlook.month}`, title: 'Controller supplier disruption',
    detail: `An unexpected upstream disruption left industry controller availability ${Math.abs(supplySurprise * 100).toFixed(1)}% below the opening outlook. Existing component stock and supplier development help protect production; recovery takes time.`,
    type: 'warning', location: 'factory',
  });
  return {
    indices: draw.indices,
    context: { isForecast, regime: outlook.regime, regimeLabel: outlook.regimeLabel, initialRegime: state.marketCycle.initialRegime, expected, realized, demandSurprise, supplySurprise, events },
  };
}

export function forecast(state, plan) { return resolve(state, plan, true); }
export function advanceMonth(state, plan) { return resolve(state, plan, false); }

function resolve(inputState, inputPlan, isForecast) {
  const stateCheck = validateState(inputState);
  if (!stateCheck.valid) throw new Error(`Invalid simulation state: ${stateCheck.errors.join(' ')}`);
  const checked = validatePlan(inputPlan, inputState);
  if (!checked.valid) throw new Error(checked.errors.join(' '));
  const state = copy(inputState);
  const plan = checked.plan;
  const month = state.month + 1;
  const opening = balanceSheet(state);
  const outlook = getMarketOutlook(state);
  const resolvedMarket = resolveMarket(state, outlook, isForecast);
  const productReports = [];
  const events = resolvedMarket ? copy(resolvedMarket.context.events) : [];
  const actualVariation = channel => isForecast ? 0.5 : random(state.seed, month, channel);
  let procurement = 0, conversion = 0, wholesaleRevenue = 0, cogs = 0, newLending = 0;
  let overtimeExpense = 0, reworkExpense = 0, warrantyAccrual = 0, warrantyClaims = 0;
  let completedInvestment = 0, completedEngineering = 0;

  state.capexPipeline = state.capexPipeline.filter(project => {
    project.remaining -= 1;
    if (project.remaining <= 0) { completedInvestment += project.amount; return false; }
    return true;
  });
  state.rdPipeline = state.rdPipeline.filter(project => {
    project.remaining -= 1;
    if (project.remaining <= 0) { completedEngineering += project.amount; return false; }
    return true;
  });
  state.capacityBonus = clamp(state.capacityBonus + completedInvestment * 0.004, 0, 0.4);
  if (plan.capex) state.capexPipeline.push({ amount: plan.capex, remaining: 3 });
  if (plan.rd) state.rdPipeline.push({ amount: plan.rd, remaining: 3 });
  if (completedInvestment || completedEngineering) events.push({ id: `investment-${month}`, title: 'Investments reach the business', detail: `$${completedInvestment.toFixed(1)}m of factory projects and $${completedEngineering.toFixed(1)}m of engineering completed their three-month lead time.`, type: 'positive', location: 'headquarters' });

  for (let index = 0; index < PRODUCTS.length; index += 1) {
    const p = PRODUCTS[index];
    const s = state.products[p.id];
    const before = copy(s);
    const target = plan[`${p.id}Production`];
    const price = plan[`${p.id}Price`];
    s.condition = clamp(s.condition + plan.maintenance * 0.018 - 0.017 - plan.overtime * 0.00035, 0.58, 1);
    s.skill = clamp(s.skill + plan.training * 0.018 - 0.007, 0.7, 1.08);
    s.technology = clamp(s.technology + completedEngineering * 0.007 - 0.0025, 0.82, 1.25);
    s.quality = clamp(s.quality + plan.quality * 0.0025 + plan.training * 0.0015 - 0.0032 - plan.overtime * 0.00018, 0.84, 0.992);
    const capacity = Math.floor(p.capacity * s.condition * (0.9 + s.skill * 0.1) * (1 + state.capacityBonus) * (1 + plan.overtime * 0.0065));
    const marketSupply = resolvedMarket ? resolvedMarket.context.realized.controllerSupply : outlook.controllerSupply;
    const supplyRate = clamp(marketSupply * (0.88 + actualVariation(20 + index) * 0.24) + plan.quality * 0.004, 0.45, 1);
    const kitOrder = Math.max(0, Math.ceil(target * (1 + plan.partsBuffer / 100)) - s.parts - s.incomplete);
    const controllerOrder = Math.max(0, Math.ceil(target * (1 + plan.partsBuffer / 100)) - s.controllers);
    const kitReceipts = Math.min(kitOrder, Math.floor(p.capacity * 1.25));
    const controllerReceipts = Math.min(Math.floor(controllerOrder * supplyRate), Math.floor(p.capacity * 1.2));
    s.parts += kitReceipts;
    s.controllers += controllerReceipts;
    const productProcurement = kitReceipts * kitCost(p) + controllerReceipts * controllerCost(p);
    procurement += productProcurement;
    const reworkResolved = Math.min(s.rework, Math.floor(p.capacity * 0.035 + plan.quality * 4 + plan.training * 2));
    const assemblyCapacity = Math.max(0, capacity - Math.ceil(reworkResolved * 0.35));
    const oldCompleted = Math.min(s.incomplete, s.controllers, target, assemblyCapacity);
    s.incomplete -= oldCompleted;
    s.controllers -= oldCompleted;
    const starts = Math.min(Math.max(0, target - oldCompleted), Math.max(0, assemblyCapacity - oldCompleted), s.parts);
    s.parts -= starts;
    const newCompleted = Math.min(starts, s.controllers);
    s.controllers -= newCompleted;
    s.incomplete += starts - newCompleted;
    const assembled = oldCompleted + newCompleted;
    const defectRate = clamp(1 - s.quality + (actualVariation(30 + index) - 0.5) * 0.018, 0.004, 0.2);
    const defects = Math.min(assembled, Math.round(assembled * defectRate));
    const production = assembled - defects + reworkResolved;
    s.rework += defects - reworkResolved;
    s.finishedGoods += production;
    const productConversion = (starts * 0.6 + assembled * 0.4) * p.conversionCost;
    conversion += productConversion;
    overtimeExpense += productConversion * plan.overtime / 100 * 1.35;
    reworkExpense += reworkResolved * p.conversionCost * 0.22;

    const market = p.segment === 'Agriculture' ? outlook.agriculture : outlook.construction;
    const priceResponse = Math.pow(p.basePrice / price, 1.65);
    const marketingResponse = 0.88 + 0.15 * Math.log1p(plan.marketing);
    const financingResponse = clamp(1 + (7.25 - plan.financingApr) * 0.012, 0.9, 1.08);
    const expectedDemand = Math.max(0, Math.round(p.baseDemand * market * priceResponse * marketingResponse * financingResponse * s.reputation * s.technology * outlook.competitorPressure));
    const actualMarket = resolvedMarket ? (p.segment === 'Agriculture' ? resolvedMarket.context.realized.agriculture : resolvedMarket.context.realized.construction) : market;
    const orderDemand = resolvedMarket ? Math.max(0, Math.round(expectedDemand * actualMarket / market)) : expectedDemand;
    const demand = Math.max(0, Math.round(orderDemand * (0.91 + actualVariation(10 + index) * 0.18)));
    const dealerOrders = Math.max(0, Math.round(orderDemand * 2.45) - s.dealerStock);
    const deliveries = Math.min(s.finishedGoods, dealerOrders);
    s.finishedGoods -= deliveries;
    s.dealerStock += deliveries;
    const retailSales = Math.min(s.dealerStock, demand);
    s.dealerStock -= retailSales;
    const lostSales = demand - retailSales;
    const revenue = deliveries * price / 1000 * 0.86;
    const productCogs = deliveries * totalCost(p);
    wholesaleRevenue += revenue;
    cogs += productCogs;
    const financingShare = clamp(0.32 + (7.25 - plan.financingApr) * 0.014, 0.2, 0.4);
    const productLending = retailSales * price / 1000 * financingShare * 0.8;
    newLending += productLending;
    const productWarrantyAccrual = revenue * (0.009 + (1 - s.quality) * 0.3);
    const productWarrantyClaims = s.installedBase * (0.00065 + (1 - s.warrantyQuality) * 0.018) * totalCost(p) * 0.10;
    warrantyAccrual += productWarrantyAccrual;
    warrantyClaims += productWarrantyClaims;
    s.warrantyQuality = s.warrantyQuality * 0.93 + s.quality * 0.07;
    s.installedBase = Math.round(s.installedBase * 0.992) + retailSales;
    const deliveredService = dealerOrders ? deliveries / dealerOrders : 1;
    s.reputation = clamp(s.reputation + (s.quality - 0.958) * 0.1 + (deliveredService - 0.94) * 0.018 - lostSales / Math.max(1, demand) * 0.025, 0.68, 1.08);
    s.lastPrice = price;
    const shortage = Math.max(0, Math.min(target, assemblyCapacity) - assembled);
    const missedOrders = dealerOrders - deliveries;
    productReports.push({
      id: p.id, name: p.name, segment: p.segment, price, target, capacity, assemblyCapacity,
      opening: { parts: before.parts, controllers: before.controllers, incomplete: before.incomplete, rework: before.rework, finishedGoods: before.finishedGoods, dealerStock: before.dealerStock },
      closing: { parts: s.parts, controllers: s.controllers, incomplete: s.incomplete, rework: s.rework, finishedGoods: s.finishedGoods, dealerStock: s.dealerStock },
      kitOrder, controllerOrder, kitReceipts, controllerReceipts, starts, assembled, defects, reworkResolved,
      production, deliveries, dealerOrders, retailSales, demand, expectedDemand, lostSales, shortage, missedOrders,
      supplyRate, qualityRate: assembled ? (assembled - defects) / assembled : s.quality,
      serviceLevel: dealerOrders ? deliveries / dealerOrders : 1,
      revenue: money(revenue), cogs: money(productCogs), procurement: money(productProcurement), conversion: money(productConversion),
      newLending: money(productLending), warrantyAccrual: money(productWarrantyAccrual), warrantyClaims: money(productWarrantyClaims),
      explanation: shortage > 0 ? `${shortage} requested units could not finish assembly. Controller availability is ${Math.round(supplyRate * 100)}%; ${s.incomplete} machines are waiting in the incomplete yard.`
        : missedOrders > 0 ? `${missedOrders} dealer orders could not ship. Review the production target, available capacity and rework queue.`
          : `${deliveries} machines shipped to dealers; ${retailSales} reached customers. Dealers finish with ${s.dealerStock} units.`,
    });
    if (shortage > 0) events.push({ id: `supply-${p.id}-${month}`, title: `${p.name}: ${shortage} units constrained`, detail: `${controllerReceipts} controllers arrived against ${controllerOrder} ordered. ${s.incomplete} machines await completion; ${s.rework} await quality release.`, type: 'warning', location: 'factory', productId: p.id });
    if (s.finishedGoods > p.capacity * 0.8) events.push({ id: `inventory-${p.id}-${month}`, title: `${p.name} inventory is building`, detail: `${s.finishedGoods} finished machines remain at the factory. Dealers order against expected retail demand, so extra production does not guarantee revenue.`, type: 'warning', location: 'yard', productId: p.id });
  }

  // Existing retail loan cohorts amortize. Principal is an asset collection, never revenue.
  let loanPrincipalCollections = 0, loanInterestIncome = 0, creditLosses = 0;
  const loanOpening = state.loanBook;
  state.loanCohorts = state.loanCohorts.filter(cohort => {
    loanInterestIncome += cohort.balance * cohort.apr / 1200;
    const lossRate = 0.0014 + Math.max(0, cohort.apr - 7.25) * 0.00012 + (actualVariation(40) - 0.5) * 0.0008;
    const loss = cohort.balance * lossRate;
    creditLosses += loss;
    const principal = (cohort.balance - loss) / cohort.monthsRemaining;
    loanPrincipalCollections += principal;
    cohort.balance -= loss + principal;
    cohort.monthsRemaining -= 1;
    return cohort.monthsRemaining > 0 && cohort.balance > 1e-10;
  });
  if (newLending > 0) state.loanCohorts.push({ balance: newLending, monthsRemaining: 24, apr: plan.financingApr });
  state.loanBook = money(sum(state.loanCohorts.map(c => c.balance)));
  const financeFunding = money(state.loanBook * 0.8 - state.financeDebt);
  const newCorporateDebt = state.corporateDebt + plan.debtChange;
  const interestExpense = state.corporateDebt * 0.075 / 12 + state.financeDebt * 0.055 / 12;
  const customerCollections = inputState.receivables * 0.72 + wholesaleRevenue * 0.27;
  const supplierPayments = inputState.payables * 0.75 + procurement * 0.4;
  const depreciation = inputState.fixedAssets / 180;
  const fixedFactoryExpense = 4.1;
  const corporateExpense = 2.15;
  const inventoryCarryingExpense = inputState.inventoryValue * 0.004;
  const operatingExpense = fixedFactoryExpense + corporateExpense + plan.marketing + plan.quality + plan.maintenance + plan.training + plan.rd + overtimeExpense + reworkExpense + inventoryCarryingExpense;
  const warrantyShortfall = Math.max(0, warrantyClaims - inputState.warrantyReserve - warrantyAccrual);
  const totalRevenue = wholesaleRevenue + loanInterestIncome;
  const operatingProfit = totalRevenue - cogs - operatingExpense - depreciation - warrantyAccrual - warrantyShortfall - creditLosses;
  const pretaxProfit = operatingProfit - interestExpense;
  const tax = Math.max(0, pretaxProfit * 0.24);
  const profit = pretaxProfit - tax;
  const cashChange = customerCollections + loanInterestIncome + loanPrincipalCollections + plan.debtChange + financeFunding
    - supplierPayments - conversion - operatingExpense - warrantyClaims - interestExpense - tax - newLending - plan.capex;

  state.cash = money(inputState.cash + cashChange);
  state.receivables = money(inputState.receivables + wholesaleRevenue - customerCollections);
  state.payables = money(inputState.payables + procurement - supplierPayments);
  state.fixedAssets = money(inputState.fixedAssets + plan.capex - depreciation);
  state.warrantyReserve = money(Math.max(0, inputState.warrantyReserve + warrantyAccrual - warrantyClaims));
  state.corporateDebt = money(newCorporateDebt);
  state.financeDebt = money(state.loanBook * 0.8);
  state.debt = money(state.corporateDebt + state.financeDebt);
  state.inventoryValue = inventoryValue(state.products);
  state.equity = money(inputState.equity + profit);
  state.month = month;
  if (resolvedMarket) state.marketCycle = { initialRegime: state.marketCycle.initialRegime, observedMonth: month, ...resolvedMarket.indices };
  // Negative cash is a visible emergency overdraft, not silently forgiven debt.
  // It is kept in cash and included in all balances and ending scores.
  if (state.cash < 0) events.push({ id: `liquidity-${month}`, title: 'Liquidity emergency', detail: `Cash is $${state.cash.toFixed(1)}m. Restore liquidity through working capital, spending choices or available corporate borrowing. Two consecutive negative-cash months end the mandate.`, type: 'danger', location: 'headquarters' });
  const previousCash = inputState.history.length ? inputState.history[inputState.history.length - 1].balanceSheet.cash : inputState.cash;
  const insolvent = state.equity <= 0 || (state.cash < 0 && previousCash < 0);
  state.status = insolvent ? 'distressed' : month >= 12 ? 'completed' : 'active';
  if (month % 3 === 0) events.push({ id: `board-${month}`, title: `Quarter ${month / 3} board review`, detail: `The board reviews cash, delivery, reliability and long-term company value. Borrowing and moving stock into dealers do not create shareholder value.`, type: 'info', location: 'headquarters' });

  const dealerOrders = sum(productReports.map(p => p.dealerOrders));
  const assembled = sum(productReports.map(p => p.assembled));
  const deliveries = sum(productReports.map(p => p.deliveries));
  const bs = balanceSheet(state);
  const cashFlow = {
    opening: inputState.cash, closing: state.cash, cashChange: money(cashChange),
    customerCollections: money(customerCollections), loanInterestIncome: money(loanInterestIncome),
    loanPrincipalCollections: money(loanPrincipalCollections), newLending: money(newLending),
    supplierPayments: money(supplierPayments), conversion: money(conversion), operatingExpense: money(operatingExpense),
    warrantyClaims: money(warrantyClaims), interestExpense: money(interestExpense), tax: money(tax),
    capex: plan.capex, corporateBorrowing: plan.debtChange, financeFunding,
    operating: money(customerCollections + loanInterestIncome - supplierPayments - conversion - operatingExpense - warrantyClaims - interestExpense - tax),
    investing: money(loanPrincipalCollections - newLending - plan.capex),
    financing: money(plan.debtChange + financeFunding),
  };
  const report = {
    month, isForecast, forecast: isForecast, plan: copy(plan), outlook, events,
    metrics: {
      revenue: money(totalRevenue), profit: money(profit), cashChange: money(cashChange), cash: state.cash,
      deliveries, retailSales: sum(productReports.map(p => p.retailSales)),
      production: sum(productReports.map(p => p.production)),
      serviceLevel: dealerOrders ? deliveries / dealerOrders : 1,
      qualityRate: assembled ? (assembled - sum(productReports.map(p => p.defects))) / assembled : sum(PRODUCTS.map(p => state.products[p.id].quality)) / PRODUCTS.length,
      dealerInventory: sum(productReports.map(p => p.closing.dealerStock)),
      factoryInventory: sum(productReports.map(p => p.closing.finishedGoods)),
      incomplete: sum(productReports.map(p => p.closing.incomplete)),
      debt: state.debt, equity: state.equity,
    },
    products: productReports,
    income: {
      wholesaleRevenue: money(wholesaleRevenue), loanInterestIncome: money(loanInterestIncome), revenue: money(totalRevenue),
      cogs: money(cogs), grossProfit: money(totalRevenue - cogs), fixedFactoryExpense, corporateExpense,
      marketing: plan.marketing, quality: plan.quality, maintenance: plan.maintenance, training: plan.training, rd: plan.rd,
      overtimeExpense: money(overtimeExpense), reworkExpense: money(reworkExpense), inventoryCarryingExpense: money(inventoryCarryingExpense),
      operatingExpense: money(operatingExpense), depreciation: money(depreciation), warrantyAccrual: money(warrantyAccrual),
      warrantyShortfall: money(warrantyShortfall), creditLosses: money(creditLosses), operatingProfit: money(operatingProfit),
      interestExpense: money(interestExpense), pretaxProfit: money(pretaxProfit), tax: money(tax), profit: money(profit),
    },
    financing: { openingLoanBook: loanOpening, newLending: money(newLending), principalCollections: money(loanPrincipalCollections), creditLosses: money(creditLosses), interestIncome: money(loanInterestIncome), closingLoanBook: state.loanBook, fundingChange: financeFunding },
    cashFlow, balanceSheet: bs, openingBalanceSheet: opening,
    drivers: [
      { label: 'Dealer invoice collections', value: money(customerCollections), detail: '72% of opening receivables and 27% of current wholesale invoices turned into cash. Revenue and cash collection occur separately.' },
      { label: 'Suppliers & assembly', value: money(-supplierPayments - conversion), detail: `Paid $${supplierPayments.toFixed(1)}m to suppliers and capitalized $${conversion.toFixed(1)}m of assembly labor into equipment. Unsold units remain inventory.` },
      { label: 'Operations, warranty & tax', value: money(-operatingExpense - warrantyClaims - interestExpense - tax), detail: 'Operating budgets, warranty claims, interest and cash taxes reduce cash. Depreciation and warranty provisions are noncash expenses.' },
      { label: 'Customer financing, net', value: money(loanPrincipalCollections + loanInterestIncome - newLending + financeFunding), detail: 'New lending creates a loan asset. Principal collections reduce that asset; only interest is revenue. Matched borrowing funds 80% of the outstanding loan book.' },
      { label: 'Factory investment', value: -plan.capex, detail: 'Capital expenditure consumes cash immediately; capacity arrives after three months. Existing fixed assets depreciate over time.' },
      { label: 'Corporate borrowing', value: plan.debtChange, detail: 'Borrowing changes cash and debt equally. It does not create profit or improve ending net assets.' },
    ],
    reconciliation: { balanceSheet: bs.reconciliation, inventory: money(state.inventoryValue - inputState.inventoryValue - procurement - conversion + cogs), cash: money(state.cash - inputState.cash - cashChange), loanBook: money(state.loanBook - loanOpening - newLending + loanPrincipalCollections + creditLosses) },
  };
  if (resolvedMarket) report.marketContext = resolvedMarket.context;
  if (!events.length) events.push({ id: `steady-${month}`, title: 'Operations are on plan', detail: 'Review demand, cash conversion and inventory before increasing production.', type: 'info', location: 'headquarters' });
  state.history.push(copy(report));
  return { state, report };
}

function adjustedEquity(state) {
  // Future obligations remain liabilities. Discounts recognize realization risk
  // and prevent final-month warehouse loading or receivable growth earning points.
  const finished = sum(PRODUCTS.map(p => (state.products[p.id].finishedGoods + state.products[p.id].rework) * totalCost(p)));
  const wip = sum(PRODUCTS.map(p => state.products[p.id].incomplete * wipCost(p)));
  return money(state.equity - finished * 0.20 - wip * 0.35 - state.receivables * 0.035 - state.loanBook * 0.025);
}

export function getCampaignOutcome(state) {
  const history = state.history || [];
  const average = key => history.length ? sum(history.map(r => r.metrics[key])) / history.length : 0;
  const averageService = average('serviceLevel');
  const averageQuality = average('qualityRate');
  const value = adjustedEquity(state);
  const gain = value - state.initialAdjustedEquity;
  const capability = sum(PRODUCTS.map(p => (state.products[p.id].condition + state.products[p.id].reputation + state.products[p.id].technology) / 3)) / PRODUCTS.length;
  const financialScore = clamp(22 + gain * 0.7, 0, 45);
  const serviceScore = clamp((averageService - 0.6) / 0.4 * 25, 0, 25);
  const qualityScore = clamp((averageQuality - 0.85) / 0.14 * 15, 0, 15);
  const capabilityScore = clamp((capability - 0.7) / 0.35 * 15, 0, 15);
  const liquidityPenalty = state.cash < 0 ? Math.min(35, -state.cash) : 0;
  const score = Math.round(clamp(financialScore + serviceScore + qualityScore + capabilityScore - liquidityPenalty, 0, state.status === 'distressed' ? 39 : 100));
  const complete = state.status !== 'active' || state.month >= 12;
  const title = state.status === 'distressed' ? 'The board ends your mandate' : score >= 80 ? 'A stronger business' : score >= 60 ? 'A credible first year' : score >= 40 ? 'A turnaround still in progress' : 'A business under pressure';
  return {
    complete, status: state.status, month: state.month, score, title,
    summary: `Adjusted company value ${gain >= 0 ? 'grew' : 'fell'} by $${Math.abs(gain).toFixed(1)}m. Average dealer delivery was ${Math.round(averageService * 100)}%; first-pass quality was ${Math.round(averageQuality * 100)}%.`,
    adjustedEquity: value, valueCreated: money(gain), averageService, averageQuality,
    profit: money(sum(history.map(r => r.metrics.profit))), endingCash: state.cash, endingDebt: state.debt,
    components: [
      { label: 'Long-term company value', score: money(financialScore), maximum: 45 },
      { label: 'Dealer delivery', score: money(serviceScore), maximum: 25 },
      { label: 'Quality', score: money(qualityScore), maximum: 15 },
      { label: 'Future capability', score: money(capabilityScore), maximum: 15 },
    ],
    obligations: { debt: state.debt, payables: state.payables, warrantyReserve: state.warrantyReserve, loanBook: state.loanBook, incomplete: sum(PRODUCTS.map(p => state.products[p.id].incomplete)) },
    explanation: 'Score uses adjusted net assets after all recorded debt, payables and warranty reserves, with discounts on inventory, receivables and loans. Borrowed cash is offset by debt. Unsold machines and unfinished work carry realization discounts. Operating reliability and future capability also count.',
  };
}

// Saved reports are rendered directly by the review and statement screens. Check
// their known shape before accepting imported data; additional metadata is fine.
const METRIC_KEYS = ['revenue', 'profit', 'cashChange', 'cash', 'deliveries', 'retailSales', 'production', 'serviceLevel', 'qualityRate', 'dealerInventory', 'factoryInventory', 'incomplete', 'debt', 'equity'];
const BALANCE_KEYS = ['cash', 'receivables', 'inventory', 'fixedAssets', 'loanBook', 'assets', 'debt', 'corporateDebt', 'financeDebt', 'payables', 'warrantyReserve', 'liabilities', 'equity', 'liabilitiesAndEquity', 'reconciliation'];
const FLOW_STOCK_KEYS = ['parts', 'controllers', 'incomplete', 'rework', 'finishedGoods', 'dealerStock'];
const FLOW_NUMBER_KEYS = ['price', 'target', 'capacity', 'assemblyCapacity', 'kitOrder', 'controllerOrder', 'kitReceipts', 'controllerReceipts', 'starts', 'assembled', 'defects', 'reworkResolved', 'production', 'deliveries', 'dealerOrders', 'retailSales', 'demand', 'expectedDemand', 'lostSales', 'shortage', 'missedOrders', 'supplyRate', 'qualityRate', 'serviceLevel', 'revenue', 'cogs', 'procurement', 'conversion', 'newLending', 'warrantyAccrual', 'warrantyClaims'];
const INCOME_KEYS = ['wholesaleRevenue', 'loanInterestIncome', 'revenue', 'cogs', 'grossProfit', 'fixedFactoryExpense', 'corporateExpense', 'marketing', 'quality', 'maintenance', 'training', 'rd', 'overtimeExpense', 'reworkExpense', 'inventoryCarryingExpense', 'operatingExpense', 'depreciation', 'warrantyAccrual', 'warrantyShortfall', 'creditLosses', 'operatingProfit', 'interestExpense', 'pretaxProfit', 'tax', 'profit'];
const CASH_FLOW_KEYS = ['opening', 'closing', 'cashChange', 'customerCollections', 'loanInterestIncome', 'loanPrincipalCollections', 'newLending', 'supplierPayments', 'conversion', 'operatingExpense', 'warrantyClaims', 'interestExpense', 'tax', 'capex', 'corporateBorrowing', 'financeFunding', 'operating', 'investing', 'financing'];
const FINANCING_KEYS = ['openingLoanBook', 'newLending', 'principalCollections', 'creditLosses', 'interestIncome', 'closingLoanBook', 'fundingChange'];
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validText = value => typeof value === 'string' && value.length <= 8192;

function validateMarketContext(context, label, errors) {
  if (!isRecord(context)) { errors.push(`${label} market context is missing.`); return; }
  if (typeof context.isForecast !== 'boolean' || !MARKET_REGIMES.includes(context.regime) || !MARKET_REGIMES.includes(context.initialRegime) || !validText(context.regimeLabel)) errors.push(`${label} market scenario is invalid.`);
  for (const key of ['expected', 'realized']) {
    const factors = context[key];
    if (!isRecord(factors) || ['agriculture', 'construction', 'controllerSupply'].some(field => !finite(factors[field]) || factors[field] <= 0 || factors[field] > 3)) errors.push(`${label} ${key} market factors must be positive finite numbers.`);
  }
  for (const key of ['demandSurprise', 'supplySurprise']) if (!finite(context[key]) || context[key] < -1 || context[key] > 5) errors.push(`${label} ${key} must be a finite rate.`);
  if (!Array.isArray(context.events) || context.events.length > 8 || context.events.some(event => !isRecord(event) || ['id', 'title', 'detail', 'type', 'location'].some(key => !validText(event[key])))) errors.push(`${label} market events must contain the required text fields.`);
}

function validateReport(report, index, errors) {
  const label = `Report ${index + 1}`;
  if (!isRecord(report) || report.month !== index + 1) {
    errors.push(`${label} is missing or out of sequence.`);
    return;
  }
  const numericRecord = (value, keys, name) => {
    if (!isRecord(value) || keys.some(key => !finite(value[key]))) errors.push(`${label} ${name} must contain all required finite numbers.`);
  };
  numericRecord(report.metrics, METRIC_KEYS, 'metrics');
  numericRecord(report.income, INCOME_KEYS, 'income statement');
  numericRecord(report.cashFlow, CASH_FLOW_KEYS, 'cash flow');
  numericRecord(report.balanceSheet, BALANCE_KEYS, 'balance sheet');
  numericRecord(report.openingBalanceSheet, BALANCE_KEYS, 'opening balance sheet');
  numericRecord(report.financing, FINANCING_KEYS, 'financing');
  numericRecord(report.reconciliation, ['balanceSheet', 'inventory', 'cash', 'loanBook'], 'reconciliation');
  if (Object.hasOwn(report, 'planningForecast')) numericRecord(report.planningForecast, METRIC_KEYS, 'planning forecast');
  if (!validatePlan(report.plan).valid) errors.push(`${label} contains an invalid committed plan.`);

  if (!Array.isArray(report.products) || report.products.length !== PRODUCTS.length) errors.push(`${label} must contain one flow for each product.`);
  else {
    const ids = new Set();
    for (const product of report.products) {
      if (!isRecord(product) || !PRODUCTS.some(p => p.id === product.id) || ids.has(product.id)) {
        errors.push(`${label} contains an unknown, repeated or invalid product flow.`);
        continue;
      }
      ids.add(product.id);
      numericRecord(product, FLOW_NUMBER_KEYS, `${product.id} flow`);
      if (['name', 'segment', 'explanation'].some(key => !validText(product[key]))) errors.push(`${label} ${product.id} descriptions must be text.`);
      for (const position of ['opening', 'closing']) {
        const stock = product[position];
        if (!isRecord(stock) || FLOW_STOCK_KEYS.some(key => !Number.isSafeInteger(stock[key]) || stock[key] < 0)) errors.push(`${label} ${product.id} ${position} stocks must be nonnegative integers.`);
      }
    }
  }
  if (!Array.isArray(report.events) || report.events.length > 128) errors.push(`${label} events must be a bounded array.`);
  else if (report.events.some(event => !isRecord(event) || ['id', 'title', 'detail', 'type', 'location'].some(key => !validText(event[key])))) errors.push(`${label} events must contain the required text fields.`);
  if (!Array.isArray(report.drivers) || report.drivers.length > 64) errors.push(`${label} cash drivers must be a bounded array.`);
  else if (report.drivers.some(driver => !isRecord(driver) || !finite(driver.value) || !validText(driver.label) || !validText(driver.detail))) errors.push(`${label} cash drivers must contain a finite value and text descriptions.`);
  if (Object.hasOwn(report, 'marketContext')) validateMarketContext(report.marketContext, label, errors);
}

export function validateState(state) {
  const errors = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return { valid: false, errors: ['State must be an object.'] };
  if (![MODEL_VERSION, CYCLICAL_MODEL_VERSION].includes(state.version)) errors.push('Unsupported save version.');
  if (!Number.isInteger(state.seed) || state.seed < 0 || state.seed > 4294967295) errors.push('Invalid seed.');
  if (!Number.isInteger(state.month) || state.month < 0 || state.month > 12) errors.push('Month must be 0–12.');
  for (const key of ['cash', 'debt', 'corporateDebt', 'financeDebt', 'equity', 'receivables', 'payables', 'fixedAssets', 'loanBook', 'warrantyReserve', 'inventoryValue', 'initialEquity', 'initialAdjustedEquity', 'capacityBonus']) {
    if (!finite(state[key])) errors.push(`${key} must be finite.`);
    else if (!['cash', 'equity', 'initialEquity', 'initialAdjustedEquity'].includes(key) && state[key] < -1e-7) errors.push(`${key} cannot be negative.`);
  }
  if (!['active', 'completed', 'distressed'].includes(state.status)) errors.push('Invalid campaign status.');
  if (state.month === 12 && state.status === 'active') errors.push('A 12-month campaign must be complete.');
  if (state.status === 'completed' && state.month !== 12) errors.push('A completed campaign must contain twelve months.');
  for (const p of PRODUCTS) {
    const s = state.products?.[p.id];
    if (!s) { errors.push(`Missing ${p.id} state.`); continue; }
    for (const key of ['finishedGoods', 'dealerStock', 'incomplete', 'parts', 'controllers', 'rework', 'installedBase']) {
      if (!Number.isSafeInteger(s[key]) || s[key] < 0) errors.push(`${p.id}.${key} must be a nonnegative integer.`);
    }
    for (const key of ['quality', 'reputation', 'technology', 'condition', 'skill', 'warrantyQuality', 'lastPrice']) if (!finite(s[key]) || s[key] <= 0) errors.push(`${p.id}.${key} must be a positive finite number.`);
    if (s.quality > 1 || s.warrantyQuality > 1) errors.push(`${p.id} quality cannot exceed 100%.`);
  }
  if (!Array.isArray(state.history) || state.history.length !== state.month || state.history.length > 12) errors.push('History must contain one report per completed month, up to twelve.');
  else for (let i = 0; i < state.history.length; i += 1) validateReport(state.history[i], i, errors);
  if (state.version === CYCLICAL_MODEL_VERSION) {
    const cycle = state.marketCycle;
    if (!isRecord(cycle) || !MARKET_REGIMES.includes(cycle.initialRegime) || cycle.observedMonth !== state.month || ['agricultureIndex', 'constructionIndex', 'supplyIndex'].some(key => !finite(cycle[key]) || cycle[key] < 0.3 || cycle[key] > 2)) errors.push('Cyclical campaigns require a valid observed market state.');
    else if (Array.isArray(state.history)) {
      for (const [index, report] of state.history.entries()) if (!isRecord(report?.marketContext) || report.marketContext.initialRegime !== cycle.initialRegime) errors.push(`Report ${index + 1} is missing the campaign market context.`);
      const last = state.history.at(-1)?.marketContext?.realized;
      if (last) {
        const factors = categoryFactors(state.month, cycle);
        if (['agriculture', 'construction', 'controllerSupply'].some(key => !finite(last[key]) || Math.abs(factors[key] - last[key]) > 1e-9)) errors.push('Observed cycle does not reconcile to the latest market report.');
      } else if (state.month === 0 && ['agricultureIndex', 'constructionIndex', 'supplyIndex'].some(key => cycle[key] !== 1)) errors.push('A new market scenario cannot contain unobserved cycle results.');
    }
  }
  for (const key of ['rdPipeline', 'capexPipeline']) {
    if (!Array.isArray(state[key])) errors.push(`${key} must be an array.`);
    else for (const project of state[key]) if (!project || !finite(project.amount) || project.amount < 0 || !Number.isInteger(project.remaining) || project.remaining < 1 || project.remaining > 3) errors.push(`Invalid ${key} project.`);
  }
  if (!Array.isArray(state.loanCohorts)) errors.push('Loan cohorts are missing.');
  else {
    for (const cohort of state.loanCohorts) if (!cohort || !finite(cohort.balance) || cohort.balance < 0 || !Number.isInteger(cohort.monthsRemaining) || cohort.monthsRemaining < 1 || cohort.monthsRemaining > 24 || !finite(cohort.apr) || cohort.apr < 0 || cohort.apr > 20) errors.push('Invalid loan cohort.');
    if (state.loanCohorts.every(c => c && finite(c.balance)) && Math.abs(sum(state.loanCohorts.map(c => c.balance)) - state.loanBook) > 1e-7) errors.push('Loan book does not reconcile to its cohorts.');
  }
  if (errors.length === 0) {
    if (Math.abs(balanceSheet(state).reconciliation) > 1e-7) errors.push('Assets do not equal liabilities plus equity.');
    if (Math.abs(inventoryValue(state.products) - state.inventoryValue) > 1e-7) errors.push('Inventory value does not reconcile to physical units.');
    if (Math.abs(state.corporateDebt + state.financeDebt - state.debt) > 1e-7) errors.push('Debt does not reconcile.');
    if (state.corporateDebt > 160 + 1e-7) errors.push('Corporate credit limit exceeded.');
  }
  return { valid: errors.length === 0, errors };
}
