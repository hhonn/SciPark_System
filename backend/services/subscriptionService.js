import cron from 'node-cron';
import Subscription from '../models/subscriptionModel.js';
import { syncUserTier } from './membershipService.js';
import { createNotification } from './notificationService.js';
import { runExclusive } from '../utils/jobLock.js';

/**
 * Subscription expiry service.
 *
 * Without this, `user.rank` stayed Diamond/Predator forever: the rank was set
 * on subscribe and nothing ever set it back, so a lapsed member kept their
 * discount indefinitely. Pricing also guards against this at calculation time
 * (see config/pricing.js getEffectiveTier) — this job keeps the stored data
 * honest so the UI and the billing agree.
 */

// Every 15 minutes: between a tier expiring and this sweep the member is
// billed as Iron, so the gap is kept short.
const CHECK_INTERVAL = '*/15 * * * *';
let task = null;

export const expireLapsedSubscriptions = async () => {
  const now = new Date();

  const lapsed = await Subscription.find({
    status: 'active',
    expiresAt: { $lte: now },
  }).populate('user', 'name rank');

  if (lapsed.length === 0) return { expired: 0 };

  let expired = 0;
  const affected = new Map();

  for (const subscription of lapsed) {
    try {
      subscription.status = 'expired';
      await subscription.save();
      expired += 1;

      const userId = subscription.user?._id || subscription.user;
      if (userId) affected.set(String(userId), subscription);
    } catch (error) {
      console.error(`[Subscription] Failed to expire ${subscription._id}:`, error.message);
    }
  }

  // Recompute rather than demote. The old sweep set the user to Iron unless
  // some other row was active, and otherwise left them alone — so a member
  // whose promo upgrade ended kept the expired tier's name and a past expiry
  // (billed as Iron) even though a paid subscription was still running.
  for (const [userId, subscription] of affected) {
    try {
      const before = subscription.user?.rank;
      const membership = await syncUserTier(userId, { now });

      if (membership.tier.id === 'iron') {
        await createNotification(
          userId,
          'system_announcement',
          'สมาชิกหมดอายุแล้ว',
          `แพ็กเกจ ${subscription.tierName} ของคุณหมดอายุแล้ว ระดับสมาชิกกลับเป็น Iron — ต่ออายุเพื่อรับส่วนลดต่อ`,
          { tier: subscription.tier }
        );
      } else if (before && before !== membership.tier.rank) {
        await createNotification(
          userId,
          'system_announcement',
          `แพ็กเกจ ${subscription.tierName} หมดอายุแล้ว`,
          `ตอนนี้คุณใช้สิทธิ์ ${membership.tier.name} ที่ยังเหลืออยู่`,
          { tier: membership.tier.id }
        );
      }
    } catch (error) {
      console.error(`[Subscription] Failed to resync user ${userId}:`, error.message);
    }
  }

  console.log(`[Subscription] Expired ${expired}/${lapsed.length} subscription(s).`);
  return { expired, checked: lapsed.length };
};

export const startSubscriptionScheduler = () => {
  // Guarded like the auto-cancel scheduler: calling this twice used to register
  // a second cron job, so every lapsed subscription was swept concurrently by
  // two handlers.
  if (task) return task;

  task = cron.schedule(CHECK_INTERVAL, async () => {
    try {
      await runExclusive('subscription-expiry', 14 * 60 * 1000, expireLapsedSubscriptions);
    } catch (error) {
      console.error('[Subscription] Scheduler error:', error);
    }
  });

  console.log('✅ Subscription expiry scheduler is running (every 15 min)');

  // Catch anything that lapsed while the server was down.
  setTimeout(() => {
    expireLapsedSubscriptions().catch((e) =>
      console.error('[Subscription] Initial sweep failed:', e.message)
    );
  }, 8000);

  return task;
};

/**
 * Stop the sweeper. Shutdown stopped the auto-cancel task but not this one, so
 * a cron job stayed registered and held the event loop open past SIGTERM.
 */
export const stopSubscriptionScheduler = () => {
  if (task) {
    task.stop();
    task = null;
    console.log('[Subscription] Scheduler stopped.');
  }
};

export default {
  startSubscriptionScheduler,
  stopSubscriptionScheduler,
  expireLapsedSubscriptions,
};
