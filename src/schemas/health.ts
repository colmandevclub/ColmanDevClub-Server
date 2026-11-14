import { z } from './zod.js'

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  message: z.literal('ColmanDevClub API is healthy'),
})
