import type { EmailTemplateData, TemplateId } from '../../schemas/email.js'

export type { EmailTemplateData, TemplateId }

export interface EmailService {
  send<T extends TemplateId>(to: string, template: T, data: EmailTemplateData[T]): Promise<void>
}

export interface EmailMessage {
  to: string
  template: TemplateId
  subject: string
  html: string
  text: string
}

export interface EmailAdapter {
  readonly name: 'gmail' | 'console' | 'test'
  deliver(message: EmailMessage): Promise<void>
}
