import { couponDiscount, eligibleTotal, PricedItem } from './coupon-discount';

// A cart with a course of academy-1 (100), one of academy-2 (200) and a
// platform-wide product (50).
const cart: PricedItem[] = [
  { centerId: 'academy-1', price: 100 },
  { centerId: 'academy-2', price: 200 },
  { centerId: null, price: 50 },
];

const percent = (centerId: string | null, value: number) => ({
  centerId,
  discountPercentage: value,
  discountAmount: null,
});
const amount = (centerId: string | null, value: number) => ({
  centerId,
  discountPercentage: null,
  discountAmount: value,
});

describe('coupon discount', () => {
  it('platform-wide coupon: applies to the whole cart', () => {
    expect(eligibleTotal(percent(null, 10), cart)).toBe(350);
    expect(couponDiscount(percent(null, 10), cart)).toBe(35);
  });

  it('academy coupon: only applies to that academy items', () => {
    expect(eligibleTotal(percent('academy-1', 50), cart)).toBe(100);
    expect(couponDiscount(percent('academy-1', 50), cart)).toBe(50);
  });

  it('a 100% academy coupon cannot make other academies items free', () => {
    expect(couponDiscount(percent('academy-1', 100), cart)).toBe(100);
  });

  it('fixed amount: never more than the eligible part', () => {
    expect(couponDiscount(amount('academy-1', 30), cart)).toBe(30);
    expect(couponDiscount(amount('academy-1', 150), cart)).toBe(100);
    expect(couponDiscount(amount(null, 1000), cart)).toBe(350);
  });

  it('academy coupon with none of its items in the cart: no discount', () => {
    expect(couponDiscount(percent('academy-3', 50), cart)).toBe(0);
  });

  it('a discount is in whole millimes', () => {
    const odd: PricedItem[] = [{ centerId: null, price: 199.999 }];
    // 15% of 199.999 is 29.99985, 12.5% is 24.999875
    expect(couponDiscount(percent(null, 15), odd)).toBe(30);
    expect(couponDiscount(percent(null, 12.5), odd)).toBe(25);
    const small: PricedItem[] = [
      { centerId: null, price: 0.1 },
      { centerId: null, price: 0.2 },
    ];
    expect(couponDiscount(amount(null, 5), small)).toBe(0.3);
  });
});
