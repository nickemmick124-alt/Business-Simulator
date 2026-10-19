import { PRODUCTS, PLAN_FIELDS, MODEL_VERSION, createInitialState, defaultPlan, validatePlan, forecast, advanceMonth, getCampaignOutcome, getMarketOutlook, balanceSheet } from './simulation.js';
import { World } from './world.js';
import { loadGame, saveGame, clearGame, exportSave, parseSave } from './persistence.js';
import { marketPanelHTML, marketDetailHTML, financePanelHTML, financeDetailHTML } from './strategy-views.js';
import { economicsHTML, coachingSummaryHTML, coachingDetailHTML, climateHTML } from './learning-views.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (value, digits = 1) => `${value < 0 ? '−' : ''}$${Math.abs(Number(value) || 0).toFixed(digits)}m`;
const units = value => Math.round(Number(value) || 0).toLocaleString('en-US');
const percent = value => `${Math.round((Number(value) || 0) * 100)}%`;
const signed = value => `${value >= 0 ? '+' : '−'}$${Math.abs(Number(value) || 0).toFixed(1)}m`;
const sum = values => values.reduce((a,b) => a + b, 0);
const clone = value => JSON.parse(JSON.stringify(value));
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const shortMonths = months.map(m => m.slice(0,3));
const paths = {
  home:'<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>',
  plan:'<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="19" r="2"/>',
  factory:'<path d="M3 21V9l6 3V7l6 5V3h4v18zM6 17h2m3 0h2m3 0h2"/>',
  reports:'<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h3m-3 3h8"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/>',
  cash:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
  chart:'<path d="M3 3v18h18M7 16l4-5 4 2 5-7"/>',
  box:'<path d="m3 7 9-4 9 4v10l-9 4-9-4zm0 0 9 5 9-5M12 12v9M8 5l9 5"/>',
  truck:'<path d="M3 6h11v12H3zM14 10h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
  alert:'<path d="m12 3 10 18H2zM12 9v5M12 17h.01"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  leaf:'<path d="M20 3C8 2 3 6 4 13c1 7 13 8 16-10ZM4 21 16 8"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5z"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.chart}</svg>`;
const defaultSettings = { reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, muted:true, viewMode:'orbit' };
function randomSeed() {
  if(globalThis.crypto?.getRandomValues)return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random()*4294967296);
}
let state = createInitialState(randomSeed(),{marketRegime:'random'});
let plan = defaultPlan(state);
let settings = { ...defaultSettings };
let drafts = initialDrafts(plan);
let activeDraft = 'inherited';
let tab = 'briefing';
let planGroup = 'Commercial';
let location = 'headquarters';
let world;
let forecastResult;
let busy = false;
let canAutosave = true;
let toastTimer;
let lastFocused;
let modalMode = '';
let projectionHorizon = 3;
let coachingMonth = null;
const loaded = loadGame();
if (loaded.ok && !loaded.empty) {
  state = loaded.data.state; plan = loaded.data.plan; drafts = loaded.data.drafts;
  settings = {...defaultSettings,...loaded.data.settings}; activeDraft = drafts[0]?.id || '';
} else if (!loaded.ok) {
  canAutosave = false;
  setTimeout(() => toast(`Your saved campaign could not be loaded. Autosave is paused. ${loaded.error}`, 9000), 700);
}

function initialDrafts(base) {
  const resilient = demandLedPlan({...base,partsBuffer:5,capex:0,debtChange:0});
  const margin={...base,partsBuffer:5,quality:1.3,maintenance:1,training:.8,capex:0,debtChange:0};
  for(const p of PRODUCTS)margin[`${p.id}Price`]=Math.round(p.basePrice*1.03);
  return [{id:'inherited',name:'Inherited operating plan',plan:{...base}},{id:'resilience',name:'Protect cash & delivery',plan:resilient},{id:'margin',name:'Margin & working capital',plan:demandLedPlan(margin)}];
}
function demandLedPlan(base) {
  const result={...base};
  try {
    const expected=forecast(state,result);
    for(const product of expected.report.products){
      const opening=state.products[product.id];
      const field=PLAN_FIELDS.find(f=>f.key===`${product.id}Production`);
      result[field.key]=Math.min(field.max,Math.max(0,Math.ceil((product.dealerOrders+product.expectedDemand*.15-opening.finishedGoods-Math.min(opening.rework,5))/.96)));
    }
  }catch{/* Keep the existing plan editable if a one-time funding choice is invalid. */}
  return result;
}
function persist() {
  if (!canAutosave) { $('#save-indicator').textContent = 'Autosave paused · open Settings'; return; }
  const saved = saveGame({state,plan,drafts,settings});
  $('#save-indicator').textContent = saved.ok ? 'Saved on this device' : 'Autosave unavailable · export your campaign';
  if (!saved.ok) toast(saved.error, 6500);
}
function toast(message, duration = 3500) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}
function setTab(next) {
  tab = next; renderNav(); renderPanel();
  if (next === 'operations') setLocation('factory');
  if (next === 'plan') setLocation('headquarters');
}
function setLocation(next) {
  location = next; world?.setLocation(next); renderLocation();
  $('#inspect-card').classList.add('hidden');
}
function renderLocation() {
  $$('[data-location]').forEach(b => b.classList.toggle('active', b.dataset.location === location));
  $('#location-title').textContent = location === 'factory' ? 'The factory floor' : 'Headquarters';
  $('#location-eyebrow').textContent = location === 'factory' ? 'WHERE STRATEGY BECOMES REAL' : 'THE EXECUTIVE CAMPUS';
  $('#location-caption').textContent = location === 'factory' ? 'Every machine has a story. Follow the flow.' : 'A new perspective on the whole business.';
}
function renderNav() {
  const sections = [['briefing','home','Briefing'],['plan','plan','Decisions'],['operations','factory','Operations'],['markets','globe','Markets'],['finance','cash','Finance'],['reports','reports','Results']];
  $('#main-nav').innerHTML = sections.map(([id,img,label]) => `<button class="rail-button ${tab===id?'active':''}" data-tab="${id}" aria-label="${label}" ${tab===id?'aria-current="page"':''}>${icon(img)}<span>${label}</span></button>`).join('');
}
function renderHeader() {
  const complete = state.status !== 'active';
  $('#round-badge').innerHTML = `<span>${complete?(state.status==='distressed'?'MANDATE ENDED':'YEAR COMPLETE'):`ROUND ${String(state.month+1).padStart(2,'0')} / 12`}</span><strong>${complete?'BOARD REVIEW':months[state.month].toUpperCase()}</strong>`;
  $('#advance-button').innerHTML = complete ? 'Board review <span>↗</span>' : 'Advance month <span>↗</span>';
  $('#company-status').textContent = state.cash < 20 ? 'CASH NEEDS YOUR ATTENTION' : state.month ? 'THE BUSINESS IS IN YOUR HANDS.' : 'YOUR COMPANY. YOUR CALL.';
}
function metrics() { return state.history.at(-1)?.metrics; }
function renderMetrics() {
  const m = metrics();
  const dealerUnits = sum(PRODUCTS.map(p => state.products[p.id].dealerStock));
  const quality = m?.qualityRate ?? sum(PRODUCTS.map(p=>state.products[p.id].quality))/PRODUCTS.length;
  const data = [
    ['cash','Cash available',money(state.cash),m?`${signed(m.cashChange)} this month`:'Your operating runway',m?.cashChange],
    ['chart','Net profit',m?money(m.profit):'—',m?'After interest & tax':'First result after January',m?.profit],
    ['box','Dealer inventory',`${units(dealerUnits)} <small>units</small>`,'Independent dealer stock'],
    ['truck','Dealer delivery',m?percent(m.serviceLevel):'—','Units shipped / dealer orders'],
    ['shield','First-pass quality',percent(quality),'Accepted without rework'],
  ];
  $('#metrics-bar').innerHTML = data.map(([img,label,value,trend,change])=>`<div class="metric"><div class="metric-label">${icon(img)}${label}</div><div class="metric-value">${value}</div><div class="metric-trend ${typeof change==='number'?(change<0?'negative':'positive'):''}">${trend}</div></div>`).join('');
}
function renderPanel() {
  const contents = {briefing:renderBriefing,plan:renderPlan,operations:renderOperations,reports:renderReports,markets:renderMarkets,finance:()=>financePanelHTML(state,plan)};
  $('#command-panel').innerHTML = `<div class="panel-inner">${contents[tab]()}</div>`;
  if (tab === 'plan') refreshForecast();
}
function renderBriefing() {
  const outlook = getMarketOutlook(state);
  const last = state.history.at(-1);
  const complete = state.status !== 'active';
  const result = complete ? getCampaignOutcome(state) : null;
  const headline = complete ? result.title : state.month === 0 ? 'A new season.<br>A difficult call.' : state.month < 3 ? 'Find the balance.<br>Protect the business.' : state.month < 8 ? 'Build on what<br>you have learned.' : 'Finish strong.<br>Think beyond December.';
  return `<div class="eyebrow-row"><span class="overline">${complete?'THE BOARD’S VERDICT':'YOUR MONTHLY BRIEFING'}</span><span class="tag live">${complete?'Year 01':`${shortMonths[state.month]} · Year 01`}</span></div>
    <h2>${headline}</h2><p class="lede">${complete?escape(result.summary):'The whole company is in your hands. Make the plan, explore the operation, and follow the consequences.'}</p>
    ${climateHTML(state)}<div class="mandate"><strong>Your board mandate</strong>Protect cash. Restore dependable delivery. Build a business that is stronger at year-end.</div>
    <div class="business-entry"><button data-action="open-markets">${icon('globe')}<span>Understand the market<small>Market size, your share & demand outlook</small></span><b>↗</b></button><button data-action="open-finance">${icon('cash')}<span>Read the financial position<small>Balance sheet, cash & forward projections</small></span><b>↗</b></button></div>
    ${complete?`<div class="completion"><span class="overline">BOARD SCORE</span><h3>${result.score}<small> / 100</small></h3><p>${escape(result.explanation)}</p></div>`:`
    <div class="section-rule"></div><span class="overline">ON YOUR DESK</span>
    <div class="brief-event"><div class="event-icon warning">${icon('alert')}</div><div><h3>${state.month<2?'A critical component is running late':'Know what the market can absorb'}</h3><p>${escape(outlook.summary)}</p><button data-action="inspect-supply">Visit the operation ↗</button></div></div>
    <div class="brief-event"><div class="event-icon">${icon('box')}</div><div><h3>${state.month===0?'The channel already holds inventory':`${units(sum(PRODUCTS.map(p=>state.products[p.id].dealerStock)))} machines are with dealers`}</h3><p>Factory shipments and customer purchases are different events. More output can tie up cash before it creates a sale.</p></div></div>
    <div class="brief-event"><div class="event-icon">${icon('leaf')}</div><div><h3>${last?`${money(last.metrics.profit)} net profit last month`:'Construction offers a different opportunity'}</h3><p>${last?`Cash moved ${signed(last.metrics.cashChange)}. Review what changed before you commit again.`:'Balance the agricultural cycle with loader demand, dealer support, and reliable equipment.'}</p>${last?'<button data-action="last-report">Read the monthly result ↗</button>':''}</div></div>
    <div class="adviser"><div class="avatar">CF</div><div><span class="overline">A WORD FROM YOUR CFO</span><p>${state.cash<20?'Cash is tight. Compare a lower-output plan, reduce discretionary investment, or consider the cost of additional borrowing.':'A healthy order book does not pay the bills by itself. Watch inventory and cash collection as closely as profit.'}</p></div></div>`}
    <div class="panel-footer"><button class="primary-button wide" data-action="${complete?'outcome':'open-plan'}">${complete?'Review your first year':'Build this month’s plan'}<span>↗</span></button><button class="secondary-button" data-location="factory">${icon('factory')} Explore the factory</button><p class="panel-footnote">Independent strategy simulation · Illustrative business data</p></div>`;
}
function renderPlan() {
  if (state.status !== 'active') return `<span class="overline">CAMPAIGN COMPLETE</span><h2 style="margin-top:12px">Your year,<br>in perspective.</h2><p class="lede">This campaign has ended. Review the results or begin a new mandate.</p><div class="panel-footer"><button class="primary-button" data-action="outcome">Review the year ↗</button><button class="secondary-button" data-action="restart">Start a new campaign</button></div>`;
  const groups = [...new Set(PLAN_FIELDS.map(f=>f.group))];
  const fieldHTML = PLAN_FIELDS.filter(f=>f.group===planGroup).map(f=>`<div class="decision-field"><div class="field-title"><label for="field-${f.key}">${escape(f.label)}</label><span>${escape(f.unit)}</span></div><div class="field-input-row"><input type="range" data-field="${f.key}" aria-label="${escape(f.label)} slider" min="${f.min}" max="${f.max}" step="${f.step}" value="${plan[f.key]}"><div class="number-wrap"><input id="field-${f.key}" data-field="${f.key}" type="number" min="${f.min}" max="${f.max}" step="${f.step}" value="${plan[f.key]}" aria-describedby="help-${f.key}"></div></div><p id="help-${f.key}" class="field-help">${escape(f.help)}</p></div>`).join('');
  return `<div class="eyebrow-row"><span class="overline">THE DECISION ROOM</span><span class="tag">${shortMonths[state.month]} PLAN</span></div><div class="panel-title-row"><h2>Make your move.</h2><button class="mini-button" data-action="compare">Compare ↗</button></div><p class="lede">Set the numbers. Test the tradeoffs.<br>Nothing advances until you commit the round.</p>
    <button class="secondary-button economics-entry" data-action="unit-economics">Unit economics & break-even ↗</button><div class="draft-row"><select id="draft-select" aria-label="Saved plan"><option value="">Current working plan</option>${drafts.map(d=>`<option value="${escape(d.id)}" ${activeDraft===d.id?'selected':''}>${escape(d.name)}</option>`).join('')}</select><button class="mini-button" data-action="save-draft">Save as…</button></div>
    <div class="tab-strip" role="group" aria-label="Decision categories">${groups.map(g=>`<button data-plan-group="${g}" class="${planGroup===g?'active':''}">${g==='Investment'?'Invest':g==='Commercial'?'Market':g==='Production'?'Output':g==='Operations'?'People & plant':'Finance'}</button>`).join('')}</div>
    ${fieldHTML}${planGroup==='Production'?'<button class="secondary-button" data-action="demand-led">Suggest demand-led targets</button><p class="field-help">Uses expected dealer orders and existing stock to target a small finished-goods buffer. Review the forecast before committing.</p>':''}<div id="plan-errors" class="error-text" role="alert"></div><div id="forecast-panel"></div><div class="plan-actions"><button class="secondary-button" data-action="compare">Compare plans</button><button class="primary-button red" data-action="commit-preview">Commit round ↗</button></div><p class="panel-footnote" style="margin-top:12px">Forecasts use expected conditions. Actual results will vary.</p>`;
}
function computeForecast() {
  if(state.status!=='active') return null;
  const checked=validatePlan(plan,state);
  if(!checked.valid) return {error:checked.errors.join(' ')};
  try { return forecast(state,plan); } catch(err) {return {error:err.message};}
}
function refreshForecast() {
  forecastResult = computeForecast();
  const target = $('#forecast-panel'); if(!target) return;
  $('#plan-errors').textContent = forecastResult?.error || '';
  if(!forecastResult || forecastResult.error){target.innerHTML='';return;}
  const m=forecastResult.report.metrics;
  target.innerHTML=`<div class="forecast-box"><div class="forecast-top"><span class="overline">PROJECTED MONTH-END</span><span class="tag">Forecast</span></div><div class="forecast-grid"><div><span>Cash</span><strong class="${forecastResult.state.cash<20?'negative':''}">${money(forecastResult.state.cash)}</strong></div><div><span>Net profit</span><strong class="${m.profit<0?'negative':''}">${money(m.profit)}</strong></div><div><span>Delivery</span><strong>${percent(m.serviceLevel)}</strong></div></div><p class="forecast-note">${m.cashChange < -10 ? `Cash is projected to fall ${money(Math.abs(m.cashChange))}. Inspect inventory and lending before committing.` : 'Expected demand and supplier performance. Market surprises and execution will affect the actual result.'}</p><button class="text-button" data-action="financial-plan">See balance sheet & longer projections ↗</button></div>`;
}
function renderOperations() {
  const last=state.history.at(-1);
  return `<div class="eyebrow-row"><span class="overline">OPERATIONS ROOM</span><span class="tag">${last?'Month '+state.month:'Opening position'}</span></div><h2>Follow the flow.</h2><p class="lede">A missing controller can hold a nearly finished machine. Inspect the work, then connect it to the numbers.</p>
  ${PRODUCTS.map(p=>{const s=state.products[p.id];const r=last?.products.find(x=>x.id===p.id);return `<div class="plant-card"><div class="plant-card-top"><div><h3>${p.name}</h3><p>${p.segment}</p></div><span class="badge-dot" style="background:${p.color}"></span></div><div class="plant-stats"><div><span>Awaiting parts</span><strong>${units(s.incomplete)}</strong></div><div><span>Ready to ship</span><strong>${units(s.finishedGoods)}</strong></div><div><span>Rework</span><strong>${units(s.rework)}</strong></div></div><div class="progress-track"><div class="progress-fill" style="width:${Math.round(s.quality*100)}%"></div></div><p>${percent(s.quality)} first-pass capability · ${units(s.controllers)} controllers available</p><button data-focus="${s.incomplete?'supply':'assembly'}">Inspect the ${s.incomplete?'shortage':'assembly line'} ↗</button></div>`;}).join('')}
  <div class="adviser"><div class="avatar">OP</div><div><span class="overline">YOUR OPERATIONS LEADER</span><p>Scheduling more units cannot clear a parts constraint. Stock buffers, supplier development and a feasible product mix work together.</p></div></div><div class="panel-footer"><button class="primary-button wide" data-action="open-plan">Adjust the operating plan<span>↗</span></button></div>`;
}
function renderReports() {
  const last=state.history.at(-1);
  return `<div class="eyebrow-row"><span class="overline">YOUR PERFORMANCE</span><span class="tag">YEAR 01</span></div><h2>Every result<br>has a reason.</h2><p class="lede">Compare your expectations with what happened. Follow cash, output and delivery back to the operation.</p>
  ${last?`<div class="section-rule"></div><div class="plant-stats"><div><span>Year-to-date profit</span><strong>${money(sum(state.history.map(r=>r.metrics.profit)))}</strong></div><div><span>Cash movement</span><strong>${signed(sum(state.history.map(r=>r.metrics.cashChange)))}</strong></div><div><span>Machines shipped</span><strong>${units(sum(state.history.map(r=>r.metrics.deliveries)))}</strong></div></div><div class="section-rule"></div><span class="overline">ROUND HISTORY</span>${[...state.history].reverse().map(r=>`<div class="history-row"><button data-report="${r.month}">${months[r.month-1]}<span>${units(r.metrics.production)} built · ${percent(r.metrics.serviceLevel)} delivered</span></button><div class="history-outcome"><strong class="${r.metrics.profit<0?'negative':'positive'}">${money(r.metrics.profit)}</strong><button data-coaching-month="${r.month}">Coach ↗</button></div></div>`).join('')}<div class="panel-footer"><button class="primary-button wide" data-action="last-report">Open latest review<span>↗</span></button><button class="secondary-button" data-action="statements">View financial statements</button></div>`:`<div class="empty-state">${icon('reports')}<p style="margin:12px 0">Your first report arrives when you commit January’s plan.</p><button class="secondary-button" data-action="open-plan">Build your first plan</button><button class="secondary-button" data-action="statements">View opening balance sheet</button></div>`}
  <div class="panel-footer"><button class="text-button" data-action="scoring">How the board evaluates your year</button></div>`;
}
function renderMarkets() { return climateHTML(state)+marketPanelHTML(state,plan); }
function showUnitEconomics(month=null) {
  showModal('What does a sale really earn?','UNIT ECONOMICS & BREAK-EVEN',economicsHTML(state,plan,month),'<span>Per-machine costs in $000 · company totals in $m</span><button class="primary-button" data-action="back-to-plan">Review the plan ↗</button>','economics');
}
function showCoaching(month,alternative=null) {
  coachingMonth=month;
  showModal(`${months[month-1]}: learn from the decision.`,'MONTHLY BUSINESS COACH',coachingDetailHTML(state,month,alternative),`<button class="secondary-button" data-report="${month}">Back to monthly result</button><button class="primary-button" data-action="back-to-plan">Plan the next decision ↗</button>`,'coaching');
}
function showMarketDetail() {
  showModal('The market behind your plan.','MARKET INTELLIGENCE',marketDetailHTML(state,plan),'<span>Illustrative market assumptions · Year 01</span><button class="primary-button" data-action="open-commercial">Review pricing & support ↗</button>','markets');
}
function showFinancialPlan() {
  showModal('The business, projected.','FINANCIAL PLANNING',financeDetailHTML(state,plan,projectionHorizon),'<span>USD millions · Expected conditions</span><button class="primary-button" data-action="back-to-plan">Return to decisions ↗</button>','financial-plan');
}
function updateWorld() {
  const m=metrics();
  world?.setState({month:Math.min(12,state.month+1),cash:state.cash,production:m?.production||0,inventory:sum(PRODUCTS.map(p=>state.products[p.id].finishedGoods)),shortage:sum(PRODUCTS.map(p=>state.products[p.id].incomplete)),quality:(m?.qualityRate??.956)*100,serviceLevel:(m?.serviceLevel??0)*100,products:PRODUCTS.map(p=>({id:p.id,name:p.name,wip:state.products[p.id].incomplete,finishedGoods:state.products[p.id].finishedGoods,completed:state.history.at(-1)?.products.find(x=>x.id===p.id)?.production||0,capacity:p.capacity,shortage:state.products[p.id].incomplete}))});
}
function renderAll() { renderNav();renderHeader();renderPanel();renderMetrics();renderLocation();updateWorld();applySettings(); }
function applySettings() {
  document.body.classList.toggle('reduce-motion',settings.reducedMotion);
  world?.setPaused(settings.reducedMotion);
  world?.setViewMode(settings.viewMode);
  $$('[data-action="camera-orbit"],[data-action="camera-walk"]').forEach(b=>b.classList.toggle('active',b.dataset.action===`camera-${settings.viewMode}`));
  $('#scene-hint').textContent = settings.viewMode==='walk'?'W A S D TO MOVE · DRAG TO LOOK · ESC TO EXIT WALK':'DRAG TO EXPLORE · SCROLL TO ZOOM · SELECT A WORK AREA';
}
function showInspection(data) {
  $('#inspect-card').innerHTML=`<button class="close-small" data-action="close-inspect" aria-label="Close inspection">×</button><span class="overline">${escape(data.subtitle||'OPERATING DETAIL')}</span><h3>${escape(data.title)}</h3><p>${escape(data.description)}</p><div class="inspect-stats">${(data.metrics||[]).map(m=>`<div><span>${escape(m.label)}</span><strong>${escape(m.value)}</strong></div>`).join('')}</div>`;
  $('#inspect-card').classList.remove('hidden');
}
function showModal(title,eyebrow,body,footer='',mode='') {
  const modal=$('#modal');if(!modal.open)lastFocused=document.activeElement;modalMode=mode;
  $('#modal-content').innerHTML=`<div class="modal-header"><div><span class="overline">${escape(eyebrow)}</span><h2>${escape(title)}</h2></div><button class="modal-close" data-action="close-modal" aria-label="Close dialog">×</button></div><div class="modal-body">${body}</div>${footer?`<div class="modal-footer">${footer}</div>`:''}`;
  modal.setAttribute('aria-label',title);
  if(!modal.open)modal.showModal();
}
function closeModal() { $('#modal').close();modalMode='';lastFocused?.focus?.(); }
function showCommit() {
  if(busy)return;
  if(state.status!=='active'){showOutcome();return;}
  forecastResult=computeForecast();
  if(forecastResult?.error){setTab('plan');toast(forecastResult.error,6500);return;}
  const r=forecastResult.report;
  showModal(`Commit your ${months[state.month]} plan?`,'THE NEXT ROUND',`<p>Your decisions will advance the company by one month. Supplier performance, customer demand and execution can differ from this forecast.</p><div class="commit-summary"><div class="review-stat"><span>Projected ending cash</span><strong class="${forecastResult.state.cash<20?'negative':''}">${money(forecastResult.state.cash)}</strong><small>${signed(r.metrics.cashChange)} change</small></div><div class="review-stat"><span>Projected net profit</span><strong>${money(r.metrics.profit)}</strong><small>After interest & tax</small></div><div class="review-stat"><span>Projected delivery</span><strong>${percent(r.metrics.serviceLevel)}</strong><small>${units(r.metrics.deliveries)} units to dealers</small></div></div><div class="info-callout">${r.metrics.cashChange < -10 ? 'This plan uses significant cash. The current production mix, dealer demand and financing commitments deserve a second look.' : 'The selected plan and its forecast are recorded with the round. You can review what changed and why after it resolves.'}</div>`,'<button class="secondary-button" data-action="back-to-plan">Keep planning</button><button class="primary-button red" data-action="commit">Commit & advance ↗</button>','commit');
}
async function commitRound() {
  if(busy || state.status!=='active') return;
  const checked=validatePlan(plan,state);if(!checked.valid){toast(checked.errors.join(' '));return;}
  const predicted=computeForecast();if(predicted?.error){toast(predicted.error);return;}
  busy=true;closeModal();document.body.classList.add('resolving');$('#advance-button').disabled=true;
  toast(`Resolving ${months[state.month]}…`,1000);
  try {
    const result=advanceMonth(state,plan);
    result.report.planningForecast=clone(predicted.report.metrics);
    result.state.history[result.state.history.length-1].planningForecast=clone(predicted.report.metrics);
    await new Promise(resolve=>setTimeout(resolve,settings.reducedMotion?0:650));
    state=result.state;plan=defaultPlan(state);activeDraft='';tab='reports';persist();renderAll();showReport(state.month);
  }catch(error){toast(`The round could not be committed: ${error.message}`,7000);}
  finally{busy=false;document.body.classList.remove('resolving');$('#advance-button').disabled=false;}
}
function showReport(month) {
  const r=state.history.find(x=>x.month===Number(month));if(!r)return;
  const f=r.planningForecast;
  const maxDriver=Math.max(1,...r.drivers.map(x=>Math.abs(x.value)));
  const title=`${months[r.month-1]}, in perspective.`;
  showModal(title,`ROUND ${String(r.month).padStart(2,'0')} COMPLETE`,`${state.status!=='active'&&month===state.month?`<div class="completion"><span class="overline">YOUR MANDATE HAS ENDED</span><h3>${escape(getCampaignOutcome(state).title)}</h3><p>${escape(getCampaignOutcome(state).summary)}</p></div>`:''}
  ${coachingSummaryHTML(state,month)}<button class="text-button" data-economics-month="${month}">Understand this month’s unit economics ↗</button><div class="review-hero">${[['Net profit',money(r.metrics.profit),f?`Forecast ${money(f.profit)}`:'After interest & tax'],['Cash change',signed(r.metrics.cashChange),f?`Forecast ${signed(f.cashChange)}`:'Operating, investing & financing'],['Dealer delivery',percent(r.metrics.serviceLevel),f?`Forecast ${percent(f.serviceLevel)}`:'Units shipped / orders'],['Machines built',units(r.metrics.production),f?`Forecast ${units(f.production)}`:'Good units completed']].map(([label,value,note])=>`<div class="review-stat"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('')}</div>
  <div class="review-columns"><div><div class="subheading">WHAT CHANGED IN THE BUSINESS</div>${r.events.map(ev=>`<div class="review-event"><h3>${escape(ev.title)}</h3><p>${escape(ev.detail)}</p><button data-review-focus="${ev.location==='headquarters'?'boardroom':ev.location==='quality'?'quality':ev.location==='yard'?'dispatch':'supply'}">Follow this into the operation ↗</button></div>`).join('')}</div><div><div class="subheading">FOLLOW THE CASH</div>${r.drivers.map(d=>`<div class="driver ${d.value<0?'negative':''}"><div class="driver-top"><span>${escape(d.label)}</span><span class="driver-value ${d.value<0?'negative':'positive'}">${signed(d.value)}</span></div><div class="progress-track"><div class="progress-fill" style="width:${Math.max(1,Math.abs(d.value)/maxDriver*100)}%"></div></div><p class="driver-note">${escape(d.detail)}</p></div>`).join('')}</div></div>
  <div class="subheading table-label">THE FACTORY AND THE CHANNEL</div><div class="table-scroll"><table data-report-production><thead><tr><th>Product</th><th>Planned</th><th>Completed</th><th>Shipped</th><th>Retail sales</th><th>Delivery</th></tr></thead><tbody>${r.products.map(p=>`<tr><td>${escape(PRODUCTS.find(x=>x.id===p.id)?.name||p.name)}</td><td>${units(p.target)}</td><td>${units(p.production)}</td><td>${units(p.deliveries)}</td><td>${units(p.retailSales)}</td><td>${percent(p.serviceLevel)}</td></tr>`).join('')}</tbody></table></div>` ,`<span>Actual results · Money in USD millions</span><button class="primary-button" data-action="${state.status==='active'?'next-plan':'outcome'}">${state.status==='active'?'Plan the next month':'Review your first year'} ↗</button>`,'report');
}
function showCompare() {
  if(state.status!=='active'){showOutcome();return;}
  const candidates=[{name:'Current working plan',plan},...drafts.slice(0,8)];
  const results=candidates.map(d=>{try{return {...d,result:forecast(state,d.plan)};}catch(error){return {...d,error:error.message};}});
  const rows=[['Month-end cash',r=>money(r.state.cash)],['Net profit',r=>money(r.report.metrics.profit)],['Cash change',r=>signed(r.report.metrics.cashChange)],['Dealer delivery',r=>percent(r.report.metrics.serviceLevel)],['Machines built',r=>units(r.report.metrics.production)],['Dealer stock',r=>units(r.report.metrics.dealerInventory)],['Ending debt',r=>money(r.state.debt)]];
  showModal('Choose the tradeoff.','PLAN COMPARISON',`<p>Compare plans under the same expected conditions. These are projections, not guaranteed outcomes.</p><div class="table-scroll" style="margin-top:20px"><table class="comparison-table"><thead><tr><th>Projected result</th>${results.map(d=>`<th>${escape(d.name)}</th>`).join('')}</tr></thead><tbody>${rows.map(([label,fn])=>`<tr><td>${label}</td>${results.map(d=>`<td>${d.error?'Unavailable':fn(d.result)}</td>`).join('')}</tr>`).join('')}<tr><td>Use this plan</td><td>Working plan</td>${results.slice(1).map((d,i)=>`<td>${d.error?`<span class="negative">${escape(d.error)}</span>`:`<button class="secondary-button" data-use-draft="${escape(drafts[i].id)}">Load plan</button>`}</td>`).join('')}</tr></tbody></table></div><div class="info-callout" style="margin-top:22px">A plan that maximizes production may consume cash or overstock dealers. A plan that minimizes spending can erode quality and future capability. The board considers the condition of the business at year-end.</div>`,'<span>Forecasts hold external assumptions constant.</span><button class="primary-button" data-action="back-to-plan">Return to decisions ↗</button>','compare');
}
function showStatements() {
  const r=state.history.at(-1);if(!r){showFinancialPlan();return;}
  const statement=(title,rows)=>`<div><div class="subheading">${title}</div><table><tbody>${rows.map(([label,value])=>`<tr><td>${label}</td><td>${money(value)}</td></tr>`).join('')}</tbody></table></div>`;
  showModal(`${months[r.month-1]} financial statements`,'THE CFO’S REPORT',`<div class="review-columns">${statement('INCOME STATEMENT',[['Wholesale equipment revenue',r.income.wholesaleRevenue],['Financing interest income',r.income.loanInterestIncome],['Total revenue',r.income.revenue],['Equipment cost of sales',-r.income.cogs],['Operating expenses',-r.income.operatingExpense],['Depreciation',-r.income.depreciation],['Warranty provisions',-r.income.warrantyAccrual],['Warranty shortfall',-r.income.warrantyShortfall],['Credit losses',-r.income.creditLosses],['Operating profit',r.income.operatingProfit],['Interest expense',-r.income.interestExpense],['Income tax',-r.income.tax],['Net profit',r.income.profit]])}${statement('BALANCE SHEET',[['Cash',r.balanceSheet.cash],['Trade receivables',r.balanceSheet.receivables],['Manufacturer inventory',r.balanceSheet.inventory],['Net fixed assets',r.balanceSheet.fixedAssets],['Customer loan book',r.balanceSheet.loanBook],['Total assets',r.balanceSheet.assets],['Corporate debt',r.balanceSheet.corporateDebt],['Finance funding',r.balanceSheet.financeDebt],['Trade payables',r.balanceSheet.payables],['Warranty reserve',r.balanceSheet.warrantyReserve],['Equity',r.balanceSheet.equity],['Liabilities + equity',r.balanceSheet.liabilitiesAndEquity]])}</div><div class="review-columns" style="margin-top:26px">${statement('CASH FLOW',[['Opening cash',r.cashFlow.opening],['Operating cash flow',r.cashFlow.operating],['Investing cash flow',r.cashFlow.investing],['Financing cash flow',r.cashFlow.financing],['Net cash movement',r.cashFlow.cashChange],['Closing cash',r.cashFlow.closing]])}<div class="info-callout">Dealer inventory belongs to independent dealers after qualifying wholesale sales. It is tracked operationally, not counted in manufacturer inventory. Customer loan principal repayments reduce the loan asset; only interest is income. This is a simplified educational model.</div></div>`,'<span>USD millions · Rounding may affect displayed totals.</span><button class="secondary-button" data-action="last-report">Return to monthly review</button>','statements');
}
function showOutcome() {
  const outcome=getCampaignOutcome(state);
  showModal(outcome.complete?'Your first year, evaluated.':'What success looks like.','THE BOARD’S SCORECARD',`${outcome.complete?`<div class="completion"><span class="overline">${outcome.score} / 100</span><h3>${escape(outcome.title)}</h3><p>${escape(outcome.summary)}</p></div>`:'<p>The board evaluates what you leave behind: company value, dependable delivery, quality, and the capability to compete next year.</p>'}<div style="margin-top:20px">${outcome.components.map(c=>`<div class="driver"><div class="driver-top"><span>${escape(c.label)}</span><strong>${outcome.complete?c.score.toFixed(1):'—'} / ${c.maximum}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${outcome.complete?c.score/c.maximum*100:0}%"></div></div></div>`).join('')}</div><div class="info-callout" style="margin-top:20px">${escape(outcome.explanation)} Negative ending cash also reduces the score; financial distress caps it at 39.</div>${outcome.complete?`<div class="commit-summary"><div class="review-stat"><span>Ending cash</span><strong>${money(outcome.endingCash)}</strong></div><div class="review-stat"><span>Total debt</span><strong>${money(outcome.endingDebt)}</strong></div><div class="review-stat"><span>Total net profit</span><strong>${money(outcome.profit)}</strong></div></div>`:''}` ,`<button class="secondary-button" data-action="export">Export your campaign</button><button class="primary-button" data-action="${outcome.complete?'restart':'close-modal'}">${outcome.complete?'Begin another mandate':'Continue the campaign'} ↗</button>`,'outcome');
}
function showHelp() {
  showModal('Your company. Your call.','A QUICK FIELD GUIDE',`<div class="help-steps"><div class="help-step"><div class="step-number">01</div><h3>Read the business</h3><p>Your briefing identifies pressures. Visit the factory and markets to understand inventory, demand and capability.</p></div><div class="help-step"><div class="step-number">02</div><h3>Build a plan</h3><p>Enter prices, output and budgets. Save alternatives and compare forecasts. Policies carry forward; borrowing and capital investment reset each month.</p></div><div class="help-step"><div class="step-number">03</div><h3>Commit & learn</h3><p>Advance one month. Compare results with your forecast, follow the cash and adjust. Your mandate lasts up to twelve rounds.</p></div></div><div class="info-callout"><strong>Getting around</strong><br>Drag to orbit and scroll to zoom. Select a marked work area to inspect. Choose Walk to move with W A S D and drag to look; press Escape to return to Orbit. Direct location and section buttons are always available. Reduced motion is available in Settings.</div><div class="section-rule"></div><h3>About this simulation</h3><p style="font-size:11px;line-height:1.8;color:#7e9170;margin-top:10px">An independent, original strategy game inspired by equipment manufacturing. It is not an official CNH product or a prediction of CNH performance. Three representative product families, aggregate markets and dealer demand, and simplified customer financing are modeled. Factories, operating values and events are illustrative. All calculations run locally; your campaign saves in this browser unless you export it.</p><ul class="source-list"><li><a href="https://investors.cnh.com/news/news-details/2025/CNHs-new-Strategic-Business-Plan-set-to-enhance-product-leadership-and-expand-margins/default.aspx" target="_blank" rel="noreferrer">CNH’s public strategy</a> informs the business themes.</li><li><a href="https://www.sec.gov/Archives/edgar/data/1567094/000156709426000006/cnhi-20251231.htm" target="_blank" rel="noreferrer">CNH’s 2025 annual filing</a> describes its businesses and financing relationships.</li><li><a href="https://github.com/nickemmick124-alt/Business-Simulator" target="_blank" rel="noreferrer">Project source and model documentation</a> explain the rules and assumptions.</li></ul>`,'<span>Simulation model '+escape(state.version)+'</span><button class="primary-button" data-action="close-modal">Back to the business ↗</button>','help');
}
function showSettings() {
  showModal('Make yourself at home.','SAVES & SETTINGS',`<div class="settings-grid"><div class="setting-card"><h3>Your campaign</h3><p>Progress saves on this device after changes. Export a file to move your campaign to another browser or keep a backup. A shareable game link does not share your save.</p><button class="secondary-button" data-action="export">${icon('download')} Export save</button><button class="secondary-button" data-action="import">Import save</button>${!canAutosave?'<p class="negative">A stored save could not be loaded. Autosave is paused until you import a valid save or deliberately begin a new campaign.</p>':''}</div><div class="setting-card"><h3>World & accessibility</h3><p>Explore freely or use direct navigation. Numerical planning works independently of the 3D camera.</p><label class="switch-line">Reduce animation<input id="reduced-motion" type="checkbox" ${settings.reducedMotion?'checked':''}></label><label class="switch-line">Walk through the world<input id="walk-mode" type="checkbox" ${settings.viewMode==='walk'?'checked':''}></label></div><div class="setting-card"><h3>A fresh mandate</h3><p>Start again with the same scenario to compare strategies, or choose a new scenario seed. Export your current campaign first if you want to keep it.</p><button class="secondary-button" data-action="restart">New campaign</button></div><div class="setting-card"><h3>Understand the model</h3><p>Prices use thousands of dollars; financial reports use millions. Physical units, dealer sales and cash collection are modeled separately.</p><button class="secondary-button" data-action="help">Game guide & sources</button><button class="secondary-button" data-action="scoring">Board scorecard</button></div></div>`,'<span>Current campaign seed: '+state.seed+'</span><button class="primary-button" data-action="close-modal">Return to the business ↗</button>','settings');
}
function showRestart() {
  showModal('Begin a new mandate?','NEW CAMPAIGN',`<p>This replaces the campaign saved on this device. Export your current campaign first to keep it. New campaigns start with a fresh seed; repeating a seed and starting outlook lets you practice under the same external conditions.</p><label for="new-market-regime" class="overline" style="display:block;margin-top:20px">INITIAL MARKET OUTLOOK</label><select id="new-market-regime" class="name-input"><option value="random">Surprise me · random starting outlook</option><option value="soft">Soft market · protect cash and inventory</option><option value="flat">Flat market · compete for profitable share</option><option value="upswing">Upswing market · scale without overextending</option><option value="legacy">Classic scenario · original market rules</option></select><p class="business-caption">The outlook is public; actual demand and supply can diverge, including sustained downturns or recoveries. These are illustrative scenarios.</p><label for="new-seed" class="overline" style="display:block;margin-top:16px">SCENARIO SEED</label><input id="new-seed" class="name-input" type="number" min="0" max="4294967295" step="1" value="${randomSeed()}"><div class="scenario-actions"><button class="secondary-button" data-action="randomize-seed">New random seed</button><button class="text-button" data-action="repeat-scenario">Repeat current scenario</button></div><div id="restart-error" class="error-text" role="alert"></div>`,'<button class="secondary-button" data-action="export">Export current save</button><button class="primary-button red" data-action="confirm-restart">Begin new campaign ↗</button>','restart');
}
function restart() {
  const seed=Number($('#new-seed').value);
  if($('#new-seed').value.trim()===''||!Number.isInteger(seed)||seed<0||seed>4294967295){$('#restart-error').textContent='Enter a whole-number seed between 0 and 4,294,967,295.';return;}
  const regime=$('#new-market-regime').value;
  if(!['random','soft','flat','upswing','legacy'].includes(regime)){$('#restart-error').textContent='Choose a market outlook.';return;}
  state=createInitialState(seed,regime==='legacy'?{}:{marketRegime:regime});plan=defaultPlan(state);drafts=initialDrafts(plan);activeDraft='inherited';canAutosave=true;tab='briefing';coachingMonth=null;persist();closeModal();setLocation('headquarters');renderAll();toast('A new mandate begins.');
}
function exportCampaign() {
  try {
    const blob=new Blob([exportSave({state,plan,drafts,settings})],{type:'application/json'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`cnh-executive-month-${String(state.month).padStart(2,'0')}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Campaign exported. Keep the file to restore your progress.');
  }catch(error){toast(error.message,6500);}
}
function saveDraft() {
  const checked=validatePlan(plan,state);if(!checked.valid){toast(checked.errors.join(' '));return;}
  showModal('Give your plan a name.','SAVE AN ALTERNATIVE','<p>Save this set of decisions to compare with other approaches before committing the round.</p><input id="draft-name" class="name-input" maxlength="60" placeholder="For example: Protect delivery" aria-label="Plan name"><div id="draft-error" class="error-text" role="alert"></div>','<span>Up to 8 saved plans</span><button class="primary-button" data-action="confirm-save-draft">Save plan ↗</button>','draft');
  $('#draft-name').focus();
}
function useDraft(id) {
  const draft=drafts.find(d=>d.id===id);if(!draft)return;
  plan=clone(draft.plan);activeDraft=id;closeModal();setTab('plan');persist();toast(`Loaded “${draft.name}”.`);
}
function focusArea(id) {
  closeModal();setLocation(id==='boardroom'?'headquarters':'factory');world?.focus(id);
}

document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||busy)return;
  if(button.dataset.tab){setTab(button.dataset.tab);return;}
  if(button.dataset.location){setLocation(button.dataset.location);return;}
  if(button.dataset.planGroup){planGroup=button.dataset.planGroup;renderPanel();return;}
  if(button.dataset.horizon){projectionHorizon=Number(button.dataset.horizon)===12?12:3;showFinancialPlan();$(`[data-horizon="${projectionHorizon}"]`).focus();return;}
  if(button.dataset.coachingMonth){showCoaching(Number(button.dataset.coachingMonth));return;}
  if(button.dataset.coachingAlternative&&coachingMonth){showCoaching(coachingMonth,button.dataset.coachingAlternative);return;}
  if(button.dataset.economicsMonth){showUnitEconomics(Number(button.dataset.economicsMonth));return;}
  if(button.dataset.report){showReport(Number(button.dataset.report));return;}
  if(button.dataset.focus){focusArea(button.dataset.focus);return;}
  if(button.dataset.reviewFocus){focusArea(button.dataset.reviewFocus);return;}
  if(button.dataset.useDraft){useDraft(button.dataset.useDraft);return;}
  switch(button.dataset.action){
    case 'open-plan':closeModal();setTab('plan');break;
    case 'open-commercial':closeModal();planGroup='Commercial';setTab('plan');break;
    case 'open-markets':closeModal();setTab('markets');break;
    case 'open-finance':closeModal();setTab('finance');break;
    case 'market-detail':showMarketDetail();break;
    case 'financial-plan':showFinancialPlan();break;
    case 'unit-economics':showUnitEconomics();break;
    case 'back-to-plan':closeModal();setTab('plan');break;
    case 'next-plan':closeModal();setTab('plan');break;
    case 'commit-preview':showCommit();break;
    case 'commit':commitRound();break;
    case 'compare':showCompare();break;
    case 'last-report':showReport(state.month);break;
    case 'history':setTab('reports');break;
    case 'statements':showStatements();break;
    case 'scoring':case 'outcome':showOutcome();break;
    case 'help':showHelp();break;
    case 'settings':showSettings();break;
    case 'close-modal':closeModal();break;
    case 'inspect-supply':setTab('operations');world?.focus('supply');break;
    case 'close-inspect':$('#inspect-card').classList.add('hidden');break;
    case 'camera-orbit':settings.viewMode='orbit';applySettings();persist();break;
    case 'camera-walk':settings.viewMode='walk';applySettings();persist();toast('W A S D to move. Drag to look. Escape returns to Orbit.');break;
    case 'reset-camera':world?.setLocation(location);break;
    case 'save-draft':saveDraft();break;
    case 'demand-led':plan=demandLedPlan(plan);activeDraft='';renderPanel();persist();toast('Output targets now reflect expected dealer orders and available stock.');break;
    case 'confirm-save-draft':{
      const name=$('#draft-name').value.trim();if(!name){$('#draft-error').textContent='Enter a name for this plan.';break;}
      const existing=drafts.find(d=>d.name.toLowerCase()===name.toLowerCase());
      if(existing){existing.plan=clone(plan);activeDraft=existing.id;}else if(drafts.length>=8){$('#draft-error').textContent='Eight plans are already saved. Enter an existing name to update that plan.';break;}else{activeDraft=`draft-${Date.now()}`;drafts.push({id:activeDraft,name,plan:clone(plan)});}
      persist();closeModal();renderPanel();toast('Plan saved.');break;
    }
    case 'export':exportCampaign();break;
    case 'import':$('#import-file').click();break;
    case 'restart':showRestart();break;
    case 'confirm-restart':restart();break;
    case 'randomize-seed':{const previous=Number($('#new-seed').value);const next=randomSeed();$('#new-seed').value=String(next===previous?(next+1)>>>0:next);break;}
    case 'repeat-scenario':$('#new-seed').value=String(state.seed);$('#new-market-regime').value=state.marketCycle?.initialRegime||'legacy';break;
  }
});
document.addEventListener('input',event=>{
  const input=event.target;
  if(input.dataset.field){
    const key=input.dataset.field;plan[key]=input.value===''?NaN:Number(input.value);activeDraft='';
    $$(`[data-field="${key}"]`).forEach(el=>{if(el!==input&&Number.isFinite(plan[key]))el.value=plan[key];});
    const select=$('#draft-select');if(select)select.value='';refreshForecast();
  }
});
document.addEventListener('change',event=>{
  const input=event.target;
  if(input.dataset.field){if(validatePlan(plan,state).valid)persist();}
  if(input.id==='draft-select'&&input.value)useDraft(input.value);
  if(input.id==='reduced-motion'){settings.reducedMotion=input.checked;applySettings();persist();}
  if(input.id==='walk-mode'){settings.viewMode=input.checked?'walk':'orbit';applySettings();persist();}
});
$('#import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try {
    if(file.size>5*1024*1024)throw new Error('Save files must be smaller than 5 MB.');
    const imported=parseSave(await file.text());state=imported.state;plan=imported.plan;drafts=imported.drafts;settings={...defaultSettings,...imported.settings};canAutosave=true;activeDraft='';tab='briefing';persist();closeModal();renderAll();toast('Campaign restored.');
  }catch(error){toast(`Import failed: ${error.message}`,7500);}
  finally{event.target.value='';}
});
$('#modal').addEventListener('click',event=>{if(event.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
$('#modal').addEventListener('close',()=>{modalMode='';});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('#modal').open){settings.viewMode='orbit';applySettings();$('#inspect-card').classList.add('hidden');}
  if(event.key==='Enter'&&modalMode==='draft'&&event.target.id==='draft-name')$('[data-action="confirm-save-draft"]').click();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&validatePlan(plan,state).valid)persist();});
function worldError(error) {
  $('#world-loader').classList.add('ready');
  $('#world').innerHTML=`<div class="fallback-world">${icon('factory')}<h3>The 3D world needs WebGL 2</h3><p>Try a current desktop browser with hardware acceleration enabled. Your business decisions, reports and saved campaign are still available.</p></div>`;
  console.warn('3D world initialization failed:',error?.message||error);
}
renderAll();
try {
  world=new World({container:$('#world'),onInspect:showInspection,onLocationChange:next=>{location=next;renderLocation();},onReady:()=>$('#world-loader').classList.add('ready'),onError:worldError});
  updateWorld();applySettings();
}catch(error){worldError(error);}
if(canAutosave)persist();else $('#save-indicator').textContent='Autosave paused · open Settings';
