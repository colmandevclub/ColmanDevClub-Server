import express, { type Express, type Request, type Response } from 'express'

export const app: Express = express()

app.use(express.json())

app.get('/api/v1/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'ColmanDevClub API is healthy' })
})

export default app
