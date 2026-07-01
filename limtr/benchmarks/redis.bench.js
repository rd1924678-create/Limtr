import { bench, run, group } from 'mitata';
import { createClient } from 'redis';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { Limiter, RedisStore } from '../src/index.js';

async function setup() {
  const redisClient = createClient({ url: 'redis://localhost:6379' });
  
  try {
    await redisClient.connect();
    // Flush DB to ensure clean state
    await redisClient.flushDb();
  } catch (err) {
    console.error('⚠️ Benchmark requires Redis running on localhost:6379. Exiting.');
    process.exit(1);
  }

  // 1. Limtr Setup
  const limtrEngine = new Limiter({
    algorithm: { name: 'fixedWindow', max: 10000, windowMs: 60000 },
    store: new RedisStore(redisClient, 'bench:limtr:')
  });

  // 2. Rate-Limiter-Flexible Setup
  const rlfEngine = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'bench:rlf',
    points: 10000,
    duration: 60, // Per second in memory
  });

  // =======================================
  // BENCHMARKS
  // =======================================
  group('Redis Distributed Evaluation', () => {
    bench('Limtr (Lua Atomic Execution)', async () => {
      await limtrEngine.process({ ip: '10.0.0.1' });
    });

    bench('rate-limiter-flexible (Lua Atomic Execution)', async () => {
      try {
        await rlfEngine.consume('10.0.0.1', 1);
      } catch (rejRes) {
        // Blocked
      }
    });
  });

  // Run benchmarks and close connections
  await run();
  await redisClient.quit();
}

setup();
