const currency = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 0,
  style: 'currency',
});
const exactCurrency = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 2,
  style: 'currency',
});

export const projectionMoney = (value: number) => currency.format(value);
export const projectionExactMoney = (value: number) =>
  exactCurrency.format(value);
