/**
 * Fictional rivals for the educational campaign. No engine imports: the engine
 * uses the same observable benchmark pressure shown in the competitive briefing.
 * These are synthetic competitors, not CNH or other manufacturers' disclosures.
 */
const PRODUCT_REFERENCE = Object.freeze([
  { id: 'tractor', basePrice: 145, capacity: 260, baseDemand: 158, share: 0.20, category: 'agriculture' },
  { id: 'harvester', basePrice: 360, capacity: 95, baseDemand: 57, share: 0.18, category: 'agriculture' },
  { id: 'loader', basePrice: 195, capacity: 180, baseDemand: 149, share: 0.16, category: 'construction' },
]);
const RIVALS = Object.freeze([
  { id: 'northstar', name: 'Northstar Equipment', strategy: 'Premium technology and dealer service', technology: 1.10, quality: 0.979, priceIndex: 1.06, dealerReach: 1.08, capacity: 690, weight: 0.41, technologyProgress: 0.0032, capacityProgress: 0.004 },
  { id: 'prairie', name: 'Prairie Works', strategy: 'Broad range and dependable availability', technology: 1.01, quality: 0.960, priceIndex: 0.98, dealerReach: 0.95, capacity: 530, weight: 0.34, technologyProgress: 0.0025, capacityProgress: 0.003 },
  { id: 'ironvale', name: 'Ironvale Machinery', strategy: 'Value pricing and expanding distribution', technology: 0.96, quality: 0.947, priceIndex: 0.92, dealerReach: 0.88, capacity: 430, weight: 0.25, technologyProgress: 0.002, capacityProgress: 0.005 },
].map(Object.freeze));
const sum = values => values.reduce((total, value) => total + value, 0);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const validMonth = state => Math.max(0, Number.isInteger(state?.month) ? state.month : 0);
const weighted = (rows, key) => sum(rows.map(row => row[key] * row.weight));

function rivalBenchmarks(state) {
  const month = validMonth(state);
  return RIVALS.map(rival => ({
    ...rival,
    technology: Math.min(1.30, rival.technology + month * rival.technologyProgress),
    quality: Math.min(0.991, rival.quality + month * 0.00016),
    dealerReach: Math.min(1.15, rival.dealerReach + month * 0.0015),
    capacity: Math.round(rival.capacity * (1 + month * rival.capacityProgress)),
    basis: 'Fictional public benchmark',
  }));
}

/** Rival progress affects demand in new campaigns; older mechanics stay exact. */
export function getCompetitivePressure(state) {
  if (state?.version !== '1.3.0') return 1;
  const rivals = rivalBenchmarks(state);
  const strength = sum(rivals.map(rival => rival.weight * rival.technology
    * Math.sqrt(rival.quality / 0.96) * Math.pow(rival.priceIndex, -0.7)
    * Math.pow(rival.dealerReach, 0.2)));
  return clamp(1 / strength, 0.82, 1.04);
}

function marketUnits(report) {
  const factors = report?.marketContext?.realized ?? report?.outlook;
  if (!factors || !Number.isFinite(factors.agriculture) || !Number.isFinite(factors.construction)) return null;
  return sum(PRODUCT_REFERENCE.map(product => Math.round(product.baseDemand / product.share * factors[product.category])));
}

function allocation(rivals, playerUnits, totalUnits, month, kind) {
  if (!(totalUnits > 0) || !Number.isFinite(playerUnits)) return null;
  const playerShare = clamp(playerUnits / totalUnits, 0, 1);
  const remaining = Math.max(0, totalUnits - playerUnits);
  const weights = rivals.map(rival => rival.weight * rival.technology * rival.dealerReach / rival.priceIndex);
  const totalWeight = sum(weights);
  // The final row receives the remainder, avoiding rounding-created share.
  let assignedUnits = 0;
  const rows = rivals.map((rival, index) => {
    const units = index === rivals.length - 1 ? remaining - assignedUnits : Math.floor(remaining * weights[index] / totalWeight);
    assignedUnits += units;
    return { id: rival.id, name: rival.name, units, unitShare: units / totalUnits, kind: 'estimated-rival-allocation' };
  });
  return {
    month, kind, marketUnits: totalUnits, playerUnits, playerShare,
    rivals: rows, totalShare: playerShare + sum(rows.map(row => row.unitShare)),
    explanation: 'Your retail units are measured from the game report. Rival units are an estimated allocation of the remaining modeled market using public benchmark weights; the model does not simulate each rival’s accounts or individual sales transactions.',
  };
}

/**
 * Rich benchmark comparison. Optional planning context is supplied by callers
 * already using the public forecast; this module never draws future outcomes.
 */
export function getCompetitiveIntelligence(state, { market = null, projectedReport = null } = {}) {
  const rivals = rivalBenchmarks(state);
  const definitions = PRODUCT_REFERENCE.filter(product => state?.products?.[product.id]);
  const totalCapacity = sum(definitions.map(product => product.capacity));
  const average = key => totalCapacity > 0 ? sum(definitions.map(product => state.products[product.id][key] * product.capacity)) / totalCapacity : null;
  const last = state?.history?.filter(report => !report.isForecast && !report.forecast).at(-1) ?? null;
  const latestCapacity = last ? sum(last.products.map(product => product.capacity)) : null;
  const currentCapacity = sum(definitions.map(product => Math.floor(product.capacity * state.products[product.id].condition
    * (0.9 + state.products[product.id].skill * 0.1) * (1 + (state.capacityBonus ?? 0)))));
  const player = {
    id: 'player', name: 'Your company', technology: average('technology'), quality: average('quality'),
    priceIndex: totalCapacity > 0 ? sum(definitions.map(product => state.products[product.id].lastPrice / product.basePrice * product.capacity)) / totalCapacity : null,
    dealerReach: null, reputation: average('reputation'), capacity: latestCapacity ?? currentCapacity,
    capacityBasis: last ? 'Latest actual monthly slots, including chosen overtime' : 'Opening monthly slots before overtime',
    basis: 'Observed game state',
  };
  const benchmark = {
    technology: weighted(rivals, 'technology'), quality: weighted(rivals, 'quality'),
    priceIndex: weighted(rivals, 'priceIndex'), dealerReach: weighted(rivals, 'dealerReach'),
    capacity: weighted(rivals, 'capacity'),
  };
  const observed = last ? allocation(rivals, last.metrics.retailSales, market?.current?.marketUnits ?? marketUnits(last), last.month, 'actual-player-estimated-rivals') : null;
  const projection = projectedReport && (projectedReport.isForecast || projectedReport.forecast)
    ? allocation(rivals, projectedReport.metrics.retailSales, market?.next?.marketUnits ?? marketUnits(projectedReport), projectedReport.month, 'forecast-player-estimated-rivals') : null;
  return {
    month: validMonth(state), kind: 'synthetic-benchmark', player, rivals, benchmark, observed, projection,
    pressure: getCompetitivePressure(state), mechanicsActive: state?.version === '1.3.0',
    gaps: {
      technology: player.technology === null ? null : player.technology - benchmark.technology,
      quality: player.quality === null ? null : player.quality - benchmark.quality,
      priceIndex: player.priceIndex === null ? null : player.priceIndex - benchmark.priceIndex,
      capacity: player.capacity - benchmark.capacity,
    },
    interpretation: [
      'Technology, quality, prices, dealer reach and capacity are fictional public benchmarks. A technology or price index of 1.00 is the campaign reference, not an industry survey.',
      'Capacity is monthly assembly slots, not demand, utilization, or market share. Rivals have different operating scale; matching their capacity is not automatically a good investment.',
      'Rival dealer reach is a benchmark input. Your reputation index measures a different concept, so no equivalent dealer-reach rating is invented for your company.',
      'Rival shares allocate the residual market; only your completed retail sales are an actual game result. Forecast shares remain separate from completed results.',
      state?.version === '1.3.0' ? 'Advancing rival technology, quality and reach strengthen competitive pressure in new campaigns. Your engineering, pricing, marketing and reliability compete with that pressure through the demand model.' : 'This comparison is a teaching benchmark. Older campaigns retain their original competitive-pressure mechanics.',
    ],
  };
}
