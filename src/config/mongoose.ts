import mongoose from 'mongoose'

mongoose.set('sanitizeFilter', true)
mongoose.set('strictQuery', true)

export default mongoose
