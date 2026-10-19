import { getFinancingInsights, getMonthlyBalanceSheet, getInvestmentExplanation } from './financial-learning.js';
import { monthLabel } from './campaign-calendar.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const number = (value, digits = 1) => finite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const money = value => finite(value) ? (value < 0 ? '−' : '') + '$' + number(Math.abs(value), 3) + 'm' : '—';
const deltaMoney = value => {
  if (!finite(value)) return '—';
  const digits = value ? Math.min(6, Math.max(3, 1 - Math.floor(Math.log10(Math.abs(value))))) : 3;
  return (value < 0 ? '−' : value > 0 ? '+' : '') + '$' + number(Math.abs(value), digits) + 'm';
};
const percent = value => finite(value) ? number(value * 100) + '%' : '—';
const apr = value => finite(value) ? number(value, 2) + '%' : '—';
const units = value => number(value, 0);
const note = (title, description) => '<div class="business-note"><strong>' + escape(title) + '</strong><p>' + escape(description) + '</p></div>';
const table = (headers, rows, attr = '') => '<div class="table-scroll"><table class="business-table" ' + attr + '><thead><tr>' + headers.map(header => '<th scope="col">' + header + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr><th scope="row">' + row[0] + '</th>' + row.slice(1).map(value => '<td>' + value + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
const errorsHTML = errors => errors.length ? '<div class="business-alert" role="status"><strong>Projection unavailable</strong><p>' + escape(errors.join(' ')) + '</p></div>' : '';

export function financingInsightsHTML(state, plan) {
  const data = getFinancingInsights(state, plan);
  const selected = data.selected;
  let html = '<div data-financing-guide><p class="business-intro">Customer financing APR is the annual rate you offer equipment buyers on new loans.</p><p>The starting <strong>7.25%</strong> rate is a neutral demand reference in this game. It is separate from the interest your company pays to borrow.</p>' + errorsHTML(data.errors);
  html += table(['Rate', 'What it applies to', 'When it matters'], [
    [selected ? apr(selected.apr) + ' customer APR' : 'Customer APR · chosen in Decisions', 'New 24-month equipment loans. Existing loan cohorts keep their original APR.', 'Demand and new lending change now; interest from newly originated loans starts the following month.'],
    ['7.50% corporate borrowing rate', 'Opening corporate debt balance.', 'A corporate draw or repayment changes cash and debt now; its interest effect starts next month.'],
    ['5.50% customer-finance funding rate', 'Opening matched customer-finance debt balance.', 'Matched debt equals 80% of the closing loan book. Its interest effect follows the funding balance.'],
  ], 'data-financing-rate-rules');
  if (selected) {
    html += '<h3 class="operator-heading">What ' + apr(selected.apr) + ' means in your working plan</h3>' +
      '<div class="business-kpis"><div class="business-kpi"><span>Demand multiplier</span><strong data-financing-demand-multiplier>' + number(selected.demandMultiplier, 3) + '×</strong><small>1.000× at 7.25%; price, reputation, technology and supply still matter.</small></div>' +
      '<div class="business-kpi"><span>Retail sales financed</span><strong>' + percent(selected.financedRetailShare) + '</strong><small>Each financed sale lends 80% of list price. The remaining sales use other funding.</small></div></div>' +
      note('One percentage point lower', 'Holding other demand factors fixed, lowering APR by one percentage point adds 0.012 to the demand multiplier and 1.4 percentage points to the modeled financed share, within their bounds. Actual units are rounded and limited by dealer availability. More lending uses cash and increases future credit exposure.') +
      note('A $100,000 customer-loan example', 'At ' + apr(selected.apr) + ', interest at the first collection on an unchanged $100,000 opening balance is $' + number(selected.firstInterestOn100k, 2) + '. Scheduled principal is about $' + number(selected.scheduledPrincipalOn100k, 2) + ' each month before credit losses. This is a declining-balance, equal-principal model, so interest falls over time; it is not a fixed-payment annuity. Loans issued in ' + monthLabel(data.forecastMonth) + ' first earn interest in ' + monthLabel(selected.firstNewLoanInterestMonth) + '.') +
      '<h3 class="operator-heading">Compare customer rates using your plan</h3><p class="business-caption">All other decisions are held constant. Each rate stays in place for ' + data.comparisonMonths + ' projected months through ' + escape(monthLabel(data.comparisonEndMonth)) + '. Recurring operating budgets repeat; new capital spending and corporate borrowing apply only in the first month. Expected outcomes use the public market outlook.</p>' +
      table(['Next month · ' + escape(monthLabel(data.forecastMonth)), ...data.options.map(option => escape(option.label) + '<br>' + apr(option.apr))], [
        ['Expected customer requests', ...data.options.map(option => units(option.next.expectedDemand))],
        ['Customer retail sales', ...data.options.map(option => units(option.next.retailSales))],
        ['New customer lending', ...data.options.map(option => money(option.next.newLending))],
        ['Net matched funding draw / (repayment)', ...data.options.map(option => money(option.next.financeFunding))],
        ['Interest from existing customer loans', ...data.options.map(option => money(option.next.interestIncome))],
        ['Whole-company net profit', ...data.options.map(option => money(option.next.profit))],
        ['Ending cash', ...data.options.map(option => money(option.next.cash))],
      ], 'data-financing-next-month') +
      table([data.comparisonMonths + '-month projection', ...data.options.map(option => apr(option.apr))], [
        ['Total customer-loan interest income', ...data.options.map(option => money(option.totalInterestIncome))],
        ['Customer-loan credit losses', ...data.options.map(option => money(option.totalCreditLosses))],
        ['Whole-company net profit', ...data.options.map(option => money(option.totalProfit))],
        ['Net profit change vs working plan', ...data.options.map(option => deltaMoney(option.delta.totalProfit))],
        ['Ending cash', ...data.options.map(option => money(option.endingCash))],
        ['Cash change vs working plan', ...data.options.map(option => deltaMoney(option.delta.endingCash))],
        ['Ending customer loan book', ...data.options.map(option => money(option.endingLoanBook))],
        ['Ending matched finance debt', ...data.options.map(option => money(option.endingFinanceDebt))],
      ], 'data-financing-projection') +
      note('Why interest does not change immediately', 'All options collect the same interest from the existing loan cohorts next month. Your chosen rate applies only to new lending. Differences emerge from later interest, customer demand, funding needs and credit losses. Whole-company profit includes manufacturing and all other operating effects; it is not a finance-division margin.') +
      (data.options.some(option => option.stopReason === 'distress') ? note('Compared over the same period', 'At least one projection ends in distress. Every option is truncated to the earliest ending month so the comparison uses equal periods.') : '');
    const baseline = data.options[0];
    html += note('How new lending is funded', 'Under your working plan, ' + money(baseline.next.newLending) + ' of new lending is supported by ' + money(baseline.next.newLoanMatchedFunding) + ' of matched debt and ' + money(baseline.next.newLoanCompanyFunding) + ' of company funds before collections and other activity. The reported net funding change also includes repayment of funding as older loans amortize and losses reduce the book. Loan principal is an asset, not revenue.');
  } else if (data.current) html += note('Current loan book remains visible', 'The campaign has ended or the working plan needs correction. Existing customer loans total ' + money(data.current.loanBook) + ', with a balance-weighted APR of ' + apr(data.current.weightedLoanApr) + '. No new month is projected.');
  html += note('A positive APR spread is not a guaranteed profit', 'The business funds only part of each loan with matched debt, commits its own cash, faces credit losses and also pays corporate funding costs. Customer APR minus 5.50% is not a complete margin calculation. The simulation assumes fixed funding rates and full interest collection on opening loan balances; these are learning assumptions, not a credit forecast.') + '</div>';
  return html;
}

export function monthlyBalanceSheetHTML(state, month = state?.month) {
  const data = getMonthlyBalanceSheet(state, month);
  if (!data.available) return '<section data-monthly-balance-sheet>' + errorsHTML(data.errors) + '</section>';
  const income = data.income, cash = data.cashFlow;
  const rows = data.rows.map(row => '<tr data-balance-row="' + row.key + '"' + (row.total ? ' class="financial-total"' : '') + '><th scope="row">' + escape(row.label) + '<small class="financial-row-context">' + escape(row.context) + '</small></th><td>' + money(row.opening) + '</td><td data-balance-closing>' + money(row.closing) + '</td><td class="financial-' + row.tone + '" data-balance-change><strong>' + deltaMoney(row.delta) + '</strong><small>' + row.movement + '</small></td></tr>').join('');
  return '<section class="monthly-financial-statement" data-monthly-balance-sheet="' + month + '"><h3 class="operator-heading">Full balance sheet · ' + escape(monthLabel(month)) + '</h3><p class="business-caption">Actual closing accounts compared with the opening of this month. USD millions. Green and red highlight cash/equity direction and the opposite debt direction; they are prompts to investigate, not a judgment on the strategy. Other asset and liability movements are neutral because their business meaning depends on context.</p>' +
    '<div class="table-scroll"><table class="business-table financial-statement"><thead><tr><th scope="col">Account</th><th scope="col">Opening</th><th scope="col">Closing</th><th scope="col">Movement</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="business-caption" data-balance-reconciliation>Assets − liabilities − equity: ' + money(data.reconciliation) + '. Display rounding can make visible line items differ slightly from the total.</p>' +
    '<h3 class="operator-heading">What changed profit and cash?</h3>' + table(['Income this month', 'Amount'], [
      ['Equipment wholesale revenue', money(income.wholesaleRevenue)], ['Customer-loan interest revenue', money(income.loanInterestIncome)],
      ['Total revenue', money(income.revenue)], ['Cost of shipped equipment', money(income.cogs)],
      ['Operating expenses', money(income.operatingExpense)], ['Depreciation', money(income.depreciation)],
      ['Warranty provision + unreserved claims', money(income.warrantyAccrual + income.warrantyShortfall)],
      ['Customer-loan credit losses', money(income.creditLosses)], ['Corporate + finance interest expense', money(income.interestExpense)],
      ['Income tax', money(income.tax)], ['Net profit / (loss)', money(income.profit)],
    ], 'data-monthly-income') +
    table(['Cash bridge', 'Amount'], [
      ['Opening cash', money(cash.opening)], ['Operating cash flow', deltaMoney(cash.operating)],
      ['Customer-loan principal collected', deltaMoney(cash.loanPrincipalCollections)], ['New customer loans funded', deltaMoney(-cash.newLending)],
      ['Factory investment', deltaMoney(-cash.capex)], ['Corporate borrowing / (repayment)', deltaMoney(cash.corporateBorrowing)],
      ['Matched finance borrowing / (repayment)', deltaMoney(cash.financeFunding)], ['Net cash movement', deltaMoney(cash.cashChange)], ['Closing cash', money(cash.closing)],
    ], 'data-monthly-cash-bridge') +
    note('Profit builds equity; borrowing does not', 'This month’s net profit of ' + money(income.profit) + ' changes shareholders’ equity by ' + deltaMoney(data.equityChange) + '. Corporate borrowing / repayment is ' + money(cash.corporateBorrowing) + ' and matched finance funding changes by ' + deltaMoney(cash.financeFunding) + '. These move cash and debt together without creating income. Loan principal collections reduce an asset; only loan interest is revenue.') + '</section>';
}

export function investmentExplanationHTML(state, plan) {
  const data = getInvestmentExplanation(state, plan);
  const proposed = data.proposed;
  const timing = proposed ? 'A decision in ' + monthLabel(proposed.decisionMonth) + ' first affects operating capability in ' + monthLabel(proposed.benefitMonth) + '.' : 'Projects complete three months after the month in which they are funded.';
  return '<div data-investment-guide><p class="business-intro">Capacity lets you build more. Engineering helps customers want what you build.</p><p>' + escape(timing) + ' Cash leaves when you commit the spending.</p>' + errorsHTML(data.errors) +
    table(['Decision', 'What the money changes', 'How it reaches the accounts', 'What it does not guarantee'], [
      ['Factory investment · capital expenditure', 'Represents added production equipment, tooling and facility capacity. Each $1m of completed projects adds 0.4 percentage points to the shared capacity bonus, up to a 40% total bonus. Actual slots also depend on plant condition, workforce skill and overtime.', 'Cash falls and fixed assets rise immediately. Existing assets depreciate each month; a new investment joins that depreciation base next month. The capacity benefit arrives after the project delay.', 'Extra machines sold, lower unit material cost, available controllers or better quality. You need dealer demand, production targets and materials to use the extra capacity.'],
      ['Product engineering · recurring operating expense', 'Represents development of product features and capability. Each completed $1m adds 0.007 to each product’s technology index before limits and a 0.0025 monthly decay. Technology helps the demand multiplier; the index is capped at 1.25.', 'Cash and this month’s profit both fall by the engineering budget before tax effects. Projects enter a three-month development pipeline. There is no separate capitalized R&D asset in this model.', 'Immediate sales, a named new product launch, lower manufacturing unit cost or automatic improvement in factory first-pass quality. Those are separate mechanics.'],
      ['Quality, maintenance & training', 'Quality supports first-pass acceptance and supplier performance. Maintenance supports plant condition. Training develops workforce skill and also helps quality and rework recovery.', 'Recurring budgets are expenses and cash outflows in the committed month. Capability then carries forward and can deteriorate if neglected.', 'That the highest budget is always the best choice. Target the constraint and preserve a cash buffer.'],
    ], 'data-investment-explanation') +
    (proposed ? note('Your current investment choices', 'The working plan commits ' + money(proposed.capex) + ' once to factory investment and ' + money(proposed.engineering) + ' to this month’s engineering budget. The factory project can add up to ' + number(proposed.capacityBonusIncrement * 100, 2) + ' percentage points of capacity bonus after already funded projects and the cap. Engineering contributes ' + number(proposed.engineeringIndexIncrementBeforeDecayAndCaps, 4) + ' technology-index points on completion before decay and limits. Recurring engineering stays in the next working plan; capital spending resets to zero.') : '') +
    (proposed && !proposed.benefitsWithinCampaign ? note('Completion falls after this campaign', 'The new projects would mature in ' + monthLabel(proposed.benefitMonth) + ', beyond the campaign’s final month. Their cash and accounting effects occur now; this campaign cannot demonstrate their operating returns.') : '') +
    note('When is capacity useful?', 'Fund capacity when expected profitable orders would exceed usable factory slots after the project is ready. If component supply, rework, low production targets or weak dealer demand are the bottleneck, more slots can sit idle. In a soft market, maintenance, reliability and cash preservation can matter more. Compare those choices in the investment lab before committing.') +
    note('How this builds future business value', 'Useful capacity can turn later demand into deliveries and profit. Better products can support demand while good quality and delivery protect reputation. Neither spending nor borrowing creates profit by itself. Fixed assets retain book value after depreciation, but productive use and future cash generation determine whether an investment was worthwhile; the game does not estimate a market valuation or guaranteed return.') +
    '<div class="operations-links"><button class="secondary-button" data-action="factory-diagnostics">Diagnose factory constraints ↗</button><button class="secondary-button" data-action="investment-lab">Compare targeted investments ↗</button></div>' +
    (data.pipeline.length ? '<h3 class="operator-heading">Projects already funded</h3>' + table(['Project', 'Spend already committed', 'First capability benefit'], data.pipeline.map(project => [project.kind === 'capacity' ? 'Factory capacity' : 'Product engineering', money(project.amount), escape(monthLabel(project.benefitMonth)) + (project.benefitMonth > data.campaignEndMonth ? ' · after campaign end' : '')]), 'data-investment-pipeline') : note('No projects in progress', 'A new capital or engineering commitment will appear here after you advance the month.')) + '</div>';
}
