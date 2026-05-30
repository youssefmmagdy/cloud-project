import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { dynamo, s3 } from './aws.js'
import { config } from './config.js'

function assertAwsConfig() {
  if (!config.tableName) {
    throw new Error('DYNAMODB_TABLE_NAME is not set')
  }
  if (!config.sourceBucketName) {
    throw new Error('SOURCE_BUCKET_NAME or S3_BUCKET_NAME is not set')
  }
}

function imageKey(studentId, filename) {
  const ext = filename?.includes('.') ? filename.split('.').pop() : 'jpg'
  return `students/${studentId}/${Date.now()}.${ext}`
}

async function signedImageUrl(key) {
  if (!key) return null
  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  })
  return getSignedUrl(s3, command, { expiresIn: 3600 })
}

async function enrichItem(item) {
  if (!item) return null
  const imageKeys = item.imageKeys || []
  const imageUrls = await Promise.all(imageKeys.map((k) => signedImageUrl(k)))
  const currentKey = imageKeys[imageKeys.length - 1] || null
  return {
    ...item,
    imageUrl: currentKey ? imageUrls[imageUrls.length - 1] : null,
    imageUrls: imageKeys.map((key, i) => ({ key, url: imageUrls[i] })),
  }
}

export async function listItems() {
  assertAwsConfig()
  const result = await dynamo.send(
    new ScanCommand({ TableName: config.tableName }),
  )
  const items = result.Items || []
  return Promise.all(items.map(enrichItem))
}

export async function getItem(studentId) {
  assertAwsConfig()
  const result = await dynamo.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { student_id: studentId },
    }),
  )
  return enrichItem(result.Item)
}

export async function createItem({ student_id, name, age }, file) {
  assertAwsConfig()
  const now = new Date().toISOString()
  const keys = []

  if (file) {
    const key = imageKey(student_id, file.originalname)
    await s3.send(
      new PutObjectCommand({
        Bucket: config.sourceBucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    )
    keys.push(key)
  }

  const item = {
    student_id,
    name,
    age,
    imageKeys: keys,
    createdAt: now,
    updatedAt: now,
  }

  await dynamo.send(
    new PutCommand({
      TableName: config.tableName,
      Item: item,
    }),
  )

  return enrichItem(item)
}

export async function updateItem(studentId, { name, age }, file) {
  assertAwsConfig()
  const existing = await getItemRaw(studentId)
  if (!existing) return null

  const imageKeys = [...(existing.imageKeys || [])]
  const now = new Date().toISOString()

  if (file) {
    const key = imageKey(studentId, file.originalname)
    await s3.send(
      new PutObjectCommand({
        Bucket: config.sourceBucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    )
    imageKeys.push(key)
  }

  const updates = ['updatedAt = :updatedAt', 'imageKeys = :imageKeys']
  const values = {
    ':updatedAt': now,
    ':imageKeys': imageKeys,
  }

  if (name !== undefined) {
    updates.push('#name = :name')
    values[':name'] = name
  }
  if (age !== undefined) {
    updates.push('age = :age')
    values[':age'] = age
  }

  await dynamo.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { student_id: studentId },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeNames: name !== undefined ? { '#name': 'name' } : undefined,
      ExpressionAttributeValues: values,
    }),
  )

  return getItem(studentId)
}

async function getItemRaw(studentId) {
  const result = await dynamo.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { student_id: studentId },
    }),
  )
  return result.Item
}

async function deleteS3Prefix(studentId) {
  const prefix = `students/${studentId}/`
  let continuationToken

  do {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    )

    const objects = listed.Contents || []
    await Promise.all(
      objects.map((obj) =>
        s3.send(
          new DeleteObjectCommand({
            Bucket: config.bucketName,
            Key: obj.Key,
          }),
        ),
      ),
    )
    continuationToken = listed.IsTruncated
      ? listed.NextContinuationToken
      : undefined
  } while (continuationToken)
}

export async function deleteItem(studentId) {
  assertAwsConfig()
  const existing = await getItemRaw(studentId)
  if (!existing) return false

  await deleteS3Prefix(studentId)
  await dynamo.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: { student_id: studentId },
    }),
  )
  return true
}
