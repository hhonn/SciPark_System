import express from "express"
import cors from "cors"
import 'dotenv/config'
import cookieParser from "cookie-parser"
import morgan from "morgan"
import path from "path"
import fs from "fs"
import { fileURLToPath } from 'url'

import connectDB from "./config/db.js"
import { jwtSecret } from "./utils/authToken.js"
import { jsonAccessLog, logError } from "./utils/logger.js"
import { warnAboutDefaultAccounts } from "./utils/seedAccounts.js"
import { startAutoCancelScheduler, stopAutoCancelScheduler } from "./services/autoCancelService.js"
import { startSubscriptionScheduler, stopSubscriptionScheduler } from "./services/subscriptionService.js"
import { securityHeaders, sanitizeRequest, apiLimiter } from "./middleware/security.js"

import authRouter from "./routes/authRoute.js"
import vehicleRouter from "./routes/vehicleRoutes.js"
import bookingRouter from "./routes/bookingRoutes.js"
import parkingRouter from "./routes/parkingRoute.js"
import pricingRouter from "./routes/pricingRoute.js"
import privilegesRouter from "./routes/privilegesRoute.js"
import userRouter from "./routes/userRoutes.js"
import paymentMethodRouter from "./routes/paymentMethodRoutes.js"
import notificationRouter from "./routes/notificationRoutes.js"
import staffRouter from "./routes/staffRoute.js"
import adminRouter from "./routes/adminRoute.js"
import pointsRouter from "./routes/pointsRoute.js"
import { startPointsScheduler, stopPointsScheduler } from "./services/pointsService.js"

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express();
const port = process.env.PORT || 3000;

// Only trust a forwarding proxy when one is actually in front of us. Trusting
// X-Forwarded-For unconditionally lets any client spoof its IP and slip past
// the rate limiter, which matters even on a machine that is only meant to be
// reachable locally. Set TRUST_PROXY=1 if a reverse proxy is ever added.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}

// Refuse to boot without a usable signing secret. Before, the server started
// fine and then answered every login with a 500 and every request with 401.
try {
  jwtSecret();
} catch (error) {
  console.error(`❌ ${error.message}. Set JWT_SECRET in backend/.env (openssl rand -hex 32).`);
  process.exit(1);
}

// Connect to Database
connectDB();

// Background jobs (started after the DB connection has had a moment to settle)
setTimeout(() => {
  startAutoCancelScheduler();
  startSubscriptionScheduler();
  startPointsScheduler();

  // The README publishes the seed logins (admin included). On a live server
  // that is an open door, so say so loudly on every boot until it is closed.
  if (process.env.NODE_ENV === "production") {
    warnAboutDefaultAccounts().catch((e) => console.error("Seed account check failed:", e.message));
  }
}, 2000);

// Security middleware
app.use(securityHeaders);

// Request size limiting
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Strip Mongo operators and markup from every incoming payload
app.use(sanitizeRequest);

// CORS. The Vite dev server runs on its own port, so it needs an entry here;
// CLIENT_URL accepts a comma separated list for any additional origin.
const configuredOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  ...(process.env.CLIENT_URL || '').split(',').map(o => o.trim()),
].filter(Boolean);

// A request is same-origin when the Origin header matches the host it was sent
// to. This matters because Vite marks its built <script> and <link> tags
// `crossorigin`, so the browser sends an Origin header even for the app's own
// stylesheet. Rejecting that returned a JSON error in place of the CSS and the
// page rendered unstyled.
const isSameOrigin = (req, origin) => {
  if (!origin) return true; // same-origin navigations and server-to-server calls
  try {
    const { host, protocol } = new URL(origin);
    const forwardedProto = req.headers['x-forwarded-proto'] || req.protocol;
    return host === req.headers.host && `${protocol}//` === `${forwardedProto}://`;
  } catch {
    return false;
  }
};

app.use(cors((req, callback) => {
    const origin = req.headers.origin;
    const allowed = isSameOrigin(req, origin) || configuredOrigins.includes(origin);

    // `false` simply omits the CORS headers, which is what a disallowed
    // cross-origin request should get. Passing an Error here instead turned
    // every such request into a 500 from the global error handler.
    callback(null, {
        origin: allowed,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    });
}));

// Health check: polled by the load balancer every few seconds and by the
// zero-downtime demo script. Registered before the rate limiter (polling must
// never be throttled) and the access log (it would drown everything else).
// It is public, so it says only whether this instance can serve, plus which
// release and instance answered. That is what lets a rolling deploy be seen
// switching over without a single failed request.
const PROCESS_STARTED_AT = new Date(Date.now() - process.uptime() * 1000).toISOString();

const health = async (req, res) => {
  const mongoose = await import('mongoose');
  const dbUp = mongoose.default.connection.readyState === 1;

  res.set('Cache-Control', 'no-store');
  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    database: dbUp ? 'connected' : 'disconnected',
    ...(process.env.RELEASE_ID && { release: process.env.RELEASE_ID }),
    ...(process.env.INSTANCE_ID && { instance: process.env.INSTANCE_ID }),
    ...(process.env.AVAILABILITY_ZONE && { zone: process.env.AVAILABILITY_ZONE }),
    // When this process started, so a deploy timeline shows each new
    // instance coming up.
    startedAt: PROCESS_STARTED_AT,
  });
};
app.get('/health', health);
app.get('/api/health', health); // reachable through the CDN's /api/* route

// Rate limiting (per-route limiters live in the routers themselves)
app.use('/api', apiLimiter);

// Request logging: one JSON object per request in production (for CloudWatch
// Logs Insights), the readable dev format locally.
app.use(process.env.LOG_FORMAT === 'json' ? morgan(jsonAccessLog) : morgan('dev'));

// API Root route
app.get('/api', (req, res) => {
  res.json({
    message: "SciPark API is running",
    version: "2.0.0",
  });
});

app.use('/api/auth', authRouter);
app.use('/api/vehicles', vehicleRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/parking', parkingRouter);
app.use('/api/pricing', pricingRouter);
app.use('/api/privileges', privilegesRouter);
app.use('/api/user', userRouter);
app.use('/api/payment-methods', paymentMethodRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/staff', staffRouter);
app.use('/api/admin', adminRouter);
app.use('/api/points', pointsRouter);

// Unknown API routes must 404 as JSON rather than fall through to the SPA.
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found' });
});

// ============================================
// Serve Frontend Static Files
// ============================================
// Built by `npm run build` in the frontend workspace. When it is missing the
// server runs API-only, which is what `npm run dev` does while Vite serves the
// UI on its own port.
const distPath = path.join(__dirname, '../frontend/dist');
const frontendPath = fs.existsSync(distPath) ? distPath : null;

if (frontendPath) {
  console.log(`📁 Serving frontend from: ${frontendPath}`);

  // Hashed build assets are immutable; index.html must never be cached, or a
  // rebuild leaves the browser booting the previous bundle.
  app.use(express.static(frontendPath, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (/\.[0-9a-f]{8,}\.(js|css|woff2?|png|svg|jpg)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));

  // Client-side routing fallback (Express 5 needs a RegExp, not '*')
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
} else {
  console.log('⚠️  Frontend build not found. Running API-only mode.');
  app.get('/', (req, res) => {
    res.send("SciPark API is running... (Frontend not found)");
  });
}

// Global error handler
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || err.status || 500;
    if (statusCode >= 500) logError('Unhandled error', err, { path: req.path });
    // A 5xx message can carry driver/query internals (collection names, index
    // keys, connection strings), so production only says something went wrong.
    // 4xx messages are meant for the client and are passed through.
    const exposeMessage = statusCode < 500 || process.env.NODE_ENV !== 'production';
    res.status(statusCode).json({
        status: 'error',
        message: (exposeMessage && err.message) || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// HOST=127.0.0.1 when a reverse proxy on the same box (Caddy, Nginx) is the
// only thing that should reach the app. Unset = all interfaces, which is what a
// load balancer in front of the instance needs.
const host = process.env.HOST || undefined;
const server = app.listen(port, host, () => {
    console.log(`🚀 SciPark server is running on ${host || '*'}:${port}`)
});

// Graceful shutdown: finish in-flight requests, then stop the cron jobs.
const shutdown = async (signal) => {
  console.log(`🛑 ${signal} received: shutting down`);
  stopAutoCancelScheduler();
  // Was left running: the subscription cron kept the event loop alive, so the
  // process only ever exited via the 10s force-quit timer below.
  stopSubscriptionScheduler();
  stopPointsScheduler();
  server.close(() => process.exit(0));
  // Don't hang forever if a socket refuses to close.
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
