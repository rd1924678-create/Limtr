export const presets = {
  STRICT: {
    algorithm: { name: 'tokenBucket', capacity: 5, refillRate: 5, refillInterval: 1000 }
  },
  API_STANDARD: {
    algorithm: { name: 'tokenBucket', capacity: 1000, refillRate: 1000, refillInterval: 3600000 }
  },
  NO_HEADERS: {
    headers: {
      sendLimit: false,
      sendRemaining: false,
      sendReset: false,
      sendRetryAfter: false
    }
  }
};
