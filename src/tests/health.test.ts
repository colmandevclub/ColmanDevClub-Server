import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../app.js'

describe('API Health Check', () => {
  it('GET /api/v1/health should return 200 and healthy status', async () => {
    const response = await request(app).get('/api/v1/health').set('X-Forwarded-Proto', 'https')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      status: 'ok',
      message: 'ColmanDevClub API is healthy',
    })
  })
})
