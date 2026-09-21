import mongoose from "mongoose";
import User from "../models/userModel.js";
import Subscription from "../models/subscriptionModel.js";
import PromoCode from "../models/promoCodeModel.js";
import { authorizeCharge, PaymentError } from "../services/paymentService.js";
// `publicTier` lives in the pricing config so this screen and the public
// /api/pricing endpoint cannot describe the same tier differently.
import { TIER_LIST, TIERS, getEffectiveTier, publicTier } from "../config/pricing.js";

const SUBSCRIPTION_DAYS = 30;
const VOUCHER_VALID_DAYS = 30;

/*
    @desc   List tiers and the caller's current standing
    @route  GET /api/privileges
    @access Private
*/
export const getTiers = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "ไม่พบผู้ใช้" });
    }

    const subscription = await Subscription.findOne({
      user: user._id,
      status: "active",
      expiresAt: { $gt: new Date() },
    });

    // Prices and discounts come from config/pricing.js. They used to be typed
    // out again here, in the checkout maths and in the README — three numbers
    // that disagreed with each other.
    const effective = getEffectiveTier(user);

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

/*
    @desc   Subscribe to a paid tier
    @route  POST /api/privileges/subscribe
    @access Private
*/
export const subscribe = async (req, res) => {
  const session = await mongoose.startSession();
  let subscription;
  let charge;
  let tier;

  try {
    const userId = req.userId;
    const { tierId, paymentMethodId } = req.body;

    if (!tierId) throw new Error("กรุณาระบุแพ็กเกจ");

    tier = TIERS[String(tierId).toLowerCase()];
    if (!tier) throw new Error("ไม่พบแพ็กเกจที่เลือก");
    if (tier.id === "iron") throw new Error("Iron เป็นแผนฟรี ไม่ต้องสมัคร");

    await session.withTransaction(async () => {
      const now = new Date();
      const existingSub = await Subscription.findOne({
        user: userId,
        status: "active",
        expiresAt: { $gt: now },
      }).session(session);

      if (existingSub && existingSub.tier === tier.id) {
        throw new Error("คุณกำลังใช้งานแพ็กเกจนี้อยู่แล้ว");
      }

      // Charge before granting. Previously the tier was handed out for free —
      // nothing was ever billed for a subscription.
      charge = await authorizeCharge({
        userId,
        amount: tier.price,
        paymentMethodId,
        session,
        description: `SciPark ${tier.name} membership`,
      });

      const expiresAt = new Date(now.getTime() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000);

      [subscription] = await Subscription.create(
        [
          {
            user: userId,
            tier: tier.id,
            tierName: tier.name,
            price: tier.price,
            paymentMethod: charge.method?.type || "credit",
            status: "active",
            startedAt: now,
            expiresAt,
          },
        ],
        { session }
      );

      if (existingSub) {
        await Subscription.findByIdAndUpdate(existingSub._id, { status: "cancelled" }, { session });
      }

      await User.findByIdAndUpdate(
        userId,
        { rank: tier.name, subscriptionExpiry: expiresAt },
        { session }
      );
    });

    res.json({
      success: true,
      message: `สมัคร ${tier.name} สำเร็จ`,
      subscription,
      payment: { transactionId: charge.transactionId, amount: tier.price },
    });
  } catch (error) {
    if (error instanceof PaymentError) {
      return res.status(402).json({ success: false, code: error.code, message: error.message });
    }

    console.error("Subscribe error:", error);
    res.status(400).json({ success: false, message: error.message || "เกิดข้อผิดพลาด" });
  } finally {
    await session.endSession();
  }
};

/*
    @desc   Redeem a promo code
    @route  POST /api/privileges/redeem
    @access Private
*/
export const redeemCode = async (req, res) => {
  const session = await mongoose.startSession();
  let payload = {};

  try {
    const userId = req.userId;
    const { code } = req.body;

    if (!code) throw new Error("กรุณากรอกโค้ด");

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
        throw new Error("โค้ดนี้ถูกใช้งานครบแล้ว");
      }

      if (promoCode.usedBy.some((id) => String(id) === String(userId))) {
        throw new Error("คุณใช้โค้ดนี้ไปแล้ว");
      }

      const user = await User.findById(userId).session(session);
      if (!user) throw new Error("ไม่พบผู้ใช้");

      if (promoCode.type === "subscription") {
        const tier = TIERS[promoCode.tier];
        if (!tier) throw new Error("แพ็กเกจของโค้ดนี้ไม่ถูกต้อง");

        const days = promoCode.durationDays || SUBSCRIPTION_DAYS;
        const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

        const [subscription] = await Subscription.create(
          [
            {
              user: userId,
              tier: tier.id,
              tierName: tier.name,
              price: 0,
              paymentMethod: "promo_code",
              promoCode: promoCode.code,
              status: "active",
              startedAt: now,
              expiresAt,
            },
          ],
          { session }
        );

        user.rank = tier.name;
        user.subscriptionExpiry = expiresAt;
        payload = { subscription, message: `คุณได้รับ ${tier.name} ${days} วัน` };
      } else if (promoCode.type === "points") {
        const points = promoCode.points || 0;
        user.points = (user.points || 0) + points;
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
        throw new Error("ประเภทโค้ดไม่ถูกต้อง");
      }

      await user.save({ session });

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
    console.error("Redeem code error:", error);
    res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "เกิดข้อผิดพลาด",
    });
  } finally {
    await session.endSession();
  }
};
