export function validateConfig(config) {
  if (config.algorithm) {
    if (config.algorithm.windowMs && typeof config.algorithm.windowMs !== 'number') {
      throw new Error('algorithm.windowMs must be a number');
    }
    if (config.algorithm.max && typeof config.algorithm.max !== 'number') {
      throw new Error('algorithm.max must be a number');
    }
  }

  if (config.overrides && !Array.isArray(config.overrides)) {
    throw new Error('overrides must be an array');
  }

  if (config.failStrategy && !['OPEN', 'CLOSED', 'FALLBACK'].includes(config.failStrategy.mode)) {
    throw new Error('failStrategy.mode must be OPEN, CLOSED, or FALLBACK');
  }

  return true;
}
