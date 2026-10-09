export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// BUG (tsc): string passed where a number is expected.
export const headline = formatPrice('1999');
