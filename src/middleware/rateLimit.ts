import { rateLimit as expressRateLimit, type Options } from 'express-rate-limit'
import { ApiError } from './errors.js'

type RateLimitOptions = Pick<Options, 'windowMs' | 'limit'> &
  Partial<Pick<Options, 'store' | 'skipSuccessfulRequests'>>

export function rateLimit(options: RateLimitOptions) {
  return expressRateLimit({
    ...options,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    passOnStoreError: false,
    // Library diagnostics can contain client IPs or store errors with personal data.
    logger: {
      error: () => console.error({ code: 'RATE_LIMIT_ERROR' }),
      warn: () => console.warn({ code: 'RATE_LIMIT_WARNING' }),
    },
    handler: (_req, _res, next) => next(new ApiError('RATE_LIMITED')),
  })
}
