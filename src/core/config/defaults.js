import { MemoryStore } from '../../stores/memory/index.js';

export const DEFAULT_CONFIG = {
  algorithm: {
    name: 'tokenBucket',
    capacity: 100,
    refillRate: 100,
    refillInterval: 60000
  },
  store: new MemoryStore(),
  headers: {
    sendLimit: true,
    sendRemaining: true,
    sendReset: true,
    sendRetryAfter: true,
    prefix: 'X-RateLimit-'
  },
  failStrategy: {
    mode: 'OPEN' // OPEN | CLOSED | FALLBACK
  },
  plugins: [],
  overrides: [],
  keyGenerator: (req) => req.ip || 'global'
};
