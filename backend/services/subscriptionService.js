import cron from 'node-cron';
import Subscription from '../models/subscriptionModel.js';
import User from '../models/userModel.js';
import { createNotification } from './notificationService.js';

/**
 * Subscription expiry service.
 *
 * Without this, `user.rank` stayed Diamond/Predator forever: the rank was set
 * on subscribe and nothing ever set it back, so a lapsed member kept their
 * discount indefinitely. Pricing also guards against this at calculation time
 * (see config/pricing.js getEffectiveTier) — this job keeps the stored data
 * honest so the UI and the billing agree.
 */

const CHECK_INTERVAL = '0 * * * *'; // hourly
let task = null;

export const expireLapsedSubscriptions = async () => {
  const now = new Date();

  const lapsed = await Subscription.find({
    status: 'active',
    expiresAt: { $lte: now },
  }).populate('user', 'name rank');

  if (lapsed.length === 0) return { expired: 0 };

  let expired = 0;

  for (const subscription of lapsed) {
    try {
      subscription.status = 'expired';
      await subscription.save();

      const userId = subscription.user?._id || subscription.user;
      if (!userId) continue;

      // Only demote when there is no other subscription still running.
      const stillActive = await Subscription.findOne({
        user: userId,
        status: 'active',
        expiresAt: { $gt: now },
      });

      if (!stillActive) {
        await User.findByIdAndUpdate(userId, {
          rank: 'Iron',
          subscriptionExpiry: null,
        });

        await createNotification(
          userId,
          'system_announcement',
          'สมาชิกหมดอายุแล้ว',
          `แพ็กเกจ ${subscription.tierName} ของคุณหมดอายุแล้ว ระดับสมาชิกกลับเป็น Iron — ต่ออายุเพื่อรับส่วนลดต่อ`,
          { tier: subscription.tier }
        );
      }

      expired += 1;
    } catch (error) {
      console.error(`[Subscription] Failed to expire ${subscription._id}:`, error.message);
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
      await expireLapsedSubscriptions();
    } catch (error) {
      console.error('[Subscription] Scheduler error:', error);
    }
  });

  console.log('✅ Subscription expiry scheduler is running (hourly)');

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
