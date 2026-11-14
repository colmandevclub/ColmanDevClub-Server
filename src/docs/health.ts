import { healthResponseSchema } from '../schemas/health.js'
import { registerApiRoute, registry } from './registry.js'

const healthResponse = registry.register('HealthResponse', healthResponseSchema)

registerApiRoute({
  method: 'get',
  path: '/api/v1/health',
  operationId: 'getHealth',
  tags: ['Health'],
  summary: 'Check API health',
  description:
    'Public operational endpoint from S-0.1. No request body, query or path parameters. ' +
    'No product R-ID applies; this endpoint demonstrates T-23 and T-12.',
  requirements: ['T-23', 'T-12'],
  policy: 'public',
  auth: 'public',
  request: {},
  responses: {
    200: {
      description: 'The API is healthy.',
      content: { 'application/json': { schema: healthResponse } },
    },
  },
})
