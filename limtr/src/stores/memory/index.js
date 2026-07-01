import { FixedWindow } from '../../core/algorithms/fixedWindow.js';
import { TokenBucket } from '../../core/algorithms/tokenBucket.js';

/**
 * @typedef {Object} MemoryStoreConfig
 * @property {number} [maxKeys=100000] - Hard cap on memory size to prevent OOM
 * @property {number} [sweepInterval=5000] - How often the background sweeper runs (ms)
 * @property {number} [sweepBatchSize=500] - How many keys to check per sweep
 */

export class MemoryStore {
  /**
   * @param {MemoryStoreConfig} config 
   */
  constructor(config = {}) {
    /** @type {Map<string, import('../../core/interfaces.js').Bucket>} */
    this.map = new Map();
    
    this.maxKeys = config.maxKeys || 100000;
    this.sweepInterval = config.sweepInterval || 5000;
    this.sweepBatchSize = config.sweepBatchSize || 500;
    
    // Maintain a persistent iterator over the map for background sweeping
    this.iterator = this.map.keys();
    
    // Start background sweeping
    this.intervalId = setInterval(() => this._sweep(), this.sweepInterval);
    
    // Callback for bucketExpired events
    this.onExpire = null;
    
    // Ensure the interval doesn't keep the Node.js process alive indefinitely
    if (this.intervalId.unref) {
      this.intervalId.unref();
    }
  }

  /**
   * Allows the Limiter engine to subscribe to expiration events.
   * @param {function(string): void} callback 
   */
  setOnExpire(callback) {
    this.onExpire = callback;
  }

  /**
   * Retrieves a bucket from memory. Performs Lazy Eviction if expired.
   * @param {string} key 
   * @returns {Promise<import('../../core/interfaces.js').Bucket | null>}
   */
  async get(key) {
    const bucket = this.map.get(key);
    if (!bucket) return null;
    
    // Prong 1: Lazy Eviction (O(1))
    if (bucket.resetTime && Date.now() > bucket.resetTime) {
      this.map.delete(key);
      if (this.onExpire) this.onExpire(key);
      return null; // Return null so the algorithm knows to start fresh
    }
    
    return bucket;
  }

  /**
   * Evaluates and updates the state atomically.
   * @param {string} key 
   * @param {string} algorithmName
   * @param {Object} algorithmConfig
   * @param {number} consumeCount
   * @returns {Promise<any>} The result of the evaluation
   */
  async process(key, algorithmName, algorithmConfig, consumeCount = 1) {
    const currentState = await this.get(key);
    let result;
    
    // MemoryStore evaluates the algorithm locally in JavaScript
    if (algorithmName === 'fixedWindow') {
      result = FixedWindow.evaluate(currentState, algorithmConfig, consumeCount);
    } else if (algorithmName === 'tokenBucket') {
      result = TokenBucket.evaluate(currentState, algorithmConfig, consumeCount);
    } else {
      throw new Error(`MemoryStore does not support algorithm: ${algorithmName}`);
    }
    
    // 3. Hard Ceiling LRU Eviction (O(1))
    // We only evict if it's a NEW key to avoid deleting valid keys mid-update
    if (!this.map.has(key) && this.map.size >= this.maxKeys) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    
    // Save the mutated state back to memory.
    // We attach resetTime to the bucket so the background sweeper knows when to delete it.
    const bucketToSave = { 
      ...result.newBucketState, 
      resetTime: result.resetTime.getTime() 
    };
    this.map.set(key, bucketToSave);
    
    return result;
  }

  /**
   * Clears a specific key from the store.
   * @param {string} key 
   */
  async reset(key) {
    this.map.delete(key);
  }

  /**
   * Prong 2: Background Batch Sweeper (Amortized O(1))
   * Runs periodically to delete expired keys without blocking the event loop.
   * @private
   */
  _sweep() {
    const now = Date.now();
    
    for (let i = 0; i < this.sweepBatchSize; i++) {
      const next = this.iterator.next();
      
      if (next.done) {
        // Reached the end of the Map. Start over on the next tick.
        this.iterator = this.map.keys();
        break; 
      }
      
      const key = next.value;
      const bucket = this.map.get(key);
      
      if (bucket && bucket.resetTime && now > bucket.resetTime) {
        this.map.delete(key);
        if (this.onExpire) this.onExpire(key);
      }
    }
  }

  /**
   * Stops the background sweeper. Necessary for clean exits in test environments.
   */
  stop() {
    clearInterval(this.intervalId);
  }
}
