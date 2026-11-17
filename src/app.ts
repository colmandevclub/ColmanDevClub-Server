import express, { type Express, type Request, type Response, type Router } from 'express'
import cookieParser from 'cookie-parser'
import * as helmetModule from 'helmet'
import './config/mongoose.js'

type HelmetFactory = (options?: Record<string, unknown>) => (
  req: unknown,
  res: unknown,
  next: (err?: unknown) => void,
) => void

const helmet = ((helmetModule as unknown as { default?: HelmetFactory }).default ??
  (helmetModule as unknown as HelmetFactory)) as HelmetFactory
import { csrfGuard } from './middleware/csrf.js'
import { errorHandler, notFound } from './middleware/errorHandler.js'
import { requireHttps } from './middleware/https.js'
import { requestContext } from './middleware/requestContext.js'
import { apiDocsEnabled, createDocsRouter } from './docs/router.js'

export function createApp(apiRouter: Router = express.Router()): Express {
  const app = express()

  // Trust only the nearest reverse proxy, which must overwrite forwarded headers.
  app.set('trust proxy', 1)
  app.use(
    helmet({ strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true } }),
  )
  app.use(requestContext)
  app.use(requireHttps)
  app.use(cookieParser())
  app.use(express.json({ limit: '100kb' }))
  app.use(csrfGuard)

  app.get('/api/v1/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', message: 'ColmanDevClub API is healthy' })
  })
  app.use('/api/v1', apiRouter)
  if (apiDocsEnabled()) app.use('/api/docs', createDocsRouter())
  app.use(notFound)
  app.use(errorHandler)

  return app
}

export const app = createApp()

export default app
