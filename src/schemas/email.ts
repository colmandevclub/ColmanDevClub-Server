import { z } from './zod.js'

const fullName = z.string().trim().min(1).max(120)
const actionUrl = z.url().refine((value) => {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password
}, 'An HTTPS action URL without credentials is required')

export const emailRecipientSchema = z.email().max(254)

// Internal service contracts, not HTTP request/response schemas.
export const emailTemplateSchemas = {
  'registration-confirmation': z.strictObject({
    fullName,
    status: z.enum(['registered', 'waitlisted']),
    setPasswordUrl: actionUrl,
  }),
  'admission-accepted': z.strictObject({
    fullName,
    academicYear: z.string().trim().min(1).max(80),
    signInUrl: actionUrl,
  }),
  'verify-email': z.strictObject({ fullName, verificationUrl: actionUrl }),
  'reset-password': z.strictObject({ fullName, resetPasswordUrl: actionUrl }),
  invite: z.strictObject({
    fullName: fullName.optional(),
    role: z.enum(['applicant', 'member', 'mentor', 'admin']),
    academicYear: z.string().trim().min(1).max(80),
    inviteUrl: actionUrl,
  }),
}

export type TemplateId = keyof typeof emailTemplateSchemas
export type EmailTemplateData = {
  [T in TemplateId]: z.infer<(typeof emailTemplateSchemas)[T]>
}
