import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { app } from '../app.js'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create()
  const uri = mongoServer.getUri()
  console.log(`Test MongoDB running at: ${uri}`)
})

afterAll(async () => {
  if (mongoServer) {
    await mongoServer.stop()
  }
})

describe('API Health Check', () => {
  it('GET /api/v1/health should return 200 and healthy status', async () => {
    const response = await request(app).get('/api/v1/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      status: 'ok',
      message: 'ColmanDevClub API is healthy',
    })
  })
})
