import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'

const s3 = new S3Client({})

const SOURCE_BUCKET = process.env.SOURCE_BUCKET
const DEST_BUCKET = process.env.DEST_BUCKET
const WIDTH = Number(process.env.RESIZE_WIDTH) || 300
const HEIGHT = Number(process.env.RESIZE_HEIGHT) || 300
const KEY_PREFIX = process.env.KEY_PREFIX || 'students/'

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])

function streamToBuffer(body) {
  return new Promise((resolve, reject) => {
    const chunks = []
    body.on('data', (chunk) => chunks.push(chunk))
    body.on('error', reject)
    body.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

/** Skip non-images and keys that must never retrigger processing */
function shouldProcess(bucket, key) {
  if (!key) return false
  if (bucket !== SOURCE_BUCKET) return false
  if (!key.startsWith(KEY_PREFIX)) return false
  if (key.includes('/resized/') || key.startsWith('resized/')) return false

  const ext = key.split('.').pop()?.toLowerCase()
  return IMAGE_EXTENSIONS.has(ext)
}

export const handler = async (event) => {
  console.log('Received event:', JSON.stringify(event))

  if (!SOURCE_BUCKET || !DEST_BUCKET) {
    throw new Error('SOURCE_BUCKET and DEST_BUCKET environment variables are required')
  }

  if (SOURCE_BUCKET === DEST_BUCKET) {
    throw new Error('SOURCE_BUCKET and DEST_BUCKET must be different to prevent infinite loops')
  }

  const records = event.Records || []
  const results = []

  for (const record of records) {
    const eventName = record.eventName || ''
    if (!eventName.startsWith('ObjectCreated')) {
      console.log(`Skip event type: ${eventName}`)
      continue
    }

    const bucket = record.s3?.bucket?.name
    const key = decodeURIComponent(
      (record.s3?.object?.key || '').replace(/\+/g, ' '),
    )

    if (!shouldProcess(bucket, key)) {
      console.log(`Skip: s3://${bucket}/${key}`)
      results.push({ key, status: 'skipped' })
      continue
    }

    try {
      console.log(`Downloading s3://${bucket}/${key}`)

      const { Body, ContentType } = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      )
      const original = await streamToBuffer(Body)

      console.log(`Resizing to ${WIDTH}x${HEIGHT}`)
      const resized = await sharp(original)
        .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 85 })
        .toBuffer()

      const destKey = key

      await s3.send(
        new PutObjectCommand({
          Bucket: DEST_BUCKET,
          Key: destKey,
          Body: resized,
          ContentType: 'image/jpeg',
          Metadata: {
            'source-bucket': bucket,
            'source-key': key,
            'resized-by': 'image-resize-lambda',
          },
        }),
      )

      console.log(`Uploaded resized image to s3://${DEST_BUCKET}/${destKey}`)
      results.push({ key, destKey, status: 'ok', bytes: resized.length })
    } catch (err) {
      console.error(`Error processing s3://${bucket}/${key}:`, err)
      results.push({ key, status: 'error', message: err.message })
      throw err
    }
  }

  const summary = { processed: results.length, results }
  console.log('Summary:', JSON.stringify(summary))
  return summary
}
