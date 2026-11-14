import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError } from 'zod'
import { ApiError, type ErrorFields } from './errors.js'

export function validationError(error: ZodError): ApiError {
  const fields = new Map<string, string>()
  for (const issue of error.issues) {
    const field = issue.path.map(String).join('.') || '_root'
    if (!fields.has(field)) fields.set(field, issue.message)
  }
  return new ApiError('VALIDATION_ERROR', Object.fromEntries(fields) as ErrorFields)
}

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof ZodError) return validationError(error)

  // Body-parser errors include the submitted body and must never be echoed or logged.
  if (error instanceof Error && 'type' in error) {
    if (error.type === 'entity.too.large') return new ApiError('PAYLOAD_TOO_LARGE')
    if (error.type === 'entity.parse.failed') return new ApiError('VALIDATION_ERROR')
  }

  return new ApiError('INTERNAL_SERVER_ERROR')
}

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new ApiError('NOT_FOUND'))
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const normalized = normalizeError(error)

  if (normalized.status >= 500) {
    // Allow-list metadata: error messages/stacks, URLs, headers and bodies may contain PII.
    console.error({
      requestId: res.locals.requestId,
      statusCode: normalized.status,
      code: normalized.code,
    })
  }

  if (res.headersSent) {
    // Express's default error handler logs the original error; close safely instead.
    res.destroy()
    return
  }

  res.status(normalized.status).json({
    error: {
      code: normalized.code,
      message: normalized.message,
      fields: normalized.fields,
    },
  })
}
