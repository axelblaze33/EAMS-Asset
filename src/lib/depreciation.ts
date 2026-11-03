// Straight-line depreciation from purchase date over the category's useful life,
// down to its salvage value. Used on asset pages and the depreciation report.

export function bookValue(input: {
  cost: number | null;
  purchaseDate: Date | null;
  usefulLifeMonths: number;
  salvagePercent: number;
  asOf?: Date;
}) {
  if (input.cost === null || !input.purchaseDate) return null;
  const asOf = input.asOf ?? new Date();
  const salvage = (input.cost * input.salvagePercent) / 100;
  const months = Math.max(
    0,
    (asOf.getUTCFullYear() - input.purchaseDate.getUTCFullYear()) * 12 + (asOf.getUTCMonth() - input.purchaseDate.getUTCMonth()),
  );
  const elapsed = Math.min(months, input.usefulLifeMonths);
  const depreciation = ((input.cost - salvage) * elapsed) / Math.max(1, input.usefulLifeMonths);
  return {
    value: Math.round((input.cost - depreciation) * 100) / 100,
    accumulated: Math.round(depreciation * 100) / 100,
    monthsElapsed: months,
    fullyDepreciated: months >= input.usefulLifeMonths,
  };
}

export const formatMoney = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
