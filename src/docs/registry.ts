import { OpenAPIRegistry, type RouteConfig } from '@asteasolutions/zod-to-openapi'
import { errorDefinitions } from '../middleware/errors.js'
import { errorResponseSchema } from '../schemas/error.js'

export const registry = new OpenAPIRegistry()

registry.registerComponent('securitySchemes', 'accessCookie', {
  type: 'apiKey',
  in: 'cookie',
  name: 'cdc_at',
  description:
    'JWT access token; HttpOnly; Secure; SameSite=Lax; Path=/api; expires after 15 minutes. ' +
    'Sign in through the API on this origin. The browser sends the cookie automatically; ' +
    'Swagger UI cannot set HttpOnly cookies through Authorize.',
})
registry.registerComponent('securitySchemes', 'refreshCookie', {
  type: 'apiKey',
  in: 'cookie',
  name: 'cdc_rt',
  description:
    'Rotating refresh token; HttpOnly; Secure; SameSite=Lax; ' +
    'Path=/api/v1/auth/refresh; expires after 30 days.',
})

registry.register('ApiError', errorResponseSchema)
registry.registerComponent('responses', 'ApiError', {
  description:
    'Standard API error envelope. The route and its middleware determine which codes apply.\n\n' +
    Object.entries(errorDefinitions)
      .map(([code, { status, message }]) => `- ${status} ${code}: ${message}`)
      .join('\n'),
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ApiError' },
      example: { error: { code: 'FORBIDDEN', message: 'Access denied.', fields: {} } },
    },
  },
})

type RequirementId = `R-${number}` | `R-${number}.${number}` | `T-${number}`
type ApiRouteDocumentation = Omit<RouteConfig, 'security' | 'request'> & {
  request: NonNullable<RouteConfig['request']>
  requirements: readonly [RequirementId, ...RequirementId[]]
  policy: string
  auth: 'public' | 'accessCookie' | 'refreshCookie'
}

/** Registers documentation only; routes must still enforce their policy in middleware. */
export function registerApiRoute({
  requirements,
  policy,
  auth,
  ...route
}: ApiRouteDocumentation): void {
  if (
    registry.definitions.some(
      (definition) =>
        definition.type === 'route' &&
        definition.route.method === route.method &&
        definition.route.path === route.path,
    )
  ) {
    throw new Error(`Duplicate OpenAPI operation: ${route.method.toUpperCase()} ${route.path}`)
  }

  registry.registerPath({
    ...route,
    description: [
      route.description,
      `Implements: ${requirements.join(', ')}.`,
      `Authorization policy: ${policy}. Authentication: ${auth}.`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    'x-requirement-ids': requirements,
    'x-policy': policy,
    security: auth === 'public' ? [] : [{ [auth]: [] }],
    responses: {
      default: { $ref: '#/components/responses/ApiError' },
      '308': {
        description:
          'HTTP requests redirect to the configured HTTPS origin, preserving path and query.',
      },
      ...route.responses,
    },
  })
}
