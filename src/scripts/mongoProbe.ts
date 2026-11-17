import mongoose from 'mongoose'
import { connectMongo } from '../config/mongoose.js'

const keepDocument = process.argv.includes('--keep')

async function main(): Promise<void> {
  try {
    const conn = await connectMongo()
    const Probe = mongoose.model(
      'MongoProbe',
      new mongoose.Schema({ ok: Boolean, label: String, createdAt: Date }),
      'mongo_probe',
    )

    if (!keepDocument) {
      await Probe.deleteMany({})
    }

    const created = await Probe.create({ ok: true, label: 'probe-run', createdAt: new Date() })
    const found = await Probe.findById(created._id).lean()

    console.log(
      JSON.stringify(
        {
          readyState: conn.connection.readyState,
          database: conn.connection.name,
          keepDocument,
          found,
        },
        null,
        2,
      ),
    )

    if (!keepDocument) {
      await Probe.deleteMany({ _id: created._id })
    }

    await mongoose.disconnect()
  } catch (error) {
    console.error('MONGO_PROBE_FAILED')
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

void main()
