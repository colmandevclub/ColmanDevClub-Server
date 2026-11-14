import { z } from './zod.js'
import { errorDefinitions, type ErrorCode } from '../middleware/errors.js'

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.enum(Object.keys(errorDefinitions) as [ErrorCode, ...ErrorCode[]]),
    message: z.string(),
    fields: z.record(z.string(), z.string()),
  }),
})
