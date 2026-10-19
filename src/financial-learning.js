/** Read-only explanations backed by the same accounts and forecasts as the game. */
import { balanceSheet, validatePlan, validateState } from './simulation.js';
import { projectBusiness } from './business-intelligence.js';
import { campaignLength } from './campaign-calendar.js';

const sum = values => values.reduce((total, value) => total + value, 0);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const money = value => Math.round(value * 1e9) / 1e9;
const active = state => state.status === 'active' && state.month < campaignLength(state);
const rules = Object.freeze({ referenceApr: 7.25, corporateFundingApr: 7.5, customerFinanceFundingApr: 5.5, loanTermMonths: 24, financedPriceFraction: .8, matchedFundingFraction: .8 });

function projectionSummary(months) {
  const last = months.at(-1);
  if (!last) return null;
  const first = months[0].report;
  return {
    months: months.length, endMonth: last.month,
    next: {
      month: first.month, expectedDemand: sum(first.products.map(p => p.expectedDemand)), retailSales: first.metrics.retailSales,
      newLending: first.financing.newLending, financeFunding: first.financing.fundingChange,
      interestIncome: first.financing.interestIncome, cash: first.balanceSheet.cash, profit: first.income.profit,
      newLoanMatchedFunding: money(first.financing.newLending * .8), newLoanCompanyFunding: money(first.financing.newLending * .2),
    },
    totalInterestIncome: money(sum(months.map(m => m.report.income.loanInterestIncome))),
    totalNewLending: money(sum(months.map(m => m.report.financing.newLending))),
    totalCreditLosses: money(sum(months.map(m => m.report.income.creditLosses))),
    totalProfit: money(sum(months.map(m => m.report.income.profit))),
    endingCash: last.balanceSheet.cash, endingLoanBook: last.balanceSheet.loanBook,
    endingFinanceDebt: last.balanceSheet.financeDebt,
  };
}

export function getFinancingInsights(state, plan) {
  const checkedState = validateState(state);
  if (!checkedState.valid) return { status: 'invalid-state', errors: checkedState.errors, rules, current: null, options: [] };
  const current = {
    ...balanceSheet(state), loanCohorts: state.loanCohorts.length,
    weightedLoanApr: state.loanBook ? sum(state.loanCohorts.map(c => c.balance * c.apr)) / state.loanBook : null,
    nextInterestFromExistingLoans: money(sum(state.loanCohorts.map(c => c.balance * c.apr / 1200))),
    nextCorporateInterestExpense: money(state.corporateDebt * .075 / 12),
    nextFinanceInterestExpense: money(state.financeDebt * .055 / 12),
  };
  const result = { status: 'current-only', errors: [], rules, current, options: [], comparisonMonths: 0, comparisonEndMonth: null, selected: null };
  if (!active(state)) return result;
  const checked = validatePlan(plan, state);
  if (!checked.valid) return { ...result, status: 'invalid-plan', errors: checked.errors };
  const selected = {
    apr: checked.plan.financingApr,
    demandMultiplier: clamp(1 + (7.25 - checked.plan.financingApr) * .012, .9, 1.08),
    financedRetailShare: clamp(.32 + (7.25 - checked.plan.financingApr) * .014, .2, .4),
    firstInterestOn100k: 100000 * checked.plan.financingApr / 1200,
    scheduledPrincipalOn100k: 100000 / 24,
    firstNewLoanInterestMonth: state.month + 2,
  };
  const variants = [
    { id: 'baseline', label: 'Working plan', apr: selected.apr },
    { id: 'lower', label: 'Lower customer rate', apr: Math.max(2, selected.apr - 1) },
    { id: 'higher', label: 'Higher customer rate', apr: Math.min(14, selected.apr + 1) },
  ].filter((variant, index, all) => all.findIndex(other => other.apr === variant.apr) === index);
  const projections = variants.map(variant => ({ ...variant, projection: projectBusiness(state, { ...checked.plan, financingApr: variant.apr }, Math.min(6, campaignLength(state))) }));
  const comparisonMonths = Math.min(...projections.map(option => option.projection.months.length));
  const options = projections.map(option => ({
    id: option.id, label: option.label, apr: option.apr,
    differencePP: option.apr - selected.apr,
    ...projectionSummary(option.projection.months.slice(0, comparisonMonths)),
    stopReason: option.projection.stopReason,
  }));
  const baseline = options[0];
  for (const option of options) option.delta = Object.fromEntries(['totalInterestIncome', 'totalNewLending', 'totalCreditLosses', 'totalProfit', 'endingCash', 'endingLoanBook', 'endingFinanceDebt'].map(key => [key, money(option[key] - baseline[key])]));
  return { ...result, status: 'forecast', selected, options, comparisonMonths, comparisonEndMonth: baseline.endMonth, forecastMonth: state.month + 1 };
}

const ROWS = [
  ['cash', 'Cash', 'assets', 1, 'Cash may rise because of borrowing. Check operating cash flow and both debt balances before calling it improvement.'],
  ['receivables', 'Dealer receivables', 'assets', 0, 'Revenue invoiced but not yet collected. Growth can reflect sales or slower cash conversion.'],
  ['inventory', 'Manufacturer inventory', 'assets', 0, 'Owned parts, incomplete machines, rework and finished goods at cost. More stock can support delivery or tie up cash.'],
  ['fixedAssets', 'Property, plant & equipment', 'assets', 0, 'Capital investment adds assets immediately; depreciation reduces their carrying value. Capacity benefits arrive later.'],
  ['loanBook', 'Customer loans outstanding', 'assets', 0, 'Principal still owed by equipment customers; this is an asset, not interest income.'],
  ['assets', 'Total assets', 'assets', 0, 'The sum of the five asset categories above.', true],
  ['corporateDebt', 'Corporate debt', 'liabilities', -1, 'Company borrowing. Cash raised creates an equal obligation; repayment uses cash.'],
  ['financeDebt', 'Customer-finance debt', 'liabilities', -1, 'Matched borrowing equals 80% of the customer loan book. Movement often reflects lending and collections.'],
  ['payables', 'Supplier payables', 'liabilities', 0, 'Materials received but not yet paid for. An increase preserves cash today but remains an obligation.'],
  ['warrantyReserve', 'Warranty reserve', 'liabilities', 0, 'Expected future claims: provisions add to the reserve; paid claims use it. A lower reserve alone does not prove better quality.'],
  ['liabilities', 'Total liabilities', 'liabilities', 0, 'Corporate debt + customer-finance debt + supplier payables + warranty reserve. This total mixes funding, supplier obligations and expected claims; inspect the components.', true],
  ['equity', 'Shareholders’ equity', 'equity', 1, 'Opening equity plus this month’s net profit or loss. Borrowing does not create equity.', true],
  ['liabilitiesAndEquity', 'Total liabilities + equity', 'equity', 0, 'Must equal total assets.', true],
];

export function getMonthlyBalanceSheet(state, month = state?.month) {
  const checked = validateState(state);
  if (!checked.valid) return { available: false, errors: checked.errors, rows: [] };
  if (!Number.isInteger(month) || month < 1 || month > state.month) return { available: false, errors: ['Choose a completed month to see its opening and closing accounts.'], rows: [] };
  const report = state.history[month - 1];
  if (report.isForecast || report.forecast) return { available: false, errors: ['This month is a projection. Complete a live month to see its actual opening and closing accounts.'], rows: [] };
  return {
    available: true, errors: [], month, isForecast: report.isForecast,
    rows: ROWS.map(([key, label, group, direction, context, total = false]) => {
      const opening = report.openingBalanceSheet[key], closing = report.balanceSheet[key], delta = money(closing - opening);
      const movement = delta > 0 ? 'Increased' : delta < 0 ? 'Decreased' : 'Unchanged';
      const tone = !direction || !delta ? 'neutral' : delta * direction > 0 ? 'positive' : 'negative';
      return { key, label, group, total, opening, closing, delta, movement, tone, context };
    }),
    income: { ...report.income }, cashFlow: { ...report.cashFlow }, financing: { ...report.financing },
    reconciliation: report.balanceSheet.reconciliation,
    debtChange: money(report.balanceSheet.debt - report.openingBalanceSheet.debt),
    equityChange: money(report.balanceSheet.equity - report.openingBalanceSheet.equity),
  };
}

export function getInvestmentExplanation(state, plan) {
  const checkedState = validateState(state);
  if (!checkedState.valid) return { status: 'invalid-state', errors: checkedState.errors, pipeline: [], proposed: null };
  const pipeline = [
    ...state.capexPipeline.map(project => ({ kind: 'capacity', amount: project.amount, benefitMonth: state.month + project.remaining })),
    ...state.rdPipeline.map(project => ({ kind: 'engineering', amount: project.amount, benefitMonth: state.month + project.remaining })),
  ].sort((a, b) => a.benefitMonth - b.benefitMonth || a.kind.localeCompare(b.kind));
  const result = { status: 'current-only', errors: [], pipeline, currentCapacityBonus: state.capacityBonus, campaignEndMonth: campaignLength(state), proposed: null };
  if (!active(state)) return result;
  const checked = validatePlan(plan, state);
  if (!checked.valid) return { ...result, status: 'invalid-plan', errors: checked.errors };
  const queuedCapacityBonus = sum(state.capexPipeline.map(project => project.amount * .004));
  return {
    ...result, status: 'forecast', proposed: {
      decisionMonth: state.month + 1, benefitMonth: state.month + 4,
      capex: checked.plan.capex, engineering: checked.plan.rd,
      capacityBonusIncrement: Math.min(Math.max(0, .4 - state.capacityBonus - queuedCapacityBonus), checked.plan.capex * .004),
      engineeringIndexIncrementBeforeDecayAndCaps: checked.plan.rd * .007,
      benefitsWithinCampaign: state.month + 4 <= campaignLength(state),
    },
  };
}
