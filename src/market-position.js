import { campaignLength } from './campaign-calendar.js';
/**
 * Read-only market position and customer-perception diagnostics.
 * USD millions except list/reference prices ($000). Shares, rates, growth, and
 * changePP are fractions: changePP=0.01 means a one-percentage-point movement.
 * All indices and industry market sizes are synthetic model assumptions.
 */
import { PRODUCTS, forecast, getMarketOutlook, validatePlan } from './simulation.js';
import { getMarketIntelligence } from './business-intelligence.js';
import { getCompetitivePressure } from './competitive-intelligence.js';
import { getDifficulty } from './executive-rules.js';

const sum = values => values.reduce((total, value) => total + value, 0);
const ratio = (numerator, denominator) => denominator > 0 ? numerator / denominator : null;
const growth = (current, previous) => previous > 0 ? current / previous - 1 : null;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function actualRow(report, market, productId) {
  const flows = productId ? report.products.filter(product => product.id === productId) : report.products;
  const retailSales = sum(flows.map(product => product.retailSales));
  const demand = sum(flows.map(product => product.demand));
  const deliveries = sum(flows.map(product => product.deliveries));
  const dealerOrders = sum(flows.map(product => product.dealerOrders));
  return {
    month: report.month, kind: 'actual', marketUnits: market.units, marketValue: market.value,
    retailSales, unitShare: ratio(retailSales, market.units), demand,
    unmetRequests: sum(flows.map(product => product.lostSales)),
    dealerOrders, deliveries, dealerFulfillment: ratio(deliveries, dealerOrders),
    retailAvailability: ratio(retailSales, demand),
  };
}

function addChanges(row, previous) {
  const marketGrowth = previous ? growth(row.marketUnits, previous.marketUnits) : null;
  const retailGrowth = previous ? growth(row.retailSales, previous.retailSales) : null;
  return {
    ...row, changePP: previous ? row.unitShare - previous.unitShare : null,
    marketGrowth, retailGrowth,
    growthGap: marketGrowth !== null && retailGrowth !== null ? retailGrowth - marketGrowth : null,
  };
}

function projectedRow(report, market, previous, productId) {
  if (!report) return null;
  const values = addChanges(actualRow(report, market, productId), previous);
  const flows = productId ? report.products.filter(product => product.id === productId) : report.products;
  return {
    month: values.month, kind: 'projection', marketUnits: values.marketUnits, marketValue: values.marketValue,
    expectedUnitShare: values.unitShare, expectedRetailSales: values.retailSales,
    expectedDemand: sum(flows.map(product => product.expectedDemand)),
    expectedUnmetRequests: values.unmetRequests, expectedDealerOrders: values.dealerOrders,
    expectedDeliveries: values.deliveries, expectedDealerFulfillment: values.dealerFulfillment,
    expectedRetailAvailability: values.retailAvailability,
    changePP: values.changePP, marketGrowth: values.marketGrowth, retailGrowth: values.retailGrowth,
    growthGap: values.growthGap,
  };
}

function shareSeries(reports, timeline, nextReport, productId) {
  const marketFor = month => {
    const market = timeline[month - 1];
    return productId ? market.products.find(product => product.id === productId) : market;
  };
  const history = [];
  for (const report of reports) {
    history.push(addChanges(actualRow(report, marketFor(report.month), productId), history.at(-1) ?? null));
  }
  const current = history.at(-1) ?? null;
  const previous = history.at(-2) ?? null;
  return {
    current, previous, changePP: current?.changePP ?? null,
    marketGrowth: current?.marketGrowth ?? null, retailGrowth: current?.retailGrowth ?? null,
    growthGap: current?.growthGap ?? null, history,
    next: nextReport ? projectedRow(nextReport, marketFor(nextReport.month), current, productId) : null,
  };
}

function productPerception(product, state, actual, predicted, plan, publicOutlook) {
  const opening = state.products[product.id];
  const latestFlow = actual?.products.find(item => item.id === product.id) ?? null;
  const expectedFlow = predicted?.report.products.find(item => item.id === product.id) ?? null;
  const closing = predicted?.state.products[product.id] ?? null;
  let next = null;
  if (expectedFlow) {
    // These are the exact demand-model inputs for the selected planning month.
    // The engine updates technology before demand, then reputation after sales.
    const demandFactors = {
      baseDemand: product.baseDemand,
      categoryMarket: product.segment === 'Agriculture' ? publicOutlook.agriculture : publicOutlook.construction,
      price: Math.pow(product.basePrice / plan[`${product.id}Price`], 1.65),
      marketing: 0.88 + 0.15 * Math.log1p(plan.marketing),
      financing: clamp(1 + (7.25 - plan.financingApr) * 0.012, 0.9, 1.08),
      reputation: opening.reputation, technology: closing.technology,
      competition: publicOutlook.competitorPressure,
      ...(state.version === '1.3.0' ? {
        dealerService: 1 + Math.log1p(plan.dealerSupport) * 0.045,
        difficulty: getDifficulty(state).demandFactor,
        rivals: getCompetitivePressure(state),
      } : {}),
    };
    demandFactors.unroundedDemand = Object.values(demandFactors).reduce((value, factor) => value * factor, 1);
    demandFactors.expectedDemand = expectedFlow.expectedDemand;
    next = {
      month: predicted.report.month, price: expectedFlow.price,
      priceVsReference: expectedFlow.price / product.basePrice,
      pricePremium: expectedFlow.price / product.basePrice - 1,
      openingReputationIndex: opening.reputation,
      technologyIndex: closing.technology, closingReputationIndex: closing.reputation,
      fleetReliabilityIndex: closing.warrantyQuality,
      firstPassQuality: expectedFlow.assembled > 0 ? expectedFlow.qualityRate : null,
      retailAvailability: ratio(expectedFlow.retailSales, expectedFlow.demand),
      dealerFulfillment: ratio(expectedFlow.deliveries, expectedFlow.dealerOrders),
      demandFactors,
    };
  }
  return {
    basis: 'Model indices and operating results, not customer surveys or measured competitor ratings. A reputation or technology index of 1.00 is the model reference.',
    current: {
      month: state.month, price: opening.lastPrice,
      priceVsReference: opening.lastPrice / product.basePrice,
      pricePremium: opening.lastPrice / product.basePrice - 1,
      reputationIndex: opening.reputation, technologyIndex: opening.technology,
      fleetReliabilityIndex: opening.warrantyQuality, processQualityIndex: opening.quality,
      firstPassQuality: latestFlow?.assembled > 0 ? latestFlow.qualityRate : null,
      retailAvailability: latestFlow ? ratio(latestFlow.retailSales, latestFlow.demand) : null,
      dealerFulfillment: latestFlow ? ratio(latestFlow.deliveries, latestFlow.dealerOrders) : null,
    },
    next,
    explanation: [
      'Reputation is the current closing model index. Quality, dealer fulfillment, and unserved retail requests gradually change it after each month; the opening index affects that month’s customer demand.',
      'Technology is a product capability index, with 1.00 as the reference. Engineering improves it after the development delay; it also erodes slightly each month. The next-month demand model uses the technology available after completed engineering arrives.',
      'Fleet reliability is the model’s smoothed installed-fleet quality index used in warranty claims. It is distinct from the observed first-pass quality of machines assembled this month. No assembly means no measured first-pass rate.',
      'Retail availability is customer requests filled from dealer stock divided by customer requests. Dealer fulfillment is factory deliveries divided by dealer replenishment orders; these are different stages of the sale.',
      'Price, marketing, financing, reputation, technology, public category conditions, and competitive pressure multiply to form expected customer requests. Actual market share also depends on available dealer stock and realized market conditions.',
      ...(state.version === '1.3.0' ? ['Executive campaigns also multiply dealer service support, the selected difficulty demand factor, and fictional rival benchmark pressure. Rival pressure depends on public rival progression; your technology is counted once in the technology factor. Dealer support changes reputation after this month’s sales, so that reputation benefit first affects later rounds.'] : []),
    ],
  };
}

/**
 * Actual share history, selected-plan projections, and transparent perception
 * inputs. Invalid plans retain all observed/public data and return forecastError.
 * No forecasts are attempted after a campaign ends. State and plans are not edited.
 */
export function getMarketPosition(state, plan) {
  // This validates state and supplies the same industry denominators as Markets.
  // Omit the plan so invalid decisions never suppress already observed data.
  const market = getMarketIntelligence(state);
  const reports = state.history.filter(report => !report.isForecast && !report.forecast);
  const active = state.status === 'active' && state.month < campaignLength(state);
  const publicOutlook = active ? getMarketOutlook(state) : null;
  let predicted = null;
  let forecastError = null;
  if (active && plan != null) {
    const checked = validatePlan(plan, state);
    if (checked.valid) predicted = forecast(state, checked.plan);
    else forecastError = checked.errors.join(' ');
  }
  const aggregate = shareSeries(reports, market.timeline, predicted?.report ?? null);
  return {
    scope: market.scope,
    methodology: 'Share is customer retail units divided by the same month’s modeled industry units. Changes are actual-to-actual percentage-point movements; next-month share is a separate selected-plan projection. Annual TAM is valued at fixed reference retail prices, not company revenue.',
    annual: { ...market.annual }, aggregate, publicOutlook, forecastError,
    products: PRODUCTS.map(product => {
      const marketProduct = market.products.find(item => item.id === product.id);
      return {
        id: product.id, name: product.name, segment: product.segment, referencePrice: product.basePrice,
        annual: { units: marketProduct.annualUnits, value: marketProduct.annualValue },
        ...shareSeries(reports, market.timeline, predicted?.report ?? null, product.id),
        perception: productPerception(product, state, reports.at(-1), predicted, plan, publicOutlook),
      };
    }),
    levers: [
      { id: 'quality', label: 'Quality and reliable delivery', detail: 'Improve first-pass quality and dealer fulfillment, and reduce missed retail requests. Reputation responds gradually; reliability improvements also take time to work through the installed fleet.' },
      { id: 'engineering', label: 'Product engineering', detail: 'Build product capability after the three-month development delay. Compare the future demand benefit with the cash and current expense required now.' },
      { id: 'commercial', label: 'Price, marketing, and financing', detail: 'Change expected customer requests immediately. Compare contribution and financing income with demand; higher unit share alone does not guarantee profit.' },
      { id: 'capacity', label: 'Capacity and availability', detail: 'Resolve the actual constraint on saleable machines and dealer availability. Extra plant capacity cannot by itself create customer demand or market share.' },
    ],
    caveats: [
      ...market.assumptions,
      'Actual share needs one completed month; actual change needs two. Future outlook revisions do not rewrite completed months’ industry denominators.',
      'Market growth and company retail growth are separate comparisons. Their difference helps distinguish a changing market from changing relative performance; it does not prove a cause.',
      'Percentage-point share change is different from percentage growth in sales. A share change of 0.01 means +1.0 percentage point.',
      state.version === '1.3.0'
        ? 'The separate competitor comparison uses explicitly fictional benchmarks and estimates rival shares by allocating the remaining modeled market. Those are not observed rival sales, CNH disclosures or customer survey results. This view explains the demand model, not a competitor rating.'
        : 'No competitor-specific share, customer satisfaction score, or survey result is invented in this view. The competitive-pressure multiplier is the public model input, not a competitor rating. The separate fictional benchmark comparison does not change legacy campaign mechanics.',
      'Each demand factor explains the selected forecast’s model mechanics. A single observed share movement cannot establish which decision caused the change.',
    ],
  };
}
