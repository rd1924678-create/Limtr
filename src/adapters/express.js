import { Limiter } from '../core/Limiter.js';

/**
 * Creates an Express middleware for the rate limiter.
 * @param {import('../core/interfaces.js').LimiterConfig} config 
 */
export function expressRateLimit(config) {
  // Initialize the core framework-agnostic engine
  const engine = new Limiter(config);

  const middleware = async (req, res, next) => {
    try {
      // 1. Translation Layer
      // Strip away the heavy Express req object to protect the core engine
      const reqDetails = {
        ip: req.ip || req.connection?.remoteAddress,
        path: req.originalUrl || req.url,
        method: req.method,
        headers: req.headers
      };

      // Fetch the specific config for this route to respect header toggles
      const activeConfig = engine.configManager.getConfigForRequest(reqDetails);

      // 2. Engine Processing
      const result = await engine.process(reqDetails);

      // 3. HTTP Header Management
      if (activeConfig.headers.enabled && !res.headersSent) {
        res.setHeader('X-RateLimit-Limit', result.limit);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        // Convert JS ms timestamp to standard UNIX seconds
        res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime.getTime() / 1000));
      }

      // 4. Request Allowed
      if (result.isAllowed) {
        return next();
      }

      // 5. Request Blocked
      if (activeConfig.headers.enabled && !res.headersSent) {
        // Delta in seconds indicating how long the client must wait
        const retryAfter = Math.ceil(Math.max(0, result.resetTime.getTime() - Date.now()) / 1000);
        res.setHeader('Retry-After', retryAfter);
      }
      
      if (!res.headersSent) {
        const message = activeConfig.failStrategy.message || 'Too Many Requests';
        res.status(429).send(message);
      }

    } catch (err) {
      // Engine threw a fatal error in CLOSED mode. Bubble to Express global handler.
      next(err);
    }
  };

  // 6. Engine Exposure
  // Attach the initialized engine to the middleware so developers can access Events and Metrics
  middleware.engine = engine;

  return middleware;
}
