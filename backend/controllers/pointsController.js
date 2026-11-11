import User from "../models/userModel.js";
import PointTransaction from "../models/pointTransactionModel.js";
import { POINTS, REWARD_LIST, FREE_HOURS, TIERS, getEffectiveTier } from "../config/pricing.js";
import { redeemReward } from "../services/pointsService.js";
import { sendError } from "../utils/httpError.js";
import { logEvent } from "../utils/logger.js";

/*
    @desc   Balance, how points are earned, what they buy, recent history
    @route  GET /api/points
    @access Private
*/
export const getPoints = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("points freeBookingCredits pointsActivityAt rank subscriptionExpiry");
    if (!user) return res.status(404).json({ success: false, message: "ไม่พบผู้ใช้" });

    const history = await PointTransaction.find({ user: user._id }).sort({ createdAt: -1 }).limit(20);
    const tier = getEffectiveTier(user);

    res.json({
      success: true,
      balance: user.points || 0,
      freeBookingCredits: user.freeBookingCredits || 0,
      expiresAt: user.pointsActivityAt && user.points > 0
        ? new Date(new Date(user.pointsActivityAt).getTime() + POINTS.inactivityExpiryDays * 86400000)
        : null,
      rules: {
        completedSession: POINTS.completedSession,
        onTimeBonus: POINTS.onTimeBonus,
        freeHours: FREE_HOURS,
        inactivityExpiryDays: POINTS.inactivityExpiryDays,
        multiplier: tier.pointsMultiplier,
        multipliers: Object.fromEntries(Object.values(TIERS).map((t) => [t.id, t.pointsMultiplier])),
      },
      rewards: REWARD_LIST.map(({ id, name, description, cost }) => ({ id, name, description, cost })),
      history: history.map((h) => ({
        id: h._id,
        delta: h.delta,
        balanceAfter: h.balanceAfter,
        reason: h.reason,
        note: h.note,
        createdAt: h.createdAt,
      })),
    });
  } catch (error) {
    sendError(res, error, "โหลดข้อมูลแต้มไม่สำเร็จ", "Get points error");
  }
};

/*
    @desc   Spend points on a reward
    @route  POST /api/points/redeem   { rewardId }
    @access Private
*/
export const redeem = async (req, res) => {
  try {
    const result = await redeemReward({ userId: req.userId, rewardId: String(req.body?.rewardId || "") });
    logEvent("points_redeemed", { rewardId: req.body?.rewardId });
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, "แลกแต้มไม่สำเร็จ", "Redeem points error");
  }
};

export default { getPoints, redeem };
