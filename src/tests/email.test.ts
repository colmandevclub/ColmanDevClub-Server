import { createServer } from 'node:net'
import { once } from 'node:events'
import { Router } from 'express'
import nodemailer from 'nodemailer'
import type { SMTPTransportOptions } from 'nodemailer/lib/smtp-transport'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { env, envSchema } from '../config/env.js'
import type { EmailTemplateData, TemplateId } from '../schemas/email.js'
import {
  createConsoleAdapter,
  createGmailAdapter,
  DELIVERY_TIMEOUT_MS,
  SMTP_TIMEOUT_MS,
  TestEmailAdapter,
} from '../services/email/adapters.js'
import { createEmailService } from '../services/email/service.js'
import { renderEmail } from '../services/email/templates.js'
import type { EmailAdapter } from '../services/email/types.js'

const origin = 'https://club.example'
const recipient = 'applicant@example.com'
const fullName = 'ישראל ישראלי'
const token = 'private-token-not-for-logs'
const fixtures = {
  'registration-confirmation': {
    fullName,
    status: 'registered',
    setPasswordUrl: `${origin}/reset-password?token=${token}&type=set_password`,
  },
  'admission-accepted': {
    fullName,
    academicYear: 'תשפ״ז 2026–2027',
    signInUrl: `${origin}/signin`,
  },
  'verify-email': { fullName, verificationUrl: `${origin}/verify-email?token=${token}` },
  'reset-password': { fullName, resetPasswordUrl: `${origin}/reset-password?token=${token}` },
  invite: {
    fullName,
    role: 'mentor',
    academicYear: 'תשפ״ז 2026–2027',
    inviteUrl: `${origin}/invite/${token}`,
  },
} satisfies EmailTemplateData
const templateCases = [
  ['R-04.4', 'registration-confirmation'],
  ['R-29.8', 'admission-accepted'],
  ['R-08.1', 'verify-email'],
  ['R-08.2', 'reset-password'],
  ['R-13.1', 'invite'],
] as const

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Hebrew transactional templates', () => {
  it.each(templateCases)(
    '%s renders %s as Hebrew RTL with a complete plain-text fallback',
    (id, template) => {
      const rendered = renderEmail(template, fixtures[template], origin)
      expect(rendered.html).toContain('<html lang="he" dir="rtl">')
      expect(rendered.html).toContain('<bdi>ColmanDevClub</bdi>')
      expect(rendered.html).toContain('dir="ltr"')
      expect(rendered.html).toContain(fullName)
      expect(rendered.text).toContain(fullName)
      expect(rendered.text).toContain(rendered.subject)
      expect(rendered.text).toContain(
        template === 'admission-accepted' ? fixtures[template].signInUrl : token,
      )
      expect(rendered.text).not.toMatch(/<\/?(?:html|a|p|bdi)[\s>]/)
      expect(rendered.subject).toMatch(/[א-ת]/)
      expect(rendered.html, id).not.toContain('undefined')
    },
  )

  it('R-04.4 distinguishes registered and waitlisted confirmations and includes the set-password link', () => {
    const registered = renderEmail(
      'registration-confirmation',
      fixtures['registration-confirmation'],
      origin,
    )
    const waitlisted = renderEmail(
      'registration-confirmation',
      { ...fixtures['registration-confirmation'], status: 'waitlisted' },
      origin,
    )
    expect(registered.text).toContain('ליום המיון נקלטה בהצלחה')
    expect(waitlisted.text).toContain('ברשימת ההמתנה')
    expect(waitlisted.text).not.toContain('ליום המיון נקלטה בהצלחה')
    expect(waitlisted.text).toContain(fixtures['registration-confirmation'].setPasswordUrl)
  })

  it('R-29.8 confirms successful admission, names the year and links to sign-in in HTML and plain text', () => {
    const rendered = renderEmail('admission-accepted', fixtures['admission-accepted'], origin)
    expect(rendered.subject).toBe('התקבלת למועדון הפיתוח — ברוכים הבאים!')
    for (const content of [rendered.html, rendered.text]) {
      expect(content).toContain('עברת את המיונים בהצלחה והתקבלת למועדון הפיתוח!')
      expect(content).toContain(fixtures['admission-accepted'].academicYear)
      expect(content).toContain(fixtures['admission-accepted'].signInUrl)
      expect(content).toContain('לכניסה לחשבון')
      expect(content).toContain('יש להשלים את האימות לפני קבלת גישה לתוכן לחברים')
      expect(content).not.toContain('חד־פעמי')
      expect(content).not.toContain('תוקפו')
      expect(content).not.toContain('token=')
    }
    expect(rendered.html).toContain('לפני שמתחילים')
    expect(rendered.html).not.toContain('קישור אישי. שימוש בטוח.')
  })

  it('R-29.8 escapes the accepted member name and academic year without changing the plain-text content', () => {
    const data = {
      ...fixtures['admission-accepted'],
      fullName: '<img src=x onerror="alert(1)">',
      academicYear: '<script>alert(1)</script>',
    }
    const rendered = renderEmail('admission-accepted', data, origin)
    expect(rendered.html).not.toContain('<img')
    expect(rendered.html).not.toContain('<script>')
    expect(rendered.html).toContain('&lt;img')
    expect(rendered.html).toContain('&lt;script&gt;')
    expect(rendered.text).toContain(data.fullName)
    expect(rendered.text).toContain(data.academicYear)
  })

  it.each([
    { academicYear: '' },
    { fullName: '' },
    { signInUrl: 'javascript:alert(1)' },
    { signInUrl: 'http://club.example/signin' },
    { signInUrl: 'https://attacker.example/signin' },
    { signInUrl: 'https://user:password@club.example/signin' },
    { role: 'admin' },
  ])('R-29.8 rejects invalid or unexpected admission message data: %j', (override) => {
    expect(() =>
      renderEmail(
        'admission-accepted',
        {
          ...fixtures['admission-accepted'],
          ...override,
        },
        origin,
      ),
    ).toThrow()
  })

  it.each([
    ['R-08.1', 'verify-email', '24 שעות'],
    ['R-08.2', 'reset-password', 'שעה אחת'],
    ['R-13.1', 'invite', '7 ימים'],
  ] as const)('%s explains the single-use link lifetime in %s', (_id, template, lifetime) => {
    const { html, text } = renderEmail(template, fixtures[template], origin)
    for (const content of [html, text]) {
      expect(content).toContain('חד־פעמי')
      expect(content).toContain(lifetime)
    }
  })

  it('R-13.1 includes the invited role and year and supports an invite without a name', () => {
    const { text } = renderEmail('invite', { ...fixtures.invite, fullName: undefined }, origin)
    expect(text).toContain('מנטור/ית')
    expect(text).toContain(fixtures.invite.academicYear)
    expect(text).toContain('שלום,')
    expect(text).not.toContain('undefined')
  })

  it('R-08.1 escapes HTML in names and link attributes while preserving plain text', () => {
    const name = '<img src=x onerror="alert(1)"> & \'שם\''
    const url = `${origin}/verify-email?token=${token}&next=%22%3E`
    const rendered = renderEmail('verify-email', { fullName: name, verificationUrl: url }, origin)
    expect(rendered.html).not.toContain('<img')
    expect(rendered.html).toContain('&lt;img')
    expect(rendered.html).toContain('&quot;')
    expect(rendered.html).toContain('&#39;')
    expect(rendered.html).toContain('&amp;next=')
    expect(rendered.text).toContain(name)
    expect(rendered.text).toContain(url)
  })

  it('R-13.1 escapes dynamic year text and rejects unknown role/status/template data', () => {
    expect(
      renderEmail(
        'invite',
        { ...fixtures.invite, academicYear: '<script>alert(1)</script>' },
        origin,
      ).html,
    ).not.toContain('<script>')
    expect(() => renderEmail('invite', { ...fixtures.invite, role: 'owner' }, origin)).toThrow()
    expect(() =>
      renderEmail(
        'registration-confirmation',
        { ...fixtures['registration-confirmation'], status: 'accepted' },
        origin,
      ),
    ).toThrow()
    expect(() =>
      renderEmail('verify-email', { ...fixtures['verify-email'], unexpected: true }, origin),
    ).toThrow()
    expect(() => renderEmail('unknown' as TemplateId, {}, origin)).toThrow()
  })

  it.each([
    'javascript:alert(1)',
    'http://club.example/verify-email',
    'https://attacker.example/verify-email',
    'https://club.example.attacker.example/verify-email',
    'https://user:password@club.example/verify-email',
    '//club.example/verify-email',
    'not-a-url',
  ])('R-08.1 rejects an unsafe action link: %s', (verificationUrl) => {
    expect(() => renderEmail('verify-email', { fullName, verificationUrl }, origin)).toThrow()
  })

  it.each(templateCases)('%s rejects missing required data for %s', (_id, template) => {
    expect(() => renderEmail(template, {}, origin)).toThrow()
  })
})

describe('Email delivery boundary', () => {
  it.each(templateCases)(
    '%s captures %s without contacting an email provider',
    async (_id, template) => {
      const adapter = new TestEmailAdapter()
      const smtp = vi.spyOn(nodemailer, 'createTransport')
      const service = createEmailService(adapter, origin)
      await service.send(recipient, template, fixtures[template])
      expect(adapter.messages).toHaveLength(1)
      expect(adapter.messages[0]).toMatchObject({ to: recipient, template })
      const expectedLink = template === 'admission-accepted' ? fixtures[template].signInUrl : token
      expect(adapter.messages[0]?.html).toContain(expectedLink)
      expect(adapter.messages[0]?.text).toContain(expectedLink)
      expect(smtp).not.toHaveBeenCalled()
      adapter.clear()
      expect(adapter.messages).toEqual([])
    },
  )

  it.each(templateCases)(
    '%s omits all personal data and links from console output for %s',
    async (_id, template) => {
      const log = vi.spyOn(console, 'info').mockImplementation(() => {})
      await createEmailService(createConsoleAdapter(), origin).send(
        recipient,
        template,
        fixtures[template],
      )
      expect(log).toHaveBeenCalledExactlyOnceWith({
        code: 'EMAIL_PREVIEW',
        adapter: 'console',
        template,
      })
      const output = JSON.stringify(log.mock.calls)
      for (const secret of [recipient, fullName, token, origin, fixtures.invite.academicYear]) {
        expect(output).not.toContain(secret)
      }
    },
  )

  it('R-08.2 swallows delivery failure after one attempt and logs only allow-listed metadata', async () => {
    const deliver = vi.fn().mockRejectedValue(
      Object.assign(new Error(`${recipient} ${token} ${fullName}`), {
        response: 'private SMTP response',
      }),
    )
    const adapter: EmailAdapter = { name: 'gmail', deliver }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      createEmailService(adapter, origin).send(
        recipient,
        'reset-password',
        fixtures['reset-password'],
      ),
    ).resolves.toBeUndefined()
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledExactlyOnceWith({ code: 'EMAIL_DELIVERY_FAILED', adapter: 'gmail' })
  })

  it('R-29.8 does not propagate or retry a failed acceptance email and logs no recipient or year', async () => {
    const deliver = vi
      .fn()
      .mockRejectedValue(
        new Error(`${recipient} ${fullName} ${fixtures['admission-accepted'].academicYear}`),
      )
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      createEmailService({ name: 'gmail', deliver }, origin).send(
        recipient,
        'admission-accepted',
        fixtures['admission-accepted'],
      ),
    ).resolves.toBeUndefined()
    expect(deliver).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledExactlyOnceWith({ code: 'EMAIL_DELIVERY_FAILED', adapter: 'gmail' })
  })

  it.each(['invalid', `${recipient},other@example.com`, `${recipient}\r\nBcc: other@example.com`])(
    'R-08.2 rejects an invalid or multiple recipient without sending or leaking input',
    async (to) => {
      const adapter = new TestEmailAdapter()
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      await createEmailService(adapter, origin).send(
        to,
        'reset-password',
        fixtures['reset-password'],
      )
      expect(adapter.messages).toEqual([])
      expect(log).toHaveBeenCalledExactlyOnceWith({
        code: 'EMAIL_DELIVERY_FAILED',
        adapter: 'test',
      })
    },
  )

  it('R-08.1 handles invalid template data without sending or logging token-bearing validation errors', async () => {
    const adapter = new TestEmailAdapter()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await createEmailService(adapter, origin).send(recipient, 'verify-email', {
      fullName,
      verificationUrl: `https://attacker.example/${token}`,
    })
    expect(adapter.messages).toEqual([])
    expect(log).toHaveBeenCalledExactlyOnceWith({ code: 'EMAIL_DELIVERY_FAILED', adapter: 'test' })
  })

  it('R-04.4 preserves a successful mutation response when SMTP fails without replaying the write', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const adapter: EmailAdapter = {
      name: 'gmail',
      deliver: vi.fn().mockRejectedValue(new Error('SMTP unavailable')),
    }
    const service = createEmailService(adapter, env.APP_ORIGIN)
    const save = vi.fn().mockResolvedValue(undefined)
    const router = Router()
    // Test-only consumer: no production email-sending endpoint is exposed.
    router.post('/email-consumer', async (_req, res) => {
      await save()
      await service.send(recipient, 'registration-confirmation', {
        ...fixtures['registration-confirmation'],
        setPasswordUrl: `${env.APP_ORIGIN}/reset-password?token=${token}`,
      })
      res.status(201).json({ status: 'registered' })
    })
    const response = await request(createApp(router)).post('/api/v1/email-consumer').set({
      'X-Forwarded-Proto': 'https',
      'X-CDC-Request': '1',
      Origin: env.APP_ORIGIN,
    })
    expect(response.status).toBe(201)
    expect(response.body).toEqual({ status: 'registered' })
    expect(save).toHaveBeenCalledTimes(1)
    expect(adapter.deliver).toHaveBeenCalledTimes(1)
  })
})

describe('T-22 Gmail SMTP adapter', () => {
  function mockTransport() {
    const sendMail = vi.fn().mockResolvedValue({ accepted: [recipient], rejected: [] })
    const createTransport = vi
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail } as unknown as ReturnType<typeof nodemailer.createTransport>)
    return { sendMail, createTransport }
  }

  it('T-22 uses authenticated Gmail over TLS, disables provider logs and sends HTML plus text', async () => {
    const { sendMail, createTransport } = mockTransport()
    await createEmailService(
      createGmailAdapter('club@example.com', 'abcdefghijklmnop'),
      origin,
    ).send(recipient, 'verify-email', fixtures['verify-email'])
    expect(createTransport).toHaveBeenCalledExactlyOnceWith({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'club@example.com', pass: 'abcdefghijklmnop' },
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
    })
    expect(sendMail).toHaveBeenCalledOnce()
    expect(sendMail.mock.calls[0]?.[0]).toMatchObject({
      from: { name: 'מועדון הפיתוח', address: 'club@example.com' },
      to: { name: '', address: recipient },
      html: expect.stringContaining('<html lang="he" dir="rtl">'),
      text: expect.stringContaining(token),
      signal: expect.any(AbortSignal),
    })
  })

  it('T-22 treats recipient rejection as failure without retrying or leaking the provider response', async () => {
    const { sendMail } = mockTransport()
    sendMail.mockResolvedValue({ accepted: [], rejected: [recipient] })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await createEmailService(
      createGmailAdapter('club@example.com', 'abcdefghijklmnop'),
      origin,
    ).send(recipient, 'verify-email', fixtures['verify-email'])
    expect(sendMail).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledExactlyOnceWith({ code: 'EMAIL_DELIVERY_FAILED', adapter: 'gmail' })
  })

  it('T-22 composes a real UTF-8 multipart message with text and HTML without live email', async () => {
    const stream = nodemailer.createTransport({ streamTransport: true, buffer: true })
    let mime = ''
    const sendMail = vi.fn(async (options: Parameters<typeof stream.sendMail>[0]) => {
      const info = await stream.sendMail(options)
      mime = info.message.toString()
      return { accepted: [recipient], rejected: [] }
    })
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as unknown as ReturnType<
      typeof nodemailer.createTransport
    >)
    await createEmailService(
      createGmailAdapter('club@example.com', 'abcdefghijklmnop'),
      origin,
    ).send(recipient, 'verify-email', fixtures['verify-email'])
    expect(sendMail).toHaveBeenCalledOnce()
    expect(mime).toContain('Content-Type: multipart/alternative;')
    expect(mime).toContain('Content-Type: text/plain; charset=utf-8')
    expect(mime).toContain('Content-Type: text/html; charset=utf-8')
    expect(mime).toContain(`To: ${recipient}`)
  })

  it('T-22 refuses to authenticate or send email when STARTTLS is unavailable', async () => {
    const sockets = new Set<import('node:net').Socket>()
    const commands: string[] = []
    const server = createServer((socket) => {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
      socket.write('220 localhost SMTP test\r\n')
      let pending = ''
      socket.on('data', (chunk) => {
        pending += chunk.toString()
        let end: number
        while ((end = pending.indexOf('\r\n')) !== -1) {
          const command = pending.slice(0, end).split(' ')[0]!.toUpperCase()
          pending = pending.slice(end + 2)
          commands.push(command)
          if (command === 'EHLO') socket.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n')
          else if (command === 'STARTTLS') socket.write('454 TLS unavailable\r\n')
          else socket.write('500 Not supported\r\n')
        }
      })
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address() as import('node:net').AddressInfo
    const realCreateTransport = nodemailer.createTransport
    vi.spyOn(nodemailer, 'createTransport').mockImplementation((options) =>
      realCreateTransport({
        ...(options as SMTPTransportOptions),
        host: '127.0.0.1',
        port: address.port,
      }),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const adapter = createGmailAdapter('club@example.com', 'abcdefghijklmnop')
      const deliver = vi.spyOn(adapter, 'deliver')
      await createEmailService(adapter, origin).send(
        recipient,
        'verify-email',
        fixtures['verify-email'],
      )
      await expect(deliver.mock.results[0]!.value).rejects.toMatchObject({ code: 'ETLS' })
      expect(commands).toEqual(['EHLO', 'STARTTLS'])
    } finally {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it('T-22 aborts an actual stalled SMTP connection at the delivery deadline without retrying', async () => {
    const sockets = new Set<import('node:net').Socket>()
    const server = createServer((socket) => {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
      // Deliberately never send the SMTP greeting.
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address() as import('node:net').AddressInfo
    const realCreateTransport = nodemailer.createTransport
    const realTimeout = AbortSignal.timeout.bind(AbortSignal)
    const deadline = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(50))
    const createTransport = vi.spyOn(nodemailer, 'createTransport').mockImplementation((options) =>
      realCreateTransport({
        ...(options as SMTPTransportOptions),
        host: '127.0.0.1',
        port: address.port,
        secure: false,
      }),
    )
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const adapter = createGmailAdapter('club@example.com', 'abcdefghijklmnop')
      const deliver = vi.spyOn(adapter, 'deliver')
      await createEmailService(adapter, origin).send(
        recipient,
        'verify-email',
        fixtures['verify-email'],
      )
      expect(deadline).toHaveBeenCalledExactlyOnceWith(DELIVERY_TIMEOUT_MS)
      expect(deliver).toHaveBeenCalledOnce()
      await expect(deliver.mock.results[0]!.value).rejects.toMatchObject({ code: 'EABORT' })
      expect(createTransport).toHaveBeenCalledOnce()
      expect(log).toHaveBeenCalledExactlyOnceWith({
        code: 'EMAIL_DELIVERY_FAILED',
        adapter: 'gmail',
      })
    } finally {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })
})

describe('T-22 validated adapter configuration', () => {
  const gmail = { GMAIL_USER: 'club@example.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' }

  it.each([
    [{}, 'console'],
    [{ NODE_ENV: 'test' }, 'test'],
    [{ NODE_ENV: 'production', VERCEL_ENV: 'preview', APP_ORIGIN: origin }, 'console'],
    [{ NODE_ENV: 'production', APP_ORIGIN: origin, ...gmail }, 'gmail'],
    [{ VERCEL_ENV: 'production', ...gmail }, 'gmail'],
  ])('T-22 selects a safe default adapter for %j', (input, adapter) => {
    expect(envSchema.parse(input).EMAIL_ADAPTER).toBe(adapter)
  })

  it('T-22 normalizes the Gmail app password without exposing it', () => {
    expect(envSchema.parse({ EMAIL_ADAPTER: 'gmail', ...gmail }).GMAIL_APP_PASSWORD).toBe(
      'abcdefghijklmnop',
    )
  })

  it.each([
    { EMAIL_ADAPTER: 'gmail' },
    { EMAIL_ADAPTER: 'gmail', GMAIL_USER: gmail.GMAIL_USER },
    { EMAIL_ADAPTER: 'gmail', GMAIL_APP_PASSWORD: gmail.GMAIL_APP_PASSWORD },
    { EMAIL_ADAPTER: 'gmail', ...gmail, GMAIL_USER: 'not-an-email' },
    { EMAIL_ADAPTER: 'gmail', ...gmail, GMAIL_APP_PASSWORD: 'bad-password' },
    { EMAIL_ADAPTER: 'test' },
    { EMAIL_ADAPTER: 'unknown' },
    { NODE_ENV: 'production', APP_ORIGIN: origin },
    { NODE_ENV: 'production', APP_ORIGIN: origin, EMAIL_ADAPTER: 'console' },
    { NODE_ENV: 'test', VERCEL_ENV: 'production', EMAIL_ADAPTER: 'test' },
  ])(
    'T-22 rejects missing secrets, invalid adapters and production no-op delivery: %j',
    (input) => {
      expect(envSchema.safeParse(input).success).toBe(false)
    },
  )
})
