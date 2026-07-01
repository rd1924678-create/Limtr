import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryStore } from '../../src/stores/memory/index.js';

describe('MemoryStore', () => {
  let store;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    
    store = new MemoryStore({
      maxKeys: 3, 
      sweepInterval: 1000,
      sweepBatchSize: 2 
    });
  });

  afterEach(() => {
    store.stop(); 
    vi.useRealTimers();
  });

  it('should store and evaluate buckets atomically using process()', async () => {
    const config = { max: 5, windowMs: 5000 };

    // First request
    const res1 = await store.process('ip1', 'fixedWindow', config, 1);
    expect(res1.isAllowed).toBe(true);
    expect(res1.remaining).toBe(4);

    // Second request increments
    const res2 = await store.process('ip1', 'fixedWindow', config, 1);
    expect(res2.isAllowed).toBe(true);
    expect(res2.remaining).toBe(3);
  });

  it('should perform Lazy Eviction on get()', async () => {
    const config = { max: 1, windowMs: 2000 };

    await store.process('ip1', 'fixedWindow', config, 1);
    expect(await store.get('ip1')).not.toBeNull();
    
    // Fast-forward 3 seconds (past reset time)
    vi.advanceTimersByTime(3000);
    
    // get() should instantly detect expiration, delete the key, and return null
    const bucket = await store.get('ip1');
    expect(bucket).toBeNull();
  });

  it('should perform Lazy Eviction cleanly inside process()', async () => {
    const config = { max: 1, windowMs: 2000 };

    const res1 = await store.process('ip1', 'fixedWindow', config, 1);
    expect(res1.remaining).toBe(0); 
    
    // Fast-forward 3 seconds (past reset time)
    vi.advanceTimersByTime(3000);
    
    // The next process should treat it as a brand new bucket
    const res2 = await store.process('ip1', 'fixedWindow', config, 1);
    expect(res2.remaining).toBe(0); 
  });

  it('should execute Hard Ceiling LRU Eviction when exceeding maxKeys', async () => {
    const config = { max: 1, windowMs: 5000 };

    // maxKeys is configured to 3. Let's insert 3 keys.
    await store.process('ip1', 'fixedWindow', config, 1);
    await store.process('ip2', 'fixedWindow', config, 1);
    await store.process('ip3', 'fixedWindow', config, 1);
    
    expect(store.map.size).toBe(3);
    expect(store.map.has('ip1')).toBe(true);

    // Insert 4th key. This exceeds maxKeys (3).
    // Because Maps preserve insertion order, `ip1` is the oldest and must be deleted.
    await store.process('ip4', 'fixedWindow', config, 1);
    
    expect(store.map.size).toBe(3);
    expect(store.map.has('ip1')).toBe(false); // Evicted!
    expect(store.map.has('ip4')).toBe(true);  // Inserted successfully
  });

  it('should perform Background Batch Sweeping to clean dead keys silently', async () => {
    const config = { max: 1, windowMs: 500 };

    // Insert keys with a very short TTL (500ms window)
    await store.process('ip1', 'fixedWindow', config, 1);
    await store.process('ip2', 'fixedWindow', config, 1);
    
    expect(store.map.size).toBe(2);
    
    // Fast forward 1500ms. Both keys are now expired.
    // The sweepInterval is 1000ms, meaning the background setInterval will wake up once and sweep them.
    vi.advanceTimersByTime(1500);
    
    // The sweeper should have deleted both keys in the background without get() ever being called.
    expect(store.map.size).toBe(0);
  });

  it('should correctly reset (delete) keys manually via reset()', async () => {
    const config = { max: 1, windowMs: 5000 };

    await store.process('ip1', 'fixedWindow', config, 1);
    expect(await store.get('ip1')).not.toBeNull();
    
    await store.reset('ip1'); // Manual clear
    expect(await store.get('ip1')).toBeNull();
  });
});
