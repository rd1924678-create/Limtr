import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TokenBucket } from '../src/core/algorithms/tokenBucket.js';

describe('TokenBucket Algorithm', () => {
  const config = {
    capacity: 10,
    refillRate: 2,
    refillInterval: 1000 // Refill 2 tokens every 1 second
  };

  beforeEach(() => {
    // Take control of the system clock to simulate time passing accurately
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    // Restore the clock
    vi.useRealTimers();
  });

  it('should initialize a new bucket at max capacity and allow request', () => {
    const result = TokenBucket.evaluate(null, config, 1);
    
    expect(result.isAllowed).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(9);
    
    // It should create a new bucket state starting from now
    expect(result.newBucketState.count).toBe(9);
    expect(result.newBucketState.lastUpdated).toBe(Date.now());
  });

  it('should allow burst traffic up to the exact capacity limits', () => {
    let state = null;
    
    // Simulate a burst of 10 rapid requests (0ms between them)
    for (let i = 0; i < 10; i++) {
      const result = TokenBucket.evaluate(state, config, 1);
      expect(result.isAllowed).toBe(true);
      state = result.newBucketState; // Emulate the Store saving the state
    }
    
    // The bucket is now entirely empty. The 11th request must be blocked.
    const blockedResult = TokenBucket.evaluate(state, config, 1);
    expect(blockedResult.isAllowed).toBe(false);
    expect(blockedResult.remaining).toBe(0);
    
    // Since we need 1 token, and it refills 2 every 1000ms, we must wait 1 interval (1000ms)
    expect(blockedResult.resetTime.getTime()).toBe(Date.now() + 1000);
  });

  it('should refill tokens accurately based on elapsed time', () => {
    // Start with an empty bucket
    let state = { count: 0, lastUpdated: Date.now() };

    // Fast-forward time by exactly 2 seconds.
    // 2 seconds = 2 intervals = 4 tokens earned.
    vi.advanceTimersByTime(2000);

    const result = TokenBucket.evaluate(state, config, 1);
    
    expect(result.isAllowed).toBe(true);
    // 4 earned - 1 consumed = 3 remaining
    expect(result.remaining).toBe(3); 
    expect(result.newBucketState.lastUpdated).toBe(Date.now());
  });

  it('should not exceed maximum capacity on refill (expiration edge case)', () => {
    // Start with a nearly full bucket
    let state = { count: 8, lastUpdated: Date.now() };

    // Fast-forward time by 10 seconds.
    // 10 seconds = 10 intervals = 20 tokens earned.
    // However, 8 + 20 = 28, which exceeds the capacity of 10.
    vi.advanceTimersByTime(10000);

    const result = TokenBucket.evaluate(state, config, 1);
    
    expect(result.isAllowed).toBe(true);
    // Cap is 10. We consumed 1. So we should be at exactly 9.
    expect(result.remaining).toBe(9);
  });

  it('should correctly track lastUpdated to prevent fractional time loss', () => {
    let state = { count: 5, lastUpdated: Date.now() };

    // Advance time by 1.5 seconds.
    // This completes 1 interval (+2 tokens). The remaining 500ms is "fractional" time.
    vi.advanceTimersByTime(1500);

    const result = TokenBucket.evaluate(state, config, 1);
    
    // 5 current + 2 earned - 1 consumed = 6
    expect(result.remaining).toBe(6);
    
    // CRITICAL: The lastUpdated time should only advance by 1000ms, keeping the 500ms "in the bank" for the next calculation.
    expect(result.newBucketState.lastUpdated).toBe(Date.now() - 500);
  });

  it('should allow custom consume amounts for expensive operations', () => {
    // Consume 5 tokens in a single request
    const result = TokenBucket.evaluate(null, config, 5);
    
    expect(result.isAllowed).toBe(true);
    expect(result.remaining).toBe(5);
  });

  it('should block if the consume amount exceeds the current remaining balance', () => {
    // Start with 4 tokens
    let state = { count: 4, lastUpdated: Date.now() };
    
    // Attempt to consume 5 tokens
    const result = TokenBucket.evaluate(state, config, 5);
    
    expect(result.isAllowed).toBe(false);
    expect(result.remaining).toBe(4); // Do not deduct tokens if blocked
    
    // We are missing 1 token. It takes 1 interval to earn it.
    expect(result.resetTime.getTime()).toBe(Date.now() + 1000);
  });

  it('should gracefully handle massive time skips without crashing', () => {
    let state = { count: 5, lastUpdated: Date.now() };

    // Advance time by 1 year.
    vi.advanceTimersByTime(1000 * 60 * 60 * 24 * 365);

    const result = TokenBucket.evaluate(state, config, 1);
    
    expect(result.isAllowed).toBe(true);
    expect(result.remaining).toBe(9); // Capped
    
    // Since we added enough tokens to cap it out, lastUpdated shouldn't exceed now
    expect(result.newBucketState.lastUpdated).toBeLessThanOrEqual(Date.now());
  });

  // Note on concurrency: As a pure math function, TokenBucket.evaluate is intrinsically thread-safe.
  // Concurrency vulnerabilities (Race Conditions) occur at the Store layer when two identical bucketStates 
  // are read simultaneously from a database and overwritten sequentially. 
  // Those scenarios will be tested inside `MemoryStore.test.js` and `RedisStore.test.js`.
});
