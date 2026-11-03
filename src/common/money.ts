// src/common/money.ts
// Amounts are Tunisian dinars, with at most 3 decimals: the millimes. Prices
// are stored that way (the forms refuse more decimals), but a percentage
// coupon can give a part of a millime (15% of 199.999 is 29.99985), and sums
// of decimal numbers carry tiny errors (0.1 + 0.2 is 0.30000000000000004).
// Every amount the API computes and stores goes through roundMillimes.

// The nearest whole millime (a half millime goes up): 29.99985 -> 30,
// 0.5005 -> 0.501, 0.30000000000000004 -> 0.3.
export function roundMillimes(amount: number): number {
  // toFixed(6) first removes the tiny errors, so that 0.5005 * 1000
  // (500.49999999999994 in JavaScript) counts as the half it is
  return Math.round(Number((amount * 1000).toFixed(6))) / 1000;
}
