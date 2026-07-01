import { EventEmitter } from 'events';
import { ConfigManager } from './config/ConfigManager.js';
import { MemoryStore } from '../stores/memory/index.js';

export class Limiter extends EventEmitter {
  constructor(config = {}) {
    super(); // Initialize EventEmitter
    this.configManager = new ConfigManager(config);
    this.store = config.store || new MemoryStore();
    this.plugins = config.plugins || [];
    this.metricsCollector = config.metrics || null;
    
    // Dedicated in-memory store for fail-over scenarios
    this.fallbackStore = new MemoryStore();
    
    // Subscribe to local MemoryStore expirations
    if (typeof this.store.setOnExpire === 'function') {
      this.store.setOnExpire((key) => {
        this.emit('bucketExpired', {
          event: 'bucketExpired',
          timestamp: Date.now(),
          key
        });
      });
    }
    
    // Internal Metrics Registry
    this.metrics = {
      totalRequests: 0,
      totalBlocked: 0,
      totalPassed: 0
    };

    // Initialize all plugins
    for (const plugin of this.plugins) {
      if (typeof plugin.onInit === 'function') {
        plugin.onInit(this);
      }
    }

    // Defer the ready event slightly so consumers have time to attach listeners
    process.nextTick(() => {
      this.emit('ready');
    });
  }

  /**
   * Fetches a clone of the current metrics.
   * Useful for exposing a /metrics endpoint for Prometheus/Grafana.
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * The core pipeline for evaluating a request.
   * Framework-independent (Receives raw reqDetails, not an Express request).
   */
  async process(reqDetails) {
    this.metrics.totalRequests++;
    const activeConfig = this.configManager.getConfigForRequest(reqDetails);

    try {
      // 1. Plugin Pre-Hook
      // Plugins can inspect the request, modify it, or set skipRateLimit
      for (const plugin of this.plugins) {
        if (typeof plugin.onBeforeRequest === 'function') {
          await plugin.onBeforeRequest(reqDetails, activeConfig);
        }
      }

      // 2. Escape Hatch
      if (reqDetails.skipRateLimit) {
        this.metrics.totalPassed++;
        return { isAllowed: true, limit: activeConfig.algorithm.max, remaining: 1, resetTime: new Date() };
      }

      // 3. Key Generation
      const key = await activeConfig.keyGenerator(reqDetails);
      
      // 4. Atomic Execution
      // The store (Memory/Redis) handles the algorithmic evaluation
      const result = await this.store.process(key, activeConfig.algorithm.name, activeConfig.algorithm, 1);
      
      // 5. Metrics & Events
      const eventPayload = {
        timestamp: Date.now(),
        key,
        reqDetails,
        metadata: { limit: result.limit, remaining: result.remaining, resetTime: result.resetTime }
      };

      if (result.isNew) {
        this.emit('bucketCreated', { event: 'bucketCreated', ...eventPayload });
      }

      if (result.isAllowed) {
        this.metrics.totalPassed++;
        this.emit('requestAllowed', { event: 'requestAllowed', ...eventPayload });
        if (this.metricsCollector && typeof this.metricsCollector.recordAllowed === 'function') {
          this.metricsCollector.recordAllowed(reqDetails, eventPayload.metadata);
        }
      } else {
        this.metrics.totalBlocked++;
        this.emit('requestBlocked', { event: 'requestBlocked', ...eventPayload });
        if (this.metricsCollector && typeof this.metricsCollector.recordBlocked === 'function') {
          this.metricsCollector.recordBlocked(reqDetails, eventPayload.metadata);
        }
      }

      // 6. Plugin Post-Hook
      // Plugins can read the result to trigger custom alerts or logging
      for (const plugin of this.plugins) {
        if (typeof plugin.onAfterRequest === 'function') {
          await plugin.onAfterRequest(reqDetails, result, activeConfig);
        }
      }

      return result;

    } catch (err) {
      this.emit('storeError', {
        event: 'storeError',
        timestamp: Date.now(),
        key: await activeConfig.keyGenerator(reqDetails).catch(() => 'unknown'),
        reqDetails,
        error: err
      });
      
      if (this.metricsCollector && typeof this.metricsCollector.recordError === 'function') {
        this.metricsCollector.recordError(err, reqDetails);
      }
      
      // Handle Database Failures (e.g. Redis crash)
      if (activeConfig.failStrategy.mode === 'OPEN') {
        return { isAllowed: true, limit: activeConfig.algorithm.max, remaining: 1, resetTime: new Date() };
      }
      
      if (activeConfig.failStrategy.mode === 'FALLBACK') {
        // Degrade gracefully to the local Node.js MemoryStore
        const key = await activeConfig.keyGenerator(reqDetails);
        return await this.fallbackStore.process(key, activeConfig.algorithm.name, activeConfig.algorithm, 1);
      }
      
      // CLOSED mode: Bubble the error up to block the request
      throw err; 
    }
  }
}
