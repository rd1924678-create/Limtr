import { MemoryStore } from '../../stores/memory/index.js';

export const DEFAULT_CONFIG = {
  algorithm: {
    name: 'fixedWindow',
    windowMs: 60000,
    max: 100
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
