import { getBoardMandate, getBoardReview, getBoardDashboard } from './board-mandate.js';
import { campaignLength, campaignYear, monthLabel } from './campaign-calendar.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const money = value => finite(value) ? (value < 0 ? '−' : '') + '$' + Math.abs(value).toFixed(1) + 'm' : '—';
const percent = value => finite(value) ? (value * 100).toFixed(1) + '%' : '—';
const format = (value, unit) => !finite(value) ? '—' : unit === '$m' ? money(value) : unit === '%' ? percent(value) : value.toFixed(2) + ' months';
const statusClass = value => ({Beating:'ahead',Meeting:'on-track',Behind:'behind',Unmeasured:'unmeasured'}[value] || 'unmeasured');
const status = value => '<span class="board-status ' + statusClass(value) + '" data-board-status>' + escape(value || 'No actual yet') + '</span>';
const note = (title, body) => '<div class="business-note"><strong>' + escape(title) + '</strong><p>' + escape(body) + '</p></div>';
const table = (head, rows, attr = '') => '<div class="table-scroll"><table class="business-table" ' + attr + '><thead><tr>' + head.map(value => '<th scope="col">' + value + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr><th scope="row">' + row[0] + '</th>' + row.slice(1).map(value => '<td>' + value + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
const metricTable = review => '<div class="table-scroll"><table class="business-table board-metric-table"><thead><tr><th scope="col">Board objective</th><th scope="col">' + (review.kind === 'forecast' ? 'Expected' : 'Actual') + '</th><th scope="col">Target</th><th scope="col">Status</th></tr></thead><tbody>' + review.components.map(c => '<tr data-board-metric="' + c.id + '"><th scope="row">' + escape(c.label) + '<small>' + (c.direction === 'lower' ? 'Lower is better · ' : '') + c.weight + '% of score</small></th><td data-board-actual data-value="' + (finite(c.actual) ? c.actual : '') + '">' + format(c.actual,c.unit) + '</td><td data-board-target data-value="' + c.target + '">' + format(c.target,c.unit) + '</td><td>' + status(c.status) + '</td></tr>').join('') + '</tbody></table></div>';

function reviewHTML(review, compact = false) {
  if (!review?.available) return note('Board review unavailable',review?.reason || 'Actual performance becomes available after the first completed month.');
  const forecast = review.kind === 'forecast';
  return '<section class="board-review ' + (forecast ? 'board-forecast' : '') + '" data-board-review="' + review.month + '" data-board-kind="' + review.kind + '"><div class="board-review-heading"><div><span class="overline">' + (forecast ? 'WORKING PLAN · FORECAST' : review.period === 'quarter' ? 'QUARTERLY BOARD REVIEW' : 'MONTHLY BOARD REVIEW') + '</span><h3>' + escape(review.period === 'quarter' ? 'Q' + review.quarter + ' · Year ' + review.year : monthLabel(review.month)) + '</h3>' + status(review.status) + '</div><div class="board-score"><strong data-board-score>' + review.score + '</strong><span>/ 100 · <b data-board-grade>' + review.grade + '</b></span></div></div><p class="board-message">' + escape(review.message) + '</p>' +
    metricTable(review) +
    '<p class="business-caption">' + escape(review.interpretation) + '</p>' +
    (review.guardrail ? note('Score guardrail',review.guardrail.message) : '') +
    (compact ? '<button class="secondary-button" data-board-month="' + review.month + '">Full board review & targets ↗</button>' :
      '<div class="board-priorities"><div><h4>What the board recognizes</h4>' + (review.strengths.length ? review.strengths.map(item => '<p><strong>' + escape(item.title) + ':</strong> ' + escape(item.detail) + '</p>').join('') : '<p>No objective is currently meeting its target. Start with the priorities alongside.</p>') + '</div><div><h4>What the board wants next</h4>' + review.priorities.map(item => '<p><strong>' + escape(item.title) + ':</strong> ' + escape(item.detail) + '</p>').join('') + '</div></div>') +
    '</section>';
}

export function boardBriefingHTML(state) {
  const mandate = getBoardMandate(state);
  const review = state.month ? getBoardReview(state) : null;
  const goal = mandate.monthlyGoals[Math.min(state.status==='active'?state.month:Math.max(0,state.month-1),campaignLength(state)-1)];
  const quarter = mandate.quarterlyGoals.find(item => item.month >= goal.month);
  return '<section class="board-briefing" data-board-briefing><span class="overline">YOUR BOARD MANDATE</span><h3>' + escape(mandate.title) + '</h3><p>' + escape(mandate.directive) + '</p><div class="board-brief-goals"><div><span>' + escape(monthLabel(goal.month,{short:true})) + ' share target</span><strong>' + percent(goal.targets.share) + '</strong></div><div><span>Q' + quarter.quarter + ' · Year ' + quarter.year + ' share target</span><strong>' + percent(quarter.targets.share) + '</strong></div><div><span>Dealer delivery target</span><strong>' + percent(goal.targets.delivery) + '</strong></div><div><span>Quality target</span><strong>' + percent(goal.targets.quality) + '</strong></div></div>' +
    (review?.available ? '<div class="board-brief-result"><span>' + escape(monthLabel(state.month,{short:true})) + ' actual</span><strong>' + review.score + ' / 100 · ' + review.grade + '</strong>' + status(review.status) + '</div><p>' + escape(review.priorities[0]?.detail || review.message) + '</p>' : '<p class="board-small">Targets are visible before you commit. Monthly results and quarterly reviews will show whether you are beating, meeting or falling behind.</p>') +
    (mandate.retrospective ? '<p class="board-small">For this older save, targets are a retrospective learning benchmark.</p>' : '') +
    '<button class="secondary-button" data-action="board-review">Mandate, monthly goals & progress ↗</button></section>';
}

export function boardSummaryHTML(state, month = state.month) {
  const review = getBoardReview(state,Number(month));
  return '<div data-board-summary="' + month + '">' + reviewHTML(review,true) +
    (review.quarterReview ? '<details class="business-details" open><summary>Quarterly checkpoint · Q' + review.quarter + ' · Year ' + review.year + '</summary><p>Delivery, quality and share use the full quarter. Value, liquidity and inventory describe the quarter-end position.</p>' + reviewHTML(review.quarterReview) + '</details>' : '') +
    '<p class="business-caption">Board performance measures outcomes against goals. The decision coach below evaluates the choice using the forecast available before the month. A sound decision can still face an adverse market surprise.</p></div>';
}

function targetTable(mandate, goals, label, attr) {
  return table([label,...mandate.metrics.map(metric => escape(metric.label) + '<small>' + escape(metric.unit) + '</small>')],goals.map(goal => [escape(monthLabel(goal.month,{short:true})) + (goal.quarterEnd ? '<small>Q' + goal.quarter + ' checkpoint</small>' : ''),...mandate.metrics.map(metric => format(goal.targets[metric.id],metric.unit))]),attr);
}

function futureValueHTML(value) {
  if (!value) return '';
  const capability = value.capability;
  return '<h3 class="operator-heading">What have we built for the future?</h3><div class="business-kpis business-kpis-wide"><div class="business-kpi"><span>Earned company value</span><strong>' + money(value.valueCreated) + '</strong><small>Change in adjusted book equity since opening</small></div><div class="business-kpi"><span>Current book equity</span><strong>' + money(value.bookEquity) + '</strong><small>Assets less all recorded liabilities</small></div><div class="business-kpi"><span>Completed capacity bonus</span><strong>' + percent(capability.capacityBonus) + '</strong><small>Applies to operating slots; requires profitable orders</small></div><div class="business-kpi"><span>Product technology</span><strong>' + capability.technology.toFixed(3) + '</strong><small>Average modeled index · 1.000 reference</small></div></div>' +
    note('Potential must turn into results',value.explanation) +
    '<p class="business-caption">Book equity ' + money(value.bookEquity) + ' less realization discounts ' + money(value.realizationDiscount) + ' = adjusted book equity ' + money(value.adjustedEquity) + '. Opening adjusted equity was ' + money(value.initialAdjustedEquity) + '. Values are rounded. This is an accounting-based learning measure, not a company sale price.</p>' +
    (value.pipeline.length ? table(['Funded project','Amount','Scheduled completion'],value.pipeline.map(project => [project.type === 'capacity' ? 'Factory capacity' : 'Product engineering',money(project.amount),escape(monthLabel(project.maturesMonth)) + (project.withinCampaign ? '' : '<small>Beyond this campaign</small>')]),'data-board-pipeline') : '<p class="business-caption">No funded projects are waiting for completion.</p>') +
    '<div class="operations-links"><button class="secondary-button" data-action="investment-guide">What capacity & engineering change ↗</button><button class="secondary-button" data-action="investment-lab">Compare the investment choices ↗</button></div>';
}

export function boardDashboardHTML(state, plan, selectedMonth = null) {
  let dashboard;
  try { dashboard = getBoardDashboard(state,plan); }
  catch (error) { return '<div data-board-dashboard>' + note('Board view unavailable',error.message) + '</div>'; }
  const mandate = dashboard.mandate;
  const selected = selectedMonth ? dashboard.history.find(review => review.month === Number(selectedMonth)) || dashboard.current : dashboard.current;
  const showingPast = selected?.month !== dashboard.current?.month;
  const targetMonth = showingPast ? selected.month : Math.min(campaignLength(state),state.month + (state.status === 'active' ? 1 : 0));
  const nextGoal = mandate.monthlyGoals[Math.max(0,targetMonth-1)];
  const annual = mandate.annualGoals.find(goal => goal.year === campaignYear(Math.max(1,targetMonth)));
  return '<div data-board-dashboard><p class="business-intro">' + escape(mandate.title) + '</p><p class="business-caption">' + escape(mandate.directive) + '</p>' +
    '<div class="board-goal-ribbon"><div><span>Year ' + annual.year + ' ending share goal</span><strong>' + percent(annual.targets.share) + '</strong></div><div><span>Year ' + annual.year + ' earned-value goal</span><strong>' + money(annual.targets.value) + '</strong></div><div><span>Cash + unused credit target</span><strong>' + money(nextGoal.targets.liquidity) + '</strong></div></div>' +
    note(mandate.retrospective ? 'Retrospective learning benchmark' : 'The goalposts are fixed',mandate.targetBasis) +
    (dashboard.history.length ? '<div class="board-history-strip" role="group" aria-label="Choose a completed board review">' + dashboard.history.map(review => '<button data-board-month="' + review.month + '" aria-pressed="' + (review.month === selected?.month) + '" class="' + (review.month === selected?.month ? 'active' : '') + '">' + escape(monthLabel(review.month,{short:true})) + '</button>').join('') + '</div>' : '') +
    (selected ? reviewHTML(selected) : note('Your first board review follows January','The table below already shows the objectives. The forecast evaluates your current working plan; it is not an actual result.')) +
    (selected?.quarterReview ? '<details class="business-details" open><summary>Full quarterly checkpoint · Q' + selected.quarter + ' · Year ' + selected.year + '</summary><p>Delivery, quality and share are measured over all three months; other measures use quarter-end balances.</p>' + reviewHTML(selected.quarterReview) + '</details>' : '') +
    (dashboard.forecastError ? note('Working-plan forecast unavailable',dashboard.forecastError) : '') +
    (dashboard.next && !showingPast ? '<details class="business-details" open><summary>Current working plan against next month’s goals</summary>' + reviewHTML(dashboard.next) + '</details>' : '') +
    (selected?.currentOutlook ? note('The board’s view of the outlook at this review',selected.currentOutlook.detail) : '') +
    '<h3 class="operator-heading">Quarterly commitments</h3><p class="business-caption">Quarter-end value and liquidity, with quarter-wide delivery, quality and share. These targets stay fixed when the outlook changes.</p>' +
    targetTable(mandate,mandate.quarterlyGoals,'Quarter ending','data-board-quarterly-goals') +
    '<details class="business-details"><summary>Every monthly target · ' + mandate.horizonMonths + ' rounds</summary><p>Monthly progress is measured against the scheduled target, not against a goal rewritten after the result.</p>' + targetTable(mandate,mandate.monthlyGoals,'Month','data-board-monthly-goals') + '</details>' +
    futureValueHTML(selected?.futureValue) +
    '<details class="business-details"><summary>How the board score works</summary><p>' + escape(mandate.scoringMethodology) + '</p><p>A ≥90; B ≥80; C ≥70; D ≥60; F below 60. Meeting every exact target earns 75/100; an A requires stretch performance across the measures. The decision coach is a separate assessment.</p>' +
    table(['Measure','Weight','Zero-point anchor','Target · 75','Stretch · 100'],mandate.metrics.map(metric => {
      const thresholds = (selected?.goal || nextGoal).thresholds[metric.id];
      return [escape(metric.label),metric.weight + '%',format(thresholds.floor,metric.unit),format(thresholds.target,metric.unit),format(thresholds.stretch,metric.unit)];
    })) +
    mandate.metrics.map(metric => '<p><strong>' + escape(metric.label) + '.</strong> ' + escape(metric.definition) + ' A gap within ' + (metric.unit === '%' ? (metric.tolerance*100).toFixed(1)+' percentage points' : format(metric.tolerance,metric.unit)) + ' of target is labeled Meeting; the exact score still follows the anchors.</p>').join('') +
    [...mandate.guardrails,...mandate.notes].map(item => '<p>' + escape(item) + '</p>').join('') + '</details></div>';
}
