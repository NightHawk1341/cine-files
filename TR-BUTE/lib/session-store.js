/**
 * Session Store Module
 *
 * Provides Redis-based session storage for Telegram bot sessions.
 * Falls back to in-memory storage if Redis is not available.
 *
 * Usage:
 *   const { getSessionStore } = require('./lib/session-store');
 *   const sessions = getSessionStore('user'); // or 'admin'
 *
 *   await sessions.set('user:123', { state: 'awaiting_input' });
 *   const session = await sessions.get('user:123');
 *   await sessions.delete('user:123');
 */

const config = require('./config');

// In-memory fallback store
class MemoryStore {
  constructor(prefix = '') {
    this.prefix = prefix;
    this.store = new Map();
  }

  async get(key) {
    const data = this.store.get(`${this.prefix}:${key}`);
    if (!data) return null;

    // Check expiration
    if (data.expiresAt && Date.now() > data.expiresAt) {
      this.store.delete(`${this.prefix}:${key}`);
      return null;
    }

    return data.value;
  }

  async set(key, value, ttlSeconds = 86400) {
    this.store.set(`${this.prefix}:${key}`, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });
    return true;
  }

  async delete(key) {
    return this.store.delete(`${this.prefix}:${key}`);
  }

  async has(key) {
    const data = await this.get(key);
    return data !== null;
  }

  // Cleanup expired entries (should be called periodically)
  cleanup() {
    const now = Date.now();
    for (const [key, data] of this.store.entries()) {
      if (data.expiresAt && now > data.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}

// Redis store implementation
class RedisStore {
  constructor(prefix = '', client = null) {
    this.prefix = prefix;
    this.client = client;
  }

  async get(key) {
    try {
      const data = await this.client.get(`${this.prefix}:${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  async set(key, value, ttlSeconds = 86400) {
    try {
      await this.client.setex(
        `${this.prefix}:${key}`,
        ttlSeconds,
        JSON.stringify(value)
      );
      return true;
    } catch (error) {
      console.error('Redis set error:', error);
      return false;
    }
  }

  async delete(key) {
    try {
      await this.client.del(`${this.prefix}:${key}`);
      return true;
    } catch (error) {
      console.error('Redis delete error:', error);
      return false;
    }
  }

  async has(key) {
    try {
      return await this.client.exists(`${this.prefix}:${key}`) === 1;
    } catch (error) {
      console.error('Redis exists error:', error);
      return false;
    }
  }
}

// Singleton Redis client
let redisClient = null;
let redisAvailable = false;

/**
 * Initialize Redis connection
 * @returns {Promise<boolean>} Whether Redis is available
 */
async function initRedis() {
  if (redisClient !== null) return redisAvailable;

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.log(' REDIS_URL not configured, using in-memory session storage');
    redisAvailable = false;
    return false;
  }

  try {
    const Redis = require('ioredis');
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      lazyConnect: true
    });

    await redisClient.connect();

    // Test connection
    await redisClient.ping();

    console.log('Redis session store connected');
    redisAvailable = true;

    // Handle connection errors
    redisClient.on('error', (err) => {
      console.error('Redis error:', err);
      redisAvailable = false;
    });

    redisClient.on('reconnecting', () => {
      console.log('Redis reconnecting...');
    });

    redisClient.on('ready', () => {
      console.log('Redis ready');
      redisAvailable = true;
    });

    return true;
  } catch (error) {
    console.warn(' Redis connection failed, using in-memory fallback:', error.message);
    redisAvailable = false;
    redisClient = null;
    return false;
  }
}

// Memory stores for fallback
const memoryStores = new Map();

// Cleanup interval for memory stores
setInterval(() => {
  for (const store of memoryStores.values()) {
    store.cleanup();
  }
}, 60000); // Cleanup every minute

/**
 * Get a session store for the specified type
 * @param {string} type - Store type ('user' or 'admin')
 * @returns {MemoryStore|RedisStore} Session store instance
 */
function getSessionStore(type = 'session') {
  const prefix = `tribune:${type}`;

  if (redisAvailable && redisClient) {
    return new RedisStore(prefix, redisClient);
  }

  // Use or create memory store fallback
  if (!memoryStores.has(type)) {
    memoryStores.set(type, new MemoryStore(prefix));
  }

  return memoryStores.get(type);
}

/**
 * Get Redis client for direct access (if available)
 * @returns {Object|null} Redis client or null
 */
function getRedisClient() {
  return redisAvailable ? redisClient : null;
}

/**
 * Check if Redis is available
 * @returns {boolean}
 */
function isRedisAvailable() {
  return redisAvailable;
}

module.exports = {
  initRedis,
  getSessionStore,
  getRedisClient,
  isRedisAvailable,
  MemoryStore,
  RedisStore
};
