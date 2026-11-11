/**
 * Pricing & membership — SINGLE SOURCE OF TRUTH.
 *
 * Every fee, discount and grace period in the system is derived from this file.
 * Do not hard-code these numbers anywhere else (controllers, seeds, docs, UI copy).
 */

/** Non-refundable fee charged the moment a booking is created (THB). */
export const BOOKING_FEE = 20;

/** Hours of parking included in the booking fee. */
export const FREE_HOURS = 3;

/** Charged per started hour after FREE_HOURS (THB/hour). */
export const OVERTIME_RATE = 10;

/** Minutes the user has to check in before the booking is auto-cancelled. */
export const CHECKIN_GRACE_MINUTES = 30;

/** Membership tiers. `rank` is what is stored on the user document. */
export const TIERS = {
  iron: {
    id: "iron",
    rank: "Iron",
    name: "Iron",
    price: 0,
    /** Fraction off the overtime fee (never off the booking fee). */
    discount: 0,
    /** Multiplies the points a finished session earns (see POINTS). */
    pointsMultiplier: 1,
    maxVehicles: 1,
    features: [
      "จองได้ทุกโซน",
      "3 ชั่วโมงแรกฟรีทุกการจอง",
      "แจ้งเตือนพื้นฐาน",
      "รองรับ 1 ยานพาหนะ",
    ],
  },
  diamond: {
    id: "diamond",
    rank: "Diamond",
    name: "Diamond",
    price: 199,
    discount: 0.1,
    pointsMultiplier: 1.5,
    maxVehicles: 3,
    features: [
      "ส่วนลด 10% ค่าจอดเกินเวลา",
      "3 ชั่วโมงแรกฟรีทุกการจอง",
      "ประวัติการจอดไม่จำกัด",
      "แจ้งเตือนแบบ Real-time",
      "รองรับ 3 ยานพาหนะ",
      "แต้มสะสม ×1.5",
    ],
  },
  predator: {
    id: "predator",
    rank: "Predator",
    name: "Predator",
    price: 399,
    discount: 0.15,
    pointsMultiplier: 2,
    maxVehicles: 10,
    features: [
      "ส่วนลด 15% ค่าจอดเกินเวลา",
      "3 ชั่วโมงแรกฟรีทุกการจอง",
      "ประวัติการจอดไม่จำกัด",
      "แจ้งเตือนแบบ Real-time",
      "รองรับ 10 ยานพาหนะ",
      "แต้มสะสม ×2",
      "บริการช่วยเหลือ 24/7",
    ],
  },
};

export const TIER_LIST = Object.values(TIERS);

/**
 * Loyalty points.
 *
 * Points used to be earned per hour parked — the longer a car sat in a bay,
 * the more it earned. In a lot with too few bays that rewards exactly the
 * wrong thing. They now reward showing up and leaving on time:
 *  - a session that was checked in and checked out (and paid) earns a base,
 *  - leaving within the free hours earns a bonus on top,
 *  - a no-show earns nothing,
 * multiplied by the member's tier.
 */
export const POINTS = {
  completedSession: 10,
  onTimeBonus: 5,
  /** Points lapse after this long with no earning or spending at all. */
  inactivityExpiryDays: 365,
};

/** What points can buy. Costs are in points. */
export const REWARDS = {
  free_booking: {
    id: "free_booking",
    name: "จองฟรี 1 ครั้ง",
    description: `ไม่เสียค่าธรรมเนียมการจอง ${BOOKING_FEE} บาทในการจองครั้งถัดไปที่เลือกใช้สิทธิ์`,
    cost: 150,
  },
  overtime_voucher: {
    id: "overtime_voucher",
    name: "คูปองลดค่าจอดเกินเวลา 50%",
    description: "ใช้กับการเช็คเอาต์ครั้งถัดไปที่มีค่าจอดเกินเวลา ใช้ได้ 30 วัน",
    cost: 80,
    percent: 50,
    validDays: 30,
  },
  diamond_trial: {
    id: "diamond_trial",
    name: "ทดลอง Diamond 7 วัน",
    description: "ส่วนลด 10% ค่าจอดเกินเวลาและสิทธิ์ทั้งหมดของ Diamond (ต่อท้ายถ้าเป็น Diamond อยู่แล้ว)",
    cost: 400,
    tier: "diamond",
    days: 7,
  },
};

export const REWARD_LIST = Object.values(REWARDS);

/** Points a finished, paid session earns. */
export const pointsForSession = ({ durationHours, tier }) => {
  const base = POINTS.completedSession + (durationHours <= FREE_HOURS ? POINTS.onTimeBonus : 0);
  return Math.floor(base * (tier?.pointsMultiplier || 1));
};

/**
 * A tier as the API exposes it. Lives here rather than in a controller so the
 * privileges screen and the public pricing endpoint cannot describe the same
 * tier differently.
 */
export const publicTier = (tier) => ({
  id: tier.id,
  name: tier.name,
  price: tier.price,
  discount: Math.round(tier.discount * 100),
  pointsMultiplier: tier.pointsMultiplier,
  maxVehicles: tier.maxVehicles,
  features: tier.features,
});

/**
 * Every number the UI needs to quote a price, in one payload.
 *
 * The frontend used to carry its own copies of these — in seven different
 * files — so changing a fee here left the booking screen, the landing page and
 * the terms of service all quoting the old one.
 */
export const publicPricing = () => ({
  bookingFee: BOOKING_FEE,
  freeHours: FREE_HOURS,
  overtimeRate: OVERTIME_RATE,
  graceMinutes: CHECKIN_GRACE_MINUTES,
});

/**
 * Resolve a user document to the tier that is actually in force right now.
 * An expired subscription silently falls back to Iron so a lapsed member is
 * never charged the discounted rate.
 */
export const getEffectiveTier = (user) => {
  if (!user) return TIERS.iron;

  const rank = String(user.rank || "Iron").toLowerCase();
  const tier = TIERS[rank];
  if (!tier || tier.id === "iron") return TIERS.iron;

  const expiry = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
  if (!expiry || expiry.getTime() <= Date.now()) return TIERS.iron;

  return tier;
};

/** Round money to 2 decimals without float drift (e.g. 8.999999 -> 9). */
const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Calculate what a finished parking session costs.
 *
 * @param {Date} startedAt  actual check-in time
 * @param {Date} endedAt    actual check-out time
 * @param {object} user     user document (for tier discount + points)
 * @param {number} bookingFee  fee already charged at booking time
 * @param {object} [voucher]   optional one-shot discount { percent }
 */
export const calculateSessionCost = ({ startedAt, endedAt, user, bookingFee = BOOKING_FEE, voucher = null }) => {
  const durationMs = Math.max(0, new Date(endedAt) - new Date(startedAt));
  const durationHours = durationMs / (1000 * 60 * 60);

  const tier = getEffectiveTier(user);

  // Overtime is billed per *started* hour beyond the free allowance.
  const overtimeHours = Math.max(0, durationHours - FREE_HOURS);
  const chargeableHours = Math.ceil(overtimeHours);
  const grossOvertime = chargeableHours * OVERTIME_RATE;

  const tierDiscount = grossOvertime * tier.discount;
  const voucherPercent = voucher?.percent ? Math.min(100, voucher.percent) / 100 : 0;
  // The voucher applies to whatever is left after the membership discount.
  const voucherDiscount = (grossOvertime - tierDiscount) * voucherPercent;

  const overtimeCost = money(Math.max(0, grossOvertime - tierDiscount - voucherDiscount));
  const pointsEarned = pointsForSession({ durationHours, tier });

  return {
    durationMs,
    durationHours,
    hours: Math.floor(durationHours),
    minutes: Math.floor((durationHours % 1) * 60),
    freeHours: FREE_HOURS,
    overtimeRate: OVERTIME_RATE,
    overtimeHours: money(overtimeHours),
    chargeableHours,
    grossOvertime: money(grossOvertime),
    tier: tier.id,
    tierName: tier.name,
    discountPercent: Math.round(tier.discount * 100),
    discountAmount: money(tierDiscount),
    voucherPercent: Math.round(voucherPercent * 100),
    voucherDiscount: money(voucherDiscount),
    overtimeCost,
    bookingFee,
    totalCost: money(bookingFee + overtimeCost),
    pointsEarned,
  };
};

export default {
  BOOKING_FEE,
  FREE_HOURS,
  OVERTIME_RATE,
  CHECKIN_GRACE_MINUTES,
  TIERS,
  TIER_LIST,
  POINTS,
  REWARDS,
  REWARD_LIST,
  pointsForSession,
  publicTier,
  publicPricing,
  getEffectiveTier,
  calculateSessionCost,
};