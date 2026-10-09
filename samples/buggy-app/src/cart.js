export function cartTotal(items) {
  const discount = 0.1; // BUG (eslint): unused variable
  let total = 0;
  for (const item of items) total += item.price * item.qty;
  return totl; // BUG (eslint no-undef + runtime ReferenceError): typo
}
