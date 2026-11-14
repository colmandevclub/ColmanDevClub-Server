import { Router, type RequestHandler } from 'express'
import { MemoryStore } from 'express-rate-limit'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createApp } from '../app.js'
import { env, envSchema } from '../config/env.js'
import mongoose from '../config/mongoose.js'
import { ApiError, errorDefinitions, type ErrorCode } from '../middleware/errors.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { validate } from '../middleware/validate.js'

const secureHeaders = { 'X-Forwarded-Proto': 'https' }
const writeHeaders = { ...secureHeaders, 'X-CDC-Request': '1', Origin: env.APP_ORIGIN }

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('R-44.1 HTTPS and security headers', () => {
  it.each(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const)(
    'R-44.1 redirects HTTP %s before processing the request, preserving path and query',
    async (method) => {
      const response = await request(createApp())
        [method]('/api/v1/health?next=%2Fmy')
        .set('X-Forwarded-Proto', 'http')
        .set('Host', 'foreign.example')
        .set('X-Forwarded-Host', 'another.example')

      expect(response.status).toBe(308)
      expect(response.headers.location).toBe(`${env.APP_ORIGIN}/api/v1/health?next=%2Fmy`)
    },
  )

  it('R-44.1 redirects direct HTTP without a forwarded protocol', async () => {
    const response = await request(createApp()).get('/api/v1/health')
    expect(response.status).toBe(308)
  })

  it('R-44.1 cannot turn a protocol-relative request path into a foreign redirect', async () => {
    const response = await request(createApp()).get('//foreign.example/path')
    expect(new URL(response.headers.location!).origin).toBe(env.APP_ORIGIN)
  })

  it.each(['/api/v1/health', '/api/v1/missing'])(
    'R-44.1 sends the required HSTS policy and Helmet headers on %s',
    async (path) => {
      const response = await request(createApp()).get(path).set(secureHeaders)
      expect(response.headers['strict-transport-security']).toBe(
        'max-age=31536000; includeSubDomains',
      )
      expect(response.headers['x-content-type-options']).toBe('nosniff')
      expect(response.headers['x-powered-by']).toBeUndefined()
      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    },
  )
})

describe('T-10 CSRF protection', () => {
  function writeApp() {
    const router = Router()
    router.all('/write', (_req, res) => res.sendStatus(204))
    return createApp(router)
  }

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'T-10 rejects %s unless both CSRF headers are valid',
    async (method) => {
      const app = writeApp()
      const headerCases = [
        secureHeaders,
        { ...secureHeaders, Origin: env.APP_ORIGIN },
        { ...secureHeaders, 'X-CDC-Request': '1' },
        { ...writeHeaders, 'X-CDC-Request': '0' },
        { ...writeHeaders, Origin: 'https://foreign.example' },
        { ...writeHeaders, Origin: `${env.APP_ORIGIN}.foreign.example` },
        { ...writeHeaders, Origin: 'null' },
        { ...writeHeaders, Origin: `${env.APP_ORIGIN}/path` },
        { ...writeHeaders, Origin: env.APP_ORIGIN.replace('https:', 'http:') },
      ]
      for (const headers of headerCases) {
        const response = await request(app)[method]('/api/v1/write').set(headers)
        expect(response.status).toBe(403)
        expect(response.body).toEqual({
          error: { code: 'FORBIDDEN', message: 'Access denied.', fields: {} },
        })
      }
      const allowed = await request(app)[method]('/api/v1/write').set(writeHeaders)
      expect(allowed.status).toBe(204)
    },
  )

  it('T-10 rejects a foreign Origin even when Host headers match the attacker', async () => {
    const response = await request(writeApp())
      .post('/api/v1/write')
      .set({
        ...writeHeaders,
        Origin: 'https://foreign.example',
        Host: 'foreign.example',
        'X-Forwarded-Host': 'foreign.example',
      })
    expect(response.status).toBe(403)
  })

  it.each(['get', 'head', 'options'] as const)(
    'T-10 allows safe %s requests without CSRF headers',
    async (method) => {
      const response = await request(writeApp())[method]('/api/v1/write').set(secureHeaders)
      expect(response.status).toBe(204)
    },
  )

  it('T-10 blocks cross-origin preflight through the absence of CORS headers', async () => {
    const response = await request(writeApp())
      .options('/api/v1/write')
      .set({
        ...secureHeaders,
        Origin: 'https://foreign.example',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'X-CDC-Request',
      })
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
    expect(response.headers['access-control-allow-headers']).toBeUndefined()
  })
})

describe('R-12.2 unified errors and validation', () => {
  it.each([
    ['VALIDATION_ERROR', 400],
    ['UNAUTHENTICATED', 401],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['RATE_LIMITED', 429],
  ] satisfies [ErrorCode, number][])(
    'R-12.2 returns the standard %s envelope with HTTP %i',
    async (code, status) => {
      const router = Router()
      router.get('/error', () => {
        throw new ApiError(code)
      })
      const response = await request(createApp(router)).get('/api/v1/error').set(secureHeaders)
      expect(response.status).toBe(status)
      expect(response.body).toEqual({
        error: { code, message: errorDefinitions[code].message, fields: {} },
      })
    },
  )

  it('R-12.2 returns a generic JSON 404 without reflecting request details', async () => {
    const response = await request(createApp())
      .get('/api/v1/private-person@example.com?token=secret')
      .set(secureHeaders)
    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Resource not found.', fields: {} },
    })
  })

  it('S-0.6 validates nested fields and stops invalid input before the controller', async () => {
    const controller = vi.fn<RequestHandler>((_req, res) => {
      res.sendStatus(204)
    })
    const router = Router()
    router.post(
      '/validate',
      validate(z.object({ profile: z.object({ age: z.number().int().min(18) }) })),
      controller,
    )
    const response = await request(createApp(router))
      .post('/api/v1/validate')
      .set(writeHeaders)
      .send({ profile: { age: 10 } })
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(response.body.error.fields['profile.age']).toEqual(expect.any(String))
    expect(controller).not.toHaveBeenCalled()
  })

  it('S-0.6 passes parsed body, query and params values to controllers in Express 5', async () => {
    const router = Router()
    router.post(
      '/validate/:id',
      validate(z.object({ name: z.string().trim() })),
      validate(z.object({ page: z.coerce.number().int().default(1) }), 'query'),
      validate(z.object({ id: z.coerce.number().int() }), 'params'),
      (req, res) => res.json({ body: req.body, query: req.query, params: req.params }),
    )
    const response = await request(createApp(router))
      .post('/api/v1/validate/12?page=2&unused=removed')
      .set(writeHeaders)
      .send({ name: '  Member  ', unused: 'removed' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      body: { name: 'Member' },
      query: { page: 2 },
      params: { id: 12 },
    })
  })

  it('S-0.6 supports async schemas and root-level validation failures', async () => {
    const router = Router()
    router.post('/validate', validate(z.unknown().refine(async () => false)), (_req, res) =>
      res.sendStatus(204),
    )
    const response = await request(createApp(router))
      .post('/api/v1/validate')
      .set(writeHeaders)
      .send({})
    expect(response.status).toBe(400)
    expect(response.body.error.fields._root).toEqual(expect.any(String))
  })

  it('S-0.6 normalizes Zod errors thrown by an async controller', async () => {
    const router = Router()
    router.get('/validate', async () => {
      await z.object({ page: z.number() }).parseAsync({ page: 'invalid' })
    })
    const response = await request(createApp(router)).get('/api/v1/validate').set(secureHeaders)
    expect(response.status).toBe(400)
    expect(response.body.error.fields.page).toEqual(expect.any(String))
  })

  it('S-0.6 returns a safe 400 for malformed JSON without echoing or logging it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await request(createApp())
      .post('/api/v1/health')
      .set(writeHeaders)
      .set('Content-Type', 'application/json')
      .send('{"email":"private@example.com",')
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request.', fields: {} },
    })
    expect(log).not.toHaveBeenCalled()
  })

  it('S-0.6 limits JSON bodies to 100kb with a unified error', async () => {
    const response = await request(createApp())
      .post('/api/v1/health')
      .set(writeHeaders)
      .send({ data: 'a'.repeat(100 * 1024) })
    expect(response.status).toBe(413)
    expect(response.body.error).toEqual({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large.',
      fields: {},
    })
  })

  it('S-0.6 logs only server error metadata with an internally generated request ID', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = Router()
    router.post('/error', async () => {
      throw new Error('private@example.com 0501234567 token=secret confidential notes')
    })
    const response = await request(createApp(router))
      .post('/api/v1/error?email=private@example.com')
      .set({
        ...writeHeaders,
        'X-Request-ID': 'private@example.com',
        Authorization: 'Bearer secret',
        Cookie: 'cdc_at=secret',
      })
      .send({ phone: '0501234567', notes: 'confidential' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
        fields: {},
      },
    })
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
    expect(log).toHaveBeenCalledExactlyOnceWith({
      requestId: response.headers['x-request-id'],
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
    })
  })

  it('S-0.6 parses cookies before route handlers', async () => {
    const router = Router()
    router.get('/cookie', (req, res) => res.json({ cookie: req.cookies.example }))
    const response = await request(createApp(router))
      .get('/api/v1/cookie')
      .set(secureHeaders)
      .set('Cookie', 'example=value')
    expect(response.body).toEqual({ cookie: 'value' })
  })
})

describe('S-0.6 reusable rate limiting', () => {
  it('S-0.6 isolates client IPs, returns unified 429s and resets after the window', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    const router = Router()
    router.get('/limited', rateLimit({ windowMs: 1000, limit: 1 }), (_req, res) =>
      res.sendStatus(204),
    )
    const app = createApp(router)
    const hit = (ip: string) =>
      request(app).get('/api/v1/limited').set(secureHeaders).set('X-Forwarded-For', ip)

    expect((await hit('192.0.2.1')).status).toBe(204)
    const blocked = await hit('192.0.2.1')
    expect(blocked.status).toBe(429)
    expect(blocked.body).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        fields: {},
      },
    })
    expect(blocked.headers['retry-after']).toBe('1')
    expect(blocked.headers.ratelimit).toBeDefined()
    expect((await hit('192.0.2.2')).status).toBe(204)
    vi.advanceTimersByTime(1001)
    expect((await hit('192.0.2.1')).status).toBe(204)
  })

  it('S-0.6 groups IPv6 addresses by subnet and ignores spoofed leftmost proxy hops', async () => {
    const router = Router()
    router.get('/limited', rateLimit({ windowMs: 60000, limit: 1 }), (_req, res) =>
      res.sendStatus(204),
    )
    const app = createApp(router)
    const hit = (ip: string) =>
      request(app).get('/api/v1/limited').set(secureHeaders).set('X-Forwarded-For', ip)

    expect((await hit('2001:db8:abcd:1200::1')).status).toBe(204)
    expect((await hit('2001:db8:abcd:1200::2')).status).toBe(429)
    expect((await hit('spoofed, 192.0.2.4')).status).toBe(204)
    expect((await hit('different, 192.0.2.4')).status).toBe(429)
  })

  it('S-0.6 keeps IP addresses out of library diagnostic logs', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = Router()
    router.get('/limited', rateLimit({ windowMs: 60000, limit: 1 }), (_req, res) =>
      res.sendStatus(204),
    )
    await request(createApp(router))
      .get('/api/v1/limited')
      .set(secureHeaders)
      .set('X-Forwarded-For', 'private@example.com')
    expect(log).toHaveBeenCalledExactlyOnceWith({ code: 'RATE_LIMIT_ERROR' })
  })

  it('S-0.6 fails closed on store failures without exposing their raw error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = new MemoryStore()
    vi.spyOn(store, 'increment').mockRejectedValue(new Error('private@example.com token=secret'))
    const router = Router()
    router.get('/limited', rateLimit({ windowMs: 60000, limit: 1, store }), (_req, res) =>
      res.sendStatus(204),
    )
    const response = await request(createApp(router)).get('/api/v1/limited').set(secureHeaders)
    expect(response.status).toBe(500)
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR')
    expect(log).toHaveBeenCalledExactlyOnceWith({
      requestId: response.headers['x-request-id'],
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
    })
  })
})

describe('S-0.6 Mongoose filter protection', () => {
  it('S-0.6 enables filter sanitization and strict queries globally', () => {
    expect(mongoose.get('sanitizeFilter')).toBe(true)
    expect(mongoose.get('strictQuery')).toBe(true)
  })

  it('S-0.6 rejects injected operators and strips unknown query fields without a database', async () => {
    const Model = mongoose.model('SecurityBaseline', new mongoose.Schema({ email: String }))
    try {
      await expect(Model.findOne({ email: { $ne: null } }).exec()).rejects.toBeInstanceOf(
        mongoose.Error.CastError,
      )
      const query = Model.find({ email: 'member@example.com', unknown: 'stripped' })
      expect(query.cast()).toEqual({ email: 'member@example.com' })
    } finally {
      mongoose.deleteModel('SecurityBaseline')
    }
  })
})

describe('R-44.1 configured site origin', () => {
  it('R-44.1 requires an explicit site origin in production', () => {
    expect(envSchema.safeParse({ NODE_ENV: 'production' }).success).toBe(false)
  })

  it.each([
    'http://club.example',
    'https://club.example/path',
    'https://club.example?query=1',
    'https://club.example#fragment',
    'https://user:secret@club.example',
    'invalid',
  ])('R-44.1 rejects an unsafe configured origin: %s', (APP_ORIGIN) => {
    expect(envSchema.safeParse({ APP_ORIGIN }).success).toBe(false)
  })

  it('R-44.1 normalizes configured origins for exact browser Origin comparison', () => {
    const result = envSchema.parse({ NODE_ENV: 'production', APP_ORIGIN: 'https://Club.example/' })
    expect(result.APP_ORIGIN).toBe('https://club.example')
  })
})
