import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

// Extend before schemas are created, including in ESM imports.
extendZodWithOpenApi(z)

export { z }
