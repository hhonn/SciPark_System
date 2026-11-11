/**
 * Structured logging.
 *
 * With LOG_FORMAT=json (production) every line is one JSON object on stdout.
 * The CloudWatch agent ships stdout to CloudWatch Logs, where metric filters
 * such as `{ $.event = "booking_created" }` turn events into dashboard metrics
 * and Logs Insights can query any field — no log parsing, no extra service.
 *
 * Locally the same calls print a short human-readable line instead.
 */

const json = () => process.env.LOG_FORMAT === "json";

const base = () => ({
  ts: new Date().toISOString(),
  ...(process.env.INSTANCE_ID && { instance: process.env.INSTANCE_ID }),
  ...(process.env.RELEASE_ID && { release: process.env.RELEASE_ID }),
});

/** A business event worth counting (booking_created, checkin, checkout, ...). */
export const logEvent = (event, fields = {}) => {
  if (json()) {
    console.log(JSON.stringify({ ...base(), level: "info", event, ...fields }));
  } else if (process.env.NODE_ENV !== "test") {
    console.log(`📈 ${event}`, Object.keys(fields).length ? fields : "");
  }
};

/** An unexpected failure. */
export const logError = (context, error, fields = {}) => {
  if (json()) {
    console.error(JSON.stringify({
      ...base(),
      level: "error",
      event: "server_error",
      context,
      message: error?.message,
      name: error?.name,
      stack: error?.stack?.split("\n").slice(0, 6).join("\n"),
      ...fields,
    }));
  } else {
    console.error(`${context}:`, error);
  }
};

/**
 * One JSON line per HTTP request, for morgan. The query string is dropped:
 * it can carry search terms and tokens that have no business in a log.
 */
export const jsonAccessLog = (tokens, req, res) =>
  JSON.stringify({
    ...base(),
    level: "info",
    event: "http",
    method: tokens.method(req, res),
    path: (req.originalUrl || req.url).split("?")[0],
    status: Number(tokens.status(req, res)) || 0,
    ms: Number(tokens["response-time"](req, res)) || 0,
    bytes: Number(tokens.res(req, res, "content-length")) || 0,
    ip: req.ip,
  });

export default { logEvent, logError, jsonAccessLog };
