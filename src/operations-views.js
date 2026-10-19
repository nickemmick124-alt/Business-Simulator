import { getFactoryDiagnostics, getCostLedger } from './factory-diagnostics.js';
import { getMarketPosition } from './market-position.js';
import { getInvestmentOptions } from './investments.js';
import { campaignLength, monthLabel } from './campaign-calendar.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const amount = (value, digits = 1) => finite(value) ? Math.abs(value).toLocaleString('en-US', {minimumFractionDigits:digits, maximumFractionDigits:digits}) : '—';
const money = value => finite(value) ? (value < 0 ? '−' : '') + '$' + amount(value) + 'm' : '—';
const unitCost = value => finite(value) ? '$' + amount(value, 2) + 'k' : '—';
const units = value => finite(value) ? Math.round(value).toLocaleString('en-US') : '—';
const percent = value => finite(value) ? (value * 100).toFixed(1) + '%' : '—';
const index = value => finite(value) ? value.toFixed(3) : '—';
const sign = value => value > 0 ? '+' : value < 0 ? '−' : '';
const change = value => finite(value) ? sign(value) + amount(value * 100) + '%' : '—';
const points = value => finite(value) ? sign(value) + amount(value * 100) + ' pp' : '—';
const effectAmount = (value, minimum = 1) => {
  const absolute = Math.abs(value);
  if (absolute > 0 && absolute < .000001) return '<0.000001';
  const digits = absolute ? Math.min(6, Math.max(minimum, 1 - Math.floor(Math.log10(absolute)))) : minimum;
  return amount(value, digits);
};
const deltaMoney = value => finite(value) ? sign(value) + '$' + effectAmount(value) + 'm' : '—';
const deltaUnits = value => finite(value) ? sign(value) + units(Math.abs(value)) : '—';
const deltaIndex = value => finite(value) ? sign(value) + effectAmount(value, 3) : '—';
const effectPoints = value => finite(value) ? sign(value) + effectAmount(value * 100) + ' pp' : '—';
const month = value => monthLabel(value);
const shortMonth = value => monthLabel(value, { short: true });
const button = (action, label) => '<button class="secondary-button" data-action="' + action + '">' + label + ' ↗</button>';
const note = (title, text) => '<div class="business-note"><strong>' + escape(title) + '</strong><p>' + escape(text) + '</p></div>';
const details = (title, items) => '<details class="business-details"><summary>' + escape(title) + '</summary>' + items.map(item => '<p>' + escape(item) + '</p>').join('') + '</details>';
const kpi = (label, value, caption = '', attr = '') => '<div class="business-kpi"><span>' + escape(label) + '</span><strong ' + attr + '>' + value + '</strong><small>' + escape(caption) + '</small></div>';
const table = (heads, rows, attr = '') => '<div class="table-scroll"><table class="business-table" ' + attr + '><thead><tr>' + heads.map(h => '<th scope="col">' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr><th scope="row">' + row[0] + '</th>' + row.slice(1).map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
const alert = message => '<div class="business-alert" role="status"><strong>Projection unavailable</strong><p>' + escape(message) + '</p></div>';
function contextMessage(data) {
  if (data.errors?.length) return alert(data.errors.join(' ') + ' Update your working plan in Decisions. Current balances remain available.');
  return data.status === 'current-only' ? note('Campaign ended', 'Current balances and the latest actual operations remain available. No additional month is projected.') : '';
}

export function factoryDiagnosticsHTML(state, plan) {
  const data = getFactoryDiagnostics(state, plan);
  return '<div data-factory-diagnostics><p class="business-intro">Find the constraint before funding the solution.</p><p class="business-caption">Current capability and ' + (data.forecastMonth ? month(data.forecastMonth) + ' expected flow under your working plan.' : 'the latest completed month.') + ' Budgets apply across the company’s product lines.</p>' +
    contextMessage(data) + '<div class="operations-links">' + button('investment-lab','Compare targeted investments') + button('cost-ledger','Follow inventory & quality costs') + '</div>' +
    data.products.map(product => {
      const flow = product.flow || product.latestActual;
      const capabilities = [['Plant condition','condition'],['Workforce skill index','skill'],['First-pass capability','quality'],['Product technology','technology'],['Market reputation','reputation']];
      return '<section class="diagnostic-card" data-factory-product="' + product.id + '"><div class="plant-card-top"><div><span class="overline">' + (product.flow ? 'NEXT MONTH · FORECAST' : 'CURRENT POSITION') + '</span><h3>' + escape(product.name) + '</h3></div><span class="tag">' + units(product.nominalCapacity) + ' nominal slots / month</span></div>' +
        (flow ? '<div class="factory-flow" aria-label="Factory flow"><div><span>Requested</span><strong>' + units(flow.target) + '</strong></div><div><span>Available slots</span><strong>' + units(flow.capacity) + '</strong></div><div><span>After rework</span><strong>' + units(flow.assemblyCapacity) + '</strong></div><div><span>Assembled</span><strong>' + units(flow.assembled) + '</strong></div><div><span>Good output</span><strong>' + units(flow.production) + '</strong></div></div><p class="business-caption">' + (product.flow ? 'Expected' : month(product.latestActual.month) + ' actual') + ': ' + units(flow.goodFirstPassUnits) + ' accepted first-pass + ' + units(flow.reworkResolved) + ' recovered from earlier rework = ' + units(flow.production) + ' good units. ' + units(flow.defects) + ' new defects; ' + units(flow.closing.incomplete) + ' incomplete machines at close. Completion utilization: ' + percent(flow.utilization) + '; occupied assembly slots: ' + percent(flow.workSlotUtilization) + '.</p>' : '<p class="business-caption">No completed month yet. A valid working plan unlocks the expected flow.</p>') +
        (product.constraints.length ? '<div class="constraint-list">' + product.constraints.map(constraint => '<div class="constraint-item ' + constraint.severity + '"><h4>' + escape(constraint.title) + '</h4><p>' + escape(constraint.detail) + '</p></div>').join('') + '</div>' : '') +
        '<details class="business-details"><summary>People, plant & product capability</summary>' + table(['Indicator','Current',data.forecastMonth ? month(data.forecastMonth) + ' forecast' : 'No projection'], capabilities.map(([label,key]) => [label, key === 'quality' ? percent(product.current[key]) : index(product.current[key]), product.projected ? key === 'quality' ? percent(product.projected[key]) : index(product.projected[key]) : '—'])) + '<p>Skill is a pooled workforce index, not the percentage of people who are cross-trained. These indices describe modeled capability; actual output still depends on orders and material flow.</p></details></section>';
    }).join('') +
    '<details class="business-details"><summary>Which decision improves which problem?</summary>' + data.investmentLevers.map(lever => '<p><strong>' + escape(lever.label) + '.</strong> ' + escape(lever.effect) + ' ' + escape(lever.timing) + ' ' + escape(lever.accounting) + '</p>').join('') + '</details>' +
    (data.pipeline.length ? '<details class="business-details"><summary>Projects already funded</summary>' + table(['Project','Amount','Scheduled completion'],data.pipeline.map(project => [escape(project.label),money(project.amountM),escape(month(project.availableMonth))])) + '</details>' : '') +
    details('How to read these diagnostics',data.assumptions) + '</div>';
}

function qualityTable(current, projected) {
  const columns = [current,projected].filter(Boolean);
  if (!columns.length) return note('No period expense yet','Inventory is visible at the opening balance. Complete a month or provide a valid plan to see quality expenses and cash payments.');
  const rows = [
    ['Quality prevention / supplier development','preventionM'],['Rework premiums','reworkM'],
    ['Warranty provision · expense','warrantyAccrualM'],['Unreserved warranty claims · extra expense','warrantyShortfallM'],
    ['Quality expense subtotal','qualityExpenseM'],['Warranty claims · cash paid','warrantyClaimsM'],
    ['Quality cash subtotal','qualityCashM'],['Training · separate operating expense','trainingM'],
    ['Maintenance · separate operating expense','maintenanceM'],['Engineering · separate operating expense','engineeringM'],
    ['Inventory carrying · separate operating expense','inventoryCarryingM'],
  ];
  return table(['USD millions',...columns.map(c => month(c.month) + (c.isForecast ? ' forecast' : ' actual'))], rows.map(([label,key]) => [label,...columns.map(c => money(c[key]))]), 'data-quality-ledger') +
    '<p class="business-caption">The quality expense and quality cash subtotals are different views of the same activity. Do not add them together. Training, maintenance and engineering are separate budgets; no arbitrary portion is counted again as quality expense.</p>' +
    columns.map(c => note(month(c.month) + (c.isForecast ? ' forecast' : ' actual') + ' warranty reserve', money(c.openingWarrantyReserveM) + ' opening reserve + ' + money(c.warrantyAccrualM) + ' provision + ' + money(c.warrantyShortfallM) + ' unreserved claims − ' + money(c.warrantyClaimsM) + ' claims paid = ' + money(c.closingWarrantyReserveM) + ' closing reserve. Provisions reduce profit; claims use cash and the reserve.')).join('');
}

export function costLedgerHTML(state, plan) {
  const data = getCostLedger(state, plan);
  if (!data.inventory) return '<div data-cost-ledger>' + contextMessage(data) + '</div>';
  const now = state.month ? month(state.month) + ' actual close' : 'Opening balance';
  const stageRows = data.products[0].currentInventory.stages.map((stage,i) => [escape(stage.label), money(data.products.reduce((total,p) => total + p.currentInventory.stages[i].valueM,0)), data.forecastMonth ? money(data.products.reduce((total,p) => total + p.forecastInventory.stages[i].valueM,0)) : '—']);
  stageRows.push(['Total manufacturer inventory',money(data.inventory.currentM),money(data.inventory.forecastM)]);
  const bridge = data.inventory.forecastBridge;
  return '<div data-cost-ledger><p class="business-intro">A machine’s production cost, inventory value, period expense and cash payment tell different parts of the story.</p>' + contextMessage(data) +
    '<div class="operations-links">' + button('unit-economics','Prices, margins & break-even') + button('factory-diagnostics','Find factory constraints') + '</div><h3 class="operator-heading">What goes into a machine?</h3><p class="business-caption">Illustrative standard manufacturing cost per machine, before warranty, overhead and other period expenses. USD thousands.</p>' +
    '<div class="economics-products">' + data.products.map(product => {
      const cost = product.unitCosts;
      return '<article class="economics-product"><h3>' + escape(product.name) + '</h3><strong class="contribution-amount">' + unitCost(cost.standardCostK) + '<small>Standard manufacturing cost</small></strong><div class="cost-stack" role="img" aria-label="' + escape('Component kit ' + unitCost(cost.kitK) + ', controller ' + unitCost(cost.controllerK) + ', normal conversion ' + unitCost(cost.conversionK)) + '"><span style="width:' + (cost.kitK/cost.standardCostK*100) + '%"></span><span style="width:' + (cost.controllerK/cost.standardCostK*100) + '%"></span><span style="width:' + (cost.conversionK/cost.standardCostK*100) + '%"></span></div><dl class="economics-lines"><div><dt>Component kit</dt><dd>' + unitCost(cost.kitK) + '</dd></div><div><dt>Controller</dt><dd>' + unitCost(cost.controllerK) + '</dd></div><div><dt>Normal conversion<small>Pooled assembly cost</small></dt><dd>' + unitCost(cost.conversionK) + '</dd></div></dl></article>';
    }).join('') + '</div>' +
    note('Cost visibility, with an honest level of detail','The model does not separately price steel, transmissions, tires, labor hours or energy. Training and better equipment can improve output and quality; the current model holds standard material and conversion cost per machine fixed. These figures are synthetic, not CNH bills of material.') +
    '<h3 class="operator-heading">Where inventory sits on the balance sheet</h3><p class="business-caption">Owned stock at standard cost, in USD millions. Independent dealer stock is excluded.</p>' +
    table(['Inventory asset',now,data.forecastMonth ? month(data.forecastMonth) + ' forecast' : 'No projection'],stageRows,'data-inventory-ledger') +
    (bridge ? note('Next month’s inventory bridge',money(bridge.openingM) + ' opening inventory + ' + money(bridge.purchasesM) + ' received materials + ' + money(bridge.conversionM) + ' normal conversion − ' + money(bridge.shippedCostM) + ' cost of shipped machines = ' + money(bridge.closingM) + ' closing inventory. Supplier payments can occur in a different period.') : '') +
    data.products.map(product => '<details class="business-details"><summary>' + escape(product.name) + ' · inventory units and values</summary>' + table(['Stage','Current units','Cost / unit','Current value',data.forecastMonth ? 'Forecast units' : 'No projection',data.forecastMonth ? 'Forecast value' : 'No projection'],product.currentInventory.stages.map((stage,i) => [escape(stage.label),units(stage.units),unitCost(stage.unitCostK),money(stage.valueM),units(product.forecastInventory?.stages[i].units),money(product.forecastInventory?.stages[i].valueM)])) + '<p>' + units(product.currentInventory.dealerStockExcludedUnits) + ' machines belong to dealers and are tracked outside the manufacturer’s inventory balance.</p></details>').join('') +
    '<h3 class="operator-heading">What quality costs this period</h3>' + qualityTable(data.currentQuality,data.forecastQuality) +
    '<p class="business-caption">Displayed amounts are rounded to $0.1m. The underlying inventory and warranty accounts reconcile; adding rounded line items can differ from the displayed total.</p>' +
    details('Cost and accounting assumptions',data.assumptions) + '</div>';
}

function shareChart(history, next) {
  if (!history.length && !next) return '';
  const pointsData = [...history.map(row => ({month:row.month,value:row.unitShare})),...(next ? [{month:next.month,value:next.expectedUnitShare,forecast:true}] : [])];
  const ceiling = Math.max(.05,...pointsData.map(p => p.value)) * 1.15;
  const firstMonth = pointsData[0].month;
  const span = Math.max(11, pointsData.at(-1).month - firstMonth);
  const tickStride = Math.max(1, Math.ceil(pointsData.length / 10));
  const x = p => 40 + (p.month - firstMonth) / span * 550;
  const y = p => 145 - p.value / ceiling * 110;
  const actual = pointsData.filter(p => !p.forecast);
  const expected = pointsData.at(-1)?.forecast ? pointsData.at(-1) : null;
  return '<figure class="business-chart share-chart"><figcaption>Your share of the scenario market<span>Customer retail units / modeled industry units · outlined point = forecast</span></figcaption><svg viewBox="0 0 635 185" role="img" aria-label="Monthly retail unit share; exact values in the table below."><line class="chart-baseline" x1="30" x2="610" y1="145" y2="145"/>' +
    (actual.length > 1 ? '<polyline class="share-actual-line" points="' + actual.map(p => x(p)+','+y(p)).join(' ') + '"/>' : '') +
    (expected && actual.length ? '<line class="chart-line" x1="' + x(actual.at(-1)) + '" y1="' + y(actual.at(-1)) + '" x2="' + x(expected) + '" y2="' + y(expected) + '"/>' : '') +
    pointsData.map((p,i) => '<circle class="' + (p.forecast ? 'chart-forecast' : 'chart-actual') + '" cx="' + x(p) + '" cy="' + y(p) + '" r="4"><title>' + month(p.month) + (p.forecast ? ' forecast ' : ' actual ') + percent(p.value) + '</title></circle>' + (i % tickStride === 0 || i === pointsData.length - 1 ? '<text text-anchor="middle" x="' + x(p) + '" y="166">' + shortMonth(p.month) + '</text><text text-anchor="middle" x="' + x(p) + '" y="' + (y(p)-12) + '">' + percent(p.value) + '</text>' : '')).join('') + '</svg></figure>';
}

export function marketPositionHTML(state, plan) {
  const data = getMarketPosition(state, plan);
  const current = data.aggregate.current;
  const next = data.aggregate.next;
  return '<div data-market-position><p class="business-intro">Are customers choosing you? See whether your sales are outpacing the market and gaining share.</p><p class="business-caption">Estimated actual share uses completed customer retail sales and the modeled market for that month. Forecast share is kept separate. This is the game’s three-product market.</p>' +
    (data.forecastError ? alert(data.forecastError) : '') +
    '<div class="business-kpis business-kpis-wide">' +
    kpi('Actual unit share',percent(current?.unitShare),current ? month(current.month) + ' actual retail / scenario market' : 'Available after the first completed month','data-market-position-current-share') +
    kpi('Actual share movement',points(data.aggregate.changePP),'Versus the preceding completed month · percentage points','data-market-position-share-change') +
    kpi('Market unit growth',change(data.aggregate.marketGrowth),'Actual month over month · available after two months') +
    kpi('Your retail unit growth',change(data.aggregate.retailGrowth),'Actual month over month · separate from shipments') + '</div>' +
    (next ? '<div class="forecast-box"><span class="overline">' + month(next.month).toUpperCase() + ' · CURRENT PLAN FORECAST</span><div class="business-kpis">' + kpi('Expected unit share',percent(next.expectedUnitShare),points(next.changePP) + ' versus latest actual') + kpi('Expected customer sales',units(next.expectedRetailSales),change(next.retailGrowth) + ' versus latest actual') + '</div></div>' : '') +
    shareChart(data.aggregate.history,next) +
    table(['Month','Your retail units','Market units','Unit share','Share change'],[...data.aggregate.history.map(row => [month(row.month) + ' · actual',units(row.retailSales),units(row.marketUnits),percent(row.unitShare),points(row.changePP)]),...(next ? [[month(next.month) + ' · forecast',units(next.expectedRetailSales),units(next.marketUnits),percent(next.expectedUnitShare),points(next.changePP)]] : [])],'data-share-history') +
    '<div class="operations-links">' + button('market-detail','Market size & outlook') + button('investment-lab','Compare capability investments') + '</div>' +
    '<h3 class="operator-heading">How the product competes</h3><p class="business-caption">Reputation and technology are modeled indices, not customer surveys. Price, reliability and availability play different roles; one month’s share movement does not establish its cause.</p>' +
    data.products.map(product => {
      const c = product.perception.current, n = product.perception.next;
      return '<section class="diagnostic-card" data-market-product="' + product.id + '"><div class="plant-card-top"><h3>' + escape(product.name) + '</h3><span class="tag">' + percent(product.current?.unitShare) + ' actual share · ' + points(product.changePP) + '</span></div>' +
        table(['Indicator',state.month ? month(state.month) + ' actual close' : 'Opening position',n ? month(n.month) + ' forecast' : 'No projection'],[
          ['List price / reference',unitCost(c.price) + ' / ' + unitCost(product.referencePrice),n ? unitCost(n.price) + ' / ' + unitCost(product.referencePrice) : '—'],
          ['Price premium / discount',change(c.pricePremium),change(n?.pricePremium)],
          ['Reputation index',index(c.reputationIndex),index(n?.closingReputationIndex)],
          ['Technology index',index(c.technologyIndex),index(n?.technologyIndex)],
          ['Installed-fleet reliability index',index(c.fleetReliabilityIndex),index(n?.fleetReliabilityIndex)],
          ['First-pass quality · assembled units',percent(c.firstPassQuality),percent(n?.firstPassQuality)],
          ['Retail demand served',percent(c.retailAvailability),percent(n?.retailAvailability)],
          ['Dealer orders filled',percent(c.dealerFulfillment),percent(n?.dealerFulfillment)],
        ]) +
        (n ? '<details class="business-details"><summary>What drives next month’s demand?</summary><p>Start with ' + units(n.demandFactors.baseDemand) + ' base units and multiply by these factors. Reputation is the opening index; technology includes projects maturing this month. Expected requests are rounded to ' + units(n.demandFactors.expectedDemand) + ' units. Availability then limits retail sales.</p>' +
        table(['Demand factor','Multiplier'],[['Category market',n.demandFactors.categoryMarket],['Price',n.demandFactors.price],['Marketing',n.demandFactors.marketing],['Customer financing',n.demandFactors.financing],['Opening reputation',n.demandFactors.reputation],['Product technology',n.demandFactors.technology],['Competitive pressure',n.demandFactors.competition],...(n.demandFactors.dealerService===undefined?[]:[['Dealer service',n.demandFactors.dealerService],['Difficulty',n.demandFactors.difficulty],['Rival benchmarks',n.demandFactors.rivals]])].map(([label,value]) => [label,index(value) + '×'])) + '</details>' : '') +
        details('What these indicators mean',product.perception.explanation) + '</section>';
    }).join('') + details('Market scope and limits',data.caveats) + '</div>';
}

function investmentCard(option, data) {
  if (!option.enabled) return '<article class="investment-card" data-investment-option="' + option.id + '"><h3>' + escape(option.name) + '</h3><p>' + escape(option.disabledReason) + '</p><button class="secondary-button" disabled>Budget at maximum</button></article>';
  const selected = option.comparison.selected, delta = option.comparison.delta, cost = option.costCommitment;
  if (option.id === 'baseline') return '<article class="investment-card investment-baseline" data-investment-option="baseline"><span class="overline">YOUR WORKING PLAN · REFERENCE</span><h3>Continue this policy.</h3><p>Every option is compared against this same plan over ' + data.comparisonMonths + ' months.</p><div class="business-kpis">' + kpi('Period net profit',money(selected.profit),'After interest and tax') + kpi('Ending cash',money(selected.endingCash),month(data.comparisonEndMonth)) + kpi('Ending inventory',money(selected.endingInventory),'Manufacturer-owned stock') + kpi('Ending unit share',percent(selected.endingUnitShare),'Final compared month · forecast') + '</div><p>Lowest projected month-end cash: <strong>' + money(selected.minimumCash) + '</strong> in ' + month(selected.minimumCashMonth) + '. The current cash balance is ' + money(data.openingCash) + '.</p><p>Prices, production targets and other policies stay fixed. Borrowing and new capital spending apply only in the first month.</p></article>';
  const capability = {training:['Workforce skill','skill'],quality:['First-pass capability','qualityCapability'],maintenance:['Plant condition','condition'],capacity:['Capacity bonus','capacityBonus'],engineering:['Product technology','technology']}[option.id];
  const capabilityValue = capability[1] === 'qualityCapability' || capability[1] === 'capacityBonus' ? effectPoints(delta[capability[1]]) : deltaIndex(delta[capability[1]]);
  return '<article class="investment-card" data-investment-option="' + option.id + '"><span class="overline">' + (cost.type === 'one-time' ? 'ONE-TIME CAPITAL PROJECT' : 'RECURRING OPERATING BUDGET') + '</span><h3>' + escape(option.name) + '</h3><p>' + escape(option.purpose) + '</p><strong class="investment-spend">+' + money(cost.increment) + (cost.type === 'monthly' ? ' / month' : ' once') + '</strong><p>Budget moves from ' + money(cost.baselineBudget) + ' to ' + money(cost.proposedBudget) + '. Additional commitment over compared months: ' + money(cost.comparisonIncrement) + '.</p>' +
    '<div class="investment-timing"><strong>Earliest capability effect: ' + escape(month(option.timing.firstBenefitMonth) + (option.timing.withinCampaign ? '' : ' (after this campaign)')) + '</strong><span>' + (option.timing.observedFirstCapabilityBenefitMonth ? 'First modeled improvement versus baseline: ' + month(option.timing.observedFirstCapabilityBenefitMonth) + '.' : 'No improvement in the primary capability is observed within this comparison.') + '</span></div>' +
    '<dl class="economics-lines"><div><dt>Period net profit vs baseline</dt><dd>' + deltaMoney(delta.profit) + '</dd></div><div><dt>Ending cash vs baseline</dt><dd>' + deltaMoney(delta.endingCash) + '</dd></div><div><dt>Customer retail units vs baseline</dt><dd>' + deltaUnits(delta.retailSales) + '</dd></div><div><dt>Ending share vs baseline</dt><dd>' + effectPoints(delta.endingUnitShare) + '</dd></div><div><dt>' + capability[0] + ' vs baseline</dt><dd>' + capabilityValue + '</dd></div></dl>' +
    '<p>Lowest projected month-end cash: <strong>' + money(selected.minimumCash) + '</strong> in ' + month(selected.minimumCashMonth) + '. ' + (option.stopReason === 'distress' ? 'This policy reaches financial distress in ' + month(option.months.at(-1).month) + '.' : '') + '</p>' +
    option.warnings.map(warning => '<div class="business-alert"><p>' + escape(warning.detail) + '</p></div>').join('') +
    '<details class="business-details"><summary>Tradeoffs & monthly comparison</summary><p>' + escape(option.timing.detail) + '</p><p>At the comparison end: ' + deltaUnits(delta.capacity) + ' available slots / month, ' + effectPoints(delta.qualityRate) + ' period first-pass quality, ' + effectPoints(delta.serviceLevel) + ' period dealer fulfillment, ' + deltaMoney(delta.endingInventory) + ' inventory versus baseline.</p>' +
    table(['Month · forecast','Net profit change','Ending cash change','Retail units change'],option.comparison.monthly.map(row => [month(row.month),deltaMoney(row.delta.profit),deltaMoney(row.delta.endingCash),deltaUnits(row.delta.retailSales)])) + '</details>' +
    '<button class="primary-button" data-investment-apply="' + option.id + '">Use this budget in working plan ↗</button><small>Updates the plan only. You still choose when to commit the month.</small></article>';
}

export function investmentLabHTML(state, plan, horizon = 6, message = '') {
  let data;
  try { data = getInvestmentOptions(state,plan,horizon); }
  catch (error) { return '<div data-investment-lab>' + alert(error.message + ' Update Decisions before comparing investments.') + '</div>'; }
  if (!data.available) return '<div data-investment-lab>' + note('Campaign ended',data.reason) + '<div class="operations-links">' + button('factory-diagnostics','Review the factory') + button('cost-ledger','Review costs & inventory') + '</div></div>';
  return '<div data-investment-lab><div class="business-toolbar"><div><p class="business-intro">Which investment addresses your constraint?</p><p class="business-caption">Five targeted experiments against the current working plan. Forecasts use the same public outlook.</p></div><div class="tab-strip" role="group" aria-label="Investment comparison horizon">' + [[3,'3 months'],[6,'6 months'],['year-end','To year-end'],...(campaignLength(state)>12 ? [['campaign-end','To campaign end']] : [])].map(([value,label]) => '<button data-investment-horizon="' + value + '" class="' + (horizon === value ? 'active' : '') + '" aria-pressed="' + (horizon === value) + '">' + label + '</button>').join('') + '</div></div>' +
    (message ? '<div class="business-note" role="status"><strong>' + escape(message) + '</strong><p>The updated working plan is now the reference case. The month has not advanced.</p></div>' : '') +
    (data.truncated ? '<div class="business-alert"><strong>Comparison shortened by financial distress</strong><p>' + escape(data.comparisonNote) + '</p></div>' : '<p class="business-caption">' + escape(data.comparisonNote) + '</p>') +
    data.warnings.map(warning => '<div class="business-alert"><strong>Projected funding risk</strong><p>' + escape(warning.detail) + '</p></div>').join('') +
    note('Better capability does not automatically create better profit','An investment can cost cash now and improve future readiness without generating extra sales in this horizon. Targets, materials, demand and dealer inventory may remain the constraint. Compare a longer horizon and then adjust the whole operating plan. No payback or optimal investment is assumed.') +
    '<div class="operations-links">' + button('factory-diagnostics','Inspect factory constraints') + button('market-position','Inspect market position') + '</div><div class="investment-grid">' + data.options.map(option => investmentCard(option,{...data,openingCash:state.cash})).join('') + '</div>' +
    (data.pipeline.length ? '<details class="business-details"><summary>Already-funded projects included in every option</summary>' + table(['Project','Amount','Scheduled completion'],data.pipeline.map(project => [escape(project.name),money(project.amount),escape(month(project.firstBenefitMonth) + (project.withinCampaign ? '' : ' (after this campaign)'))])) + '</details>' : '') +
    details('Comparison assumptions',data.assumptions) + '<p class="business-caption">Displayed values are rounded. Small effects may round to zero; adding displayed amounts can differ from a rounded total.</p></div>';
}
