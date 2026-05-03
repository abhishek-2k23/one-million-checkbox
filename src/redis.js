const { createClient, commandOptions } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const BITS_KEY = 'checkbox_bits';

const redis = createClient({ url: REDIS_URL });
const pub = createClient({ url: REDIS_URL });
const sub = createClient({ url: REDIS_URL });

async function initRedis() {
  await redis.connect();
  await pub.connect();
  await sub.connect();
  console.log('Connected to Redis');
}

/**
 * Gets a chunk of bits as a Buffer.
 * This is MUCH faster than individual GETBIT calls for scaling to 1M.
 */
async function getBitsChunk(startBit, endBit) {
  const startByte = Math.floor(startBit / 8);
  const endByte = Math.ceil(endBit / 8) - 1;
  
  // Use commandOptions to get the bytes as Buffer
  const buffer = await redis.getRange(
    commandOptions({ returnBuffers: true }),
    BITS_KEY,
    startByte,
    endByte
  );
  return buffer;
}

async function setBit(index, value) {
  return await redis.setBit(BITS_KEY, index, value);
}

async function getBit(index) {
  return await redis.getBit(BITS_KEY, index);
}

module.exports = {
  redis,
  pub,
  sub,
  initRedis,
  getBitsChunk,
  setBit,
  getBit,
  BITS_KEY
};
