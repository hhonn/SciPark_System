/**
 * End-to-end smoke test (`npm run smoke`).
 *
 * Boots the real Express app against an in-memory MongoDB and walks the whole
 * booking lifecycle, asserting the behaviours the Test_Case_SciPark document
 * specifies. No network, no external database — safe to run anywhere.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'smoke_test_secret_key_that_is_long_enough';
process.env.NODE_ENV = 'test';

let passed = 0;
let failed = 0;

const check = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}\n      ${error.message}`);
  }
};

const run = async () => {
  // A replica set, not a standalone: the controllers use multi-document
  // transactions, which standalone mongod refuses. Atlas is always a replica
  // set, so this matches production.
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGO_URI = mongo.getUri();

  await mongoose.connect(process.env.MONGO_URI);

  // Import only after the env is set, so modules read the right config.
  const { default: User } = await import('../models/userModel.js');
  const { default: ParkingZone } = await import('../models/parkingZoneModel.js');
  const { default: ParkingSpot } = await import('../models/parkingSpotModel.js');
  const { default: PaymentMethod } = await import('../models/paymentMethodModel.js');
  const { default: Booking } = await import('../models/bookingModel.js');
  const { default: PromoCode } = await import('../models/promoCodeModel.js');
  const bcrypt = (await import('bcryptjs')).default;

  const bookingCtrl = await import('../controllers/bookingController.js');
  const privilegesCtrl = await import('../controllers/privilegesController.js');
  const pricing = await import('../config/pricing.js');
  const { autoCancelExpiredBookings } = await import('../services/autoCancelService.js');
  const { expireLapsedSubscriptions } = await import('../services/subscriptionService.js');

  // --- Minimal req/res doubles -------------------------------------------
  const call = (handler, { body = {}, params = {}, query = {}, userId } = {}) =>
    new Promise((resolve) => {
      let statusCode = 200;
      const res = {
        status(code) {
          statusCode = code;
          return res;
        },
        json(payload) {
          resolve({ status: statusCode, body: payload });
          return res;
        },
      };
      handler({ body, params, query, userId }, res);
    });

  // --- Fixtures -----------------------------------------------------------
  const user = await User.create({
    name: 'Smoke Tester',
    email: 'smoke@test.com',
    username: 'smoke',
    password: await bcrypt.hash('password123', 10),
    phone: '0812345678',
    rank: 'Iron',
  });

  const zone = await ParkingZone.create({
    zoneName: 'SMOKE',
    name: 'ลานทดสอบ',
    building: 'อาคารทดสอบ',
    totalSpots: 2,
    hourlyRate: 10,
  });

  await ParkingSpot.create([
    { name: 'ช่อง A01', spotNumber: 'A01', zone: zone._id, status: 'available', pricePerHour: 10 },
    { name: 'ช่อง A02', spotNumber: 'A02', zone: zone._id, status: 'available', pricePerHour: 10 },
  ]);

  const uid = user._id.toString();

  console.log('\nPricing (config/pricing.js)');

  await check('overtime bills per started hour after the free allowance', () => {
    const bill = pricing.calculateSessionCost({
      startedAt: new Date(Date.now() - 4.2 * 3600 * 1000),
      endedAt: new Date(),
      user: { rank: 'Iron' },
    });
    // 4.2h - 3h free = 1.2h -> 2 started hours -> 20 THB
    assert.equal(bill.chargeableHours, 2);
    assert.equal(bill.overtimeCost, 20);
    assert.equal(bill.totalCost, 40);
  });

  await check('an expired subscription is billed at the Iron rate', () => {
    const lapsed = { rank: 'Predator', subscriptionExpiry: new Date(Date.now() - 1000) };
    assert.equal(pricing.getEffectiveTier(lapsed).id, 'iron');
    const bill = pricing.calculateSessionCost({
      startedAt: new Date(Date.now() - 5 * 3600 * 1000),
      endedAt: new Date(),
      user: lapsed,
    });
    assert.equal(bill.discountPercent, 0);
  });

  await check('a live Predator gets exactly 15% off overtime', () => {
    const bill = pricing.calculateSessionCost({
      startedAt: new Date(Date.now() - 5 * 3600 * 1000),
      endedAt: new Date(),
      user: { rank: 'Predator', subscriptionExpiry: new Date(Date.now() + 86400000) },
    });
    assert.equal(bill.grossOvertime, 20);
    assert.equal(bill.overtimeCost, 17);
  });

  console.log('\nBooking flow (Test Cases 1-3, 19-21)');

  await check('TC3: booking is refused when no payment method exists', async () => {
    const res = await call(bookingCtrl.createBooking, { body: { zoneId: zone._id.toString() }, userId: uid });
    assert.equal(res.status, 402);
    assert.equal(res.body.code, 'no_payment_method');

    // Critical: the declined attempt must not have held a spot.
    const held = await ParkingSpot.countDocuments({ zone: zone._id, status: 'reserved' });
    assert.equal(held, 0, 'a spot was left reserved after a failed payment');
    assert.equal(await Booking.countDocuments({}), 0, 'a booking survived a failed payment');
  });

  const card = await PaymentMethod.create({
    user: user._id,
    type: 'credit_card',
    cardLast4: '1111',
    cardBrand: 'Visa',
    cardHolderName: 'SMOKE TESTER',
    expiryMonth: '12',
    expiryYear: String(new Date().getFullYear() + 3),
    isDefault: true,
  });

  let bookingId;

  await check('TC1/TC20: booking assigns a spot, charges 20 THB and issues a QR', async () => {
    const res = await call(bookingCtrl.createBooking, { body: { zoneId: zone._id.toString() }, userId: uid });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.payment.amount, 20);
    assert.ok(res.body.data.spot.spotNumber, 'no spot number was assigned');
    assert.ok(res.body.data.qrCode.token, 'no QR token was issued');
    assert.ok(res.body.data.checkInDeadline, 'no check-in deadline was set');

    bookingId = res.body.data.bookingId.toString();
    global.__qrToken = res.body.data.qrCode.token;

    // The spot is held, not yet occupied: nobody has parked in it.
    const spot = await ParkingSpot.findById(res.body.data.spot.id);
    assert.equal(spot.status, 'reserved');
  });

  await check('QR credential is persisted as a hash, never in the clear', async () => {
    const stored = await Booking.findById(bookingId).select('+qrTokenHash');
    assert.ok(stored.qrTokenHash, 'QR hash was not stored');
    assert.notEqual(stored.qrTokenHash, global.__qrToken, 'the raw token was stored');
  });

  await check('a second concurrent booking is rejected for the same user', async () => {
    const res = await call(bookingCtrl.createBooking, { body: { zoneId: zone._id.toString() }, userId: uid });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /มีการจองที่ใช้งานอยู่/);
  });

  console.log('\nCheck-in (Test Cases 6-7)');

  await check('check-in is refused without a valid QR token', async () => {
    const res = await call(bookingCtrl.checkIn, {
      params: { bookingId },
      body: { qrPayload: 'a'.repeat(64) },
      userId: uid,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'invalid_qr');
  });

  await check('TC6: a valid QR checks in and marks the spot occupied', async () => {
    const res = await call(bookingCtrl.checkIn, {
      params: { bookingId },
      body: { qrPayload: global.__qrToken },
      userId: uid,
    });
    assert.equal(res.status, 200);

    const booking = await Booking.findById(bookingId);
    assert.equal(booking.status, 'confirmed');
    assert.ok(booking.actualStartTime, 'check-in time was not recorded');

    const spot = await ParkingSpot.findById(booking.spot);
    assert.equal(spot.status, 'occupied');
  });

  await check('the QR cannot be replayed after a successful check-in', async () => {
    const res = await call(bookingCtrl.checkIn, {
      params: { bookingId },
      body: { qrPayload: global.__qrToken },
      userId: uid,
    });
    assert.equal(res.status, 400);
  });

  console.log('\nCheck-out (Test Cases 8-10)');

  await check('TC10: check-out bills, releases the spot and awards points', async () => {
    // Pretend the car has been parked for four and a bit hours.
    await Booking.findByIdAndUpdate(bookingId, {
      actualStartTime: new Date(Date.now() - 4.5 * 3600 * 1000),
    });

    const res = await call(bookingCtrl.checkOut, { params: { bookingId }, userId: uid });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.pricing.chargeableHours, 2);
    assert.equal(res.body.data.pricing.totalCost, 40);
    assert.ok(res.body.data.pointsEarned > 0, 'no points were awarded at check-out');

    const booking = await Booking.findById(bookingId);
    assert.equal(booking.status, 'completed');
    assert.equal(booking.paymentStatus, 'settled');

    const spot = await ParkingSpot.findById(booking.spot);
    assert.equal(spot.status, 'available', 'the spot was not released');

    const fresh = await User.findById(user._id);
    assert.equal(fresh.points, res.body.data.pointsEarned, 'points were not credited to the user');
  });

  console.log('\nAuto-cancel (Test Case 7)');

  await check('TC7: an un-checked-in booking is cancelled and its spot freed', async () => {
    const res = await call(bookingCtrl.createBooking, { body: { zoneId: zone._id.toString() }, userId: uid });
    const newId = res.body.data.bookingId;

    // Push the deadline into the past.
    await Booking.findByIdAndUpdate(newId, { checkInDeadline: new Date(Date.now() - 60000) });

    const result = await autoCancelExpiredBookings();
    assert.equal(result.cancelled, 1);

    const booking = await Booking.findById(newId);
    assert.equal(booking.status, 'cancelled');
    assert.equal(booking.cancelReason, 'auto_cancelled_timeout');
    assert.equal(booking.refundable, false, 'the 20 THB fee was marked refundable');

    const spot = await ParkingSpot.findById(booking.spot);
    assert.equal(spot.status, 'available');
  });

  await check('TC2: a full zone reports "full" instead of overbooking', async () => {
    await ParkingSpot.updateMany({ zone: zone._id }, { status: 'occupied' });
    const res = await call(bookingCtrl.createBooking, { body: { zoneId: zone._id.toString() }, userId: uid });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /เต็ม/);
    await ParkingSpot.updateMany({ zone: zone._id }, { status: 'available' });
  });

  console.log('\nPromo codes & subscriptions');

  await check('a "discount" promo code can actually be redeemed', async () => {
    await PromoCode.create({
      code: 'SMOKE50',
      type: 'discount',
      discountPercent: 50,
      maxUses: 10,
      expiresAt: new Date(Date.now() + 86400000),
      description: 'test',
    });

    const res = await call(privilegesCtrl.redeemCode, { body: { code: 'SMOKE50' }, userId: uid });
    assert.equal(res.status, 200);
    assert.equal(res.body.discount.percent, 50);

    const fresh = await User.findById(user._id);
    assert.equal(fresh.activeDiscount.percent, 50);
  });

  await check('the same promo code cannot be redeemed twice', async () => {
    const res = await call(privilegesCtrl.redeemCode, { body: { code: 'SMOKE50' }, userId: uid });
    assert.equal(res.status, 400);
  });

  await check('a lapsed subscription demotes the user back to Iron', async () => {
    const { default: Subscription } = await import('../models/subscriptionModel.js');
    await Subscription.create({
      user: user._id,
      tier: 'diamond',
      tierName: 'Diamond',
      price: 199,
      status: 'active',
      startedAt: new Date(Date.now() - 40 * 86400000),
      expiresAt: new Date(Date.now() - 86400000),
    });
    await User.findByIdAndUpdate(user._id, {
      rank: 'Diamond',
      subscriptionExpiry: new Date(Date.now() - 86400000),
    });

    await expireLapsedSubscriptions();

    const fresh = await User.findById(user._id);
    assert.equal(fresh.rank, 'Iron');
  });

  console.log('\nSecurity middleware');

  await check('Mongo operators and markup are stripped from request bodies', async () => {
    const { sanitizeRequest } = await import('../middleware/security.js');
    const req = {
      body: { email: { $ne: null }, name: '<script>alert(1)</script>', nested: { 'a.b': 1, ok: 'x' } },
      params: {},
      query: {},
    };
    await new Promise((resolve) => sanitizeRequest(req, {}, resolve));

    assert.equal(req.body.email.$ne, undefined, '$ne survived sanitising');
    assert.ok(!req.body.name.includes('<script>'), 'markup survived sanitising');
    assert.equal(req.body.nested['a.b'], undefined, 'a dotted key survived sanitising');
    assert.equal(req.body.nested.ok, 'x', 'a legitimate value was destroyed');
  });

  await check('card numbers are never persisted in full', async () => {
    const stored = await PaymentMethod.findById(card._id).lean();
    assert.equal(stored.cardNumber, undefined, 'a full card number is in the database');
    assert.equal(stored.cardLast4, '1111');
  });

  await check('a payment method cannot be filed under another user', async () => {
    const paymentCtrl = await import('../controllers/paymentMethodController.js');

    const victim = await User.create({
      name: 'Victim',
      email: 'victim@test.com',
      username: 'victim',
      password: await bcrypt.hash('password123', 10),
    });

    const res = await call(paymentCtrl.addPaymentMethod, {
      userId: uid,
      // `user` and `cardLast4` are the server's to decide, but the create
      // handler used to spread the whole body over the new document.
      body: {
        type: 'promptpay',
        phoneNumber: '0899999999',
        user: victim._id.toString(),
        cardLast4: '4242',
        status: 'inactive',
      },
    });

    assert.equal(res.status, 201);

    const stored = await PaymentMethod.findById(res.body.data.id).lean();
    assert.equal(String(stored.user), uid, 'the payment method was filed under another account');
    assert.equal(stored.cardLast4, null, 'a forged cardLast4 was stored');
    assert.equal(stored.status, 'active', 'the client dictated the status');
  });

  console.log('\nVehicles');

  await check('a plate that differs only in spacing is refused, not a 500', async () => {
    const vehicleCtrl = await import('../controllers/vehicleController.js');

    const first = await call(vehicleCtrl.addVehicle, {
      userId: uid,
      body: { licensePlate: 'กข 1234', brand: 'Toyota', model: 'Yaris' },
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.data.licensePlate, 'กข1234', 'the plate was not normalised');

    const second = await call(vehicleCtrl.addVehicle, {
      userId: uid,
      body: { licensePlate: 'กข  1234', brand: 'Toyota', model: 'Yaris' },
    });
    assert.equal(second.status, 409, 'a duplicate plate fell through to the unique index');
  });

  await check('the tier vehicle limit is enforced (Iron allows 1)', async () => {
    const vehicleCtrl = await import('../controllers/vehicleController.js');

    const res = await call(vehicleCtrl.addVehicle, {
      userId: uid,
      body: { licensePlate: 'ขค 5678', brand: 'Honda', model: 'Jazz' },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'vehicle_limit_reached');
    assert.equal(res.body.limit, pricing.TIERS.iron.maxVehicles);
  });

  console.log('\nMalformed input');

  await check('a malformed id is a 404, not a 500', async () => {
    const vehicleCtrl = await import('../controllers/vehicleController.js');
    const notifCtrl = await import('../controllers/notificationController.js');
    const paymentCtrl = await import('../controllers/paymentMethodController.js');

    const cases = [
      ['deleteVehicle', vehicleCtrl.deleteVehicle, { id: 'not-an-id' }],
      ['setDefaultVehicle', vehicleCtrl.setDefaultVehicle, { id: 'not-an-id' }],
      ['deletePaymentMethod', paymentCtrl.deletePaymentMethod, { id: 'not-an-id' }],
      ['markAsRead', notifCtrl.markAsRead, { notificationId: 'not-an-id' }],
      ['getBookingQR', bookingCtrl.getBookingQR, { bookingId: 'not-an-id' }],
      ['cancelBooking', bookingCtrl.cancelBooking, { id: 'not-an-id' }],
    ];

    for (const [name, handler, params] of cases) {
      const res = await call(handler, { params, userId: uid });
      assert.equal(res.status, 404, `${name} answered ${res.status} for a malformed id`);
    }
  });

  await check('a non-numeric ?limit does not return the whole collection', async () => {
    const notifCtrl = await import('../controllers/notificationController.js');
    const res = await call(notifCtrl.getNotifications, { userId: uid, query: { limit: 'abc' } });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.pagination.limit, 20, 'limit fell through as NaN');
    assert.ok(res.body.data.pagination.pages >= 1, 'pages was NaN/null');
  });

  console.log('\nNotifications');

  await check('users are warned before the check-in window closes', async () => {
    const { sendCheckInReminders } = await import('../services/autoCancelService.js');
    const { default: Notification } = await import('../models/notificationModel.js');

    const res = await call(bookingCtrl.createBooking, {
      body: { zoneId: zone._id.toString() },
      userId: uid,
    });
    const id = res.body.data.bookingId;

    // Slide the deadline to just inside the reminder window.
    await Booking.findByIdAndUpdate(id, {
      checkInDeadline: new Date(Date.now() + 60 * 1000),
    });

    const first = await sendCheckInReminders();
    assert.equal(first.sent, 1, 'no reminder was sent');

    const notice = await Notification.findOne({ user: user._id, type: 'booking_reminder' });
    assert.ok(notice, 'no booking_reminder notification was created');

    // Runs every minute: it must not re-send on the next sweep.
    const second = await sendCheckInReminders();
    assert.equal(second.sent, 0, 'the reminder was sent twice');

    // Close it out directly rather than through the controller: cancelling
    // fires a notification it does not await, which would still be in flight
    // when this script tears the database down.
    await Booking.findByIdAndUpdate(id, { status: 'cancelled', cancelReason: 'user_cancelled' });
    await ParkingSpot.findByIdAndUpdate(
      (await Booking.findById(id)).spot,
      { status: 'available' }
    );
  });

  console.log('\nPricing is published, and the frontend fallback matches it');

  await check('GET /api/pricing serves the config verbatim', async () => {
    const pricingCtrl = await import('../controllers/pricingController.js');

    const res = await new Promise((resolve) => {
      let statusCode = 200;
      const r = {
        set: () => r,
        status(code) { statusCode = code; return r; },
        json(payload) { resolve({ status: statusCode, body: payload }); return r; },
      };
      pricingCtrl.getPricing({}, r);
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.pricing, {
      bookingFee: pricing.BOOKING_FEE,
      freeHours: pricing.FREE_HOURS,
      overtimeRate: pricing.OVERTIME_RATE,
      graceMinutes: pricing.CHECKIN_GRACE_MINUTES,
    });
    assert.equal(res.body.tiers.length, pricing.TIER_LIST.length);
    assert.equal(res.body.tiers.find((t) => t.id === 'predator').discount, 15);
  });

  await check('the frontend pricing fallback has not drifted from the config', async () => {
    // The UI ships a fallback so the landing and legal pages render before the
    // API answers. That fallback is the one place a stale fee could survive, so
    // it is asserted here rather than trusted.
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');

    const here = path.dirname(fileURLToPath(import.meta.url));
    const storePath = path.join(here, '../../frontend/src/stores/pricingStore.js');
    const source = await readFile(storePath, 'utf8');

    const read = (key) => {
      const match = source.match(new RegExp(`${key}:\\s*(\\d+)`));
      assert.ok(match, `${key} is missing from the frontend fallback`);
      return Number(match[1]);
    };

    assert.equal(read('bookingFee'), pricing.BOOKING_FEE, 'bookingFee drifted');
    assert.equal(read('freeHours'), pricing.FREE_HOURS, 'freeHours drifted');
    assert.equal(read('overtimeRate'), pricing.OVERTIME_RATE, 'overtimeRate drifted');
    assert.equal(read('graceMinutes'), pricing.CHECKIN_GRACE_MINUTES, 'graceMinutes drifted');
    assert.equal(read('diamond'), Math.round(pricing.TIERS.diamond.discount * 100), 'diamond discount drifted');
    assert.equal(read('predator'), Math.round(pricing.TIERS.predator.discount * 100), 'predator discount drifted');
  });

  await check('the frontend password rule matches the backend', async () => {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const { MIN_PASSWORD_LENGTH } = await import('../config/auth.js');

    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = await readFile(path.join(here, '../../frontend/src/config/auth.js'), 'utf8');

    const match = source.match(/MIN_PASSWORD_LENGTH\s*=\s*(\d+)/);
    assert.ok(match, 'MIN_PASSWORD_LENGTH is missing from the frontend config');
    assert.equal(
      Number(match[1]),
      MIN_PASSWORD_LENGTH,
      'the client would accept a password the server rejects (or vice versa)'
    );
  });

  // --- Teardown -----------------------------------------------------------
  await mongoose.disconnect();
  await mongo.stop();

  console.log(`\n${'─'.repeat(52)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log('─'.repeat(52));

  process.exit(failed > 0 ? 1 : 0);
};

run().catch((error) => {
  console.error('Smoke test crashed:', error);
  process.exit(1);
});
