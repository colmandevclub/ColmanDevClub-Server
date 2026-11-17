import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose, {
  connectMongo,
  resetMongoConnection,
} from '../config/mongoose.js'

describe('MongoDB connection lifecycle', () => {
  let memoryServer: MongoMemoryServer | undefined

  beforeEach(async () => {
    await resetMongoConnection()
    delete process.env.MONGO_URI
    memoryServer = await MongoMemoryServer.create()
  }, 60000)

  afterAll(async () => {
    await resetMongoConnection()
    await mongoose.disconnect().catch(() => undefined)
    await memoryServer?.stop()
  }, 60000)

  it('reuses a cached connection across concurrent requests', async () => {
    const [first, second] = await Promise.all([
      connectMongo(memoryServer!.getUri()),
      connectMongo(memoryServer!.getUri()),
    ])

    expect(first).toBe(second)
    expect(mongoose.connection.readyState).toBe(1)

    const Model = mongoose.model('MongoReuse', new mongoose.Schema({ name: String }))
    await Model.create({ name: 'shared' })
    expect(await Model.countDocuments()).toBe(1)
    mongoose.deleteModel('MongoReuse')
  })

  it(
    'retries after a failed connect and remains available to services',
    async () => {
      await expect(connectMongo('mongodb://127.0.0.1:65535/should-fail')).rejects.toThrow()

      const connection = await connectMongo(memoryServer!.getUri())
      const ping = await connection.connection.db!.admin().ping()

      expect(ping.ok).toBe(1)

      const Model = mongoose.model('MongoRetry', new mongoose.Schema({ ok: Boolean }))
      await Model.create({ ok: true })
      expect(await Model.countDocuments({ ok: true })).toBe(1)
      mongoose.deleteModel('MongoRetry')
    },
    30000,
  )
})
