import express from 'express'
import { readFile } from 'node:fs/promises'
import { env } from '../config/env.js'
import { createConsoleAdapter, createGmailAdapter } from '../services/email/adapters.js'
import { createEmailService } from '../services/email/service.js'
import type { EmailAdapter, EmailTemplateData, TemplateId } from '../services/email/types.js'
import { emailRecipientSchema, emailTemplateSchemas } from '../schemas/email.js'
import { z } from '../schemas/zod.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { requestContext } from '../middleware/requestContext.js'
import { errorHandler, notFound } from '../middleware/errorHandler.js'
import { validate } from '../middleware/validate.js'

// Standalone loopback-only mail tester. No accounts, database or production routes.
if (env.NODE_ENV !== 'development' || env.VERCEL_ENV) {
  throw new Error('The email tester requires local development')
}
const templateIds = Object.keys(emailTemplateSchemas) as [TemplateId, ...TemplateId[]]
const requestSchema = z.strictObject({
  template: z.enum(templateIds),
  to: emailRecipientSchema.optional(),
})
const origin = env.APP_ORIGIN
const fullName = 'משתמש בדיקה'
const fixtures = {
  'registration-confirmation': {
    fullName,
    status: 'registered',
    setPasswordUrl: `${origin}/reset-password?token=preview-only&type=set_password`,
  },
  'admission-accepted': { fullName, academicYear: 'תשפ״ז', signInUrl: `${origin}/signin` },
  'verify-email': { fullName, verificationUrl: `${origin}/verify-email?token=preview-only` },
  'reset-password': { fullName, resetPasswordUrl: `${origin}/reset-password?token=preview-only` },
  invite: {
    fullName,
    role: 'mentor',
    academicYear: 'תשפ״ז',
    inviteUrl: `${origin}/invite/preview-only`,
  },
} satisfies EmailTemplateData
const adapter =
  env.EMAIL_ADAPTER === 'gmail'
    ? createGmailAdapter(env.GMAIL_USER!, env.GMAIL_APP_PASSWORD!)
    : createConsoleAdapter()
const events: { template: TemplateId; status: string; at: string }[] = []
const app = express()
const port = env.PORT
const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, env.APP_ORIGIN])

app.disable('x-powered-by')
app.set('trust proxy', false)
app.use(requestContext)
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (
    !hosts.has(req.get('Host') ?? '') ||
    !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')
  ) {
    res.status(403).json({ status: 'forbidden' })
    return
  }
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    (req.get('X-CDC-Request') !== '1' || !origins.has(req.get('Origin') ?? ''))
  ) {
    res.status(403).json({ status: 'forbidden' })
    return
  }
  next()
})
app.use(express.json({ limit: '4kb' }))
app.get(['/', '/mail-test'], async (_req, res) => {
  res.type('html').send(await readFile(new URL('./email-test.html', import.meta.url), 'utf8'))
})
app.get('/postman/email.json', async (_req, res) => {
  res
    .attachment('email.postman_collection.json')
    .type('json')
    .send(
      await readFile(
        new URL('../../docs/postman/email.postman_collection.json', import.meta.url),
        'utf8',
      ),
    )
})
app.get('/__dev/email-status', (_req, res) => res.json({ adapter: adapter.name, events }))
app.post(
  '/__dev/send-test-email',
  rateLimit({ windowMs: 15 * 60_000, limit: 5 }),
  validate(requestSchema),
  async (req, res) => {
    const { template, to } = req.body as z.infer<typeof requestSchema>
    const recipient = to ?? env.GMAIL_USER
    if (!recipient) {
      res.status(400).json({ status: 'recipient_required' })
      return
    }
    let outcome: 'smtp_accepted' | 'preview' | 'failed' = 'failed'
    const observed: EmailAdapter = {
      name: adapter.name,
      async deliver(message) {
        await adapter.deliver(message)
        outcome = adapter.name === 'gmail' ? 'smtp_accepted' : 'preview'
      },
    }
    await createEmailService(observed, origin).send(recipient, template, fixtures[template])
    events.push({ template, status: outcome, at: new Date().toISOString() })
    if (events.length > 20) events.shift()
    res.status(outcome === 'failed' ? 503 : 200).json({ status: outcome, template })
  },
)
app.use(notFound)
app.use(errorHandler)
const server = app.listen(port, '127.0.0.1', () =>
  console.info({ code: 'LOCAL_MAIL_SENDER_READY', port, adapter: adapter.name }),
)
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => process.exit(0)))
}
