import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GenericContainer } from 'testcontainers';
import { createClient } from 'redis';
import { RedisStore } from '../../src/stores/redis/index.js';

describe('RedisStore Integration', () => {
  let container;
  let redisClient;
  let store;

  beforeAll(async () => {
    // 1. Start an isolated Redis container
    // This guarantees the tests run in a clean environment regardless of the developer's local setup
    container = await new GenericContainer("redis:7-alpine")
      .withExposedPorts(6379)
      .start();

    const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
    
    // 2. Connect the standard node-redis client
    redisClient = createClient({ url });
    await redisClient.connect();
    
    // 3. Initialize our Limtr RedisStore
    store = new RedisStore(redisClient, 'test-limtr:');
  }, 60000); // Give Docker up to 60 seconds to pull the image and start

  afterAll(async () => {
    // Graceful teardown
    if (redisClient) await redisClient.quit();
    if (container) await container.stop();
  });

  beforeEach(async () => {
    // Flush DB before each test to prevent test pollution
    await redisClient.flushDb();
  });

  describe('Fixed Window Lua Script', () => {
    const config = { windowMs: 1000, max: 2 };

    it('should correctly process requests and block when limit exceeded', async () => {
      // Request 1
      let res = await store.process('ip1', 'fixedWindow', config, 1);
      expect(res.isAllowed).toBe(true);
      expect(res.remaining).toBe(1);

      // Request 2
      res = await store.process('ip1', 'fixedWindow', config, 1);
      expect(res.isAllowed).toBe(true);
      expect(res.remaining).toBe(0);

      // Request 3 (Should be blocked by Lua)
      res = await store.process('ip1', 'fixedWindow', config, 1);
      expect(res.isAllowed).toBe(false);
      expect(res.remaining).toBe(0);
    });
    
    it('should accurately calculate resetTime and set Redis PEXPIRE', async () => {
      const start = Date.now();
      const res = await store.process('ip2', 'fixedWindow', config, 1);
      
      // Reset time should be ~1000ms from now
      expect(res.resetTime.getTime()).toBeGreaterThanOrEqual(start + 990);
      expect(res.resetTime.getTime()).toBeLessThanOrEqual(start + 1010);
      
      // Verify TTL was actually set in Redis for garbage collection
      const ttl = await redisClient.pttl('test-limtr:ip2');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(1000);
    });
  });

  describe('Token Bucket Lua Script', () => {
    const config = { capacity: 3, refillRate: 1, refillInterval: 500 }; // 1 token every 500ms

    it('should allow burst up to capacity and block afterwards', async () => {
      // Burst 3 requests
      for (let i = 0; i < 3; i++) {
        const res = await store.process('ip3', 'tokenBucket', config, 1);
        expect(res.isAllowed).toBe(true);
        expect(res.remaining).toBe(2 - i);
      }
      
      // 4th request must be blocked
      const blockedRes = await store.process('ip3', 'tokenBucket', config, 1);
      expect(blockedRes.isAllowed).toBe(false);
      expect(blockedRes.remaining).toBe(0);
    });

    it('should reset properly using Redis DEL', async () => {
      await store.process('ip4', 'tokenBucket', config, 1);
      
      // Confirm it exists in Redis
      const exists = await redisClient.exists('test-limtr:ip4');
      expect(exists).toBe(1);

      // Call manual reset
      await store.reset('ip4');
      
      // Confirm it was deleted from Redis
      const existsAfter = await redisClient.exists('test-limtr:ip4');
      expect(existsAfter).toBe(0);
    });
  });
});
