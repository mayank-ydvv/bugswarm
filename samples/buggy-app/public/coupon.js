document.getElementById('apply').addEventListener('click', () => {
  const code = document.getElementById('coupon').value;
  // BUG (playwright click error): throws for any coupon.
  throw new Error(`Coupon ${code.toUpperCase()} could not be applied: discounts is undefined`);
});
