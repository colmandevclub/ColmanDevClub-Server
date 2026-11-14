import { Router, type Express } from 'express'
import type { generateOpenApiDocument } from './openapi.js'

type Layer = {
  handle: { stack?: Layer[] }
  route?: { path: unknown; methods: Record<string, boolean> }
}
type RouterStack = { stack: Layer[] }
export type ApiOperation = { method: string; path: string }

function stringPaths(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringPaths)
  throw new Error(
    'OpenAPI coverage requires string route/mount paths; RegExp paths are unsupported.',
  )
}

function joinPath(prefix: string, path: string): string {
  return `${prefix}/${path}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
}

function openApiPath(path: string): string {
  // Express 5 optional/wildcard routes represent multiple URLs, not one OpenAPI path.
  if (/[{}*]/.test(path)) {
    throw new Error(
      `Use explicit paths for OpenAPI coverage instead of optional/wildcard path: ${path}`,
    )
  }
  return path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}')
}

/**
 * Express 5 hides mount paths in matcher functions. Capture use() arguments while
 * constructing/importing the app, then walk its actual route stack. This tooling
 * runs in isolation in CI, never in the server's request path.
 */
export async function collectApiOperations(
  build: () => Express | Promise<Express>,
): Promise<ApiOperation[]> {
  const mounts = new WeakMap<Layer, string[]>()
  const prototype = Router.prototype as { use: (...args: unknown[]) => unknown }
  const originalUse = prototype.use

  prototype.use = function (this: RouterStack, ...args: unknown[]): unknown {
    let first = args[0]
    while (Array.isArray(first) && first.length > 0) first = first[0]
    const paths = typeof first === 'function' ? ['/'] : stringPaths(args[0])
    const before = this.stack.length
    const result = Reflect.apply(originalUse, this, args)
    for (const layer of this.stack.slice(before)) mounts.set(layer, paths)
    return result
  }

  try {
    const app = await build()
    const operations: ApiOperation[] = []
    const walk = (stack: Layer[], prefix: string): void => {
      // Documentation and its static assets are infrastructure, not API operations.
      if (prefix === '/api/docs' || prefix.startsWith('/api/docs/')) return
      for (const layer of stack) {
        if (layer.route) {
          for (const path of stringPaths(layer.route.path)) {
            const fullPath = openApiPath(joinPath(prefix, path))
            if (fullPath !== '/api' && !fullPath.startsWith('/api/')) continue
            for (const [method, enabled] of Object.entries(layer.route.methods)) {
              if (enabled) operations.push({ method, path: fullPath })
            }
          }
        } else if (layer.handle.stack) {
          const paths = mounts.get(layer)
          if (!paths)
            throw new Error('Import and construct all routers inside collectApiOperations().')
          for (const path of paths) walk(layer.handle.stack, joinPath(prefix, path))
        }
      }
    }
    walk((app.router as unknown as RouterStack).stack, '')
    return operations
  } finally {
    prototype.use = originalUse
  }
}

export function assertApiCoverage(
  operations: ApiOperation[],
  document: ReturnType<typeof generateOpenApiDocument>,
): void {
  const actual = new Set(operations.map(({ method, path }) => `${method.toUpperCase()} ${path}`))
  const documented = new Set<string>()
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const method of methods) {
      if (item[method]) documented.add(`${method.toUpperCase()} ${path}`)
    }
  }

  const missing = [...actual].filter((operation) => !documented.has(operation))
  const stale = [...documented].filter((operation) => !actual.has(operation))
  if (missing.length || stale.length) {
    throw new Error(
      [
        ...missing.map((operation) => `Unregistered API route: ${operation}`),
        ...stale.map((operation) => `OpenAPI operation has no API route: ${operation}`),
        'Register each API route in src/docs/ with request/response schemas, auth, policy and requirement IDs (T-23).',
      ].join('\n'),
    )
  }
}
