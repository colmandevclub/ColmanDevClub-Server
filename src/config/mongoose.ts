import mongoose from 'mongoose'
import { env } from './env.js'

type MongoCache = {
  connection: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  var __cdcMongoCache: MongoCache | undefined
}

export function getMongoCache(): MongoCache {
  const globalWithMongo = globalThis as typeof globalThis & {
    __cdcMongoCache?: MongoCache
  }

  if (!globalWithMongo.__cdcMongoCache) {
    globalWithMongo.__cdcMongoCache = {
      connection: null,
      promise: null,
    }
  }

  return globalWithMongo.__cdcMongoCache
}

export function getDatabaseNameForEnvironment(environment: typeof env.NODE_ENV = env.NODE_ENV): string {
  switch (environment) {
    case 'production':
      return 'colman-devclub-prod'
    case 'test':
      return 'colman-devclub-test'
    case 'development':
    default:
      return 'dev_club'
  }
}

export function resolveMongoUri(
  overrideUri: string | undefined = process.env.MONGO_URI ?? env.MONGO_URI,
  environment: typeof env.NODE_ENV = env.NODE_ENV,
): string {
  if (overrideUri) {
    return overrideUri
  }

  if (environment === 'production') {
    throw new Error('MONGO_URI is required for production database access.')
  }

  return `mongodb://127.0.0.1:27017/${getDatabaseNameForEnvironment(environment)}`
}

export async function resetMongoConnection(): Promise<void> {
  const cache = getMongoCache()
  cache.promise = null
  cache.connection = null

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect().catch(() => undefined)
  }
}

export async function connectMongo(uri = resolveMongoUri()): Promise<typeof mongoose> {
  const cache = getMongoCache()

  if (cache.connection && mongoose.connection.readyState === 1) {
    return cache.connection
  }

  if (cache.promise) {
    return cache.promise
  }

  const connectionPromise = mongoose
    .connect(uri, {
      dbName: getDatabaseNameForEnvironment(),
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      autoIndex: false,
    })
    .then((connection) => {
      cache.connection = connection
      cache.promise = null
      return connection
    })
    .catch((error) => {
      cache.promise = null
      throw error
    })

  cache.promise = connectionPromise
  return connectionPromise
}

export async function getMongoConnection(): Promise<typeof mongoose> {
  return connectMongo(resolveMongoUri())
}

mongoose.set('sanitizeFilter', true)
mongoose.set('strictQuery', true)
mongoose.set('bufferCommands', false)

export default mongoose
