import express from "express"
import cors from "cors"
import 'dotenv/config'
import cookieParser from "cookie-parser"
import morgan from "morgan"
import path from "path"
import fs from "fs"
import { fileURLToPath } from 'url'

import connectDB from "./config/db.js"
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

// Connect to Database
connectDB();

// Background jobs (started after the DB connection has had a moment to settle)
setTimeout(() => {
  startAutoCancelScheduler();
  startSubscriptionScheduler();
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

/**
 * A request is same-origin when the Origin header matches the host it was sent
 * to. This matters because Vite marks its built <script> and <link> tags
 * `crossorigin`, so the browser sends an Origin header even for the app's own
 * stylesheet. Rejecting that returned a JSON error in place of the CSS and the
 * page rendered unstyled.
 */
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

// Rate limiting (per-route limiters live in the routers themselves)
app.use('/api', apiLimiter);

// Request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// API Root route
app.get('/api', (req, res) => {
  res.json({
    message: "SciPark API is running",
    version: "2.0.0",
  });
});

// Health Check endpoint
app.get('/health', async (req, res) => {
  try {
    const mongoose = await import('mongoose');
    const dbStatus = mongoose.default.connection.readyState === 1 ? 'connected' : 'disconnected';

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
      },
      services: {
        autoCancelScheduler: 'running'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: error.message
    });
  }
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
    const statusCode = err.statusCode || 500;
    if (statusCode >= 500) console.error('Unhandled error:', err);
    res.status(statusCode).json({
        status: 'error',
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

const server = app.listen(port, () => {
    console.log(`🚀 SciPark server is running on port ${port}`)
});

// Graceful shutdown — finish in-flight requests, then stop the cron jobs.
const shutdown = async (signal) => {
  console.log(`🛑 ${signal} received: shutting down`);
  stopAutoCancelScheduler();
  // Was left running: the subscription cron kept the event loop alive, so the
  // process only ever exited via the 10s force-quit timer below.
  stopSubscriptionScheduler();
  server.close(() => process.exit(0));
  // Don't hang forever if a socket refuses to close.
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
