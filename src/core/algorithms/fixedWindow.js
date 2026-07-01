/**
 * A pure, database-agnostic implementation of the Fixed Window algorithm.
 */
export class FixedWindow {
  /**
   * @param {Object} bucketState 
   * @param {Object} config 
   * @param {number} [consumeCount=1] 
   */
  static evaluate(bucketState, config, consumeCount = 1) {
    const now = Date.now();
    const { windowMs, max } = config;

    let isNew = false;
    // 1. Initialize or reset if window has passed
    if (!bucketState || !bucketState.resetTime || now > bucketState.resetTime) {
      isNew = true;
      bucketState = { 
        count: 0, 
        lastUpdated: now,
        resetTime: now + windowMs 
      };
    }

    // 2. Evaluate
    const potentialCount = bucketState.count + consumeCount;
    const isAllowed = potentialCount <= max;
    const finalCount = isAllowed ? potentialCount : bucketState.count;

    // 3. Return result
    return {
      isAllowed,
      isNew,
      limit: max,
      remaining: Math.max(0, max - finalCount),
      resetTime: new Date(bucketState.resetTime),
      newBucketState: {
        count: finalCount,
        lastUpdated: now,
        resetTime: bucketState.resetTime
      }
    };
  }
}
