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
  const { default: Vehicle } = await import('../models/vehicleModel.js');
  let plateSeq = 1000;
  const giveCar = (userId) =>
    Vehicle.create({ licensePlate: `ทด${plateSeq++}`, brand: 'Toyota', model: 'Yaris', userId, isDefault: true });
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

  // Bookings need a car on file (the staff scan compares the plate).
  await giveCar(user._id);

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

  // A session of exactly `hours`. Reading the clock twice (start from
  // Date.now(), end from new Date()) let a slow machine slip in a millisecond,
  // and per-started-hour billing turned 5h + 1ms into a sixth hour.
  const session = (hours) => {
    const endedAt = new Date();
    return { startedAt: new Date(endedAt.getTime() - hours * 3600 * 1000), endedAt };
  };

  await check('overtime bills per started hour after the free allowance', () => {
    const bill = pricing.calculateSessionCost({
      ...session(4.2),
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
      ...session(5),
      user: lapsed,
    });
    assert.equal(bill.discountPercent, 0);
  });

  await check('a live Predator gets exactly 15% off overtime', () => {
    const bill = pricing.calculateSessionCost({
      ...session(5),
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
    assert.equal(res.status, 409);
    assert.match(res.body.message, /มีการจองที่ใช้งานอยู่/);
  });

  console.log('\nCheck-in (Test Cases 6-7)');

  // Arrival is proven by a staff scan (or GPS, tested further down), never by
  // the user replaying the token the API gave them.
  const staffCtrl = await import('../controllers/staffController.js');
  const staffUser = await User.create({
    name: 'Gate Staff', email: 'staff@test.com', username: 'gatestaff',
    password: await bcrypt.hash('password123', 10), isStaff: true,
  });
  const staffId = staffUser._id.toString();

  await check('a user can no longer check themselves in with the QR token', async () => {
    const res = await call(bookingCtrl.checkIn, {
      params: { bookingId },
      body: { qrPayload: global.__qrToken },
      userId: uid,
    });
    // The test lot has no coordinates, so only a staff scan can check in.
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'self_checkin_unavailable');
    assert.equal((await Booking.findById(bookingId)).status, 'pending');
  });

  await check('a staff scan of an unknown QR is refused', async () => {
    const res = await call(staffCtrl.scanCheckIn, { body: { qrPayload: 'a'.repeat(64) }, userId: staffId });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'invalid_qr');
  });

  await check('TC6: a staff scan checks in and marks the spot occupied', async () => {
    const payload = JSON.stringify({ v: 1, bookingId, token: global.__qrToken });
    const res = await call(staffCtrl.scanCheckIn, { body: { qrPayload: payload }, userId: staffId });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.data.driverName, 'Smoke Tester');

    const booking = await Booking.findById(bookingId);
    assert.equal(booking.status, 'confirmed');
    assert.ok(booking.actualStartTime, 'check-in time was not recorded');
    assert.equal(booking.checkInMethod, 'staff_scan');
    assert.equal(String(booking.checkedInBy), staffId);

    const spot = await ParkingSpot.findById(booking.spot);
    assert.equal(spot.status, 'occupied');
  });

  await check('the QR cannot be replayed after a successful check-in', async () => {
    const res = await call(staffCtrl.scanCheckIn, { body: { qrPayload: global.__qrToken }, userId: staffId });
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

  await check('Mongo operators are stripped, and text is stored as typed', async () => {
    const { sanitizeRequest } = await import('../middleware/security.js');
    const req = {
      body: { email: { $ne: null }, name: '<script>alert(1)</script>', nested: { 'a.b': 1, ok: 'x' } },
      params: {},
      query: {},
    };
    await new Promise((resolve) => sanitizeRequest(req, {}, resolve));

    assert.equal(req.body.email.$ne, undefined, '$ne survived sanitising');
    // Not escaped on the way in: React escapes on output, and escaping input
    // corrupted names and passwords (see middleware/security.js).
    assert.equal(req.body.name, '<script>alert(1)</script>', 'input text was rewritten');
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

  const plateUid = (await User.create({
    name: 'Plates', email: 'plates@test.com', username: 'plates', password: 'h',
  }))._id.toString();

  await check('a plate that differs only in spacing is refused, not a 500', async () => {
    const vehicleCtrl = await import('../controllers/vehicleController.js');

    const first = await call(vehicleCtrl.addVehicle, {
      userId: plateUid,
      body: { licensePlate: 'กข 1234', brand: 'Toyota', model: 'Yaris' },
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.data.licensePlate, 'กข1234', 'the plate was not normalised');

    const second = await call(vehicleCtrl.addVehicle, {
      userId: plateUid,
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

  // --- Phase 1 security regressions --------------------------------------
  // These drive the middleware too, so the double needs cookies, headers and
  // a `next` callback.
  const authCtrl = await import('../controllers/authController.js');
  const userCtrl = await import('../controllers/userController.js');
  const { default: userAuth } = await import('../middleware/userAuth.js');

  const httpCall = (handler, { body = {}, params = {}, headers = {}, cookies = {}, userId } = {}) =>
    new Promise((resolve) => {
      let statusCode = 200;
      const set = {};
      const req = { body, params, query: {}, headers, cookies, userId };
      const res = {
        status(code) { statusCode = code; return res; },
        json(payload) { resolve({ status: statusCode, body: payload, cookies: set, req }); return res; },
        cookie(name, value) { set[name] = value; return res; },
        clearCookie(name) { set[name] = null; return res; },
      };
      Promise.resolve(handler(req, res, () => resolve({ status: 'next', req, cookies: set })));
    });

  const bearer = (token) => ({ authorization: `Bearer ${token}` });

  console.log('\nPhase 1: authentication & concurrency');

  await check('concurrent bookings on different spots still give one user one booking', async () => {
    const racer = await User.create({
      name: 'Racer', email: 'racer@test.com', username: 'racer',
      password: await bcrypt.hash('password123', 10),
    });
    await PaymentMethod.create({
      user: racer._id, type: 'promptpay', phoneNumber: '0899999999', isDefault: true,
    });
    await giveCar(racer._id);
    const raceZone = await ParkingZone.create({ zoneName: 'RACE', name: 'ลานแข่ง', totalSpots: 4 });
    const spots = await ParkingSpot.create(
      ['R1', 'R2', 'R3', 'R4'].map((n) => ({ name: n, spotNumber: n, zone: raceZone._id }))
    );

    // Distinct spots, so the spot claims never collide with each other.
    const results = await Promise.all(spots.map((s) =>
      call(bookingCtrl.createBooking, { body: { spotId: s._id.toString() }, userId: racer._id.toString() })
    ));

    assert.equal(results.filter((r) => r.status === 201).length, 1, `statuses: ${results.map((r) => r.status)}`);
    assert.equal(await Booking.countDocuments({ user: racer._id, status: { $in: ['pending', 'confirmed'] } }), 1);
    assert.equal(await ParkingSpot.countDocuments({ zone: raceZone._id, status: 'reserved' }), 1,
      'a refused booking left its spot held');
  });

  await check('a malformed payment method id is a clean 402, not a driver error', async () => {
    const res = await call(bookingCtrl.createBooking, {
      body: { zoneId: zone._id.toString(), paymentMethodId: 'not-an-id' },
      userId: await (async () => {
        const x = await User.create({ name: 'X', email: 'x@test.com', username: 'xuser', password: 'h' });
        await giveCar(x._id);
        return x._id.toString();
      })(),
    });
    assert.equal(res.status, 402);
    assert.doesNotMatch(res.body.message, /Cast to ObjectId/);
  });

  await check('a username cannot shadow someone else\'s email', async () => {
    const victim = await httpCall(authCtrl.register, {
      body: { name: 'Victim', email: 'owner@test.com', password: 'victimpass1' },
    });
    assert.equal(victim.status, 201);
    assert.equal(victim.body.token, undefined, 'the JWT must not be returned in the body');

    const squat = await httpCall(authCtrl.register, {
      body: { name: 'A', email: 'attacker@test.com', username: 'OWNER@TEST.COM', password: 'password123' },
    });
    assert.equal(squat.status, 400, 'a username containing "@" was accepted');

    const login = await httpCall(authCtrl.login, { body: { email: 'owner@test.com', password: 'victimpass1' } });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.email, 'owner@test.com');
  });

  await check('usernames differing only in case cannot both register', async () => {
    const first = await httpCall(authCtrl.register, {
      body: { name: 'B', email: 'bob1@test.com', username: 'Bobby', password: 'password123' },
    });
    const second = await httpCall(authCtrl.register, {
      body: { name: 'B', email: 'bob2@test.com', username: 'bobby', password: 'password123' },
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 409);
  });

  await check('logout revokes the token itself, not just the cookie', async () => {
    const login = await httpCall(authCtrl.login, { body: { email: 'owner@test.com', password: 'victimpass1' } });
    const token = login.cookies.token;
    assert.ok(token, 'login did not set the session cookie');

    assert.equal((await httpCall(userAuth, { headers: bearer(token) })).status, 'next');

    const out = await httpCall(authCtrl.logout, { headers: bearer(token) });
    assert.equal(out.status, 200);
    assert.equal(out.cookies.token, null, 'the cookie was not cleared');

    const after = await httpCall(userAuth, { headers: bearer(token) });
    assert.equal(after.status, 401);
    assert.equal(after.body.code, 'token_revoked');
  });

  await check('changing the password signs out every other session', async () => {
    const a = (await httpCall(authCtrl.login, { body: { email: 'owner@test.com', password: 'victimpass1' } })).cookies.token;
    const b = (await httpCall(authCtrl.login, { body: { email: 'owner@test.com', password: 'victimpass1' } })).cookies.token;

    const authed = await httpCall(userAuth, { headers: bearer(a) });
    const changed = await httpCall(userCtrl.changePassword, {
      body: { currentPassword: 'victimpass1', newPassword: 'victimpass2' },
      userId: authed.req.userId,
    });
    assert.equal(changed.status, 200);
    assert.ok(changed.cookies.token, 'the current session was not re-issued');

    assert.equal((await httpCall(userAuth, { headers: bearer(b) })).status, 401, 'an old session survived');
    assert.equal((await httpCall(userAuth, { headers: bearer(changed.cookies.token) })).status, 'next');
  });

  await check('a token without a jti (pre-revocation format) is refused', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const legacy = jwt.sign({ id: uid }, process.env.JWT_SECRET, { expiresIn: '1d' });
    const res = await httpCall(userAuth, { headers: bearer(legacy) });
    assert.equal(res.status, 401);
  });

  // --- Phase 2: proof of arrival -------------------------------------------
  console.log('\nPhase 2: GPS and staff check-in');

  const { requireStaff } = await import('../middleware/userAuth.js');
  const { expirePendingBooking, confirmCheckIn, distanceMeters } = await import('../services/checkInService.js');

  // A lot with real coordinates (Faculty of Science, KMITL — roughly).
  const LOT = { latitude: 13.7299, longitude: 100.7782 };
  const gpsZone = await ParkingZone.create({
    zoneName: 'GPSLOT', name: 'ลาน GPS', totalSpots: 3, ...LOT, checkInRadiusMeters: 100,
  });
  await ParkingSpot.create(['G1', 'G2', 'G3'].map((n) => ({ name: n, spotNumber: n, zone: gpsZone._id })));

  const makeDriver = async (email, username) => {
    const driver = await User.create({ name: username, email, username, password: await bcrypt.hash('password123', 10) });
    await PaymentMethod.create({ user: driver._id, type: 'promptpay', phoneNumber: '0811111111', isDefault: true });
    await giveCar(driver._id);
    const res = await call(bookingCtrl.createBooking, { body: { zoneId: gpsZone._id.toString() }, userId: driver._id.toString() });
    assert.equal(res.status, 201, res.body.message);
    return { id: driver._id.toString(), bookingId: res.body.data.bookingId.toString(), token: res.body.data.qrCode.token };
  };

  // ~0.0003° of latitude is ~33 m; 0.01° is ~1.1 km.
  const near = { latitude: LOT.latitude + 0.0003, longitude: LOT.longitude, accuracy: 15 };
  const far = { latitude: LOT.latitude + 0.01, longitude: LOT.longitude, accuracy: 15 };

  const driver = await makeDriver('gps@test.com', 'gpsdriver');
  const selfCheckIn = (body) => call(bookingCtrl.checkIn, { params: { bookingId: driver.bookingId }, body, userId: driver.id });

  await check('the distance helper is accurate to a few metres', () => {
    const d = distanceMeters(LOT, near);
    assert.ok(d > 30 && d < 36, `got ${d}`);
  });

  await check('GPS self check-in requires a location', async () => {
    const res = await selfCheckIn({});
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'location_required');
  });

  await check('an imprecise GPS fix is refused', async () => {
    const res = await selfCheckIn({ ...near, accuracy: 500 });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'gps_inaccurate');
  });

  await check('checking in from 1 km away is refused', async () => {
    const res = await selfCheckIn(far);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'too_far');
    assert.equal((await Booking.findById(driver.bookingId)).status, 'pending');
  });

  await check('checking in from inside the lot works and records where', async () => {
    const res = await selfCheckIn(near);
    assert.equal(res.status, 200, res.body.message);
    const booking = await Booking.findById(driver.bookingId);
    assert.equal(booking.status, 'confirmed');
    assert.equal(booking.checkInMethod, 'gps');
    assert.ok(booking.checkInLocation.distanceMeters < 100);
    assert.equal((await ParkingSpot.findById(booking.spot)).status, 'occupied');
  });

  await check('the active booking tells the app which check-in methods exist', async () => {
    const other = await makeDriver('opts@test.com', 'optsdriver');
    const res = await call(bookingCtrl.getActiveBooking, { userId: other.id });
    assert.deepEqual(
      { staffScan: res.body.data.checkInOptions.staffScan, gps: res.body.data.checkInOptions.gps },
      { staffScan: true, gps: true }
    );
    await call(bookingCtrl.cancelBooking, { params: { id: other.bookingId }, userId: other.id });
  });

  await check('staff cannot scan their own booking', async () => {
    const own = await makeDriver('ownstaff@test.com', 'ownstaff');
    await User.findByIdAndUpdate(own.id, { isStaff: true });
    const res = await call(staffCtrl.scanCheckIn, { body: { qrPayload: own.token }, userId: own.id });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'own_booking');
    await call(bookingCtrl.cancelBooking, { params: { id: own.bookingId }, userId: own.id });
  });

  await check('only staff and admins pass the staff guard', async () => {
    const guard = (user) => httpCall((req, res, next) => { req.user = user; return requireStaff(req, res, next); });
    assert.equal((await guard({ isStaff: false, isAdmin: false })).status, 403);
    assert.equal((await guard({ isStaff: true })).status, 'next');
    assert.equal((await guard({ isAdmin: true })).status, 'next');
  });

  await check('check-in and the auto-cancel sweep cannot both win', async () => {
    const late = await makeDriver('late@test.com', 'latedriver');
    await Booking.findByIdAndUpdate(late.bookingId, { checkInDeadline: new Date(Date.now() - 1000) });

    // A check-in that lost the race must not resurrect an expired booking...
    await assert.rejects(confirmCheckIn({ bookingId: late.bookingId, method: 'gps' }), /ไม่อยู่ในสถานะรอเช็คอิน/);

    // ...and once the sweep has cancelled it, a second sweep changes nothing.
    assert.ok(await expirePendingBooking(late.bookingId));
    assert.equal(await expirePendingBooking(late.bookingId), null);

    // Nor may a sweep cancel a booking that has already checked in.
    assert.equal(await expirePendingBooking(driver.bookingId), null);
    assert.equal((await Booking.findById(driver.bookingId)).status, 'confirmed');
  });

  await check('a lot location must be a real coordinate', async () => {
    const bad = await call(staffCtrl.setZoneLocation, {
      params: { id: gpsZone._id.toString() }, body: { latitude: 200, longitude: 0 },
    });
    assert.equal(bad.status, 400);
    const off = await call(staffCtrl.setZoneLocation, { params: { id: gpsZone._id.toString() }, body: { clear: true } });
    assert.equal(off.status, 200);
    assert.equal(off.body.zone.gpsCheckIn, false);
  });

  // --- Bay QR stickers: check-in with no staff on site --------------------
  console.log('\nBay QR stickers (self check-in without staff)');

  const adminSpotCtrl = await import('../controllers/adminController.js');
  const qrZone = await ParkingZone.create({
    zoneName: 'QRLOT', name: 'ลาน QR', totalSpots: 2, ...LOT, checkInRadiusMeters: 100,
  });
  await ParkingSpot.create(['Q10', 'Q2'].map((n) => ({ name: n, spotNumber: n, zone: qrZone._id })));

  const qrDriverUser = await User.create({
    name: 'qrdriver', email: 'qr@test.com', username: 'qrdriver', password: await bcrypt.hash('password123', 10),
  });
  const qrUid = qrDriverUser._id.toString();
  await PaymentMethod.create({ user: qrDriverUser._id, type: 'promptpay', phoneNumber: '0822222222', isDefault: true });
  await giveCar(qrDriverUser._id);

  let bays = [];
  await check('opening the print page gives every bay a code, sorted A2 before A10', async () => {
    const res = await call(adminSpotCtrl.listSpotCodes, { query: { zone: qrZone._id.toString() } });
    assert.equal(res.status, 200, res.body.message);
    bays = res.body.spots;
    assert.deepEqual(bays.map((b) => b.spotNumber), ['Q2', 'Q10']);
    assert.ok(bays.every((b) => typeof b.code === 'string' && b.code.length >= 20));
    // Codes stay hidden from ordinary queries.
    assert.equal((await ParkingSpot.findById(bays[0].id)).checkInCode, undefined);
  });

  const scan = (body) => call(bookingCtrl.scanSpot, { body, userId: qrUid });

  await check('a wrong or made-up bay code is refused', async () => {
    const res = await scan({ spotId: bays[0].id.toString(), code: 'not-the-code' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'invalid_spot_qr');
  });

  await check('scanning a bay with no booking says so', async () => {
    const res = await scan({ spotId: bays[0].id.toString(), code: bays[0].code });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.state, 'no_booking');
    assert.equal(res.body.data.spot.spotNumber, 'Q2');
  });

  const qrBooked = await call(bookingCtrl.createBooking, { body: { zoneId: qrZone._id.toString() }, userId: qrUid });
  const qrBookingId = qrBooked.body.data?.bookingId?.toString();
  const qrBooking = await Booking.findById(qrBookingId);
  const mine = bays.find((b) => String(b.id) === String(qrBooking?.spot));
  const other = bays.find((b) => b !== mine);
  const qrCheckIn = (bay, extra = {}) =>
    call(bookingCtrl.checkIn, {
      params: { bookingId: qrBookingId },
      body: { spotId: bay.id.toString(), code: bay.code, ...extra },
      userId: qrUid,
    });

  await check('the bay-QR button shows only once an admin says the stickers are up', async () => {
    assert.equal(qrBooked.status, 201, qrBooked.body.message);
    const before = await call(bookingCtrl.getActiveBooking, { userId: qrUid });
    assert.equal(before.body.data.checkInOptions.spotQr, false);
    const lotsCtrlEarly = await import('../controllers/adminLotsController.js');
    const set = await call(lotsCtrlEarly.updateLot, { params: { id: qrZone._id.toString() }, body: { spotStickers: true } });
    assert.equal(set.status, 200, set.body.message);
    const after = await call(bookingCtrl.getActiveBooking, { userId: qrUid });
    assert.equal(after.body.data.checkInOptions.spotQr, true);
  });

  await check('scanning another bay is caught, and cannot check in', async () => {
    const preview = await scan({ spotId: other.id.toString(), code: other.code });
    assert.equal(preview.body.data.state, 'wrong_spot');
    const res = await qrCheckIn(other);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'wrong_spot');
    assert.equal((await Booking.findById(qrBookingId)).status, 'pending');
  });

  await check('scanning the booked bay offers check-in (and asks for GPS where the lot has it)', async () => {
    const res = await scan({ spotId: mine.id.toString(), code: mine.code });
    assert.equal(res.body.data.state, 'ready');
    assert.equal(res.body.data.gpsCheck, true);
    assert.equal(res.body.data.booking.bookingId.toString(), qrBookingId);
  });

  await check('a sticker photo used from 1 km away is refused', async () => {
    const res = await qrCheckIn(mine, far);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'too_far');
    assert.equal((await Booking.findById(qrBookingId)).status, 'pending');
  });

  await check('in a lot with coordinates, the sticker also needs GPS inside the radius', async () => {
    const none = await qrCheckIn(mine);
    assert.equal(none.status, 400);
    assert.equal(none.body.code, 'location_required');
    const rough = await qrCheckIn(mine, { ...near, accuracy: 500 });
    assert.equal(rough.body.code, 'gps_inaccurate');
    assert.equal((await Booking.findById(qrBookingId)).status, 'pending');
  });

  await check('scanning the booked bay from inside the lot checks in', async () => {
    const res = await qrCheckIn(mine, near);
    assert.equal(res.status, 200, res.body.message);
    assert.ok((await Booking.findById(qrBookingId)).checkInLocation.distanceMeters < 100);
    const booking = await Booking.findById(qrBookingId);
    assert.equal(booking.status, 'confirmed');
    assert.equal(booking.checkInMethod, 'spot_qr');
    assert.equal((await ParkingSpot.findById(mine.id)).status, 'occupied');
    const again = await scan({ spotId: mine.id.toString(), code: mine.code });
    assert.equal(again.body.data.state, 'already_checked_in');
  });

  await check('rotating a bay code kills the old sticker', async () => {
    const res = await call(adminSpotCtrl.rotateSpotCheckInCode, { params: { id: other.id.toString() }, userId: uid });
    assert.equal(res.status, 200, res.body.message);
    assert.notEqual(res.body.spot.code, other.code);
    assert.equal((await scan({ spotId: other.id.toString(), code: other.code })).body.code, 'invalid_spot_qr');
    assert.equal((await scan({ spotId: other.id.toString(), code: res.body.spot.code })).status, 200);
  });

  // --- Phase 3: logic bugs ---------------------------------------------------
  console.log('\nPhase 3: billing and membership logic');

  const { default: Subscription } = await import('../models/subscriptionModel.js');
  const parkingCtrl = await import('../controllers/parkingController.js');
  const DAY = 24 * 60 * 60 * 1000;

  // A driver who is checked in, `hours` ago, at the GPS lot.
  const parkedDriver = async (email, username, hours) => {
    const d = await makeDriver(email, username);
    await confirmCheckIn({ bookingId: d.bookingId, method: 'gps' });
    await Booking.findByIdAndUpdate(d.bookingId, { actualStartTime: new Date(Date.now() - hours * 3600 * 1000) });
    return d;
  };
  const voucher = { percent: 50, code: 'HALF', expiresAt: new Date(Date.now() + DAY) };

  await check('a voucher is not used up by a session inside the free hours', async () => {
    const d = await parkedDriver('v1@test.com', 'voucher1', 1);
    await User.findByIdAndUpdate(d.id, { activeDiscount: voucher });
    const res = await call(bookingCtrl.checkOut, { params: { bookingId: d.bookingId }, userId: d.id });
    assert.equal(res.status, 200, res.body.message);
    assert.equal((await User.findById(d.id)).activeDiscount?.percent, 50, 'the voucher was burned for nothing');
  });

  await check('a voucher is spent when it actually discounts overtime', async () => {
    const d = await parkedDriver('v2@test.com', 'voucher2', 4.5);
    await User.findByIdAndUpdate(d.id, { activeDiscount: voucher });
    const res = await call(bookingCtrl.checkOut, { params: { bookingId: d.bookingId }, userId: d.id });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.data.pricing.voucherDiscount, 10);
    assert.equal((await User.findById(d.id)).activeDiscount, null);
  });

  await check('check-out falls back to the default card if the booking\'s card was removed', async () => {
    const d = await parkedDriver('pm@test.com', 'pmdriver', 4.5);
    const used = (await Booking.findById(d.bookingId)).paymentMethod;
    await PaymentMethod.findByIdAndUpdate(used, { status: 'inactive', isDefault: false });
    await PaymentMethod.create({ user: d.id, type: 'truewallet', phoneNumber: '0822222222', isDefault: true });
    const res = await call(bookingCtrl.checkOut, { params: { bookingId: d.bookingId }, userId: d.id });
    assert.equal(res.status, 200, res.body.message);
  });

  const member = async (email, username, tier, days, extra = {}) => {
    const u = await User.create({
      name: username, email, username, password: 'h',
      rank: tier === 'iron' ? 'Iron' : tier[0].toUpperCase() + tier.slice(1),
      subscriptionExpiry: tier === 'iron' ? null : new Date(Date.now() + days * DAY),
      ...extra,
    });
    if (tier !== 'iron') {
      await Subscription.create({
        user: u._id, tier, tierName: u.rank, price: 199, status: 'active',
        startedAt: new Date(), expiresAt: u.subscriptionExpiry,
      });
    }
    return u._id.toString();
  };
  const promo = (code, tier, days = 30) =>
    PromoCode.create({ code, type: 'subscription', tier, durationDays: days, expiresAt: new Date(Date.now() + 30 * DAY) });

  await check('a Predator redeeming a Diamond code keeps Predator (and keeps the code)', async () => {
    const id = await member('pred@test.com', 'pred', 'predator', 20);
    await promo('DIAPROMO', 'diamond', 30);
    const res = await call(privilegesCtrl.redeemCode, { body: { code: 'DIAPROMO' }, userId: id });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'lower_tier_active');
    const u = await User.findById(id);
    assert.equal(u.rank, 'Predator', 'the paid tier was overwritten');
    assert.equal((await PromoCode.findOne({ code: 'DIAPROMO' })).usedCount, 0, 'a refused code was used up');
  });

  await check('renewing the same tier stacks instead of resetting', async () => {
    const id = await member('renew@test.com', 'renew', 'diamond', 10);
    await promo('DIA30', 'diamond', 30);
    const res = await call(privilegesCtrl.redeemCode, { body: { code: 'DIA30' }, userId: id });
    assert.equal(res.status, 200, res.body.message);
    const days = (new Date((await User.findById(id)).subscriptionExpiry) - Date.now()) / DAY;
    assert.ok(days > 39.5 && days < 40.5, `expected ~40 days, got ${days.toFixed(1)}`);
  });

  await check('an upgrade keeps the lower tier, which resumes when the upgrade ends', async () => {
    const id = await member('up@test.com', 'upgrader', 'diamond', 60);
    await promo('PRED7', 'predator', 7);
    const res = await call(privilegesCtrl.redeemCode, { body: { code: 'PRED7' }, userId: id });
    assert.equal(res.status, 200, res.body.message);
    assert.equal((await User.findById(id)).rank, 'Predator');

    // Fast-forward: the Predator week is over.
    await Subscription.updateOne({ user: id, tier: 'predator' }, { expiresAt: new Date(Date.now() - 1000) });
    await expireLapsedSubscriptions();
    const u = await User.findById(id);
    assert.equal(u.rank, 'Diamond', 'the paid Diamond did not resume');
    assert.ok(new Date(u.subscriptionExpiry) > new Date(Date.now() + 59 * DAY));
  });

  await check('a rank granted before subscriptions were tracked is not lost', async () => {
    // Seeded/legacy: rank and expiry on the user, no Subscription row.
    const legacy = await User.create({
      name: 'L', email: 'legacy@test.com', username: 'legacy', password: 'h',
      rank: 'Diamond', subscriptionExpiry: new Date(Date.now() + 30 * DAY),
    });
    await promo('PREDL', 'predator', 7);
    const res = await call(privilegesCtrl.redeemCode, { body: { code: 'PREDL' }, userId: legacy._id.toString() });
    assert.equal(res.status, 200, res.body.message);
    await Subscription.updateOne({ user: legacy._id, tier: 'predator' }, { expiresAt: new Date(Date.now() - 1000) });
    await expireLapsedSubscriptions();
    assert.equal((await User.findById(legacy._id)).rank, 'Diamond');
  });

  await check('a password stored under the old escaping still logs in, and is repaired', async () => {
    // What the old sanitiser hashed for a password typed "pass<word>1".
    await User.create({
      name: 'Esc', email: 'esc@test.com', username: 'escaped',
      password: await bcrypt.hash('pass&lt;word&gt;1', 10),
    });
    const first = await httpCall(authCtrl.login, { body: { email: 'esc@test.com', password: 'pass<word>1' } });
    assert.equal(first.status, 200);
    const stored = (await User.findOne({ email: 'esc@test.com' }).select('+password')).password;
    assert.ok(await bcrypt.compare('pass<word>1', stored), 'the hash was not upgraded to the real password');
  });

  await check('an admin cannot free a spot that a live booking holds', async () => {
    const d = await makeDriver('held@test.com', 'helddriver');
    const spotId = String((await Booking.findById(d.bookingId)).spot);
    const res = await call(parkingCtrl.updateSpotStatus, { params: { id: spotId }, body: { status: 'available' } });
    assert.equal(res.status, 409);
    assert.equal((await ParkingSpot.findById(spotId)).status, 'reserved');
    await call(bookingCtrl.cancelBooking, { params: { id: d.bookingId }, userId: d.id });
  });

  await check('total spent includes fees kept on cancelled bookings', async () => {
    const d = await makeDriver('spent@test.com', 'spender');
    await call(bookingCtrl.cancelBooking, { params: { id: d.bookingId }, userId: d.id });
    const res = await call(userCtrl.getProfile, { userId: d.id });
    assert.equal(res.body.stats.totalSpent, 20);
  });

  // --- Phase 4: missing features --------------------------------------------
  console.log('\nPhase 4: vehicles, email verification, password reset, admin');

  const { default: OTP } = await import('../models/otpModel.js');
  const adminCtrl = await import('../controllers/adminController.js');

  const bareDriver = async (email, username) => {
    const u = await User.create({ name: username, email, username, password: await bcrypt.hash('password123', 10) });
    await PaymentMethod.create({ user: u._id, type: 'promptpay', phoneNumber: '0833333333', isDefault: true });
    return u._id.toString();
  };
  const bookGps = (userId, body = {}) =>
    call(bookingCtrl.createBooking, { body: { zoneId: gpsZone._id.toString(), ...body }, userId });

  await check('email verification is required by default when mail goes through SES', async () => {
    const { emailVerificationRequired } = await import('../config/auth.js');
    const saved = { MAIL_TRANSPORT: process.env.MAIL_TRANSPORT, REQUIRE_EMAIL_VERIFICATION: process.env.REQUIRE_EMAIL_VERIFICATION };
    try {
      delete process.env.REQUIRE_EMAIL_VERIFICATION;
      process.env.MAIL_TRANSPORT = 'ses';
      assert.equal(emailVerificationRequired(), true);
      // ...but an explicit "false" wins (SES sandbox: most people cannot receive mail yet).
      process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
      assert.equal(emailVerificationRequired(), false);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  });

  await check('no active booking is a normal 200 with data null, not a 404', async () => {
    const id = await bareDriver('idle@test.com', 'idledriver');
    const res = await call(bookingCtrl.getActiveBooking, { userId: id });
    assert.equal(res.status, 200);
    assert.equal(res.body.data, null);
  });

  await check('booking without a registered car is refused', async () => {
    const id = await bareDriver('nocar@test.com', 'nocar');
    const res = await bookGps(id);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'vehicle_required');
    assert.equal(await Booking.countDocuments({ user: id }), 0);
  });

  await check('with no car chosen, the default car goes on the booking', async () => {
    const id = await bareDriver('defcar@test.com', 'defcar');
    const car = await giveCar(id);
    const res = await bookGps(id);
    assert.equal(res.status, 201, res.body.message);
    assert.equal(String((await Booking.findById(res.body.data.bookingId)).vehicle), String(car._id));
    await call(bookingCtrl.cancelBooking, { params: { id: res.body.data.bookingId }, userId: id });
  });

  await check('an unverified email blocks booking when verification is required', async () => {
    const id = await bareDriver('unverified@test.com', 'unverified');
    await giveCar(id);
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    try {
      const res = await bookGps(id);
      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'email_unverified');
    } finally {
      delete process.env.REQUIRE_EMAIL_VERIFICATION;
    }
  });

  await check('OTP: resend has a cooldown, and a correct code verifies the email', async () => {
    const id = await bareDriver('otp@test.com', 'otpuser');
    assert.equal((await httpCall(authCtrl.sendVerifyOTP, { userId: id })).status, 200);
    const again = await httpCall(authCtrl.sendVerifyOTP, { userId: id });
    assert.equal(again.status, 429);
    assert.equal(again.body.code, 'otp_cooldown');

    // Swap in a code we know (the real one only went to the mail log).
    await OTP.deleteMany({ userId: id });
    await OTP.create({ userId: id, otp: '424242', type: 'ACCOUNT_VERIFICATION' });
    assert.equal((await httpCall(authCtrl.verifyEmail, { userId: id, body: { otp: '111111' } })).status, 400);
    assert.equal((await httpCall(authCtrl.verifyEmail, { userId: id, body: { otp: '424242' } })).status, 200);
    assert.equal((await User.findById(id)).isAccountVerified, true);
  });

  await check('forgot-password answers the same for unknown and known emails', async () => {
    const unknown = await httpCall(authCtrl.forgotPassword, { body: { email: 'nobody@test.com' } });
    const known = await httpCall(authCtrl.forgotPassword, { body: { email: 'owner@test.com' } });
    assert.equal(unknown.status, 200);
    assert.deepEqual(unknown.body, known.body, 'the reply reveals whether the account exists');
    const owner = await User.findOne({ email: 'owner@test.com' });
    assert.ok(await OTP.exists({ userId: owner._id, type: 'PASSWORD_RESET' }), 'no reset code was issued');
  });

  await check('a reset code locks after 5 wrong guesses', async () => {
    const owner = await User.findOne({ email: 'owner@test.com' });
    await OTP.deleteMany({ userId: owner._id });
    await OTP.create({ userId: owner._id, otp: '135790', type: 'PASSWORD_RESET' });
    let last;
    for (let i = 0; i < 5; i++) {
      last = await httpCall(authCtrl.resetPassword, { body: { email: 'owner@test.com', otp: '000000', newPassword: 'whatever123' } });
    }
    assert.equal(last.body.code, 'otp_locked');
    // The right code no longer works either: it was discarded.
    const late = await httpCall(authCtrl.resetPassword, { body: { email: 'owner@test.com', otp: '135790', newPassword: 'whatever123' } });
    assert.equal(late.status, 400);
  });

  await check('a password reset works and signs out every existing session', async () => {
    const owner = await User.findOne({ email: 'owner@test.com' });
    const before = (await httpCall(authCtrl.login, { body: { email: 'owner@test.com', password: 'victimpass2' } })).cookies.token;
    assert.ok(before, 'precondition: could not log in');

    await OTP.deleteMany({ userId: owner._id });
    await OTP.create({ userId: owner._id, otp: '246810', type: 'PASSWORD_RESET' });
    const res = await httpCall(authCtrl.resetPassword, { body: { email: 'owner@test.com', otp: '246810', newPassword: 'brandnew123' } });
    assert.equal(res.status, 200, res.body.message);

    assert.equal((await httpCall(userAuth, { headers: bearer(before) })).status, 401, 'an old session survived the reset');
    assert.equal((await httpCall(authCtrl.login, { body: { email: 'owner@test.com', password: 'brandnew123' } })).status, 200);
  });

  const adminId = (await User.create({ name: 'Boss', email: 'boss@test.com', username: 'boss', password: 'h', isAdmin: true }))._id.toString();

  await check('an admin can cancel a held booking, and the spot is freed', async () => {
    const d = await makeDriver('abandon@test.com', 'abandoner');
    const res = await call(adminCtrl.adminCancelBooking, { params: { id: d.bookingId }, body: { note: 'ไม่มาตามนัด' }, userId: adminId });
    assert.equal(res.status, 200, res.body.message);
    const b = await Booking.findById(d.bookingId);
    assert.equal(b.status, 'cancelled');
    assert.equal(b.cancelReason, 'admin_cancelled');
    assert.equal(String(b.closedBy), adminId);
    assert.equal((await ParkingSpot.findById(b.spot)).status, 'available');
  });

  await check('force check-out frees the bay even when the card is declined, and records the debt', async () => {
    const d = await parkedDriver('stuck@test.com', 'stuck', 5);
    await PaymentMethod.updateMany({ user: d.id }, { status: 'inactive' }); // nothing chargeable left

    // The driver's own check-out is refused (Test Case 11) ...
    assert.equal((await call(bookingCtrl.checkOut, { params: { bookingId: d.bookingId }, userId: d.id })).status, 402);

    // ... but an admin can close it.
    const res = await call(adminCtrl.forceCheckout, { params: { id: d.bookingId }, userId: adminId });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.data.settled, false);

    const b = await Booking.findById(d.bookingId);
    assert.equal(b.status, 'completed');
    assert.equal(b.paymentStatus, 'failed');
    assert.ok(b.cost > 0);
    assert.equal((await ParkingSpot.findById(b.spot)).status, 'available');

    const unpaid = await call(adminCtrl.listBookings, { query: { status: 'unpaid' } });
    assert.ok(unpaid.body.bookings.some((x) => String(x.id) === d.bookingId), 'the debt is not listed');
  });

  await check('admins can search bookings by plate and grant the staff role', async () => {
    const d = await makeDriver('findme@test.com', 'findme');
    const plate = (await Vehicle.findOne({ userId: d.id })).licensePlate;
    const found = await call(adminCtrl.listBookings, { query: { status: 'active', q: plate } });
    assert.equal(found.body.bookings.length, 1);
    assert.equal(found.body.bookings[0].vehicle.licensePlate, plate);

    const granted = await call(adminCtrl.setStaff, { params: { id: d.id }, body: { isStaff: true } });
    assert.equal(granted.status, 200);
    assert.equal((await User.findById(d.id)).isStaff, true);
    assert.equal((await call(adminCtrl.setStaff, { params: { id: d.id }, body: { isStaff: 'yes' } })).status, 400);
  });

  // --- Points ---------------------------------------------------------------
  console.log('\nPoints: earning, rewards and the ledger');

  const { default: PointTransaction } = await import('../models/pointTransactionModel.js');
  const pointsSvc = await import('../services/pointsService.js');
  const pointsCtrl = await import('../controllers/pointsController.js');
  const redeemPts = (userId, rewardId) => call(pointsCtrl.redeem, { body: { rewardId }, userId });
  const withPoints = async (email, username, points, extra = {}) => {
    const id = await bareDriver(email, username);
    await giveCar(id);
    await User.findByIdAndUpdate(id, { points, ...extra });
    return id;
  };

  await check('points reward showing up and leaving on time, not hours parked', () => {
    const { pointsForSession, TIERS } = pricing;
    assert.equal(pointsForSession({ durationHours: 1, tier: TIERS.iron }), 15, 'on time: base + bonus');
    assert.equal(pointsForSession({ durationHours: 8, tier: TIERS.iron }), 10, 'a long stay must not earn more');
    assert.equal(pointsForSession({ durationHours: 1, tier: TIERS.diamond }), 22);
    assert.equal(pointsForSession({ durationHours: 1, tier: TIERS.predator }), 30);
  });

  await check('check-out earnings go through the ledger', async () => {
    const d = await parkedDriver('earn@test.com', 'earner', 1);
    const res = await call(bookingCtrl.checkOut, { params: { bookingId: d.bookingId }, userId: d.id });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.data.pointsEarned, 15);
    assert.equal(res.body.data.totalPoints, 15);
    const row = await PointTransaction.findOne({ user: d.id, reason: 'session' });
    assert.equal(row?.delta, 15);
    assert.equal(String(row.booking), d.bookingId);
  });

  await check('a reward you cannot afford costs nothing', async () => {
    const id = await withPoints('poor@test.com', 'poor', 100);
    const res = await redeemPts(id, 'free_booking');
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'insufficient_points');
    assert.equal((await User.findById(id)).points, 100);
  });

  await check('two redemptions at once cannot overdraw the balance', async () => {
    const id = await withPoints('race2@test.com', 'racer2', 150); // enough for exactly one
    const results = await Promise.all([redeemPts(id, 'free_booking'), redeemPts(id, 'free_booking')]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const u = await User.findById(id);
    assert.equal(u.points, 0);
    assert.equal(u.freeBookingCredits, 1);
  });

  await check('a free-booking credit waives the fee once, and is used up', async () => {
    const id = await withPoints('free@test.com', 'freebie', 0, { freeBookingCredits: 1 });
    const first = await bookGps(id, { useFreeBooking: true });
    assert.equal(first.status, 201, first.body.message);
    assert.equal(first.body.data.payment.amount, 0);
    const booking = await Booking.findById(first.body.data.bookingId);
    assert.equal(booking.bookingFee, 0);
    assert.equal(booking.feeWaiver, 'free_booking_credit');
    assert.equal((await User.findById(id)).freeBookingCredits, 0);

    await call(bookingCtrl.cancelBooking, { params: { id: first.body.data.bookingId }, userId: id });
    const second = await bookGps(id, { useFreeBooking: true });
    assert.equal(second.status, 409);
    assert.equal(second.body.code, 'no_free_booking_credit');
  });

  await check('a booking that fails gives the free-booking credit back', async () => {
    const id = await withPoints('refund@test.com', 'refundee', 0, { freeBookingCredits: 1 });
    await PaymentMethod.updateMany({ user: id }, { status: 'inactive' }); // booking will fail
    const res = await bookGps(id, { useFreeBooking: true });
    assert.equal(res.status, 402);
    assert.equal((await User.findById(id)).freeBookingCredits, 1, 'the credit was lost with the failed booking');
  });

  await check('an overtime voucher cannot be stacked on an unused one', async () => {
    const id = await withPoints('vouch@test.com', 'voucher3', 200);
    assert.equal((await redeemPts(id, 'overtime_voucher')).status, 200);
    const again = await redeemPts(id, 'overtime_voucher');
    assert.equal(again.status, 409);
    assert.equal((await User.findById(id)).points, 120, 'the refused voucher was charged');
  });

  await check('a Diamond trial is refused (free of charge) for a Predator', async () => {
    const id = await withPoints('predpts@test.com', 'predpts', 500);
    await Subscription.create({
      user: id, tier: 'predator', tierName: 'Predator', price: 399, status: 'active',
      startedAt: new Date(), expiresAt: new Date(Date.now() + 10 * DAY),
    });
    const res = await redeemPts(id, 'diamond_trial');
    assert.equal(res.status, 409);
    assert.equal((await User.findById(id)).points, 500);
  });

  await check('a Diamond trial makes an Iron member Diamond for 7 days', async () => {
    const id = await withPoints('trial@test.com', 'trialist', 400);
    const res = await redeemPts(id, 'diamond_trial');
    assert.equal(res.status, 200, res.body.message);
    const u = await User.findById(id);
    assert.equal(u.rank, 'Diamond');
    assert.equal(u.points, 0);
    const days = (new Date(u.subscriptionExpiry) - Date.now()) / DAY;
    assert.ok(days > 6.9 && days < 7.1);
  });

  await check('"points" promo codes are recorded in the ledger', async () => {
    const id = await withPoints('promopts@test.com', 'promopts', 0);
    await PromoCode.create({ code: 'PTS100', type: 'points', points: 100, expiresAt: new Date(Date.now() + DAY) });
    assert.equal((await call(privilegesCtrl.redeemCode, { body: { code: 'PTS100' }, userId: id })).status, 200);
    assert.equal((await User.findById(id)).points, 100);
    assert.ok(await PointTransaction.exists({ user: id, reason: 'promo_code', delta: 100 }));
  });

  await check('points lapse after a year with no activity, and only then', async () => {
    const stale = await withPoints('stale@test.com', 'stale', 70, { pointsActivityAt: new Date(Date.now() - 400 * DAY) });
    const fresh = await withPoints('fresh@test.com', 'freshpts', 70, { pointsActivityAt: new Date(Date.now() - 30 * DAY) });
    await pointsSvc.expireInactivePoints();
    assert.equal((await User.findById(stale)).points, 0);
    assert.equal((await User.findById(fresh)).points, 70);
    assert.ok(await PointTransaction.exists({ user: stale, reason: 'expired', delta: -70 }));
  });

  await check('the points endpoint lists rules, rewards and history', async () => {
    const id = await withPoints('view@test.com', 'viewer', 0);
    await pointsSvc.addPoints({ userId: id, amount: 40, reason: 'admin_adjust' });
    const res = await call(pointsCtrl.getPoints, { userId: id });
    assert.equal(res.body.balance, 40);
    assert.equal(res.body.rewards.length, pricing.REWARD_LIST.length);
    assert.equal(res.body.history[0].delta, 40);
    assert.ok(res.body.expiresAt, 'no expiry date reported');
  });

  // --- Cloud-native: stateless app tier ----------------------------------
  console.log('\nCloud: shared state, job locks, S3 media');

  const { MongoRateLimitStore } = await import('../utils/mongoRateLimitStore.js');
  const { runExclusive } = await import('../utils/jobLock.js');
  const media = await import('../services/mediaService.js');
  const photoCtrl = await import('../controllers/vehiclePhotoController.js');

  await check('two instances share one rate-limit counter', async () => {
    // Two store objects = two app instances behind the load balancer.
    const a = new MongoRateLimitStore('smoke');
    const b = new MongoRateLimitStore('smoke');
    a.init({ windowMs: 60_000 });
    b.init({ windowMs: 60_000 });
    await a.increment('1.2.3.4');
    await b.increment('1.2.3.4');
    const third = await a.increment('1.2.3.4');
    assert.equal(third.totalHits, 3, 'instances counted separately');
    await b.decrement('1.2.3.4');
    assert.equal((await a.increment('1.2.3.4')).totalHits, 3);
  });

  await check('a rate-limit window resets once it has passed', async () => {
    const s = new MongoRateLimitStore('smoke-short');
    s.init({ windowMs: 150 });
    await s.increment('k');
    await s.increment('k');
    await new Promise((r) => setTimeout(r, 250));
    assert.equal((await s.increment('k')).totalHits, 1);
  });

  await check('a scheduled job runs on one instance per lease', async () => {
    let runs = 0;
    const job = async () => { runs += 1; };
    const results = await Promise.all([
      runExclusive('smoke-job', 60_000, job),
      runExclusive('smoke-job', 60_000, job),
      runExclusive('smoke-job', 60_000, job),
    ]);
    assert.equal(runs, 1, `ran ${runs} times`);
    assert.equal(results.filter((r) => r.ran).length, 1);
    // An expired lease can be taken again.
    await mongoose.connection.collection('joblocks').updateOne({ _id: 'smoke-job' }, { $set: { lockedUntil: new Date(0) } });
    assert.equal((await runExclusive('smoke-job', 60_000, job)).ran, true);
  });

  await check('S3 photo upload: presigned POST, ownership check, confirm', async () => {
    const { S3Client } = await import('@aws-sdk/client-s3');
    process.env.MEDIA_BUCKET = 'smoke-media';
    process.env.AWS_REGION = 'ap-southeast-1';
    const fakeObjects = new Map();
    const fake = new S3Client({ region: 'ap-southeast-1', credentials: { accessKeyId: 'AKIAFAKE', secretAccessKey: 'fake' } });
    fake.send = async (cmd) => {
      const name = cmd.constructor.name;
      if (name === 'HeadObjectCommand') {
        const obj = fakeObjects.get(cmd.input.Key);
        if (!obj) throw Object.assign(new Error('NotFound'), { name: 'NotFound' });
        return obj;
      }
      if (name === 'DeleteObjectCommand') { fakeObjects.delete(cmd.input.Key); return {}; }
      throw new Error(`unexpected ${name}`);
    };
    media.setS3Client(fake);

    try {
      const owner = await bareDriver('photo@test.com', 'photographer');
      const car = await giveCar(owner);
      const params = { id: String(car._id) };

      const bad = await call(photoCtrl.requestPhotoUpload, { params, body: { contentType: 'application/pdf' }, userId: owner });
      assert.equal(bad.status, 400);

      const up = await call(photoCtrl.requestPhotoUpload, { params, body: { contentType: 'image/jpeg' }, userId: owner });
      assert.equal(up.status, 200, up.body.message);
      const { url, fields, key } = up.body.upload;
      assert.match(url, /smoke-media/);
      assert.ok(key.startsWith(`vehicles/${owner}/${car._id}/`), key);
      assert.equal(fields['Content-Type'], 'image/jpeg');
      assert.ok(fields.Policy && fields['X-Amz-Signature'], 'the POST is not signed');

      // Confirming before the file exists is refused.
      assert.equal((await call(photoCtrl.confirmPhoto, { params, body: { key }, userId: owner })).status, 400);

      // Someone else's key is refused even if the file exists.
      const stranger = await bareDriver('stranger@test.com', 'stranger');
      const strangerCar = await giveCar(stranger);
      fakeObjects.set(key, { ContentType: 'image/jpeg', ContentLength: 1000 });
      const theft = await call(photoCtrl.confirmPhoto, { params: { id: String(strangerCar._id) }, body: { key }, userId: stranger });
      assert.equal(theft.status, 400);

      const ok = await call(photoCtrl.confirmPhoto, { params, body: { key }, userId: owner });
      assert.equal(ok.status, 200, ok.body.message);
      assert.match(ok.body.photoUrl, /X-Amz-Signature/);
      assert.equal((await Vehicle.findById(car._id)).photoKey, key);

      // The staff scan shows the photo next to the plate.
      const d = await bookGps(owner);
      assert.equal(d.status, 201, d.body.message);
      const scan = await call(staffCtrl.scanCheckIn, { body: { qrPayload: d.body.data.qrCode.token }, userId: staffId });
      assert.equal(scan.status, 200, scan.body.message);
      assert.match(scan.body.data.vehicle.photoUrl, /smoke-media/);
    } finally {
      delete process.env.MEDIA_BUCKET;
      media.setS3Client(null);
    }
  });

  await check('without a bucket configured, photo upload answers 503, not 500', async () => {
    const id = await bareDriver('nobucket@test.com', 'nobucket');
    const car = await giveCar(id);
    const res = await call(photoCtrl.requestPhotoUpload, { params: { id: String(car._id) }, body: { contentType: 'image/png' }, userId: id });
    assert.equal(res.status, 503);
  });

  await check('JSON logs are one parseable object per line', async () => {
    const { logEvent } = await import('../utils/logger.js');
    const lines = [];
    const original = console.log;
    process.env.LOG_FORMAT = 'json';
    console.log = (line) => lines.push(line);
    try {
      logEvent('booking_created', { zone: 'A' });
    } finally {
      console.log = original;
      delete process.env.LOG_FORMAT;
    }
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.event, 'booking_created');
    assert.equal(parsed.zone, 'A');
    assert.ok(parsed.ts);
  });

  // --- Admin: dashboard, lots and bays ---------------------------------------
  console.log('\nAdmin: dashboard, lots and bays');

  const lotsCtrl = await import('../controllers/adminLotsController.js');
  const dashCtrl = await import('../controllers/adminDashboardController.js');

  await check('bay numbers: ranges keep their padding, junk is refused', () => {
    assert.deepEqual(lotsCtrl.parseSpotNumbers('a01-a03, B9 b9 C10'), ['A01', 'A02', 'A03', 'B9', 'C10']);
    assert.deepEqual(lotsCtrl.parseSpotNumbers('7-9'), ['7', '8', '9']);
    assert.throws(() => lotsCtrl.parseSpotNumbers('A5-A1'), /มากกว่า/);
    assert.throws(() => lotsCtrl.parseSpotNumbers('A1-A999'), /ไม่เกิน/);
    assert.throws(() => lotsCtrl.parseSpotNumbers('ช่อง1'), /อ่านเลขช่อง/);
  });

  let newLotId;
  await check('an admin adds a lot, then its bays (existing ones are skipped)', async () => {
    const made = await call(lotsCtrl.createLot, { body: { zoneName: 'eng-b', name: 'ลานวิศวะ' }, userId: uid });
    assert.equal(made.status, 201, made.body.message);
    assert.equal(made.body.lot.zoneName, 'ENG-B');
    newLotId = made.body.lot.id.toString();
    assert.equal((await call(lotsCtrl.createLot, { body: { zoneName: 'ENG-B', name: 'ซ้ำ' } })).status, 409);

    const first = await call(lotsCtrl.addLotSpots, { params: { id: newLotId }, body: { spots: 'E01-E03' }, userId: uid });
    assert.equal(first.status, 201, first.body.message);
    const again = await call(lotsCtrl.addLotSpots, { params: { id: newLotId }, body: { spots: 'E03-E04' }, userId: uid });
    assert.deepEqual(again.body.added, ['E04']);
    assert.deepEqual(again.body.skipped, ['E03']);
    assert.equal((await ParkingZone.findById(newLotId)).totalSpots, 4);
  });

  await check('a closed bay is never booked, and cannot be closed while in use', async () => {
    const spots = (await call(lotsCtrl.listLotSpots, { params: { id: newLotId } })).body.spots;
    assert.deepEqual(spots.map((s) => s.spotNumber), ['E01', 'E02', 'E03', 'E04']);
    for (const s of spots.slice(1)) {
      const res = await call(lotsCtrl.setSpotClosed, { params: { id: s.id.toString() }, body: { closed: true }, userId: uid });
      assert.equal(res.status, 200, res.body.message);
    }
    // One bay left open: the next booking must land on it.
    const driverId = await bareDriver('lots@test.com', 'lotsdriver');
    await giveCar(driverId);
    const booked = await call(bookingCtrl.createBooking, { body: { zoneId: newLotId }, userId: driverId });
    assert.equal(booked.status, 201, booked.body.message);
    const held = await Booking.findById(booked.body.data.bookingId);
    assert.equal(String(held.spot), String(spots[0].id));

    const busy = await call(lotsCtrl.setSpotClosed, { params: { id: spots[0].id.toString() }, body: { closed: true }, userId: uid });
    assert.equal(busy.status, 409);
    assert.equal(busy.body.code, 'spot_in_use');

    // Drivers see the closed bays as not part of the lot.
    const zone = (await call(parkingCtrl.getZoneById, { params: { id: newLotId } })).body.zone;
    assert.equal(zone.totalSpots, 1);
    await call(bookingCtrl.cancelBooking, { params: { id: held._id.toString() }, userId: driverId });

    const reopened = await call(lotsCtrl.setSpotClosed, { params: { id: spots[1].id.toString() }, body: { closed: false }, userId: uid });
    assert.equal(reopened.body.spot.status, 'available');
  });

  await check('the dashboard counts lots, today, money and what needs attention', async () => {
    // A car parked 13 hours ago that never checked out.
    const forgetful = await bareDriver('forgot@test.com', 'forgetful');
    await giveCar(forgetful);
    const b = await call(bookingCtrl.createBooking, { body: { zoneId: newLotId }, userId: forgetful });
    assert.equal(b.status, 201, b.body.message);
    await confirmCheckIn({ bookingId: b.body.data.bookingId, method: 'gps' });
    await Booking.findByIdAndUpdate(b.body.data.bookingId, { actualStartTime: new Date(Date.now() - 13 * 3600 * 1000) });

    const res = await call(dashCtrl.getDashboard, { userId: uid });
    assert.equal(res.status, 200, res.body.message);
    const d = res.body;
    const lot = d.lots.find((l) => l.zoneName === 'ENG-B');
    assert.deepEqual({ occupied: lot.occupied, closed: lot.closed, total: lot.total }, { occupied: 1, closed: 2, total: 4 });
    assert.equal(d.revenue.length, 7);
    assert.equal(d.bookingsByHour.length, 24);
    assert.ok(d.today.bookings >= 2);
    assert.ok(d.today.revenue >= 40, `today's revenue ${d.today.revenue}`);
    assert.equal(d.revenue[6].total, d.today.revenue);
    assert.ok(d.attention.longParked.some((x) => String(x.bookingId) === String(b.body.data.bookingId)));
  });

  await check('a Bangkok day starts at 17:00 UTC the day before', () => {
    const start = dashCtrl.bangkokDayStart(new Date('2026-11-13T16:30:00Z')); // 23:30 in Bangkok
    assert.equal(start.toISOString(), '2026-11-12T17:00:00.000Z');
    const next = dashCtrl.bangkokDayStart(new Date('2026-11-13T17:30:00Z')); // 00:30 next day
    assert.equal(next.toISOString(), '2026-11-13T17:00:00.000Z');
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
