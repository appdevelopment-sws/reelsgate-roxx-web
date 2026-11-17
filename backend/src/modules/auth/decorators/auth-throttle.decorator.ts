import { Throttle } from '@nestjs/throttler';

export const AUTH_THROTTLE_TTL = 3600000; // 1 hour in milliseconds (60 * 60 * 1000)
export const AUTH_THROTTLE_LIMIT = 15; // 15 requests per hour

/**
 * Custom Throttle decorator for sensitive authentication endpoints.
 * Restricts client IP to 10 requests per 1 hour by default.
 * Values can be customized via THROTTLE_AUTH_LIMIT and THROTTLE_AUTH_TTL environment variables.
 */
export const AuthThrottle = (
  limit = AUTH_THROTTLE_LIMIT,
  ttl = AUTH_THROTTLE_TTL,
) =>
  Throttle({
    default: {
      limit: Number(process.env.THROTTLE_AUTH_LIMIT) || limit,
      ttl: Number(process.env.THROTTLE_AUTH_TTL) || ttl,
    },
  });
