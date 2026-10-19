import { getUnitEconomics, getReportEconomics } from './unit-economics.js';
import { getMonthlyCoaching } from './coaching.js';
import { getMarketOutlook } from './simulation.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => n == null ? '—' : `${n<0?'−':''}$${Math.abs(n).toFixed(1)}m`;
const perUnit = n => n == null ? '—' : `${n<0?'−':''}$${Math.abs(n).toFixed(1)}k`;
const units = n => n == null ? '—' : Math.ceil(n).toLocaleString('en-US');
const percent = n => n == null ? '—' : `${(n*100).toFixed(1)}%`;
const change = n => n == null ? '—' : `${n>=0?'+':'−'}${Math.abs(n*100).toFixed(1)}%`;
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const kpi = (key,label,value,note='') => `<div class="business-kpi"><span>${label}</span><strong data-kpi="${key}">${value}</strong><small>${note}</small></div>`;
const cache = new WeakMap();

export function coachingReview(state,month) {
  if(!cache.has(state))cache.set(state,new Map());
  const entries=cache.get(state);
  if(!entries.has(month)) {
    try { entries.set(month,getMonthlyCoaching(state,month)); }
    catch(error) { entries.set(month,{available:false,month,reason:error.message}); }
  }
  return entries.get(month);
}

export function climateHTML(state) {
  const o=getMarketOutlook(state);
  if(state.status!=='active'&&o.regimeLabel)return `<div class="climate-card"><span class="overline">CAMPAIGN MARKET CONTEXT</span><h3>${esc(o.regimeLabel)}</h3><p>Your campaign began with a ${esc(state.marketCycle.initialRegime)} outlook. Review each completed month to compare its opening expectations with observed demand and supply. Your mandate has ended; there is no next-month company forecast.</p></div>`;
  if(!o.regimeLabel)return `<div class="climate-card"><span class="overline">CLASSIC SCENARIO</span><p>Your existing campaign keeps its original market rules. A new campaign can start in a soft, flat or upswing market with changing conditions.</p><button class="text-button" data-action="restart">Explore a new market scenario ↗</button></div>`;
  return `<div class="climate-card" data-market-climate><div class="eyebrow-row"><span class="overline">PUBLIC MARKET OUTLOOK</span><span class="tag">${esc(o.regimeLabel)}</span></div><h3>${esc(o.regimeLabel)}</h3><p>${esc(o.cycleSummary||o.summary)}</p><div class="climate-facts"><span>Year outlook vs flat reference <strong>${change(o.expectedAnnualChange)}</strong></span><span>Coming month vs last observed <strong>${change(o.expectedMonthChange)}</strong></span></div><small>Expected scenario, not a promise. Demand and supply can surprise you; next month’s outlook incorporates what has been observed.</small></div>`;
}

export function economicsHTML(state,plan,month=null) {
  let e;
  try {
    const historical=month!=null?state.history.find(r=>r.month===month):state.status!=='active'?state.history.at(-1):null;
    e=historical?getReportEconomics(historical):getUnitEconomics(state,plan);
  }catch(error){return `<div class="business-alert" role="status"><strong>Check the working plan</strong><p>${esc(error.message)}</p></div>`;}
  const c=e.company;
  const basis=e.isForecast?'Expected under your working plan':'Recorded actual results';
  return `<p class="business-intro"><strong>${months[e.month-1]} · ${basis}.</strong> First understand what each sale contributes. Then ask whether enough sales cover the company’s monthly costs.</p>
    <div class="business-kpis business-kpis-wide">${kpi('equipment-revenue','Equipment wholesale sales',money(c.wholesaleRevenueM),`${units(c.shipments)} machines shipped to dealers`)}${kpi('pretax-break-even','Company pre-tax break-even',money(c.pretaxBreakEvenRevenueM),`${units(c.pretaxBreakEvenUnits)} shipments at this mix and pricing`)}${kpi('margin-of-safety','Sales above / below break-even',money(c.marginOfSafetyM),`${percent(c.marginOfSafetyRatio)} of equipment revenue`)}${kpi('economic-pretax-profit','Pre-tax profit',money(c.pretaxProfitM),'Includes finance income and funding costs')}</div>
    <div class="business-note"><strong>A positive margin is the beginning, not the whole answer.</strong><p>The manufacturer earns 86% of the customer list price. Materials, assembly and warranty use part of that revenue. What remains contributes toward shared costs. Producing a machine creates inventory; shipping it to a dealer creates equipment revenue.</p></div>
    <div class="economics-products">${e.products.map(p=>`<section class="economics-product" data-economics-product="${esc(p.id)}"><div class="plant-card-top"><div><span class="overline">${units(p.shipments)} SHIPMENTS</span><h3>${esc(p.name)}</h3></div><strong class="contribution-amount ${p.contributionPerUnitK<0?'negative':''}" data-economics-field="contributionPerUnitK">${perUnit(p.contributionPerUnitK)}<small>contribution / machine</small></strong></div>
    <dl class="economics-lines"><div><dt>Customer list price</dt><dd data-economics-field="listPriceK">${perUnit(p.listPriceK)}</dd></div><div><dt>Manufacturer revenue · 86%</dt><dd data-economics-field="manufacturerPriceK">${perUnit(p.manufacturerPriceK)}</dd></div><div><dt>Materials</dt><dd>${perUnit(p.materialCostK)}</dd></div><div><dt>Standard assembly cost</dt><dd>${perUnit(p.conversionCostK)}</dd></div><div><dt>Total standard production cost</dt><dd data-economics-field="standardCostK">${perUnit(p.standardCostK)}</dd></div><div><dt>Warranty provision per shipment</dt><dd>${perUnit(p.warrantyPerUnitK)}</dd></div><div class="economics-threshold"><dt>Direct-cost & warranty price floor<small>Customer list price; covers these costs only</small></dt><dd>${perUnit(p.warrantyAdjustedFloorListPriceK)}</dd></div><div><dt>Illustrative full-cost break-even price<small>Includes an allocated share of common costs at this volume</small></dt><dd data-economics-field="indicativeBreakEvenListPriceK">${perUnit(p.indicativeBreakEvenListPriceK)}</dd></div></dl><p class="business-caption">${percent(p.contributionMarginRatio)} of equipment revenue contributes toward common costs. Allocated common costs: ${money(p.allocatedCommonCostsM)} this month.</p></section>`).join('')}</div>
    <div class="business-note"><strong>Use break-even as a question, not an automatic price recommendation.</strong><p>These thresholds hold the shipment mix, warranty rate and spending policy constant. A higher price can reduce demand. A lower price can increase sales yet leave less contribution to pay overhead. The full-cost product price allocates common costs by wholesale revenue; it is one teaching convention, not a unique cost of making that product.</p><p>${c.pretaxBreakEvenRevenueM==null?'No meaningful positive break-even threshold is available at the current mix. Review contribution and whether any machines are expected to ship.':`At this mix, the company needs about ${money(c.pretaxBreakEvenRevenueM)} of equipment wholesale revenue, or ${units(c.pretaxBreakEvenUnits)} shipments, to cover pre-tax costs.`} Break-even does not guarantee demand, capacity or cash.</p></div>
    <details class="business-details" open><summary>How product contribution becomes company profit</summary><div class="table-scroll"><table class="business-table" data-economics-reconciliation><tbody><tr><th scope="row">Equipment contribution after standard cost & warranty</th><td>${money(c.contributionM)}</td></tr>${c.costBreakdown.map(row=>`<tr><th scope="row">${esc(row.label)}</th><td>${money(-row.valueM)}</td></tr>`).join('')}<tr><th scope="row">Financing interest income</th><td>${money(c.loanInterestIncomeM)}</td></tr><tr><th scope="row">Interest expense</th><td>${money(-c.interestExpenseM)}</td></tr><tr class="total-row"><th scope="row">Pre-tax profit</th><td>${money(c.pretaxProfitM)}</td></tr></tbody></table></div></details>
    <div class="business-alert"><strong>Profit break-even and cash survival are different.</strong><p>Capital spending and debt principal use cash without being a current expense. Inventory and receivables can absorb cash even when sales are profitable. This ${e.isForecast?'plan projects':'month recorded'} ${money(c.endingCashM)} ending cash and ${money(c.cashChangeM)} cash movement. Check Finance before committing.</p></div>
    <details class="business-details"><summary>Calculation assumptions</summary><ul>${e.assumptions.map(a=>`<li>${esc(a)}</li>`).join('')}</ul></details>`;
}

export function coachingSummaryHTML(state,month) {
  const r=coachingReview(state,month);
  if(!r.available)return `<div class="business-alert"><strong>Monthly coaching unavailable</strong><p>${esc(r.reason||'The opening state could not be reconstructed reliably.')}</p></div>`;
  return `<section class="coach-summary"><div class="coach-grade"><strong data-kpi="coaching-score">${r.score}</strong><span>/ 100 · <b data-kpi="coaching-grade">${esc(r.grade)}</b></span><small>Decision quality</small></div><div><span class="overline">YOUR MONTHLY BUSINESS COACH</span><h3>${esc(r.lesson)}</h3><p>Graded using the information available before the round. Actual outcomes and market surprises are reviewed separately.</p><button class="secondary-button" data-coaching-month="${month}">What worked, what to change ↗</button></div></section>`;
}

function lessonList(items,empty) {
  return items.length?items.map(x=>`<article class="coach-lesson"><h4>${esc(x.title)}</h4><p>${esc(x.detail)}</p>${x.action?`<p><strong>Try next:</strong> ${esc(x.action)}</p>`:''}</article>`).join(''):`<p class="business-caption">${esc(empty)}</p>`;
}

export function coachingDetailHTML(state,month,selectedId=null) {
  const r=coachingReview(state,month);
  if(!r.available)return `<div class="business-alert"><strong>Review unavailable</strong><p>${esc(r.reason)}</p></div>`;
  const selected=r.alternatives.find(a=>a.id===selectedId)||r.hindsightBest;
  const rows=[['revenue','Revenue',money],['profit','Net profit',money],['cash','Ending cash',money],['retailSales','Retail sales',units],['serviceLevel','Dealer order fulfillment',percent]];
  return `${coachingSummaryHTML(state,month)}<div class="business-kpis">${kpi('outcome-score','Outcome score',`${r.actualVsForecast.outcomeScore} / 100`,`${esc(r.actualVsForecast.outcomeGrade)} · includes realized conditions`)}${kpi('tested-alternatives','Plans compared',String(r.alternatives.length),'Same opening company and external conditions')}</div>
    <div class="coach-components">${r.components.map(c=>`<div><span>${esc(c.label)}</span><strong>${Number(c.score).toFixed(1)} / ${c.maximum}</strong><div class="progress-track"><div class="progress-fill" style="width:${Math.max(0,Math.min(100,c.score/c.maximum*100))}%"></div></div><p>${esc(c.detail)}</p></div>`).join('')}</div>
    <div class="review-columns coach-lessons"><div><div class="subheading">WHAT WORKED</div>${lessonList(r.strengths,'No single strength stood out in this round; use the components to identify a starting point.')}</div><div><div class="subheading">WHAT TO IMPROVE</div>${lessonList(r.improvements,'No major weakness was flagged. Keep testing your assumptions as conditions change.')}</div></div>
    <div class="business-note"><strong>What you knew, and what happened</strong><p>${esc(r.shockContext.summary)}</p><p>${esc(r.shockContext.publicOutlook?.summary||'The public outlook was available before you committed.')}</p>${(r.shockContext.events||[]).map(e=>`<p><strong>${esc(e.title)}</strong> ${esc(e.detail)}</p>`).join('')}</div>
    <div class="table-scroll"><table class="business-table" data-coaching-variance><thead><tr><th scope="col">Your plan</th><th scope="col">Forecast at the time</th><th scope="col">Actual result</th></tr></thead><tbody>${rows.map(([key,label,format])=>`<tr><th scope="row">${label}</th><td>${format(r.actualVsForecast.forecast[key])}</td><td>${format(r.actualVsForecast.actual[key])}</td></tr>`).join('')}</tbody></table></div>
    <div class="business-kpis">${kpi('forecast-best','Best tested before the round',esc(r.forecastBest.name),`${r.forecastBest.score} / 100 expected decision score`)}${kpi('hindsight-best','Best tested with hindsight',esc(r.hindsightBest.name),`${r.hindsightBest.actualScore} / 100 realized outcome score`)}</div>
    <p class="business-caption">These are the strongest of the tested feasible plans under the displayed score. They are not a proven global optimum or a guarantee of the best year-end strategy. Alternatives were generated using public forecasts; their actual outcomes are then replayed under the same shocks your company experienced.</p>
    <div class="table-scroll"><table class="business-table" data-coaching-alternatives><thead><tr><th scope="col">Tested plan</th><th scope="col">Decision score</th><th scope="col">Outcome score</th><th scope="col">Actual profit</th><th scope="col">Actual cash</th><th scope="col">Actual fulfillment</th><th scope="col">Explore</th></tr></thead><tbody>${r.alternatives.map(a=>`<tr class="${a.id===selected.id?'highlight-row':''}"><th scope="row">${esc(a.name)}</th><td>${a.score}</td><td>${a.actualScore}</td><td>${money(a.actual.profit)}</td><td>${money(a.actual.cash)}</td><td>${percent(a.actual.serviceLevel)}</td><td><button class="mini-button" data-coaching-alternative="${esc(a.id)}" aria-pressed="${a.id===selected.id}">Inspect</button></td></tr>`).join('')}</tbody></table></div>
    <details class="business-details" open><summary>${esc(selected.name)} · decision changes</summary><p>Compare the selected alternative with the plan you actually committed in ${months[month-1]}. Reviewing an alternative does not change your history or current decisions.</p>${selected.planChanges.length?`<div class="table-scroll"><table class="business-table" data-coaching-plan-changes><thead><tr><th scope="col">Decision</th><th scope="col">You chose</th><th scope="col">Alternative</th></tr></thead><tbody>${selected.planChanges.map(p=>`<tr><th scope="row">${esc(p.label)} (${esc(p.unit)})</th><td>${Number(p.from).toLocaleString('en-US')}</td><td>${Number(p.to).toLocaleString('en-US')}</td></tr>`).join('')}</tbody></table></div>`:'<p>This is your committed plan; no inputs differ.</p>'}</details>
    <details class="business-details"><summary>How the monthly grade works</summary><p>${esc(r.methodology)}</p><p>A: 90–100 · B: 80–89 · C: 70–79 · D: 60–69 · F: below 60. The monthly coaching grade is separate from the board’s final campaign score. Use the dimension breakdown and tradeoffs to decide what to improve.</p></details>`;
}
