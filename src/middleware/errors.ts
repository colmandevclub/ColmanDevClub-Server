export const errorDefinitions = {
  VALIDATION_ERROR: { status: 400, message: 'Invalid request.' },
  UNAUTHENTICATED: { status: 401, message: 'Authentication required.' },
  FORBIDDEN: { status: 403, message: 'Access denied.' },
  NOT_FOUND: { status: 404, message: 'Resource not found.' },
  CONFLICT: { status: 409, message: 'Request conflicts with the current state.' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'Request body is too large.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Please try again later.' },
  INTERNAL_SERVER_ERROR: { status: 500, message: 'An unexpected error occurred.' },
} as const

export type ErrorCode = keyof typeof errorDefinitions
export type ErrorFields = Record<string, string>

export class ApiError extends Error {
  readonly status: number

  constructor(
    readonly code: ErrorCode,
    readonly fields: ErrorFields = {},
  ) {
    super(errorDefinitions[code].message)
    this.name = 'ApiError'
    this.status = errorDefinitions[code].status
  }
}
