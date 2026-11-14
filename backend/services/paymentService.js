import mongoose from "mongoose";
import PaymentMethod from "../models/paymentMethodModel.js";

// Payment gateway boundary.
//
// SciPark has no acquiring bank yet, so this module *simulates* the charge,
// but it simulates it honestly: a charge requires a real, active payment method
// belonging to the user, it can fail, and every caller must handle failure.
// Swapping in Omise/Stripe later means replacing `authorizeCharge` only.

export class PaymentError extends Error {
  constructor(message, code = "payment_failed") {
    super(message);
    this.name = "PaymentError";
    this.code = code;
  }
}

// Resolve which saved payment method to charge.
//
// @throws {PaymentError} when the user has nothing chargeable on file.
export const resolvePaymentMethod = async ({ userId, paymentMethodId, preferredMethodId = null, session = null }) => {
  // A malformed id used to throw a Mongoose CastError whose text described the
  // schema; to the user it is simply a method that does not exist.
  if (paymentMethodId && !mongoose.isValidObjectId(paymentMethodId)) {
    throw new PaymentError("ไม่พบวิธีการชำระเงินที่เลือก", "no_payment_method");
  }

  let method = null;

  // A soft preference (e.g. the card a booking was paid with): used if it is
  // still active, otherwise silently replaced by the default below.
  if (!paymentMethodId && preferredMethodId && mongoose.isValidObjectId(preferredMethodId)) {
    method = await PaymentMethod.findOne({ _id: preferredMethodId, user: userId, status: "active" }).session(session);
  }

  const query = paymentMethodId
    ? { _id: paymentMethodId, user: userId, status: "active" }
    : { user: userId, status: "active", isDefault: true };

  if (!method) method = await PaymentMethod.findOne(query).session(session);

  // No default flagged yet: fall back to any active method the user has.
  if (!method && !paymentMethodId) {
    method = await PaymentMethod.findOne({ user: userId, status: "active" }).session(session);
  }

  if (!method) {
    throw new PaymentError(
      paymentMethodId
        ? "ไม่พบวิธีการชำระเงินที่เลือก"
        : "กรุณาเพิ่มวิธีการชำระเงินก่อนทำการจอง",
      "no_payment_method"
    );
  }

  return method;
};

// Cards that expired last month cannot be charged this month.
const isCardExpired = (method) => {
  if (!["credit_card", "debit_card"].includes(method.type)) return false;
  if (!method.expiryMonth || !method.expiryYear) return false;

  const month = parseInt(method.expiryMonth, 10);
  const year = parseInt(method.expiryYear, 10);
  if (Number.isNaN(month) || Number.isNaN(year)) return false;

  const fullYear = year < 100 ? 2000 + year : year;
  // Valid through the last day of the expiry month.
  const expiresAt = new Date(fullYear, month, 1);
  return expiresAt.getTime() <= Date.now();
};

// Authorize and capture an amount.
//
// @returns {Promise<{ success: true, transactionId: string, amount: number, method: object }>}
// @throws  {PaymentError} on a declined charge; callers must roll back.
export const authorizeCharge = async ({ userId, amount, paymentMethodId, preferredMethodId = null, session = null, description = "" }) => {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new PaymentError("จำนวนเงินไม่ถูกต้อง", "invalid_amount");
  }

  const method = await resolvePaymentMethod({ userId, paymentMethodId, preferredMethodId, session });

  if (isCardExpired(method)) {
    throw new PaymentError("บัตรของคุณหมดอายุแล้ว กรุณาใช้บัตรอื่น", "card_expired");
  }

  // A zero-amount charge (e.g. a fully discounted session) needs no gateway hop.
  if (amount === 0) {
    return { success: true, transactionId: "free", amount: 0, method };
  }

  return {
    success: true,
    transactionId: `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    amount,
    description,
    method,
  };
};

export default { authorizeCharge, resolvePaymentMethod, PaymentError };
