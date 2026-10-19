/** Executive campaign rules. Synthetic learning scenarios; no simulation imports. */
export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', demandFactor: 1.04, shockScale: 0.7, graceMonths: 3, strikeLimit: 5, description: 'Supportive demand, smaller surprises, three protected opening months and five strikes before dismissal.' }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', demandFactor: 0.97, shockScale: 1, graceMonths: 2, strikeLimit: 4, description: 'Competitive demand, normal surprises, two protected opening months and four strikes before dismissal.' }),
  difficult: Object.freeze({ id: 'difficult', label: 'Difficult', demandFactor: 0.9, shockScale: 1.4, graceMonths: 1, strikeLimit: 3, description: 'Stronger competitors, larger surprises, one protected opening month and three strikes before dismissal.' }),
});

export function getDifficulty(stateOrId) {
  const id = typeof stateOrId === 'string' ? stateOrId : stateOrId?.difficulty;
  return DIFFICULTIES[id] ?? null;
}

export function createEmployment() {
  return { strikes: 0, badMonths: 0, goodMonths: 0, status: 'secure', lastReviewMonth: 0 };
}

/** Disclosed operational guardrails; attendance never affects employment. */
export function evaluateEmployment(previous, report, state) {
  const profile = getDifficulty(state);
  if (!profile) return null;
  const liquidity = state.cash + Math.max(0, 160 - state.corporateDebt);
  const orders = report.products.reduce((total, product) => total + product.dealerOrders, 0);
  const inventoryMonths = state.inventoryValue / Math.max(8, report.income.cogs);
  const signals = [
    { id: 'profit', label: 'Monthly loss greater than $2m', failed: report.income.profit < -2, actual: report.income.profit, threshold: -2 },
    { id: 'delivery', label: 'Dealer delivery below 75%', failed: orders > 0 && report.metrics.serviceLevel < 0.75, actual: report.metrics.serviceLevel, threshold: 0.75 },
    { id: 'quality', label: 'First-pass quality below 94%', failed: report.metrics.qualityRate < 0.94, actual: report.metrics.qualityRate, threshold: 0.94 },
    { id: 'inventory', label: 'Inventory above 2.5 months of cost of sales', failed: inventoryMonths > 2.5, actual: inventoryMonths, threshold: 2.5 },
    { id: 'liquidity', label: 'Cash plus unused credit below $40m', failed: liquidity < 40, actual: liquidity, threshold: 40 },
  ];
  const failed = signals.filter(signal => signal.failed);
  const emergency = state.cash < 0 || report.metrics.retailSales === 0;
  const poorMonth = emergency || failed.length >= 2;
  const strongMonth = !poorMonth && failed.length === 0;
  const graceActive = report.month <= profile.graceMonths;
  let strikes = previous.strikes;
  let goodMonths = strongMonth ? previous.goodMonths + 1 : 0;
  if (!graceActive && poorMonth) strikes += 1;
  if (!graceActive && strongMonth && goodMonths >= 2 && strikes > 0) { strikes -= 1; goodMonths = 0; }
  const status = strikes >= profile.strikeLimit ? 'dismissed' : strikes >= profile.strikeLimit - 1 ? 'probation' : strikes > 0 ? 'warning' : 'secure';
  const employment = { strikes, badMonths: previous.badMonths + Number(poorMonth), goodMonths, status, lastReviewMonth: report.month };
  const reasons = failed.map(signal => signal.label);
  if (state.cash < 0) reasons.unshift('Cash is negative');
  if (report.metrics.retailSales === 0) reasons.unshift('No equipment reached customers');
  const assessment = graceActive ? `Protected opening month ${report.month} of ${profile.graceMonths}: no strike added.`
    : poorMonth ? 'A strike was added: two operating guardrails failed, or an emergency occurred.'
      : strikes < previous.strikes ? 'Two consecutive months with every guardrail met removed one strike.'
        : strongMonth && strikes > 0 ? 'Every guardrail met. Another clean month will remove one strike.'
          : 'No strike added. Two consecutive months with every guardrail met remove one strike.';
  return {
    employment,
    review: { ...employment, performanceScore: Math.min(100 - failed.length * 20, emergency ? 39 : 100), isForecast: report.isForecast, poorMonth, strongMonth, graceActive, graceMonths: profile.graceMonths, strikeLimit: profile.strikeLimit, signals, reasons,
      message: status === 'dismissed' ? `The board ended your tenure after ${strikes} unresolved performance strikes. ${assessment}` : `${status === 'probation' ? 'Final warning: one more unresolved strike ends your tenure. ' : ''}${assessment}`,
      methodology: 'A poor month means at least two failed guardrails, negative cash, or zero customer sales. Each poor month after the opening grace period adds one strike. Two consecutive months meeting every guardrail remove one strike. Forecast reviews are projections; only committed months affect the actual mandate.' },
  };
}
