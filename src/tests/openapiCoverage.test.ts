import express, { Router } from 'express'
import { describe, expect, it } from 'vitest'
import { assertApiCoverage, collectApiOperations } from '../docs/coverage.js'
import { generateOpenApiDocument } from '../docs/openapi.js'

const handler = (_req: express.Request, res: express.Response) => res.sendStatus(204)

describe('T-23 CI route coverage', () => {
  it('T-23 requires every real API method/path to be registered', async () => {
    const operations = await collectApiOperations(async () => {
      const { createApp } = await import('../app.js')
      return createApp()
    })
    expect(operations).toContainEqual({ method: 'get', path: '/api/v1/health' })
    expect(() => assertApiCoverage(operations, generateOpenApiDocument())).not.toThrow()
  })

  it('T-23 fails for unregistered direct, nested, parameterized, array and chained routes', async () => {
    const operations = await collectApiOperations(() => {
      const app = express()
      app.get('/api/v1/direct', handler)
      app.route('/api/v1/chained').get(handler).post(handler)
      const child = Router()
      child.patch(['/members/:userId', '/users/:userId'], handler)
      const parent = Router()
      parent.use('/years/:yearId', child)
      app.use(['/api/v1', '/api/v2'], parent)
      return app
    })
    expect(operations).toHaveLength(7)
    expect(operations).toContainEqual({
      method: 'patch',
      path: '/api/v2/years/{yearId}/users/{userId}',
    })
    for (const operation of operations) {
      expect(() =>
        assertApiCoverage([operation], { ...generateOpenApiDocument(), paths: {} }),
      ).toThrow(`Unregistered API route: ${operation.method.toUpperCase()} ${operation.path}`)
    }
  })

  it('T-23 compares the full mount path and HTTP method, and rejects stale docs', () => {
    const document = generateOpenApiDocument()
    expect(() => assertApiCoverage([{ method: 'post', path: '/api/v1/health' }], document)).toThrow(
      'Unregistered API route: POST /api/v1/health',
    )
    expect(() => assertApiCoverage([{ method: 'get', path: '/api/v2/health' }], document)).toThrow(
      'Unregistered API route: GET /api/v2/health',
    )
    expect(() => assertApiCoverage([], document)).toThrow('OpenAPI operation has no API route')
  })

  it('T-23 fails closed for RegExp and wildcard paths and restores Express after failure', async () => {
    const originalUse = Router.prototype.use
    await expect(
      collectApiOperations(() => {
        const app = express()
        app.get(/^\/api\/v1\/hidden$/, handler)
        return app
      }),
    ).rejects.toThrow('RegExp paths are unsupported')
    expect(Router.prototype.use).toBe(originalUse)
    await expect(
      collectApiOperations(() => {
        const app = express()
        app.get('/api/v1/*rest', handler)
        return app
      }),
    ).rejects.toThrow('Use explicit paths')
    expect(Router.prototype.use).toBe(originalUse)
  })
})
