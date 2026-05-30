import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Local .env first, then parent Cloud/.env — override shell env vars
dotenv.config({ path: path.resolve(__dirname, '../.env') })
dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  override: true,
})

const region = process.env.AWS_REGION || 'eu-north-1'

export const config = {
  port: Number(process.env.PORT) || 3001,
  region,
  s3Region: process.env.S3_REGION || region,
  tableName: process.env.DYNAMODB_TABLE_NAME || 'cloud_dataset',
  bucketName:
    process.env.SOURCE_BUCKET_NAME || process.env.S3_BUCKET_NAME || '',
  sourceBucketName:
    process.env.SOURCE_BUCKET_NAME || process.env.S3_BUCKET_NAME || '',
  destBucketName:
    process.env.DEST_BUCKET_NAME ||
    process.env.RESIZED_BUCKET_NAME ||
    process.env.S3_DESTINATION_NAME ||
    '',
}
