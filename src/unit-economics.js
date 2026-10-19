/**
 * Teaching view of the simulation's own accounts, not a second profit model.
 * Per-machine amounts use USD thousands (K); company amounts use USD millions
 * (M). Ratios are fractions. A null threshold means it cannot be calculated.
 */
import { PRODUCTS, forecast } from './simulation.js';

const DEALER_RECEIPT_RATE = 0.86;
const sum = values => values.reduce((total, value) => total + value, 0);
const finite = value => typeof value === 'number' && Number.isFinite(value);

/** Expected unit economics under the player's current, uncommitted plan. */
export function getUnitEconomics(state, plan) {
  const projected = forecast(state, plan);
  // Quality remains known in a planning forecast even if no machines ship.
  const warrantyRates = Object.fromEntries(PRODUCTS.map(product => [
    product.id, 0.009 + (1 - projected.state.products[product.id].quality) * 0.3,
  ]));
  return reportEconomics(projected.report, warrantyRates);
}

/** Historical economics use only the recorded report; no future information. */
export function getReportEconomics(report) {
  return reportEconomics(report);
}

function reportEconomics(report, warrantyRates = {}) {
  requireReport(report);
  const income = report.income;
  const shipments = sum(report.products.map(product => product.deliveries));
  const wholesaleRevenueM = income.wholesaleRevenue;
  const contributionM = wholesaleRevenueM - income.cogs - income.warrantyAccrual;
  const commonCostsM = income.operatingExpense + income.depreciation
    + income.warrantyShortfall + income.creditLosses;
  const contributionMarginRatio = wholesaleRevenueM > 0 ? contributionM / wholesaleRevenueM : null;
  const contributionPerUnitK = shipments > 0 ? contributionM * 1000 / shipments : null;
  const positiveMix = shipments > 0 && wholesaleRevenueM > 0 && contributionM > 0;
  const operatingCoverageM = Math.max(0, commonCostsM - income.loanInterestIncome);
  const pretaxCoverageM = Math.max(0, commonCostsM + income.interestExpense - income.loanInterestIncome);
  const operatingBreakEvenRevenueM = positiveMix ? operatingCoverageM / contributionMarginRatio : null;
  const pretaxBreakEvenRevenueM = positiveMix ? pretaxCoverageM / contributionMarginRatio : null;
  const operatingBreakEvenUnits = positiveMix ? operatingCoverageM * 1000 / contributionPerUnitK : null;
  const pretaxBreakEvenUnits = positiveMix ? pretaxCoverageM * 1000 / contributionPerUnitK : null;
  const marginOfSafetyM = pretaxBreakEvenRevenueM === null ? null : wholesaleRevenueM - pretaxBreakEvenRevenueM;

  const products = report.products.map(row => {
    const product = PRODUCTS.find(candidate => candidate.id === row.id);
    const materialCostK = product.materialCost * 1000;
    const conversionCostK = product.conversionCost * 1000;
    const standardCostK = materialCostK + conversionCostK;
    const manufacturerPriceK = row.price * DEALER_RECEIPT_RATE;
    const warrantyRate = row.revenue > 0 ? row.warrantyAccrual / row.revenue
      : finite(warrantyRates[row.id]) ? warrantyRates[row.id] : null;
    const warrantyPerUnitK = warrantyRate === null ? null : manufacturerPriceK * warrantyRate;
    const contributionPerUnitK = warrantyPerUnitK === null ? null : manufacturerPriceK - standardCostK - warrantyPerUnitK;
    const allocatedCommonCostsM = wholesaleRevenueM > 0 ? commonCostsM * row.revenue / wholesaleRevenueM : null;
    const commonCostPerUnitK = row.deliveries > 0 && allocatedCommonCostsM !== null
      ? allocatedCommonCostsM * 1000 / row.deliveries : null;
    const retainedReceiptRate = warrantyRate === null ? null : DEALER_RECEIPT_RATE * (1 - warrantyRate);
    return {
      id: row.id, name: product.name, shipments: row.deliveries,
      retailSales: row.retailSales, production: row.production,
      listPriceK: row.price, manufacturerPriceK, materialCostK, conversionCostK, standardCostK,
      grossMarginPerUnitK: manufacturerPriceK - standardCostK,
      warrantyRate, warrantyPerUnitK, contributionPerUnitK,
      contributionMarginRatio: contributionPerUnitK !== null && manufacturerPriceK > 0 ? contributionPerUnitK / manufacturerPriceK : null,
      variableCostFloorListPriceK: standardCostK / DEALER_RECEIPT_RATE,
      warrantyAdjustedFloorListPriceK: retainedReceiptRate > 0 ? standardCostK / retainedReceiptRate : null,
      wholesaleRevenueM: row.revenue,
      contributionM: row.revenue - row.cogs - row.warrantyAccrual,
      allocatedCommonCostsM,
      fullyLoadedCostPerUnitK: commonCostPerUnitK !== null && warrantyPerUnitK !== null
        ? standardCostK + warrantyPerUnitK + commonCostPerUnitK : null,
      indicativeBreakEvenListPriceK: commonCostPerUnitK !== null && retainedReceiptRate > 0
        ? (standardCostK + commonCostPerUnitK) / retainedReceiptRate : null,
    };
  });

  return {
    month: report.month,
    isForecast: Boolean(report.isForecast ?? report.forecast),
    products,
    company: {
      shipments, wholesaleRevenueM, contributionM, contributionMarginRatio, contributionPerUnitK,
      commonCostsM, loanInterestIncomeM: income.loanInterestIncome, interestExpenseM: income.interestExpense,
      operatingProfitM: income.operatingProfit, pretaxProfitM: income.pretaxProfit,
      operatingBreakEvenRevenueM, pretaxBreakEvenRevenueM, operatingBreakEvenUnits, pretaxBreakEvenUnits,
      marginOfSafetyM,
      marginOfSafetyRatio: marginOfSafetyM !== null && wholesaleRevenueM > 0 ? marginOfSafetyM / wholesaleRevenueM : null,
      endingCashM: report.balanceSheet.cash, cashChangeM: report.cashFlow.cashChange,
      reconciliationM: contributionM - commonCostsM + income.loanInterestIncome - income.interestExpense - income.pretaxProfit,
      costBreakdown: [
        { label: 'Factory and corporate base expense', valueM: income.fixedFactoryExpense + income.corporateExpense },
        { label: 'Chosen operating and engineering budgets', valueM: income.marketing + income.quality + income.maintenance + income.training + income.rd },
        { label: 'Overtime, rework and inventory carrying', valueM: income.overtimeExpense + income.reworkExpense + income.inventoryCarryingExpense },
        { label: 'Depreciation', valueM: income.depreciation },
        { label: 'Unreserved warranty claims and credit losses', valueM: income.warrantyShortfall + income.creditLosses },
      ],
    },
    assumptions: [
      'Customer list prices and all per-machine costs are in $000; company totals are in $m. The manufacturer invoices dealers at 86% of list price. Dealer invoices are revenue before they become collected cash.',
      'Standard unit cost is materials plus normal conversion labor. Contribution subtracts that cost and the warranty provision on each shipped unit. Overtime, rework and inventory carrying remain in common monthly costs; this contribution is a teaching measure, not all marginal cash costs.',
      'The variable-cost floor covers standard materials and conversion only. The warranty-adjusted floor also covers the provision. Neither pays for common costs, financing, investment or tax.',
      'Break-even holds selling prices, shipment mix, unit cost, warranty rates, common monthly costs, loan interest income and borrowing interest unchanged. It is a sensitivity calculation, not a promise that demand or factory capacity supports that sales volume.',
      'Indicative product full cost allocates common monthly costs by current wholesale revenue share, across units shipped. This is an allocation assumption, not a unique product cost or a reason by itself to exit a product. The product break-even price holds this allocation fixed and excludes loan interest income and borrowing interest.',
      'Common costs include current operating and engineering budgets, production premiums, inventory carrying, depreciation, warranty shortfall and credit losses. Some vary with production or business conditions; they are held constant only for this month’s break-even calculation.',
      'Company operating break-even credits existing loan interest income. Pretax break-even also covers borrowing interest. Safety margin compares current wholesale revenue with pretax break-even wholesale revenue; total reported revenue also includes loan interest.',
      'Accounting break-even is different from cash adequacy. Production creates inventory until machines ship. Receivables, supplier terms, customer lending, debt principal and capital spending change cash independently of this month’s profit. Capex is depreciated over time; debt principal is not an expense.',
      'No shipments or a nonpositive combined contribution means break-even cannot be inferred from the current mix. Historical products with no shipments have no observed warranty rate; their warranty-adjusted and allocated per-unit values are unavailable.',
    ],
  };
}

function requireReport(report) {
  const fields = [
    'wholesaleRevenue', 'cogs', 'warrantyAccrual', 'operatingExpense', 'depreciation', 'warrantyShortfall',
    'creditLosses', 'loanInterestIncome', 'interestExpense', 'operatingProfit', 'pretaxProfit',
    'fixedFactoryExpense', 'corporateExpense', 'marketing', 'quality', 'maintenance', 'training', 'rd',
    'overtimeExpense', 'reworkExpense', 'inventoryCarryingExpense',
  ];
  if (!report || !Array.isArray(report.products) || !report.income
    || !fields.every(key => finite(report.income[key]))
    || !finite(report.balanceSheet?.cash) || !finite(report.cashFlow?.cashChange)
    || report.products.length !== PRODUCTS.length
    || new Set(report.products.map(product => product.id)).size !== PRODUCTS.length
    || !report.products.every(product => PRODUCTS.some(candidate => candidate.id === product.id)
      && ['price', 'deliveries', 'retailSales', 'production', 'revenue', 'cogs', 'warrantyAccrual'].every(key => finite(product[key])))) {
    throw new Error('A complete simulation report is required to calculate unit economics.');
  }
}
