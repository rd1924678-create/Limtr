import express from 'express';
import { createClient } from 'redis';
import { expressRateLimit, MemoryStore, RedisStore, presets } from '../src/index.js';

const app = express();
app.use(express.json());

// ==========================================
// 1. GLOBAL RATE LIMITING
// ==========================================
// Protects all routes by default using the fast in-memory store
// 100 requests per 15 minutes
const globalLimiter = expressRateLimit({
  algorithm: { name: 'fixedWindow', max: 100, windowMs: 15 * 60 * 1000 },
  store: new MemoryStore()
});
app.use(globalLimiter);

app.get('/', (req, res) => res.send('Welcome to the Limtr Example Server!'));

// ==========================================
// 2. LOGIN RATE LIMITING (Presets)
// ==========================================
// Uses the built-in 'login' preset to strictly prevent brute force attacks
const loginLimiter = expressRateLimit(presets.login);
app.post('/login', loginLimiter, (req, res) => {
  res.send('Login attempt processed. (Try spamming this route to see it block you fast)');
});

// ==========================================
// 3. OTP RATE LIMITING (Custom Responses)
// ==========================================
// Highly restrictive rule: 3 requests per 10 minutes, with a custom error message
const otpLimiter = expressRateLimit({
  algorithm: { name: 'fixedWindow', max: 3, windowMs: 10 * 60 * 1000 },
  failStrategy: { message: 'Too many OTP requests. Please wait 10 minutes to try again.' }
});
app.post('/otp', otpLimiter, (req, res) => {
  res.send('OTP code sent to your phone.');
});

// ==========================================
// 4. USER-BASED RATE LIMITING (Custom Keys)
// ==========================================
// Instead of limiting by IP address, we extract a User ID from the request headers.
// We also use the mathematical Token Bucket algorithm for smoother burst handling.
const userLimiter = expressRateLimit({
  algorithm: { name: 'tokenBucket', capacity: 50, refillRate: 5, refillInterval: 1000 },
  keyGenerator: (req) => {
    // In a real app, this ID would be attached by your authentication middleware
    return req.headers['x-user-id'] || req.ip;
  }
});
app.get('/user-dashboard', userLimiter, (req, res) => {
  res.send('Dashboard data loaded specifically for your User ID.');
});

// ==========================================
// 5. API KEY RATE LIMITING (Route Routing)
// ==========================================
// Demonstrates how a SaaS platform might limit based on API Keys.
// 1000 burst capacity, regains 100 tokens every second.
const apiLimiter = expressRateLimit({
  keyGenerator: (req) => req.headers['x-api-key'] || req.ip,
  routes: [
    {
      pattern: /^\/api\//, // Applies specifically to API routes
      algorithm: { name: 'tokenBucket', capacity: 1000, refillRate: 100, refillInterval: 1000 }
    }
  ]
});
app.get('/api/data', apiLimiter, (req, res) => {
  res.send('Heavy API Data delivered successfully.');
});

// ==========================================
// 6. REDIS RATE LIMITING (Distributed)
// ==========================================
// For deployments with multiple Node.js instances behind a load balancer,
// this ensures all servers share the same limits atomically via Lua scripts.
(async () => {
  try {
    const redisClient = createClient({ url: 'redis://localhost:6379' });
    
    // Catch errors silently so the example server still boots if Redis isn't installed locally
    redisClient.on('error', () => {}); 
    await redisClient.connect();

    const distributedLimiter = expressRateLimit({
      store: new RedisStore(redisClient, 'limtr:prod:'),
      algorithm: { name: 'fixedWindow', max: 200, windowMs: 60 * 1000 }
    });

    app.get('/distributed', distributedLimiter, (req, res) => {
      res.send('This route is protected across all your cluster nodes by Redis!');
    });
    
    console.log('✅ Redis connected successfully for distributed limiting.');
  } catch (err) {
    console.warn('⚠️  Skipping Redis Route: Could not connect to localhost:6379');
  }

  // ==========================================
  // BOOT SERVER
  // ==========================================
  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`\n🚀 Limtr Express Example Server running on http://localhost:${PORT}`);
    console.log('Available endpoints to test:');
    console.log('  GET  /               (Global Limits)');
    console.log('  POST /login          (Strict brute-force prevention)');
    console.log('  POST /otp            (Custom 3/10min rule)');
    console.log('  GET  /user-dashboard (Limits mapped to X-User-ID header)');
    console.log('  GET  /api/data       (Massive API limits via X-Api-Key)');
    console.log('  GET  /distributed    (Redis cluster protection)\n');
  });
})();
