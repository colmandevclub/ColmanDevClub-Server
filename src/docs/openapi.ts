import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import { registry } from './registry.js'
import './health.js'

export function generateOpenApiDocument(): ReturnType<OpenApiGeneratorV31['generateDocument']> {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'ColmanDevClub API',
      version: '1.0.0',
      description:
        'Same-origin HTTPS API. Request and response schemas come from the authoritative API Zod schemas (T-12). ' +
        'State-changing requests require X-CDC-Request: 1 and a matching Origin. ' +
        'Sign in on this origin to use HttpOnly authentication cookies in Swagger UI. ' +
        'Each operation lists its requirement IDs and authorization policy. ' +
        'Failures use the shared ApiError envelope; fields is an object of field paths to messages.',
    },
    servers: [{ url: '/', description: 'Current origin (local or preview)' }],
    tags: [{ name: 'Health', description: 'Operational health check (S-0.1)' }],
  })
}
