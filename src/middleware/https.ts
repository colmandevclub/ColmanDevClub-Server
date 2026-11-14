import type { RequestHandler } from 'express'
import { env } from '../config/env.js'

export const requireHttps: RequestHandler = (req, res, next) => {
  if (req.secure) {
    next()
    return
  }

  // A configured origin prevents Host/X-Forwarded-Host from controlling redirects.
  // Concatenation preserves the path/query without interpreting // as another host.
  res.redirect(308, `${env.APP_ORIGIN}${req.originalUrl}`)
}
