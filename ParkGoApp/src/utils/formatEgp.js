/** Display amounts in Egyptian Pounds (numeric values are stored as EGP). */
export function formatEgp(amount) {
  const n = amount == null || amount === '' ? 0 : Number(amount);
  if (Number.isNaN(n)) return '0.00 EGP';
  return `${n.toFixed(2)} EGP`;
}
