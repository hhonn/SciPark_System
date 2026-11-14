// Errors that are safe to show to the client.
//
// Catch blocks used to answer `error.message` for anything thrown, so a
// Mongoose CastError ("Cast to ObjectId failed ... model PaymentMethod") or a
// driver error reached the user verbatim and described the schema. Only errors
// we raise on purpose carry a message meant for people.
import { logError } from "./logger.js";

export class HttpError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    if (code) this.code = code;
  }
}

// A message is client-facing when we raised it, with a 4xx status.
const isClientFacing = (error) =>
  error instanceof HttpError ||
  (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500);

// Answer a failed request without leaking internals.
//
// @param {object} res      Express response
// @param {Error}  error    whatever was caught
// @param {string} fallback message for anything that is not client-facing
// @param {string} context  log label
export const sendError = (res, error, fallback = "เกิดข้อผิดพลาด", context = "Request error") => {
  if (isClientFacing(error)) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      ...(error.code && { code: error.code }),
    });
  }

  // Malformed ids or fields that fail schema casting are the client's fault,
  // but the driver's wording is not for them.
  if (error?.name === "CastError" || error?.name === "ValidationError") {
    return res.status(400).json({ success: false, message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
  }

  logError(context, error);
  return res.status(500).json({ success: false, message: fallback });
};

export default { HttpError, sendError };
