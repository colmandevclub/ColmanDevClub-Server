import type { RequestHandler } from 'express'
import type { ZodType } from 'zod'
import { validationError } from './errorHandler.js'

type ValidationTarget = 'body' | 'query' | 'params'

export function validate(schema: ZodType, target: ValidationTarget = 'body'): RequestHandler {
  return async (req, _res, next) => {
    const result = await schema.safeParseAsync(req[target])
    if (!result.success) {
      next(validationError(result.error))
      return
    }

    // Express 5 exposes query through a getter; install the parsed value on this request.
    Object.defineProperty(req, target, {
      value: result.data,
      writable: true,
      enumerable: true,
      configurable: true,
    })
    next()
  }
}
