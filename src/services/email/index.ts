import { env } from '../../config/env.js'
import { createConsoleAdapter, createGmailAdapter, TestEmailAdapter } from './adapters.js'
import { createEmailService } from './service.js'

export { createEmailService } from './service.js'
export { TestEmailAdapter } from './adapters.js'
export type { EmailService, EmailTemplateData, TemplateId } from './types.js'

const adapter =
  env.EMAIL_ADAPTER === 'gmail'
    ? createGmailAdapter(env.GMAIL_USER!, env.GMAIL_APP_PASSWORD!)
    : env.EMAIL_ADAPTER === 'test'
      ? new TestEmailAdapter()
      : createConsoleAdapter()

// Import this singleton in domain services; controllers must not talk to SMTP.
export const emailService = createEmailService(adapter, env.APP_ORIGIN)
