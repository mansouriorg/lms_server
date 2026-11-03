// src/config/rate-limits.ts
// How many requests one IP address may send per minute. Over the limit, the
// server answers 429 (Too Many Requests) until the minute is over.
// Change the numbers here: app.module.ts and auth.controller.ts use them.

const ONE_MINUTE = 60_000;

export const RATE_LIMITS = {
  // Every route
  default: { name: 'default', ttl: ONE_MINUTE, limit: 300 },
  // Sign in and sign up: slows down password guessing and fake accounts
  auth: { ttl: ONE_MINUTE, limit: 10 },
};
