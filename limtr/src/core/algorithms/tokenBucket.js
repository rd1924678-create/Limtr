/**
 * A pure, database-agnostic implementation of the Token Bucket algorithm.
 * This class handles the mathematical evaluation and state mutation without
 * binding itself to any specific persistence layer (like Redis or Memory).
 */
export class TokenBucket {
  /**
   * Evaluates the current bucket state against the configuration to determine
   * if a request should be allowed, and returns the mutated state to be saved.
   *
   * @param {Object} bucketState - The current state retrieved from the Store.
   * @param {number} bucketState.count - Tokens currently available.
   * @param {number} bucketState.lastUpdated - Epoch timestamp (ms) of the last mutation.
   * @param {Object} config - The rules for this specific bucket.
   * @param {number} config.capacity - Maximum tokens the bucket can hold.
   * @param {number} config.refillRate - How many tokens to add per interval.
   * @param {number} config.refillInterval - The interval time in milliseconds.
   * @param {number} [consumeCount=1] - The number of tokens the request costs.
   * @returns {Object} The result object containing `isAllowed` and the `newBucketState`.
   */
  static evaluate(bucketState, config, consumeCount = 1) {
    const now = Date.now();
    const { capacity, refillRate, refillInterval } = config;
    let isNew = false;

    // 1. Handle Initialization
    // If no state exists, assume a brand new bucket at maximum capacity.
    if (!bucketState || typeof bucketState.lastUpdated === 'undefined') {
      isNew = true;
      bucketState = {
        count: capacity,
        lastUpdated: now
      };
    }

    // 2. Calculate Refill
    // Determine how much time has passed since the last update to calculate earned tokens.
    const timePassed = Math.max(0, now - bucketState.lastUpdated);
    const intervalsPassed = Math.floor(timePassed / refillInterval);
    const tokensToAdd = intervalsPassed * refillRate;

    // Calculate the theoretical new count, capped at the maximum capacity.
    let newCount = Math.min(capacity, bucketState.count + tokensToAdd);

    // 3. Advance the Clock
    // To prevent fractional time loss (e.g. if 1.5 intervals passed, we only added tokens for 1),
    // we only advance the timestamp by the exact intervals we credited.
    let newLastUpdated = bucketState.lastUpdated;
    if (tokensToAdd > 0) {
      newLastUpdated += intervalsPassed * refillInterval;
    }

    // 4. Consume Logic
    let isAllowed = false;
    let resetTimeMs = 0;

    if (newCount >= consumeCount) {
      // Allowed: Deduct the tokens.
      isAllowed = true;
      newCount -= consumeCount;
      resetTimeMs = now; // Not strictly needed when allowed, but good for header consistency
    } else {
      // Blocked: Do not deduct tokens. Calculate when it will be ready.
      isAllowed = false;
      const missingTokens = consumeCount - newCount;
      const waitIntervals = Math.ceil(missingTokens / refillRate);
      resetTimeMs = newLastUpdated + (waitIntervals * refillInterval);
    }

    // 5. Return Output
    // The Store is responsible for saving the `newBucketState` back to the database.
    return {
      isAllowed,
      isNew,
      limit: capacity,
      remaining: newCount,
      resetTime: new Date(resetTimeMs),
      newBucketState: {
        count: newCount,
        lastUpdated: newLastUpdated
      }
    };
  }
}
