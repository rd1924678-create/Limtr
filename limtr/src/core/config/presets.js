export const Presets = {
  STRICT: {
    algorithm: { name: 'fixedWindow', windowMs: 1000, max: 5 }
  },
  API_STANDARD: {
    algorithm: { name: 'fixedWindow', windowMs: 3600000, max: 1000 }
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
