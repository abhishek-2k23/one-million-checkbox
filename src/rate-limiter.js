const { redis } = require('./redis');

/**
 * Custom Rate Limiter using Redis Fixed Window.
 * @param {string} key - Identifier (e.g., user ID or IP)
 * @param {number} limit - Max requests allowed in window
 * @param {number} windowSec - Window duration in seconds
 * @returns {Promise<boolean>} - True if allowed, false if limited
 */
async function checkRateLimit(key, limit = 50, windowSec = 10) {
  const redisKey = `rl:${key}`;
  
  // Use a transaction/pipeline if needed, but INCR + EXPIRE is usually fine
  // for simple fixed window.
  const count = await redis.incr(redisKey);
  
  if (count === 1) {
    await redis.expire(redisKey, windowSec);
  }
  
  return count <= limit;
}

/**
 * Middleware for Express
 */
function rateLimiterMiddleware(limit, windowSec) {
  return async (req, res, next) => {
    const key = req.user ? `user:${req.user.sub}` : `ip:${req.ip}`;
    const allowed = await checkRateLimit(key, limit, windowSec);
    
    if (!allowed) {
      return res.status(429).json({
        error: 'Too many requests',
        message: 'You are being rate limited. Please try again later.'
      });
    }
    next();
  };
}

module.exports = {
  checkRateLimit,
  rateLimiterMiddleware
};
