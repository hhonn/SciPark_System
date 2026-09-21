import nodemailer from "nodemailer";

/**
 * Mail transport.
 *
 * Credentials were read from SMTP_USER/SMTP_PASSWORD while every .env template
 * documented EMAIL_USER/EMAIL_PASS, so outgoing mail silently failed to
 * authenticate. Both spellings are accepted now, and when nothing is configured
 * `sendMail` becomes a logged no-op instead of throwing on every request.
 */

const host = process.env.EMAIL_HOST || process.env.SMTP_HOST || "smtp-relay.brevo.com";
const port = Number(process.env.EMAIL_PORT || process.env.SMTP_PORT || 587);
const user = process.env.EMAIL_USER || process.env.SMTP_USER;
const pass = process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || process.env.SMTP_PASS;

export const isMailConfigured = Boolean(user && pass);

export const mailFrom =
  process.env.EMAIL_FROM || process.env.SENDER_EMAIL || "SciPark <noreply@scipark.app>";

const transporter = isMailConfigured
  ? nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })
  : {
      // Dev/CI fallback so a missing SMTP config never breaks a user flow.
      sendMail: async (options) => {
        console.log(`✉️  [mail disabled] would send "${options.subject}" to ${options.to}`);
        return { messageId: "mail-disabled" };
      },
    };

/** Send without ever rejecting: mail is never critical to a request. */
export const sendMailSafely = async (options) => {
  try {
    return await transporter.sendMail({ from: mailFrom, ...options });
  } catch (error) {
    console.error("Email error:", error.message);
    return null;
  }
};

export default transporter;
