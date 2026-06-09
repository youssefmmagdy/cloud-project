import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { S3Client } from '@aws-sdk/client-s3'
import { config } from './config.js'

export const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: config.region }),
)

export const s3 = new S3Client({
  region: config.s3Region,
  followRegionRedirects: true,
})
