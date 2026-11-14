import type { RequestHandler } from 'express'
import { env } from '../config/env.js'
import { ApiError } from './errors.js'

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (
    !safeMethods.has(req.method) &&
    (req.get('X-CDC-Request') !== '1' || req.get('Origin') !== env.APP_ORIGIN)
  ) {
    next(new ApiError('FORBIDDEN'))
    return
  }

  next()
}
