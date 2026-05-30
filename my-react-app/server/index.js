import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import itemsRouter from './routes/items.js'

const app = express()
const PORT = config.port

app.use(cors())
app.use(express.json())

app.get('/', (_req, res) => {
  res.json({
    message: 'Student Registry API — use the React app at http://localhost:5173',
    endpoints: {
      health: '/health',
      students: '/api/items',
    },
  })
})

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'cloud-catalog-api',
    region: config.region,
    table: config.tableName || '(not set)',
    bucket: config.bucketName || '(not set)',
    timestamp: new Date().toISOString(),
  })
})

app.use('/api/items', itemsRouter)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`)
  console.log(`Region: ${config.region} | S3: ${config.s3Region} | Table: ${config.tableName}`)
  console.log(`Bucket: ${config.bucketName || '(not set)'}`)
})
