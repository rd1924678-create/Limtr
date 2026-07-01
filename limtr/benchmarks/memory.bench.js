import { bench, run, group } from 'mitata';
import { rateLimit } from 'express-rate-limit';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { expressRateLimit as limtrExpress, Limiter, MemoryStore } from '../src/index.js';

// =======================================
// SETUP: EXPRESS MIDDLEWARE
// =======================================
const mockReq = { ip: '192.168.1.1', originalUrl: '/api/data', method: 'GET', headers: {} };
const mockRes = { 
  setHeader: () => {}, 
  status: () => ({ send: () => {} }),
  headersSent: false
};
const mockNext = () => {};

// 1. Limtr
const limtrMiddleware = limtrExpress({
  algorithm: { name: 'fixedWindow', max: 100, windowMs: 60000 },
  store: new MemoryStore()
});

// 2. Express-Rate-Limit (ERL)
const erlMiddleware = rateLimit({
  windowMs: 60000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false
});

// =======================================
// SETUP: PURE ENGINE (NO FRAMEWORK)
// =======================================
const limtrEngine = new Limiter({
  algorithm: { name: 'fixedWindow', max: 100, windowMs: 60000 },
  store: new MemoryStore()
});

const rlfEngine = new RateLimiterMemory({
  points: 100,
  duration: 60,
});

// =======================================
// BENCHMARKS
// =======================================
group('Express Middleware (End-to-End)', () => {
  bench('Limtr', async () => {
    await limtrMiddleware(mockReq, mockRes, mockNext);
  });

  bench('express-rate-limit', async () => {
    await erlMiddleware(mockReq, mockRes, mockNext);
  });
});

group('Pure Engine Evaluation (No Express overhead)', () => {
  bench('Limtr (Core Engine)', async () => {
    await limtrEngine.process({ ip: '192.168.1.1' });
  });

  bench('rate-limiter-flexible', async () => {
    try {
      await rlfEngine.consume('192.168.1.1', 1);
    } catch (rejRes) {
      // RLF throws on block
    }
  });
});

// Run benchmarks
run();
