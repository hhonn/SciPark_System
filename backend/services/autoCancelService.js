import cron from 'node-cron';
import Booking from '../models/bookingModel.js';
import { expirePendingBooking } from './checkInService.js';
import { CHECKIN_GRACE_MINUTES } from '../config/pricing.js';
import { notifyBookingCancelled, notifyCheckInReminder } from './notificationService.js';
import { runExclusive } from '../utils/jobLock.js';
import { logEvent } from '../utils/logger.js';

// Auto-Cancel Reservation Service
//
// ยกเลิกการจองอัตโนมัติเมื่อผู้ใช้ไม่ check-in ภายในเวลาที่กำหนด
// - Grace period: ดู CHECKIN_GRACE_MINUTES ใน config/pricing.js
// - ตรวจทุก 1 นาที (เดิม 5 นาที ทำให้ช่องจอดถูกค้างไว้นานเกินจำเป็น)
// - pending -> cancelled, spot: reserved -> available
// - ค่าจองไม่คืน

const CHECK_INTERVAL = '* * * * *'; // every minute
let task = null;

// How long before the deadline the "you are about to lose your booking fee"
// warning goes out. A third of the grace period leaves enough time to act
// without nagging someone who has only just booked.
const REMINDER_MINUTES = Math.max(1, Math.round(CHECKIN_GRACE_MINUTES / 3));

// Warn users whose check-in window is closing.
//
// Both the Terms and the Privacy policy promise this reminder, and
// `notifyCheckInReminder` has always existed in the notification service, but
// nothing ever called it, so the first a user heard of a lapsed booking was the
// cancellation notice, after the 20 THB was already forfeited.
export const sendCheckInReminders = async (now = new Date()) => {
  const windowEnd = new Date(now.getTime() + REMINDER_MINUTES * 60 * 1000);

  const soon = await Booking.find({
    status: 'pending',
    isCheckedIn: false,
    reminderSentAt: null,
    checkInDeadline: { $gt: now, $lte: windowEnd },
  }).populate('spot', 'spotNumber name');

  let sent = 0;

  for (const booking of soon) {
    try {
      const minutesLeft = Math.max(
        1,
        Math.ceil((new Date(booking.checkInDeadline).getTime() - now.getTime()) / 60000)
      );

      await notifyCheckInReminder(
        booking.user,
        { bookingId: booking._id, spotName: booking.spot?.spotNumber || 'N/A' },
        minutesLeft
      );

      // Stamped only after the notification lands, so a failure here retries
      // on the next sweep instead of silently swallowing the warning.
      booking.reminderSentAt = now;
      await booking.save();
      sent += 1;
    } catch (error) {
      console.error(`[AutoCancel] Reminder failed for ${booking._id}:`, error.message);
    }
  }

  if (sent > 0) console.log(`[AutoCancel] Sent ${sent} check-in reminder(s).`);
  return { sent, checked: soon.length };
};

export const autoCancelExpiredBookings = async () => {
  const now = new Date();

  const expiredBookings = await Booking.find({
    status: 'pending',
    checkInDeadline: { $lt: now },
    isCheckedIn: false,
  })
    .populate('user', 'name email username')
    .populate('spot', 'spotNumber name');

  if (expiredBookings.length === 0) {
    return { cancelled: 0, checked: 0 };
  }

  let cancelledCount = 0;
  const errors = [];

  for (const booking of expiredBookings) {
    try {
      // Conditional on the booking still being pending. Saving the document
      // loaded above overwrote whatever had happened since, so a driver
      // checked in at the last second came back "cancelled" with their spot
      // released to the next person.
      const cancelled = await expirePendingBooking(booking._id, now);
      if (!cancelled) continue;

      cancelledCount += 1;
      logEvent('booking_cancelled', { reason: 'timeout' });

      console.log(
        `[AutoCancel] Cancelled booking ${booking._id} ` +
        `(user: ${booking.user?.username}, spot: ${booking.spot?.spotNumber}, ` +
        `fee ${booking.bookingFee} THB not refunded)`
      );

      // The user was never told their booking was cancelled. Only the server log
      // knew. Now they get the same notification as every other state change.
      await notifyBookingCancelled(
        booking.user?._id || booking.user,
        { bookingId: booking._id, spotName: booking.spot?.spotNumber || 'N/A' },
        `ไม่ได้ check-in ภายใน ${CHECKIN_GRACE_MINUTES} นาที`
      );
    } catch (error) {
      console.error(`[AutoCancel] Error cancelling booking ${booking._id}:`, error.message);
      errors.push({ bookingId: booking._id, error: error.message });
    }
  }

  console.log(`[AutoCancel] ${cancelledCount}/${expiredBookings.length} cancelled.`);

  return {
    timestamp: now.toISOString(),
    checked: expiredBookings.length,
    cancelled: cancelledCount,
    failed: errors.length,
    errors,
  };
};

export const startAutoCancelScheduler = () => {
  if (task) return task;

  console.log('🚀 Auto-Cancel Scheduler starting');
  console.log(`   Grace period : ${CHECKIN_GRACE_MINUTES} minutes`);
  console.log(`   Reminder at  : ${REMINDER_MINUTES} minutes left`);
  console.log('   Check every  : 1 minute');

  task = cron.schedule(CHECK_INTERVAL, async () => {
    try {
      // One instance per minute, however many are running.
      await runExclusive('auto-cancel', 55 * 1000, async () => {
        await sendCheckInReminders();
        await autoCancelExpiredBookings();
      });
    } catch (error) {
      console.error('[AutoCancel] Scheduler error:', error);
    }
  });

  // Catch anything that expired while the server was down.
  setTimeout(() => {
    autoCancelExpiredBookings().catch((e) =>
      console.error('[AutoCancel] Initial sweep failed:', e.message)
    );
  }, 5000);

  return task;
};

export const stopAutoCancelScheduler = () => {
  // Stop only our own task. The previous version called cron.getTasks() and
  // stopped every scheduled job in the process, including the subscription
  // sweeper.
  if (task) {
    task.stop();
    task = null;
    console.log('[AutoCancel] Scheduler stopped.');
  }
};

export default {
  startAutoCancelScheduler,
  stopAutoCancelScheduler,
  autoCancelExpiredBookings,
  sendCheckInReminders,
};
