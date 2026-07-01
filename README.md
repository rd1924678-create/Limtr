# Limtr 🚀

[![NPM Version](https://img.shields.io/npm/v/limtr.svg)](https://www.npmjs.com/package/limtr)
[![CI Status](https://github.com/your-org/limtr/workflows/CI/badge.svg)](https://github.com/your-org/limtr/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An ultra-fast, highly extensible, framework-agnostic rate limiting engine for Node.js. 

Built for modern enterprise systems, `Limtr` provides flawless atomic race-condition prevention via Redis Lua scripts, zero-dependency background garbage collection for memory stores, and mathematically precise Token Bucket algorithms.

---

## 📦 Installation

```bash
npm install limtr
```

If you plan to use the Redis Store for distributed environments, you will also need to install the official `redis` client:
```bash
npm install redis
```

---

## ⚡ Quick Start

Limtr is totally framework-agnostic, but comes with a lightning-fast Express.js adapter out of the box.

```javascript
import express from 'express';
import { expressRateLimit } from 'limtr';

const app = express();

// Set up a global rate limiter (100 requests per 15 minutes)
const limiter = expressRateLimit({
  algorithm: { name: 'fixedWindow', max: 100, windowMs: 15 * 60 * 1000 }
});

app.use(limiter);

app.get('/', (req, res) => res.send('Protected by Limtr!'));
app.listen(3000);
```

---

## 🧠 Core Architecture

Limtr is broken down into three totally decoupled layers:
1. **The Store**: Where bucket state is saved (`MemoryStore` or `RedisStore`).
2. **The Algorithm**: The mathematical formula used to evaluate limits (`fixedWindow` or `tokenBucket`).
3. **The Engine**: The central orchestrator that handles configurations, events, metrics, and plugins.

---

## 🛠️ Configuration Options

Limtr exposes an incredibly powerful configuration object.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `Store` | `MemoryStore` | The database layer handling state. |
| `algorithm` | `Object` | `fixedWindow` | The algorithm used for rate limiting (see below). |
| `keyGenerator` | `Function` | `req.ip` | Returns a unique string identifier for the user. |
| `failStrategy` | `Object` | `FALLBACK` | Behavior when the Store crashes (`OPEN`, `CLOSED`, `FALLBACK`). |
| `headers.enabled` | `Boolean` | `true` | Injects standard `X-RateLimit-*` headers into the HTTP response. |
| `routes` | `Array` | `[]` | Override global configs for specific Regex URL paths. |
| `plugins` | `Array` | `[]` | Array of custom lifecycle plugins. |
| `metrics` | `Object` | `null` | A `MetricsCollector` interface (e.g. for Prometheus). |

### Built-in Presets
Don't want to configure everything manually? Limtr exports production-ready presets:
```javascript
import { expressRateLimit, presets } from 'limtr';

// Instantly protect a login route from brute force
app.post('/login', expressRateLimit(presets.login), loginController);
```

---

## 🌐 Redis Setup (Distributed Limiting)

If you have multiple Node.js instances sitting behind a load balancer, using `MemoryStore` will result in inaccurate limits because state isn't shared across servers.

Limtr solves this with a highly optimized `RedisStore` powered by atomic Lua scripts that completely eliminate database race conditions.

```javascript
import { expressRateLimit, RedisStore } from 'limtr';
import { createClient } from 'redis';

const redisClient = createClient({ url: 'redis://localhost:6379' });
await redisClient.connect();

const limiter = expressRateLimit({
  store: new RedisStore(redisClient, 'limtr:prod:'),
  algorithm: { name: 'fixedWindow', max: 50, windowMs: 1000 }
});
```

---

## 🚀 Production Examples

### Token Bucket (Bursty API Traffic)
The Fixed Window algorithm is great for basic limits, but the Token Bucket mathematically smooths out "bursts" of traffic, making it ideal for heavy SaaS APIs.

```javascript
const apiLimiter = expressRateLimit({
  algorithm: { 
    name: 'tokenBucket', 
    capacity: 1000,        // Max burst size
    refillRate: 100,       // Tokens to refill
    refillInterval: 1000   // Refill every 1 second
  }
});
```

### Route-Level Overrides
You don't need a million middleware instances! Define global limits, and override them for specific paths.

```javascript
const smartLimiter = expressRateLimit({
  algorithm: { name: 'fixedWindow', max: 100, windowMs: 60000 },
  routes: [
    {
      pattern: /^\/api\/heavy-query/,
      algorithm: { name: 'fixedWindow', max: 5, windowMs: 60000 }
    }
  ]
});
```

---

## 🔌 Events, Metrics, and Plugins

Limtr is built for enterprise observability.

### Events
The underlying Engine extends Node.js `EventEmitter`. Access it directly to push alerts without blocking the HTTP request!
```javascript
const rateLimiter = expressRateLimit({ ... });

rateLimiter.engine.on('requestBlocked', (payload) => {
  console.log(`Blocked IP: ${payload.key} at ${payload.timestamp}`);
});
```

### Metrics (Prometheus / OpenTelemetry)
Pass a `MetricsCollector` interface into the config, and Limtr will automatically execute it.
```javascript
const prometheusCollector = {
  recordBlocked: (reqDetails) => myPrometheusCounter.inc({ path: reqDetails.path })
};

const limiter = expressRateLimit({ metrics: prometheusCollector });
```

---

## 🩺 Troubleshooting

**Q: Why am I getting "Too Many Requests" after only a few clicks?**
If you are behind a proxy (like Nginx or Cloudflare), Express might see the Proxy's IP address instead of the actual user's IP. Ensure you enable `app.set('trust proxy', 1);` in Express.

**Q: My Redis instance crashed and now every request is blocked!**
By default, Limtr uses the `FALLBACK` fail-strategy. This means if Redis goes down, Limtr seamlessly degrades to local memory tracking. If you are experiencing blocks during an outage, ensure your `failStrategy.mode` is NOT set to `CLOSED`.

**Q: RedisStore is throwing a `NOSCRIPT` error.**
This means Redis purged its script cache. Limtr's RedisStore automatically handles this by falling back to `EVAL`, but ensure you are using a standard version of Redis 6.0+.

---

## ❓ FAQ

**Is it safe to use MemoryStore in production?**
Yes, but only for single-instance Node.js applications. Limtr's `MemoryStore` uses a non-blocking `setInterval` Garbage Collector and hard LRU ceilings to completely eliminate memory leaks and event-loop blocking. However, if you use a cluster or load balancer, you *must* use `RedisStore`.

**Can I create a custom algorithm?**
Absolutely. The architecture is totally decoupled. Just create an object that implements the `AlgorithmConfig` JSDoc signature.

**Does this work with Fastify or Koa?**
The core engine (`Limiter.js`) is 100% framework-independent. While the package currently only bundles an `expressRateLimit` adapter, you can easily wrap the core engine in a Fastify hook!
