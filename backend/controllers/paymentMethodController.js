import mongoose from "mongoose";
import { HttpError, sendError } from "../utils/httpError.js";
import PaymentMethod from "../models/paymentMethodModel.js";

/** Luhn checksum — rejects typo'd card numbers before they reach the gateway. */
const luhnValid = (digits) => {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = Number(digits[i]);
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
};

/** Card network, inferred from the IIN range, for display only. */
const detectBrand = (digits) => {
  if (/^4/.test(digits)) return "Visa";
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "Amex";
  if (/^35/.test(digits)) return "JCB";
  return "Card";
};

const CARD_TYPES = ["credit_card", "debit_card"];
const WALLET_TYPES = ["promptpay", "truewallet"];

/**
 * Fields a client may supply. Everything else on the document — `user`,
 * `status`, `cardLast4`, `cardBrand` — is decided by the server.
 *
 * The create handler used to spread the whole request body over the document
 * *after* setting `user`, so a request carrying `"user": "<someone else's id>"`
 * filed the payment method under that account, and `cardLast4` could be forged
 * to display a card the user does not hold. `updatePaymentMethod` already
 * whitelisted for this reason; creation did not.
 */
const CREATABLE = [
  "cardHolderName",
  "expiryMonth",
  "expiryYear",
  "phoneNumber",
  "bankName",
  "accountNumber",
  "accountName",
];

/** Same list, minus nothing: an edit may touch exactly what a create may. */
const EDITABLE = CREATABLE;

const pick = (source, keys) =>
  keys.reduce((out, key) => {
    if (source[key] !== undefined) out[key] = source[key];
    return out;
  }, {});

/**
 * Validate an expiry pair and report whether it is already in the past.
 * A card that cannot be charged should be refused at the point it is added,
 * not at the point the user is standing at a barrier trying to pay.
 */
const checkExpiry = (expiryMonth, expiryYear) => {
  const month = parseInt(expiryMonth, 10);
  const year = parseInt(expiryYear, 10);

  if (Number.isNaN(month) || month < 1 || month > 12) {
    return "เดือนหมดอายุไม่ถูกต้อง (1-12)";
  }
  if (Number.isNaN(year)) {
    return "ปีหมดอายุไม่ถูกต้อง";
  }

  const fullYear = year < 100 ? 2000 + year : year;
  // Valid through the last day of the expiry month.
  if (new Date(fullYear, month, 1).getTime() <= Date.now()) {
    return "บัตรนี้หมดอายุแล้ว";
  }

  return null;
};

/*
    @desc   Get all payment methods for user
    @route  GET /api/payment-methods
    @access Private
*/
export const getPaymentMethods = async (req, res) => {
  try {
    const userId = req.userId;

    const paymentMethods = await PaymentMethod.find({
      user: userId,
      status: "active"
    }).sort({ isDefault: -1, createdAt: -1 });

    // Transform data to mask sensitive information
    const maskedMethods = paymentMethods.map(method => ({
      id: method._id,
      type: method.type,
      displayName: method.getDisplayName(),
      isDefault: method.isDefault,
      status: method.status,
      createdAt: method.createdAt,
      // Include masked card info for cards
      ...(method.type.includes('card') && {
        maskedCardNumber: method.getMaskedCardNumber(),
        cardBrand: method.cardBrand,
        cardHolderName: method.cardHolderName,
        expiryMonth: method.expiryMonth,
        expiryYear: method.expiryYear
      }),
      // Include phone for PromptPay/TrueWallet
      ...((method.type === 'promptpay' || method.type === 'truewallet') && {
        phoneNumber: method.phoneNumber
      }),
      // Include bank info for bank transfer
      ...(method.type === 'bank_transfer' && {
        bankName: method.bankName,
        accountNumber: method.accountNumber,
        accountName: method.accountName
      })
    }));

    res.status(200).json({
      success: true,
      count: maskedMethods.length,
      data: maskedMethods
    });

  } catch (error) {
    console.error("Get payment methods error:", error);
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลช่องทางการชำระเงิน",
    });
  }
};

/*
    @desc   Add new payment method
    @route  POST /api/payment-methods
    @access Private
*/
export const addPaymentMethod = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const userId = req.userId;
    const { type, isDefault } = req.body;

    // Only ever read the whitelisted keys off the request.
    const methodData = pick(req.body, CREATABLE);

    // The type drives every branch below and every display helper on the
    // model, so it is checked against the schema enum rather than assumed.
    const validTypes = PaymentMethod.schema.path("type").enumValues;
    if (!validTypes.includes(type)) {
      throw new HttpError(400, `ประเภทการชำระเงินไม่ถูกต้อง ต้องเป็น: ${validTypes.join(", ")}`);
    }

    // Validate required fields based on type
    if (CARD_TYPES.includes(type)) {
      if (!req.body.cardNumber || !methodData.cardHolderName ||
          !methodData.expiryMonth || !methodData.expiryYear) {
        throw new HttpError(400, "กรุณากรอกข้อมูลบัตรให้ครบถ้วน");
      }
      const digits = String(req.body.cardNumber).replace(/\s|-/g, '');
      if (!/^\d{13,19}$/.test(digits)) {
        throw new HttpError(400, "หมายเลขบัตรไม่ถูกต้อง");
      }
      if (!luhnValid(digits)) {
        throw new HttpError(400, "หมายเลขบัตรไม่ถูกต้อง");
      }

      const expiryProblem = checkExpiry(methodData.expiryMonth, methodData.expiryYear);
      if (expiryProblem) throw new HttpError(400, expiryProblem);

      // Keep only what is needed to show the user which card this is.
      methodData.cardLast4 = digits.slice(-4);
      methodData.cardBrand = detectBrand(digits);
    } else if (WALLET_TYPES.includes(type)) {
      if (!methodData.phoneNumber) {
        throw new HttpError(400, "กรุณากรอกเบอร์โทรศัพท์");
      }
      // Phone validation
      if (!/^0\d{9}$/.test(methodData.phoneNumber)) {
        throw new HttpError(400, "เบอร์โทรศัพท์ไม่ถูกต้อง");
      }
    } else if (type === 'bank_transfer') {
      if (!methodData.bankName || !methodData.accountNumber || !methodData.accountName) {
        throw new HttpError(400, "กรุณากรอกข้อมูลบัญชีธนาคารให้ครบถ้วน");
      }
    }

    let newMethod;

    await session.withTransaction(async () => {
      // If setting as default, remove default from other methods
      if (isDefault) {
        await PaymentMethod.updateMany(
          { user: userId, isDefault: true },
          { isDefault: false },
          { session }
        );
      }

      // Create new payment method
      newMethod = new PaymentMethod({
        ...methodData,
        // Set last so a whitelisted field can never shadow them.
        user: userId,
        type,
        isDefault: Boolean(isDefault),
        status: "active",
      });

      await newMethod.save({ session });
    });

    res.status(201).json({
      success: true,
      message: "เพิ่มช่องทางการชำระเงินสำเร็จ",
      data: {
        id: newMethod._id,
        type: newMethod.type,
        displayName: newMethod.getDisplayName(),
        isDefault: newMethod.isDefault
      }
    });

  } catch (error) {
    sendError(res, error, "เกิดข้อผิดพลาดในการเพิ่มช่องทางการชำระเงิน", "Add payment method error");
  } finally {
    await session.endSession();
  }
};

/*
    @desc   Update payment method
    @route  PUT /api/payment-methods/:id
    @access Private
*/
export const updatePaymentMethod = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const userId = req.userId;
    const { isDefault } = req.body;
    const updateData = pick(req.body, EDITABLE);

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ success: false, message: "ไม่พบช่องทางการชำระเงิน" });
    }

    let method;

    await session.withTransaction(async () => {
      method = await PaymentMethod.findOne({
        _id: id,
        user: userId
      }).session(session);

      if (!method) {
        const err = new Error("ไม่พบช่องทางการชำระเงิน");
        err.statusCode = 404;
        throw err;
      }

      // Re-check the expiry when either half of it changes, so a card cannot be
      // edited into a state that only fails later, at the barrier.
      if (updateData.expiryMonth !== undefined || updateData.expiryYear !== undefined) {
        const expiryProblem = checkExpiry(
          updateData.expiryMonth ?? method.expiryMonth,
          updateData.expiryYear ?? method.expiryYear
        );
        if (expiryProblem) throw new HttpError(400, expiryProblem);
      }

      if (updateData.phoneNumber !== undefined && WALLET_TYPES.includes(method.type)) {
        if (!/^0\d{9}$/.test(updateData.phoneNumber)) {
          throw new HttpError(400, "เบอร์โทรศัพท์ไม่ถูกต้อง");
        }
      }

      // If setting as default, remove default from other methods
      if (isDefault && !method.isDefault) {
        await PaymentMethod.updateMany(
          { user: userId, isDefault: true },
          { isDefault: false },
          { session }
        );
      }

      Object.assign(method, updateData);

      if (isDefault !== undefined) {
        method.isDefault = Boolean(isDefault);
      }

      await method.save({ session });
    });

    res.status(200).json({
      success: true,
      message: "อัปเดตช่องทางการชำระเงินสำเร็จ",
      data: {
        id: method._id,
        type: method.type,
        displayName: method.getDisplayName(),
        isDefault: method.isDefault
      }
    });

  } catch (error) {
    sendError(res, error, "เกิดข้อผิดพลาดในการอัปเดตช่องทางการชำระเงิน", "Update payment method error");
  } finally {
    await session.endSession();
  }
};

/*
    @desc   Delete payment method
    @route  DELETE /api/payment-methods/:id
    @access Private
*/
export const deletePaymentMethod = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({
        success: false,
        message: "ไม่พบช่องทางการชำระเงิน"
      });
    }

    let notFound = false;

    await session.withTransaction(async () => {
      const method = await PaymentMethod.findOne({
        _id: id,
        user: userId,
        status: "active"
      }).session(session);

      if (!method) {
        notFound = true;
        return;
      }

      // Soft delete by setting status to inactive. The default flag has to go
      // with it: an inactive row left flagged `isDefault` kept winning the
      // "which card is the default" lookup, so the promotion below never had
      // an effect the user could see.
      const wasDefault = method.isDefault;
      method.status = "inactive";
      method.isDefault = false;
      await method.save({ session });

      if (wasDefault) {
        const replacement = await PaymentMethod.findOne({
          user: userId,
          status: "active",
        })
          .sort({ createdAt: 1 })
          .session(session);

        if (replacement) {
          replacement.isDefault = true;
          await replacement.save({ session });
        }
      }
    });

    if (notFound) {
      return res.status(404).json({
        success: false,
        message: "ไม่พบช่องทางการชำระเงิน"
      });
    }

    res.status(200).json({
      success: true,
      message: "ลบช่องทางการชำระเงินสำเร็จ"
    });

  } catch (error) {
    console.error("Delete payment method error:", error);
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการลบช่องทางการชำระเงิน",
    });
  } finally {
    await session.endSession();
  }
};

/*
    @desc   Set payment method as default
    @route  PUT /api/payment-methods/:id/default
    @access Private
*/
export const setDefaultPaymentMethod = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ success: false, message: "ไม่พบช่องทางการชำระเงิน" });
    }

    let method;

    await session.withTransaction(async () => {
      method = await PaymentMethod.findOne({
        _id: id,
        user: userId,
        status: "active"
      }).session(session);

      if (!method) {
        const err = new Error("ไม่พบช่องทางการชำระเงิน");
        err.statusCode = 404;
        throw err;
      }

      // Remove default from all other methods
      await PaymentMethod.updateMany(
        { user: userId, isDefault: true, _id: { $ne: method._id } },
        { isDefault: false },
        { session }
      );

      // Set this method as default
      method.isDefault = true;
      await method.save({ session });
    });

    res.status(200).json({
      success: true,
      message: "ตั้งเป็นช่องทางการชำระเงินหักอัตโนมัติสำเร็จ",
      data: {
        id: method._id,
        type: method.type,
        displayName: method.getDisplayName(),
        isDefault: method.isDefault
      }
    });

  } catch (error) {
    sendError(res, error, "เกิดข้อผิดพลาด", "Set default payment method error");
  } finally {
    await session.endSession();
  }
};
