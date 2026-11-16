import nodemailer from 'nodemailer'
import type { SMTPTransportOptions } from 'nodemailer/lib/smtp-transport'
import type { EmailAdapter, EmailMessage } from './types.js'

export const SMTP_TIMEOUT_MS = 5_000
export const DELIVERY_TIMEOUT_MS = 10_000

export function createGmailAdapter(user: string, appPassword: string): EmailAdapter {
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user, pass: appPassword },
    pool: false,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    dnsTimeout: SMTP_TIMEOUT_MS,
    logger: false,
    debug: false,
    transactionLog: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  } satisfies SMTPTransportOptions)

  return {
    name: 'gmail',
    async deliver(message) {
      // Abort the real send as well as bounding the wait; a bare Promise.race would
      // otherwise leave an SMTP operation running after the request returns.
      const info = await transport.sendMail({
        from: { name: 'מועדון הפיתוח', address: user },
        to: { name: '', address: message.to },
        subject: message.subject,
        html: message.html,
        text: message.text,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      })
      if (info.accepted.length !== 1 || info.rejected.length !== 0) {
        throw new Error('Email recipient was not accepted')
      }
    },
  }
}

export function createConsoleAdapter(): EmailAdapter {
  return {
    name: 'console',
    async deliver(message) {
      // Do not print the recipient, rendered body, URLs, names or provider response.
      console.info({ code: 'EMAIL_PREVIEW', template: message.template, adapter: 'console' })
    },
  }
}

export class TestEmailAdapter implements EmailAdapter {
  readonly name = 'test'
  readonly messages: EmailMessage[] = []

  async deliver(message: EmailMessage): Promise<void> {
    this.messages.push({ ...message })
  }

  clear(): void {
    this.messages.length = 0
  }
}
