export class RedisStore {
  /**
   * @param {import('redis').RedisClientType} client 
   * @param {string} prefix 
   */
  constructor(client, prefix = 'limtr:') {
    this.client = client;
    this.prefix = prefix;
  }

  /**
   * Executes the algorithm via atomic Lua scripts to prevent race conditions.
   * @param {string} key 
   * @param {string} algorithmName 
   * @param {Object} algorithmConfig 
   * @param {number} consumeCount 
   */
  async process(key, algorithmName, algorithmConfig, consumeCount = 1) {
    const prefixedKey = this.prefix + key;
    const now = Date.now();

    if (algorithmName === 'fixedWindow') {
      // --- LUA SCRIPT: FIXED WINDOW ---
      const script = `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local windowMs = tonumber(ARGV[2])
        local max = tonumber(ARGV[3])
        local consumeCount = tonumber(ARGV[4])

        local count = 0
        local resetTime = now + windowMs
        local isNew = 1
        
        local state = redis.call("HMGET", key, "count", "resetTime")
        if state[1] then
          local storedResetTime = tonumber(state[2])
          if now <= storedResetTime then
            isNew = 0
            count = tonumber(state[1])
            resetTime = storedResetTime
          end
        end

        local isAllowed = 0
        local finalCount = count
        
        if (count + consumeCount) <= max then
          isAllowed = 1
          finalCount = count + consumeCount
        end

        redis.call("HMSET", key, "count", finalCount, "resetTime", resetTime)
        
        local ttl = math.max(0, resetTime - now)
        if ttl > 0 then
          redis.call("PEXPIRE", key, ttl)
        end

        return { isAllowed, max, math.max(0, max - finalCount), resetTime, isNew }
      `;

      // Eval logic (Node-Redis v4 signature)
      const result = await this.client.eval(script, {
        keys: [prefixedKey],
        arguments: [
          now.toString(),
          algorithmConfig.windowMs.toString(),
          algorithmConfig.max.toString(),
          consumeCount.toString()
        ]
      });

      return {
        isAllowed: result[0] === 1,
        limit: result[1],
        remaining: result[2],
        resetTime: new Date(result[3]),
        isNew: result[4] === 1
      };

    } else if (algorithmName === 'tokenBucket') {
      // --- LUA SCRIPT: TOKEN BUCKET ---
      const script = `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local capacity = tonumber(ARGV[2])
        local refillRate = tonumber(ARGV[3])
        local refillInterval = tonumber(ARGV[4])
        local consumeCount = tonumber(ARGV[5])

        local count = capacity
        local lastUpdated = now
        local isNew = 1

        local state = redis.call("HMGET", key, "count", "lastUpdated")
        if state[1] then
          isNew = 0
          count = tonumber(state[1])
          lastUpdated = tonumber(state[2])
        end

        local timePassed = math.max(0, now - lastUpdated)
        local intervalsPassed = math.floor(timePassed / refillInterval)
        local tokensToAdd = intervalsPassed * refillRate

        count = math.min(capacity, count + tokensToAdd)
        
        if tokensToAdd > 0 then
          lastUpdated = lastUpdated + (intervalsPassed * refillInterval)
        end

        local isAllowed = 0
        local resetTime = now
        local ttl = math.ceil(capacity / refillRate) * refillInterval

        if count >= consumeCount then
          isAllowed = 1
          count = count - consumeCount
        else
          local missingTokens = consumeCount - count
          local waitIntervals = math.ceil(missingTokens / refillRate)
          resetTime = lastUpdated + (waitIntervals * refillInterval)
        end

        redis.call("HMSET", key, "count", count, "lastUpdated", lastUpdated)
        redis.call("PEXPIRE", key, ttl)

        return { isAllowed, capacity, count, resetTime, isNew }
      `;

      const result = await this.client.eval(script, {
        keys: [prefixedKey],
        arguments: [
          now.toString(),
          (algorithmConfig.capacity || algorithmConfig.max).toString(),
          algorithmConfig.refillRate.toString(),
          algorithmConfig.refillInterval.toString(),
          consumeCount.toString()
        ]
      });

      return {
        isAllowed: result[0] === 1,
        limit: result[1],
        remaining: result[2],
        resetTime: new Date(result[3]),
        isNew: result[4] === 1
      };
    }
    
    throw new Error(`RedisStore does not support algorithm: ${algorithmName}`);
  }

  async get(_key) {
    throw new Error('Not implemented. Retrieve state atomicity via process() instead.');
  }

  async reset(key) {
    await this.client.del(this.prefix + key);
  }
}
