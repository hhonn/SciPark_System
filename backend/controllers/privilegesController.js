import mongoose from "mongoose";
import { HttpError, sendError } from "../utils/httpError.js";
import User from "../models/userModel.js";
import Subscription from "../models/subscriptionModel.js";
import PromoCode from "../models/promoCodeModel.js";
import { authorizeCharge, PaymentError } from "../services/paymentService.js";
import { grantMembership, resolveMembership, thaiDate } from "../services/membershipService.js";
import { addPoints } from "../services/pointsService.js";
// `publicTier` lives in the pricing config so this screen and the public
// /api/pricing endpoint cannot describe the same tier differently.
import { TIER_LIST, TIERS, getEffectiveTier, publicTier } from "../config/pricing.js";

const SUBSCRIPTION_DAYS = 30;
const VOUCHER_VALID_DAYS = 30;

// @desc   List tiers and the caller's current standing
// @route  GET /api/privileges
// @access Private
export const getTiers = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "ไม่พบผู้ใช้" });
    }

    const now = new Date();
    const live = await Subscription.find({ user: user._id, status: "active", expiresAt: { $gt: now } })
      .sort({ startedAt: 1 });

    // Prices and discounts come from config/pricing.js. They used to be typed
    // out again here, in the checkout maths and in the README: three numbers
    // that disagreed with each other.
    const effective = getEffectiveTier(user);

    // The period actually in force, end to end: stacked renewals included,
    // not just whichever single row a findOne happened to return.
    const membership = resolveMembership(live, now);
    const subscription = membership.tier.id !== "iron"
      ? { tier: membership.tier.id, tierName: membership.tier.name, expiresAt: membership.expiresAt }
      : effective.id !== "iron"
        ? { tier: effective.id, tierName: effective.name, expiresAt: user.subscriptionExpiry }
        : null;

    res.json({
      success: true,
      tiers: TIER_LIST.map(publicTier),
      currentTier: effective.name,
      storedRank: user.rank,
      subscription: subscription || null,
      points: user.points || 0,
      activeDiscount: user.activeDiscount || null,
    });
  } catch (error) {
    console.error("Get tiers error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

// @desc   Subscribe to a paid tier
// @route  POST /api/privileges/subscribe
// @access Private
export const subscribe = async (req, res) => {
  const session = await mongoose.startSession();
  let subscription;
  let charge;
  let tier;

  try {
    const userId = req.userId;
    const { tierId, paymentMethodId } = req.body;

    if (!tierId) throw new HttpError(400, "กรุณาระบุแพ็กเกจ");

    tier = TIERS[String(tierId).toLowerCase()];
    if (!tier) throw new HttpError(400, "ไม่พบแพ็กเกจที่เลือก");
    if (tier.id === "iron") throw new HttpError(400, "Iron เป็นแผนฟรี ไม่ต้องสมัคร");

    let granted;

    await session.withTransaction(async () => {
      // Renewing stacks onto the current period and upgrading keeps the old
      // one to resume later; neither throws away days already paid for. A
      // downgrade while a higher tier runs is refused before any charge.
      granted = await grantMembership({
        userId,
        tierId: tier.id,
        days: SUBSCRIPTION_DAYS,
        price: tier.price,
        session,
        // Charge only once the grant is known to be allowed.
        beforeCreate: async () => {
          charge = await authorizeCharge({
            userId,
            amount: tier.price,
            paymentMethodId,
            session,
            description: `SciPark ${tier.name} membership`,
          });
        },
      });
      subscription = granted.subscription;
      subscription.paymentMethod = charge.method?.type || "credit";
      await subscription.save({ session });
    });

    const until = thaiDate(granted.membership.expiresAt);
    const message = {
      renewal: `ต่ออายุ ${tier.name} สำเร็จ ใช้ได้ถึง ${until}`,
      upgrade: `อัปเกรดเป็น ${tier.name} สำเร็จ ใช้ได้ถึง ${until}`,
      new: `สมัคร ${tier.name} สำเร็จ ใช้ได้ถึง ${until}`,
    }[granted.kind];

    res.json({
      success: true,
      message,
      subscription,
      membership: { tier: granted.membership.tier.name, expiresAt: granted.membership.expiresAt },
      payment: { transactionId: charge.transactionId, amount: tier.price },
    });
  } catch (error) {
    if (error instanceof PaymentError) {
      return res.status(402).json({ success: false, code: error.code, message: error.message });
    }

    sendError(res, error, "เกิดข้อผิดพลาด", "Subscribe error");
  } finally {
    await session.endSession();
  }
};

// @desc   Redeem a promo code
// @route  POST /api/privileges/redeem
// @access Private
export const redeemCode = async (req, res) => {
  const session = await mongoose.startSession();
  let payload = {};

  try {
    const userId = req.userId;
    const { code } = req.body;

    if (!code) throw new HttpError(400, "กรุณากรอกโค้ด");

    await session.withTransaction(async () => {
      const now = new Date();
      const promoCode = await PromoCode.findOne({
        code: String(code).toUpperCase().trim(),
        isActive: true,
        expiresAt: { $gt: now },
      }).session(session);

      if (!promoCode) {
        const err = new Error("โค้ดไม่ถูกต้องหรือหมดอายุแล้ว");
        err.statusCode = 404;
        throw err;
      }

      if (promoCode.maxUses && promoCode.usedCount >= promoCode.maxUses) {
        throw new HttpError(400, "โค้ดนี้ถูกใช้งานครบแล้ว");
      }

      if (promoCode.usedBy.some((id) => String(id) === String(userId))) {
        throw new HttpError(400, "คุณใช้โค้ดนี้ไปแล้ว");
      }

      const user = await User.findById(userId).session(session);
      if (!user) throw new HttpError(400, "ไม่พบผู้ใช้");

      if (promoCode.type === "subscription") {
        const tier = TIERS[promoCode.tier];
        if (!tier) throw new HttpError(400, "แพ็กเกจของโค้ดนี้ไม่ถูกต้อง");

        const days = promoCode.durationDays || SUBSCRIPTION_DAYS;

        // Used to write rank/expiry straight onto the user, so a paying
        // Predator redeeming a Diamond code was downgraded and lost the paid
        // days. A refused grant throws here, before the code is marked used.
        const { subscription, membership } = await grantMembership({
          userId,
          tierId: tier.id,
          days,
          paymentMethod: "promo_code",
          promoCode: promoCode.code,
          session,
        });

        payload = {
          subscription,
          message: `คุณได้รับ ${tier.name} เพิ่ม ${days} วัน (ใช้ได้ถึง ${thaiDate(membership.expiresAt)})`,
        };
      } else if (promoCode.type === "points") {
        const points = promoCode.points || 0;
        await addPoints({ userId, amount: points, reason: "promo_code", note: promoCode.code, session });
        payload = { points, message: `คุณได้รับ ${points} แต้ม` };
      } else if (promoCode.type === "discount") {
        // This branch simply did not exist: every "discount" code fell through to
        // "ประเภทโค้ดไม่ถูกต้อง", so the seeded DISCOUNT50 could never be used.
        const percent = promoCode.discountPercent || 0;
        user.activeDiscount = {
          percent,
          code: promoCode.code,
          expiresAt: new Date(now.getTime() + VOUCHER_VALID_DAYS * 24 * 60 * 60 * 1000),
        };
        payload = {
          discount: { percent, expiresAt: user.activeDiscount.expiresAt },
          message: `คุณได้รับส่วนลด ${percent}% สำหรับค่าจอดเกินเวลาครั้งถัดไป`,
        };
      } else {
        throw new HttpError(400, "ประเภทโค้ดไม่ถูกต้อง");
      }

      // The subscription branch saved through grantMembership; saving this
      // older copy of the user would write back its stale rank.
      // Subscriptions and points were written through their services; saving
      // this older copy of the user would write back a stale rank or balance.
      if (promoCode.type === "discount") await user.save({ session });

      promoCode.usedCount += 1;
      promoCode.usedBy.push(userId);
      await promoCode.save({ session });

    });

    res.json({
      success: true,
      message: `แลกโค้ดสำเร็จ! ${payload.message}`,
      ...payload,
    });
  } catch (error) {
    sendError(res, error, "เกิดข้อผิดพลาด", "Redeem code error");
  } finally {
    await session.endSession();
  }
};
