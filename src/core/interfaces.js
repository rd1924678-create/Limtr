/**
 * @typedef {Object} Bucket
 * @property {number} count - Current hits or tokens.
 * @property {number} lastUpdated - Epoch timestamp of last mutation.
 * @property {number} [resetTime] - Epoch timestamp when the limit resets.
 */

/**
 * @typedef {Object} AlgorithmConfig
 * @property {number} windowMs - Time window in milliseconds.
 * @property {number} max - Maximum requests per window.
 * @property {number} [capacity] - Bucket capacity (Token Bucket).
 * @property {number} [refillRate] - Refill rate (Token Bucket).
 * @property {number} [refillInterval] - Refill interval (Token Bucket).
 */

/**
 * @typedef {Object} AlgorithmResult
 * @property {boolean} isAllowed
 * @property {number} limit
 * @property {number} remaining
 * @property {number} resetTime
 */

/**
 * @typedef {Object} Store
 * @property {function(string, Bucket, AlgorithmConfig): Promise<Bucket>} process - Evaluate and update state atomically.
 * @property {function(string): Promise<Bucket | null>} get - Retrieve current state.
 * @property {function(string): Promise<void>} reset - Clear state for a key.
 */

/**
 * @typedef {Object} Algorithm
 * @property {string} name - Identifier (e.g., 'tokenBucket')
 * @property {function(Bucket, AlgorithmConfig): AlgorithmResult} evaluate - Calculates if request is allowed.
 */

/**
 * @typedef {Object} Event
 * @property {string} type - e.g., 'RATE_LIMIT_EXCEEDED'
 * @property {string} key - The identifier (e.g., IP address).
 * @property {number} timestamp - When the event occurred.
 * @property {Object} [metadata] - Additional contextual data.
 */

/**
 * @typedef {Object} RateLimitResult
 * @property {boolean} isAllowed
 * @property {number} limit
 * @property {number} remaining
 * @property {Date} resetTime
 */

/**
 * @typedef {Object} RequestDetails
 * @property {string} ip
 * @property {string} path
 * @property {Object} headers
 */

/**
 * @typedef {Object} Plugin
 * @property {string} name
 * @property {function(RequestDetails): Promise<boolean | void>} [onBeforeCheck]
 * @property {function(RateLimitResult): Promise<void>} [onAfterCheck]
 * @property {function(Event): void} [onEvent]
 */

/**
 * @typedef {Object} Limiter
 * @property {function(RequestDetails): Promise<RateLimitResult>} check - Main entry point.
 * @property {function(Plugin): void} use - Register a plugin.
 * @property {function(string): Promise<void>} clear - Manually clear a limit.
 */

/**
 * @typedef {Object} Metrics
 * @property {function(string, number): void} recordHit - Record allowed requests.
 * @property {function(string, number): void} recordBlock - Record rate-limited requests.
 * @property {function(string, number): void} recordError - Record internal errors.
 */

export {};
