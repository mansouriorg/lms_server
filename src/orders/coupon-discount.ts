// src/orders/coupon-discount.ts
// How much a coupon takes off a cart. A platform-wide coupon (no centerId)
// applies to the whole cart; an academy coupon only to that academy's items,
// so it can never discount another academy's courses or products.
import { roundMillimes } from '../common/money';

export type PricedItem = { centerId: string | null; price: number };

export type CouponTerms = {
  centerId: string | null;
  discountPercentage: number | null;
  discountAmount: number | null;
};

// Does the coupon apply to this item?
export function couponAppliesTo(coupon: CouponTerms, item: PricedItem) {
  return coupon.centerId ? item.centerId === coupon.centerId : true;
}

// The part of the cart the coupon applies to.
export function eligibleTotal(coupon: CouponTerms, items: PricedItem[]) {
  return items
    .filter((item) => couponAppliesTo(coupon, item))
    .reduce((sum, item) => sum + item.price, 0);
}

// The discount: a percentage of the eligible part (to the nearest millime),
// or a fixed amount that is never more than the eligible part.
export function couponDiscount(coupon: CouponTerms, items: PricedItem[]) {
  const eligible = eligibleTotal(coupon, items);
  if (coupon.discountPercentage) {
    return roundMillimes(eligible * (coupon.discountPercentage / 100));
  }
  if (coupon.discountAmount) {
    return roundMillimes(Math.min(coupon.discountAmount, eligible));
  }
  return 0;
}
