import { emailRecipientSchema } from '../../schemas/email.js'
import { renderEmail } from './templates.js'
import type { EmailAdapter, EmailService } from './types.js'

export function createEmailService(adapter: EmailAdapter, appOrigin: string): EmailService {
  return {
    async send(to, template, data) {
      try {
        const recipient = emailRecipientSchema.parse(to)
        const rendered = renderEmail(template, data, appOrigin)
        await adapter.deliver({ to: recipient, template, ...rendered })
      } catch {
        // Never propagate an SMTP/validation error after the caller's DB commit.
        // One attempt only: SMTP timeouts can happen after the provider accepts
        // the message, so automatic retries could send duplicate messages.
        console.error({ code: 'EMAIL_DELIVERY_FAILED', adapter: adapter.name })
      }
    },
  }
}
