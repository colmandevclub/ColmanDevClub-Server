import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'

export const requestContext: RequestHandler = (_req, res, next) => {
  // Generate internally so an incoming header cannot inject PII into our logs.
  res.locals.requestId = randomUUID()
  res.setHeader('X-Request-ID', res.locals.requestId)
  next()
}
