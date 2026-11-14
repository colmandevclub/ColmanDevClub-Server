import { z } from 'zod'

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_ORIGIN: z
      .string()
      .url()
      .refine((value) => {
        try {
          const url = new URL(value)
          return (
            url.protocol === 'https:' &&
            !url.username &&
            !url.password &&
            url.pathname === '/' &&
            !url.search &&
            !url.hash
          )
        } catch {
          return false
        }
      }, 'APP_ORIGIN must be an HTTPS origin without credentials, a path, query or fragment')
      .transform((value) => new URL(value).origin)
      .optional(),
    MONGODB_URI: z.string().url().optional(), //TODO: Make this required once you connect a real DB
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && !value.APP_ORIGIN) {
      ctx.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'APP_ORIGIN is required' })
    }
  })

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment variables:', {
    fields: parsed.error.issues.map((issue) => issue.path.join('.')),
  })
  process.exit(1)
}

export const env = {
  ...parsed.data,
  APP_ORIGIN: parsed.data.APP_ORIGIN ?? `https://localhost:${parsed.data.PORT}`,
}
