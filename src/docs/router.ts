import { Router } from 'express'
import * as swaggerUi from 'swagger-ui-express'
import { env } from '../config/env.js'
import { generateOpenApiDocument } from './openapi.js'

export function apiDocsEnabled(config: Pick<typeof env, 'NODE_ENV' | 'VERCEL_ENV'> = env): boolean {
  if (config.VERCEL_ENV === 'production') return false
  return config.VERCEL_ENV === 'preview' || config.NODE_ENV !== 'production'
}

export function createDocsRouter(): Router {
  const router = Router()
  const options: swaggerUi.SwaggerUiOptions = {
    customSiteTitle: 'ColmanDevClub API docs',
    swaggerOptions: {
      url: '/api/docs/openapi.json',
      validatorUrl: null,
      withCredentials: true,
      displayRequestDuration: true,
      requestInterceptor: (request: { headers: Record<string, string> }) => {
        request.headers['X-CDC-Request'] = '1'
        return request
      },
    },
  }

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  router.get('/openapi.json', (_req, res) => res.json(generateOpenApiDocument()))
  router.use(swaggerUi.serveFiles(undefined, options))
  router.get('/', swaggerUi.setup(null, options))

  return router
}
