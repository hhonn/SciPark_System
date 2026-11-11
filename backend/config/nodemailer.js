import nodemailer from "nodemailer";
import { logEvent, logError } from "../utils/logger.js";

/**
 * Mail transport. Three modes, chosen from the environment:
 *
 *  - MAIL_TRANSPORT=ses  Amazon SES through the AWS SDK. On AWS the instance's
 *                        IAM role authorises sending, so there is no mail
 *                        password anywhere — not in code, not in secrets.
 *  - SMTP credentials    EMAIL_USER / EMAIL_PASS (SMTP_USER / SMTP_PASSWORD
 *                        also accepted), e.g. Brevo or Gmail.
 *  - neither             sendMail is a logged no-op, so a missing mail setup
 *                        never breaks a request (local development, CI).
 */

const host = process.env.EMAIL_HOST || process.env.SMTP_HOST || "smtp-relay.brevo.com";
const port = Number(process.env.EMAIL_PORT || process.env.SMTP_PORT || 587);
const user = process.env.EMAIL_USER || process.env.SMTP_USER;
const pass = process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || process.env.SMTP_PASS;

export const mailMode = process.env.MAIL_TRANSPORT === "ses" ? "ses" : user && pass ? "smtp" : "disabled";
export const isMailConfigured = mailMode !== "disabled";

export const mailFrom =
  process.env.EMAIL_FROM || process.env.SENDER_EMAIL || "SciPark <noreply@scipark.app>";

const disabledTransport = {
  // Dev/CI fallback so a missing mail setup never breaks a user flow.
  sendMail: async (options) => {
    console.log(`✉️  [mail disabled] would send "${options.subject}" to ${options.to}`);
    // Outside production, show the body too, so OTP and reset codes can be
    // used while developing without a mail account. Never in production: a log
    // full of reset codes is a log full of passwords.
    if (process.env.NODE_ENV !== "production") console.log(`   ${String(options.text || "").replace(/\n/g, "\n   ")}`);
    return { messageId: "mail-disabled" };
  },
};

const createTransport = async () => {
  if (mailMode === "ses") {
    // Loaded only when used, so local development never needs the SDK set up.
    const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
    return nodemailer.createTransport({
      SES: { sesClient: new SESv2Client({ region: process.env.AWS_REGION }), SendEmailCommand },
    });
  }
  if (mailMode === "smtp") {
    return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  }
  return disabledTransport;
};

const transporter = await createTransport();

/** Send without ever rejecting: mail is never critical to a request. */
export const sendMailSafely = async (options) => {
  try {
    const info = await transporter.sendMail({ from: mailFrom, ...options });
    if (mailMode !== "disabled") logEvent("email_sent", { via: mailMode });
    return info;
  } catch (error) {
    // e.g. SES sandbox: the recipient has not been verified yet.
    logError("Email error", error, { via: mailMode });
    return null;
  }
};

export default transporter;
