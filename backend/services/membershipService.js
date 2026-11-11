import Subscription from "../models/subscriptionModel.js";
import User from "../models/userModel.js";
import { TIERS } from "../config/pricing.js";
import { HttpError } from "../utils/httpError.js";

/**
 * Membership is derived from the user's active subscriptions — not written
 * straight onto the user by whichever code path ran last.
 *
 * It used to be the latter, and it went wrong in two ways:
 *  - a paying Predator who redeemed a Diamond promo code was overwritten to
 *    Diamond, with the promo's (shorter) expiry: the paid membership was gone;
 *  - buying another tier cancelled the current subscription outright, so any
 *    days already paid for were simply lost.
 *
 * Now every grant is a Subscription row, `user.rank` / `user.subscriptionExpiry`
 * are a cache recomputed by `syncUserTier`, and grants follow three rules:
 *  - same tier: stacks — the new days start when the current ones end;
 *  - higher tier: starts now; the lower one stays and resumes if it outlasts it;
 *  - lower tier: refused while a higher one is running (and a promo code is
 *    not used up by the refusal).
 */

const RANK = { iron: 0, diamond: 1, predator: 2 };
const DAY_MS = 24 * 60 * 60 * 1000;

export const thaiDate = (date) =>
  new Date(date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

/** Active, not yet expired (including ones queued to start later). */
const loadLiveSubscriptions = (userId, now, session) =>
  Subscription.find({ user: userId, status: "active", expiresAt: { $gt: now } })
    .sort({ startedAt: 1 })
    .session(session);

/**
 * The tier in force at `now`, and when it runs out — following a chain of
 * back-to-back subscriptions of that tier.
 */
export const resolveMembership = (subscriptions, now = new Date()) => {
  const running = subscriptions.filter((s) => s.startedAt <= now && s.expiresAt > now);
  if (running.length === 0) return { tier: TIERS.iron, expiresAt: null };

  const best = running.reduce((a, b) => (RANK[b.tier] > RANK[a.tier] ? b : a)).tier;

  let end = Math.max(...running.filter((s) => s.tier === best).map((s) => s.expiresAt.getTime()));
  for (const s of subscriptions.filter((x) => x.tier === best)) {
    if (s.startedAt.getTime() <= end && s.expiresAt.getTime() > end) end = s.expiresAt.getTime();
  }

  return { tier: TIERS[best], expiresAt: new Date(end) };
};

/**
 * Users seeded or upgraded before this module existed carry a rank and expiry
 * with no Subscription row behind them. Record that grant as a row once, so a
 * recompute does not quietly take it away.
 */
const adoptLegacyGrant = async (user, subscriptions, now, session) => {
  const tierId = String(user.rank || "Iron").toLowerCase();
  const expiry = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
  if (!TIERS[tierId] || tierId === "iron" || !expiry || expiry <= now) return false;

  // Only for accounts that have never had a subscription row. Once rows
  // exist they are the truth, and the cached rank on the user is just a
  // cache — adopting it then would resurrect a tier that has just expired.
  if (subscriptions.length > 0) return false;
  if (await Subscription.exists({ user: user._id }).session(session)) return false;

  await Subscription.create(
    [{
      user: user._id,
      tier: tierId,
      tierName: TIERS[tierId].name,
      price: 0,
      paymentMethod: "legacy",
      status: "active",
      startedAt: now,
      expiresAt: expiry,
    }],
    { session }
  );
  return true;
};

/** Recompute and store the user's tier from their subscriptions. */
export const syncUserTier = async (userId, { session = null, now = new Date() } = {}) => {
  const user = await User.findById(userId).session(session);
  if (!user) throw new HttpError(404, "ไม่พบผู้ใช้");

  let subscriptions = await loadLiveSubscriptions(userId, now, session);
  if (await adoptLegacyGrant(user, subscriptions, now, session)) {
    subscriptions = await loadLiveSubscriptions(userId, now, session);
  }

  const membership = resolveMembership(subscriptions, now);
  await User.updateOne(
    { _id: userId },
    { rank: membership.tier.rank, subscriptionExpiry: membership.expiresAt },
    { session }
  );
  return membership;
};

/**
 * Grant `days` of `tierId`, following the stacking rules above.
 *
 * @param {object}   opts
 * @param {Function} [opts.beforeCreate]  runs after the rules pass and before
 *                   the row is written — the subscribe flow charges the card
 *                   here, so a refused grant is never billed.
 * @returns {{ subscription, membership, kind: "renewal"|"upgrade"|"new" }}
 * @throws  {HttpError} 409 for a downgrade while a higher tier is running
 */
export const grantMembership = async ({
  userId,
  tierId,
  days,
  price = 0,
  paymentMethod = "credit",
  promoCode = null,
  session = null,
  beforeCreate = null,
}) => {
  const tier = TIERS[tierId];
  if (!tier || tier.id === "iron") throw new HttpError(400, "ไม่พบแพ็กเกจที่เลือก");

  const now = new Date();
  // Brings legacy grants in first, so the rules see the user's real standing.
  const current = await syncUserTier(userId, { session, now });

  if (RANK[tier.id] < RANK[current.tier.id]) {
    throw new HttpError(
      409,
      `คุณเป็นสมาชิก ${current.tier.name} อยู่ถึง ${thaiDate(current.expiresAt)} ` +
        `จึงใช้แพ็กเกจ ${tier.name} ไม่ได้จนกว่าแพ็กเกจปัจจุบันจะหมดอายุ`,
      "lower_tier_active"
    );
  }

  const kind = tier.id === current.tier.id ? "renewal" : current.tier.id === "iron" ? "new" : "upgrade";
  const startedAt = kind === "renewal" ? current.expiresAt : now;

  if (beforeCreate) await beforeCreate();

  const [subscription] = await Subscription.create(
    [{
      user: userId,
      tier: tier.id,
      tierName: tier.name,
      price,
      paymentMethod,
      promoCode,
      status: "active",
      startedAt,
      expiresAt: new Date(startedAt.getTime() + days * DAY_MS),
    }],
    { session }
  );

  const membership = await syncUserTier(userId, { session, now });
  return { subscription, membership, kind };
};

export default { resolveMembership, syncUserTier, grantMembership, thaiDate };
