import { getMarketIntelligence, projectBusiness, getFinancialPosition } from './business-intelligence.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(1)}m`;
const marketMoney = n => n >= 1000 ? `$${(n / 1000).toFixed(2)}bn` : money(n);
const units = n => Math.round(n).toLocaleString('en-US');
const share = n => n == null ? '—' : `${(n * 100).toFixed(1)}%`;
const change = n => n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n * 100).toFixed(1)}%`;
const cashDelta = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}$${Math.abs(n).toFixed(1)}m`;
const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const monthName = month => month ? names[month - 1] : 'Opening';
const shortMonth = month => monthName(month).slice(0,3);
const kpi = (key, label, value, note = '') => `<div class="business-kpi"><span>${label}</span><strong data-kpi="${key}">${value}</strong><small>${note}</small></div>`;
const warning = error => `<div class="business-alert" role="status"><strong>Check your working plan</strong><p>${escape(error)} Update Decisions to restore the projections. Your current financial position is still available.</p></div>`;

function marketData(state, plan) {
  try { return { data: getMarketIntelligence(state, plan) }; }
  catch (error) { return { data: getMarketIntelligence(state, null), error: error.message }; }
}

export function marketPanelHTML(state, plan) {
  const { data: m, error } = marketData(state, plan);
  const n = m.next;
  const period = n ? monthName(n.month) : 'Campaign ended';
  return `<div class="eyebrow-row"><span class="overline">MARKET INTELLIGENCE</span><span class="tag">${period}</span></div>
    <h2>How much<br>can we win?</h2><p class="lede">Separate the market’s direction from your company’s performance.</p>
    <div class="business-kpis">${kpi('annual-market-value','Year 01 addressable market',marketMoney(m.annual.value),`${units(m.annual.units)} machines · 3 product families`)}${kpi('current-unit-share','Your estimated unit share',share(m.current?.unitShare),m.current?`${monthName(m.current.month)} actual retail sales / modeled market`:'No completed month')}</div>
    <p class="business-caption">Scenario TAM at reference retail prices. A synthetic, scoped market—not the global CNH market or company revenue.</p>
    ${error ? warning(error) : ''}
    ${n ? `<div class="forecast-box business-outlook"><div class="forecast-top"><span class="overline">${monthName(n.month).toUpperCase()} OUTLOOK</span><span class="tag">Expected</span></div><div class="business-kpis">${kpi('next-market-change','Market units',change(n.marketChange),n.marketChange == null ? 'First scenario month' : `vs ${monthName(n.month - 1)} modeled market`)}${kpi('next-retail-change','Your retail sales',change(n.retailSalesChange),m.current ? `vs ${monthName(m.current.month)} actual` : 'No actual comparison yet')}</div><p class="forecast-note">${units(n.marketUnits)} machines across the market. Your plan is expected to sell <strong data-kpi="expected-retail-sales">${n.expectedRetailSales == null ? '—' : units(n.expectedRetailSales)}</strong>, for ${share(n.expectedUnitShare)} estimated unit share.</p></div>` : '<div class="info-callout">Campaign ended. Market size remains available for reviewing your final position; there is no next-month forecast.</div>'}
    ${m.products.map(p => `<div class="plant-card market-product" data-market-product="${p.id}"><div class="plant-card-top"><div><h3>${escape(p.name)}</h3><p>${escape(p.segment)}</p></div><span class="tag">${marketMoney(p.annualValue)} / yr</span></div><div class="plant-stats"><div><span>Actual share</span><strong>${share(p.current?.unitShare)}</strong></div><div><span>Next market</span><strong>${change(p.next?.marketChange)}</strong></div><div><span>Planned share</span><strong>${share(p.next?.expectedUnitShare)}</strong></div></div></div>`).join('')}
    <div class="panel-footer"><button class="primary-button wide" data-action="market-detail">Explore market & share<span>↗</span></button><button class="secondary-button" data-action="open-commercial">Adjust pricing & support</button></div>`;
}

function lineChart(points, label, valueLabel, unitLabel) {
  if (points.length < 2) return '';
  const width = 640, height = 190, left = 58, right = 20, top = 25, bottom = 35;
  const lower = Math.min(0, ...points.map(p => p.value));
  const upper = Math.max(1, ...points.map(p => p.value));
  const y = v => top + (upper - v) / (upper - lower) * (height - top - bottom);
  const x = i => left + i / (points.length - 1) * (width - left - right);
  const segments = points.map((p,i) => `${x(i)},${y(p.value)}`).join(' ');
  return `<figure class="business-chart"><figcaption>${escape(label)} <span>${escape(unitLabel)}</span></figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(label)}. Values are provided in the accompanying table."><title>${escape(label)}</title><line x1="${left}" y1="${y(0)}" x2="${width-right}" y2="${y(0)}" class="chart-baseline"/><text x="${left-8}" y="${y(upper)+4}" text-anchor="end">${valueLabel(upper)}</text><text x="${left-8}" y="${y(lower)+4}" text-anchor="end">${valueLabel(lower)}</text><polyline points="${segments}" class="chart-line"/>${points.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.value)}" r="4" class="${p.actual?'chart-actual':'chart-forecast'}"><title>${escape(p.label)}: ${valueLabel(p.value)}</title></circle><text x="${x(i)}" y="${height-12}" text-anchor="middle">${escape(p.label)}</text>`).join('')}</svg></figure>`;
}

export function marketDetailHTML(state, plan) {
  const { data:m, error }=marketData(state,plan);
  const n=m.next, c=m.current;
  const shareMovement = n?.expectedUnitShare != null && c ? n.expectedUnitShare - c.unitShare : null;
  return `<p class="business-intro">The addressable market is the customer demand available across the three equipment families in this scenario. Your share uses machines bought by customers, not shipments into dealer inventory.</p>
    <div class="business-kpis business-kpis-wide">${kpi('annual-market-value','Year 01 scenario TAM',marketMoney(m.annual.value),`${units(m.annual.units)} machines · reference retail value`)}${kpi('current-unit-share','Latest estimated unit share',share(c?.unitShare),c ? `${monthName(c.month)} actual / modeled market` : 'No completed month')}${kpi('next-market-change','Next market change',change(n?.marketChange),n?.marketChange != null ? `${monthName(n.month)} vs ${monthName(n.month-1)}` : n?'First scenario month':'Campaign ended')}${kpi('next-share-movement','Planned share movement',shareMovement == null?'—':`${shareMovement>=0?'+':'−'}${Math.abs(shareMovement*100).toFixed(1)} pp`,c&&n?`${monthName(n.month)} forecast vs ${monthName(c.month)} actual`:'Percentage points, not percent growth')}</div>
    ${error ? warning(error) : ''}
    ${lineChart(m.timeline.map(t=>({label:shortMonth(t.month),value:t.units})), 'The market through Year 01', units, 'Modeled machines / month')}
    <div class="subheading">${n?monthName(n.month).toUpperCase()+' EXPECTED POSITION':'FINAL POSITION'}</div>
    <p class="business-caption">Market growth compares modeled market units with the preceding month. Company demand and retail changes compare your next forecast with your latest actual result.</p>
    <div class="table-scroll"><table class="business-table"><thead><tr><th scope="col">Product</th><th scope="col">Market units</th><th scope="col">Market change</th><th scope="col">Your demand</th><th scope="col">Demand change</th><th scope="col">Retail forecast</th><th scope="col">Actual share</th><th scope="col">Planned share</th></tr></thead><tbody>${m.products.map(p=>`<tr data-market-product="${p.id}"><th scope="row">${escape(p.name)}</th><td>${p.next?units(p.next.marketUnits):p.current?units(p.current.marketUnits):'—'}</td><td>${change(p.next?.marketChange)}</td><td>${p.next?.expectedDemand==null?'—':units(p.next.expectedDemand)}</td><td>${change(p.next?.demandChange)}</td><td>${p.next?.expectedRetailSales==null?'—':units(p.next.expectedRetailSales)}</td><td>${share(p.current?.unitShare)}</td><td>${share(p.next?.expectedUnitShare)}</td></tr>`).join('')}</tbody></table></div>
    <div class="business-note"><strong>Market opportunity → customer demand → retail sales → cash</strong><p>Price, marketing, financing and product reputation affect your demand. Dealer availability limits actual retail sales. Factory shipments create wholesale revenue; collecting those invoices creates cash. These are different measures.</p></div>
    <details class="business-details" open><summary>Full-year market outlook</summary><div class="table-scroll"><table class="business-table" data-market-timeline><thead><tr><th scope="col">Month</th><th scope="col">Market units</th><th scope="col">Change</th><th scope="col">Reference value</th>${m.products.map(p=>`<th scope="col">${escape(p.name)}</th>`).join('')}</tr></thead><tbody>${m.timeline.map(t=>`<tr class="${t.month===n?.month?'highlight-row':''}"><th scope="row">${monthName(t.month)}${t.month===n?.month?' · next':''}</th><td>${units(t.units)}</td><td>${change(t.marketChange)}</td><td>${money(t.value)}</td>${t.products.map(p=>`<td>${units(p.units)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
    <details class="business-details"><summary>How this market is defined</summary><p>All market sizes are synthetic scenario assumptions. The annual total sums twelve seasonal months. Reference prices stay fixed, so changing your price does not enlarge the market value or denominator. Competition is an aggregate demand factor, not individual rival companies.</p><ul>${m.products.map(p=>`<li>${escape(p.name)}: ${share(p.baselineUnitShare)} baseline sizing assumption; $${units(p.referencePrice)}k reference retail price.</li>`).join('')}</ul><p>Baseline sizing shares are assumptions, not your measured share. Estimated actual share divides recorded retail sales by modeled market units. No prior actual is invented for the opening month.</p></details>`;
}

function financeData(state,plan,horizon=3) {
  const current=getFinancialPosition(state);
  try { return {current,projection:projectBusiness(state,plan,horizon)}; }
  catch(error) { return {current,error:error.message}; }
}
function minimumCash(state,projection) {
  return [{month:state.month,cash:state.cash},...(projection?.months||[]).map(m=>({month:m.month,cash:m.balanceSheet.cash}))].reduce((a,b)=>b.cash<a.cash?b:a);
}

export function financePanelHTML(state,plan) {
  const {current:c,projection:p,error}=financeData(state,plan);
  const next=p?.months[0];
  const low=minimumCash(state,p);
  return `<div class="eyebrow-row"><span class="overline">THE CFO’S DESK</span><span class="tag">${state.month?shortMonth(state.month)+' close':'Opening'}</span></div><h2>Look beyond<br>the next round.</h2><p class="lede">See what you own, what you owe, and where the current plan takes the business.</p>
    <div class="business-kpis">${kpi('current-cash','Cash now',money(c.cash),'Consolidated cash balance')}${kpi('current-equity','Equity now',money(c.equity),'Assets less liabilities')}${kpi('working-capital','Operating working capital',money(c.operatingWorkingCapital),'Receivables + inventory − payables')}${kpi('credit-headroom','Corporate credit available',money(c.corporateCreditHeadroom),'Undrawn facility · borrowing has a cost')}</div>
    ${error?warning(error):''}
    ${next?`<div class="forecast-box"><span class="overline">CURRENT PLAN · ${p.months.length} MONTH${p.months.length===1?'':'S'} AHEAD</span><div class="business-kpis">${kpi('next-cash',`${monthName(next.month)} closing cash`,money(next.balanceSheet.cash),`${cashDelta(next.report.cashFlow.cashChange)} during month`)}${kpi('projected-min-cash','Lowest cash in view',money(low.cash),`${monthName(low.month)} · includes current position`)}</div><p class="forecast-note">${monthName(next.month)} revenue: ${money(next.report.metrics.revenue)} · <strong data-kpi="next-revenue-change">${change(next.changes.revenue)}</strong> ${state.month?`vs ${monthName(state.month)} actual`:'· no prior actual yet'}.</p><p class="forecast-note">Operating policies repeat. Factory investment and borrowing apply once. Actual conditions will differ.</p></div>`:state.status!=='active'?'<div class="info-callout">Campaign ended. Review your final financial position and recorded statements.</div>':''}
    <div class="panel-footer"><button class="primary-button wide" data-action="financial-plan">Balance sheet & projections<span>↗</span></button><button class="secondary-button" data-action="unit-economics">Unit economics & break-even ↗</button><button class="secondary-button" data-action="statements">${state.month?'Latest actual statements':'Opening balance sheet'}</button><button class="text-button" data-action="open-plan">Change the operating plan ↗</button></div>`;
}

const balanceRows=[['cash','Cash'],['receivables','Trade receivables'],['inventory','Manufacturer inventory'],['fixedAssets','Net fixed assets'],['loanBook','Customer loan book'],['assets','Total assets'],['corporateDebt','Corporate debt'],['financeDebt','Customer-finance funding'],['payables','Trade payables'],['warrantyReserve','Warranty reserve'],['liabilities','Total liabilities'],['equity','Equity'],['liabilitiesAndEquity','Liabilities + equity']];
const incomeRows=[['wholesaleRevenue','Wholesale equipment revenue'],['loanInterestIncome','Financing interest income'],['revenue','Total revenue'],['cogs','Equipment cost of sales',-1],['operatingExpense','Operating expenses',-1],['depreciation','Depreciation',-1],['warrantyAccrual','Warranty provisions',-1],['warrantyShortfall','Warranty shortfall',-1],['creditLosses','Credit losses',-1],['operatingProfit','Operating profit'],['interestExpense','Interest expense',-1],['tax','Income tax',-1],['profit','Net profit']];
const cashRows=[['opening','Opening cash'],['operating','Operating cash flow'],['investing','Investing cash flow'],['financing','Financing cash flow'],['cashChange','Net cash movement'],['closing','Closing cash']];
function projectionTable(type,rows,state,projected) {
  const actual=state.history.at(-1);
  const columns=[...(actual?[{report:actual,actual:true}]:[]),...projected];
  return `<div class="table-scroll"><table class="business-table" data-projection-table="${type}"><thead><tr><th scope="col">USD millions</th>${columns.map(m=>`<th scope="col">${shortMonth(m.report.month)}<small>${m.actual?'Actual':'Forecast'}</small></th>`).join('')}</tr></thead><tbody>${rows.map(([key,label,sign=1])=>`<tr data-metric="${key}" class="${['revenue','profit','closing','cashChange'].includes(key)?'total-row':''}"><th scope="row">${label}</th>${columns.map(m=>`<td>${money(m.report[type==='income'?'income':'cashFlow'][key]*sign)}</td>`).join('')}</tr>`).join('')}${type==='income'?`<tr data-metric="revenue-change"><th scope="row">Revenue change vs prior month</th>${columns.map(m=>`<td>${m.actual?'—':change(m.changes.revenue)}</td>`).join('')}</tr>`:''}</tbody></table></div>`;
}

export function financeDetailHTML(state,plan,horizon=3) {
  const {current:c,projection:p,error}=financeData(state,plan,horizon);
  const projected=p?.months||[], next=projected[0], end=projected.at(-1), low=minimumCash(state,p);
  const currentLabel=state.month?`${monthName(state.month)} actual close`:'Opening position';
  const workingChange=next?next.position.operatingWorkingCapital-c.operatingWorkingCapital:null;
  return `<div class="business-toolbar"><div><p class="business-intro">What happens if you continue this operating policy?</p><p class="business-caption">Expected conditions; your saved campaign stays unchanged.</p></div><div class="tab-strip" role="group" aria-label="Projection horizon"><button data-horizon="3" class="${horizon===3?'active':''}" aria-pressed="${horizon===3}">Next 3 months</button><button data-horizon="12" class="${horizon===12?'active':''}" aria-pressed="${horizon===12}">To year-end</button></div></div>
    ${error?warning(error):''}${state.status!=='active'?'<div class="info-callout">Campaign ended. This is your final position; no additional months are projected.</div>':''}
    ${projected.length?`<div class="business-kpis business-kpis-wide">${kpi('projected-min-cash','Lowest cash in view',money(low.cash),`${monthName(low.month)} · includes current position`)}${kpi('ending-cash',`${monthName(end.month)} closing cash`,money(end.balanceSheet.cash),'Expected, not guaranteed')}${kpi('projected-profit','Projected period profit',money(projected.reduce((v,m)=>v+m.report.income.profit,0)),`${shortMonth(next.month)}–${shortMonth(end.month)} only`)}${kpi('ending-credit','Ending corporate credit',money(end.position.corporateCreditHeadroom),'Undrawn facility · separate from finance debt')}</div>
    ${lineChart([{label:state.month?shortMonth(state.month)+' actual':'Opening',value:c.cash,actual:true},...projected.map(m=>({label:shortMonth(m.month),value:m.balanceSheet.cash}))],'Projected cash path',v=>`$${Math.round(v)}`, 'USD millions · dashed = forecast')}
    <p class="business-caption">The current plan applies in ${monthName(next.month)}. Prices, output and recurring budgets repeat thereafter; new factory investment and corporate borrowing / repayment reset to zero. Existing projects still mature. Projection stops at year-end or financial distress.</p>
    ${p.warnings?.length?`<div class="business-warnings">${p.warnings.map(w=>`<div class="business-alert"><strong>${escape(w.title)}</strong><p>${escape(w.detail)}</p><p><strong>What to try:</strong> ${escape(w.action)}</p></div>`).join('')}</div>`:''}`:''}
    <div class="subheading">BALANCE SHEET · CURRENT VS NEXT MONTH</div><p class="business-caption">USD millions. Values are balances at a point in time; the change column is not itself a cash-flow statement.</p>
    <div class="table-scroll"><table class="business-table" data-balance-sheet><thead><tr><th scope="col">Financial position</th><th scope="col">${currentLabel}</th><th scope="col">${next?monthName(next.month)+' forecast':'No projection'}</th><th scope="col">Change</th></tr></thead><tbody>${balanceRows.map(([key,label])=>`<tr data-balance-key="${key}" class="${['assets','liabilities','equity','liabilitiesAndEquity'].includes(key)?'total-row':''}"><th scope="row">${label}</th><td>${money(c[key])}</td><td>${next?money(next.balanceSheet[key]):'—'}</td><td>${next?cashDelta(next.balanceSheet[key]-c[key]):'—'}</td></tr>`).join('')}</tbody></table></div>
    <div class="business-note"><strong>Working capital: where operating cash gets tied up</strong><p>Trade receivables ${money(c.receivables)} + manufacturer inventory ${money(c.inventory)} − trade payables ${money(c.payables)} = <strong>${money(c.operatingWorkingCapital)}</strong>. ${workingChange==null?'':`The next plan changes this by ${cashDelta(workingChange)}. ${workingChange>0?'More cash is tied up in these operating balances.':workingChange<0?'These operating balances release cash.':'These operating balances are unchanged.'}`} This is one contributor to cash movement; lending, investment, profit and other items also matter.</p><p>Dealer-owned inventory is excluded. Corporate debt is ${money(c.corporateDebt)}, with ${money(c.corporateCreditHeadroom)} of undrawn facility. Customer-finance funding is ${money(c.financeDebt)} against a ${money(c.loanBook)} loan book. Consolidated net debt is ${money(c.netDebt)}.</p></div>
    ${projected.length||state.month?`<details class="business-details" open><summary>Income statement · actual and projected</summary><p class="business-caption">Revenue growth compares the first forecast with the latest actual month, then each later forecast with the preceding projection. No growth is calculated without a positive prior revenue base.</p>${projectionTable('income',incomeRows,state,projected)}</details><details class="business-details" open><summary>Cash flow · actual and projected</summary>${projectionTable('cash',cashRows,state,projected)}</details>`:''}
    ${next?`<details class="business-details"><summary>Explain ${monthName(next.month)} cash movement</summary><p>Opening cash ${money(next.report.cashFlow.opening)} ${next.report.cashFlow.cashChange>=0?'+':'−'} net movement ${money(Math.abs(next.report.cashFlow.cashChange))} = closing cash ${money(next.report.cashFlow.closing)}.</p><div class="business-bridge">${next.cashBridge.map(d=>`<div><span>${escape(d.label)}</span><strong>${cashDelta(d.value)}</strong><p>${escape(d.detail)}</p></div>`).join('')}</div></details>`:''}
    <p class="business-caption">Rounding may affect displayed totals. Illustrative scenario accounting, not a CNH forecast. Projection months are never committed as actual results.</p>`;
}
