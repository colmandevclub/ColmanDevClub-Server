import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { env } from '../config/env.js'
import { registerApiRoute, registry } from '../docs/registry.js'
import { apiDocsEnabled } from '../docs/router.js'
import { errorDefinitions } from '../middleware/errors.js'
import { errorResponseSchema } from '../schemas/error.js'
import { healthResponseSchema } from '../schemas/health.js'
import { z } from '../schemas/zod.js'

const secureHeaders = { 'X-Forwarded-Proto': 'https' }
const originalEnvironment = { ...env }

afterEach(() => {
  delete env.VERCEL_ENV
  Object.assign(env, originalEnvironment)
  vi.restoreAllMocks()
})

describe('T-23 documentation availability', () => {
  it.each([
    ['development', undefined, true],
    ['test', undefined, true],
    ['production', 'preview', true],
    ['development', 'development', true],
    ['production', undefined, false],
    ['production', 'production', false],
    ['development', 'production', false],
    ['production', 'development', false],
  ] as const)(
    'T-23 serves docs for NODE_ENV=%s VERCEL_ENV=%s: %s',
    async (node, vercel, enabled) => {
      env.NODE_ENV = node
      if (vercel) env.VERCEL_ENV = vercel
      else delete env.VERCEL_ENV
      expect(apiDocsEnabled()).toBe(enabled)

      const app = createApp()
      for (const path of [
        '/api/docs',
        '/api/docs/',
        '/api/docs/openapi.json',
        '/api/docs/swagger-ui-init.js',
        '/api/docs/swagger-ui-bundle.js',
        '/api/docs/swagger-ui-standalone-preset.js',
        '/api/docs/swagger-ui.css',
      ]) {
        const response = await request(app).get(path).set(secureHeaders)
        if (enabled) {
          expect(response.status, path).toBe(path === '/api/docs' ? 301 : 200)
        } else {
          expect(response.status, path).toBe(404)
          expect(errorResponseSchema.parse(response.body).error.code).toBe('NOT_FOUND')
        }
      }
      expect((await request(app).get('/api/v1/health').set(secureHeaders)).status).toBe(200)
    },
  )

  it('T-23 serves Swagger with same-origin assets, cookie credentials and the CSRF header', async () => {
    env.NODE_ENV = 'test'
    delete env.VERCEL_ENV
    const app = createApp()
    const page = await request(app).get('/api/docs/').set(secureHeaders)
    expect(page.text).toContain('<title>ColmanDevClub API docs</title>')
    expect(page.headers['content-security-policy']).toContain("script-src 'self'")
    expect(page.text).not.toMatch(/<script>(?!\s*<\/script>)/)
    expect(page.headers['strict-transport-security']).toContain('max-age=31536000')
    expect(page.headers['cache-control']).toBe('no-store')

    const init = await request(app).get('/api/docs/swagger-ui-init.js').set(secureHeaders)
    expect(init.text).toContain('/api/docs/openapi.json')
    expect(init.text).toContain('"withCredentials": true')
    expect(init.text).toContain('"validatorUrl": null')
    expect(init.text).toContain('X-CDC-Request')

    const redirect = await request(app).get('/api/docs')
    expect(redirect.status).toBe(308)
  })
})

describe('T-23 / T-12 authoritative API schemas', () => {
  it('T-23 generates the health example, errors, cookies and requirement IDs in OpenAPI 3.1', async () => {
    env.NODE_ENV = 'test'
    delete env.VERCEL_ENV
    const response = await request(createApp()).get('/api/docs/openapi.json').set(secureHeaders)
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.headers['cache-control']).toBe('no-store')
    const spec = response.body
    expect(spec.openapi).toBe('3.1.0')
    expect(spec.servers).toEqual([{ url: '/', description: 'Current origin (local or preview)' }])
    const health = spec.paths['/api/v1/health'].get
    expect(health.security).toEqual([])
    expect(health['x-policy']).toBe('public')
    expect(health['x-requirement-ids']).toEqual(['T-23', 'T-12'])
    expect(health.description).toContain('No product R-ID applies')
    expect(health.requestBody).toBeUndefined()
    expect(health.responses['200'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/HealthResponse',
    })
    expect(spec.components.schemas.HealthResponse.properties.status.enum).toEqual(['ok'])
    expect(health.responses.default).toEqual({ $ref: '#/components/responses/ApiError' })
    expect(spec.components.responses.ApiError.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/ApiError',
    })
    expect(spec.components.schemas.ApiError.properties.error.properties.code.enum).toEqual(
      Object.keys(errorDefinitions),
    )
    expect(spec.components.securitySchemes.accessCookie).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'cdc_at',
    })
    expect(spec.components.securitySchemes.refreshCookie).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'cdc_rt',
    })

    const healthResponse = await request(createApp()).get('/api/v1/health').set(secureHeaders)
    expect(healthResponseSchema.parse(healthResponse.body)).toEqual(healthResponse.body)
  })

  it('T-23 registers request/response schemas, R-IDs, policy and cookie security for later stories', () => {
    const registration = vi.spyOn(registry, 'registerPath').mockImplementation(() => {})
    registerApiRoute({
      method: 'patch',
      path: '/api/v1/example/{id}',
      summary: 'Example authenticated route',
      requirements: ['R-10.2'],
      policy: 'isSelf',
      auth: 'accessCookie',
      request: {
        params: z.object({ id: z.string() }),
        query: z.object({ notify: z.enum(['yes', 'no']).optional() }),
        body: {
          required: true,
          content: { 'application/json': { schema: z.object({ name: z.string() }) } },
        },
      },
      responses: {
        200: {
          description: 'Updated.',
          content: { 'application/json': { schema: z.object({ name: z.string() }) } },
        },
      },
    })
    const route = registration.mock.calls[0]![0]
    const document = new OpenApiGeneratorV31([
      ...registry.definitions,
      { type: 'route', route },
    ]).generateDocument({ openapi: '3.1.0', info: { title: 'Test', version: '1' } })
    const operation = document.paths!['/api/v1/example/{id}']!.patch!
    expect(operation.security).toEqual([{ accessCookie: [] }])
    expect(operation['x-requirement-ids']).toEqual(['R-10.2'])
    expect(operation.description).toContain('Authorization policy: isSelf')
    expect(operation.parameters).toMatchObject([
      { in: 'path', name: 'id', required: true },
      { in: 'query', name: 'notify' },
    ])
    expect(operation.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
    })
    expect(operation.responses!['200']).toMatchObject({
      content: { 'application/json': { schema: { type: 'object' } } },
    })
    expect(operation.responses!.default).toEqual({ $ref: '#/components/responses/ApiError' })
  })

  it('T-23 rejects duplicate registrations', () => {
    expect(() =>
      registerApiRoute({
        method: 'get',
        path: '/api/v1/health',
        request: {},
        requirements: ['T-23'],
        policy: 'public',
        auth: 'public',
        responses: {},
      }),
    ).toThrow('Duplicate OpenAPI operation')
  })
})
