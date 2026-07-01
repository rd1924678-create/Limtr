import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryStore } from '../../src/stores/memory/index.js';

describe('MemoryStore', () => {
  let store;

  beforeEach(() => {
    // Take control of the system clock
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    
    store = new MemoryStore({
      maxKeys: 3, // Artificially low ceiling to test LRU Eviction
      sweepInterval: 1000, // Sweep every 1 second
      sweepBatchSize: 2 // Check 2 keys per sweep
    });
  });

  afterEach(() => {
    // Crucial: Stop the background sweeper to prevent Vitest from hanging open
    store.stop(); 
    vi.useRealTimers();
  });

  it('should store and evaluate buckets atomically using process()', async () => {
    const evaluator = (state) => ({
      newBucketState: { count: state ? state.count + 1 : 1 },
      resetTime: new Date(Date.now() + 5000)
    });

    // First request
    await store.process('ip1', evaluator);
    let bucket = await store.get('ip1');
    expect(bucket.count).toBe(1);

    // Second request increments
    await store.process('ip1', evaluator);
    bucket = await store.get('ip1');
    expect(bucket.count).toBe(2);
  });

  it('should perform Lazy Eviction on get()', async () => {
    const evaluator = () => ({
      newBucketState: { count: 1 },
      resetTime: new Date(Date.now() + 2000) // Expires in 2 seconds
    });

    await store.process('ip1', evaluator);
    expect(await store.get('ip1')).not.toBeNull();
    
    // Fast-forward 3 seconds (past reset time)
    vi.advanceTimersByTime(3000);
    
    // get() should instantly detect expiration, delete the key, and return null
    const bucket = await store.get('ip1');
    expect(bucket).toBeNull();
  });

  it('should perform Lazy Eviction cleanly inside process()', async () => {
    const evaluator = (state) => {
      // If state is null, it acts like a brand new user
      return {
        newBucketState: { count: state ? state.count + 1 : 1 },
        resetTime: new Date(Date.now() + 2000)
      };
    };

    await store.process('ip1', evaluator);
    expect((await store.get('ip1')).count).toBe(1); // 1 request
    
    // Fast-forward 3 seconds (past reset time)
    vi.advanceTimersByTime(3000);
    
    // The next process should treat it as a brand new bucket (resetting count to 1)
    await store.process('ip1', evaluator);
    expect((await store.get('ip1')).count).toBe(1); 
  });

  it('should execute Hard Ceiling LRU Eviction when exceeding maxKeys', async () => {
    const evaluator = () => ({
      newBucketState: { count: 1 },
      resetTime: new Date(Date.now() + 5000)
    });

    // maxKeys is configured to 3. Let's insert 3 keys.
    await store.process('ip1', evaluator);
    await store.process('ip2', evaluator);
    await store.process('ip3', evaluator);
    
    expect(store.map.size).toBe(3);
    expect(store.map.has('ip1')).toBe(true);

    // Insert 4th key. This exceeds maxKeys (3).
    // Because Maps preserve insertion order, `ip1` is the oldest and must be deleted.
    await store.process('ip4', evaluator);
    
    expect(store.map.size).toBe(3);
    expect(store.map.has('ip1')).toBe(false); // Evicted!
    expect(store.map.has('ip4')).toBe(true);  // Inserted successfully
  });

  it('should perform Background Batch Sweeping to clean dead keys silently', async () => {
    const evaluator = (ttlMs) => () => ({
      newBucketState: { count: 1 },
      resetTime: new Date(Date.now() + ttlMs)
    });

    // Insert keys with a very short TTL (500ms)
    await store.process('ip1', evaluator(500));
    await store.process('ip2', evaluator(500));
    
    expect(store.map.size).toBe(2);
    
    // Fast forward 1500ms. Both keys are now expired.
    // The sweepInterval is 1000ms, meaning the background setInterval will wake up once and sweep them.
    vi.advanceTimersByTime(1500);
    
    // The sweeper should have deleted both keys in the background without get() ever being called.
    expect(store.map.size).toBe(0);
  });

  it('should correctly reset (delete) keys manually via reset()', async () => {
    const evaluator = () => ({
      newBucketState: { count: 1 },
      resetTime: new Date(Date.now() + 5000)
    });

    await store.process('ip1', evaluator);
    expect(await store.get('ip1')).not.toBeNull();
    
    await store.reset('ip1'); // Manual clear
    expect(await store.get('ip1')).toBeNull();
  });
});
