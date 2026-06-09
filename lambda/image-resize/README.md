# Image Resize Lambda (S3 → Lambda → S3)

Automatically resizes images to **300×300** when uploaded to the **source** bucket. Resized files go to a **separate destination** bucket so the function is never retriggered.

## Architecture

```text
React/EC2 API  →  PutObject  →  SOURCE bucket (originals)
                                      │
                          S3 ObjectCreated event (prefix: students/)
                                      ▼
                              Lambda (sharp 300×300)
                                      │
                                      ▼
                         DESTINATION bucket (resized only)
```

**Infinite loop prevention**

| Rule | Why |
|------|-----|
| **Two different buckets** | Writes to DEST never fire the SOURCE trigger |
| **Trigger only on SOURCE** | S3 notification is attached to source bucket only |
| **Prefix filter `students/`** | Matches your app; ignores stray objects |
| **Skip `resized/` keys** | Extra guard in code |

---

## 1. Create the destination bucket

AWS Console → S3 → **Create bucket** (same Region as source, e.g. `eu-north-1`):

- Name example: `cloud-bucket-285168796605-eu-north-1-an-resized`
- Block public access: ON (recommended)

---

## 2. Package dependencies (sharp needs Linux binaries)

Run from **Git Bash** or WSL on Windows (recommended):

```bash
cd lambda/image-resize
rm -rf node_modules function.zip

docker run --rm -v "$PWD":/var/task public.ecr.aws/lambda/nodejs:22 \
  npm install --omit=dev

zip -r function.zip index.js package.json node_modules
```

**PowerShell alternative** (if Docker is installed):

```powershell
cd lambda\image-resize
Remove-Item -Recurse -Force node_modules, function.zip -ErrorAction SilentlyContinue
docker run --rm -v "${PWD}:/var/task" public.ecr.aws/lambda/nodejs:22 npm install --omit=dev
Compress-Archive -Path index.js, package.json, node_modules -DestinationPath function.zip -Force
```

> Do **not** run `npm install` only on Windows and upload that zip — `sharp` will fail on Lambda.

---

## 3. IAM role and policy

Replace bucket names in `iam-policy.json`, then:

```bash
export AWS_REGION=eu-north-1
export SOURCE_BUCKET=cloud-bucket-285168796605-eu-north-1-an
export DEST_BUCKET=cloud-bucket-285168796605-eu-north-1-an-resized

# Create role
aws iam create-role \
  --role-name image-resize-lambda-role \
  --assume-role-policy-document file://trust-policy.json

# Attach inline policy (edit iam-policy.json placeholders first)
sed "s/SOURCE_BUCKET_NAME/$SOURCE_BUCKET/g; s/DESTINATION_BUCKET_NAME/$DEST_BUCKET/g" iam-policy.json > iam-policy-resolved.json

aws iam put-role-policy \
  --role-name image-resize-lambda-role \
  --policy-name image-resize-s3-logs \
  --policy-document file://iam-policy-resolved.json

# Wait ~10s for IAM propagation
```

**IAM permissions summary**

| Action | Resource |
|--------|----------|
| `s3:GetObject` | `arn:aws:s3:::SOURCE_BUCKET/students/*` |
| `s3:PutObject` | `arn:aws:s3:::DEST_BUCKET/students/*` |
| `logs:*` | CloudWatch Logs |

---

## 4. Create Lambda function

```bash
ROLE_ARN=$(aws iam get-role --role-name image-resize-lambda-role --query 'Role.Arn' --output text)

aws lambda create-function \
  --function-name image-resize \
  --runtime nodejs22.x \
  --handler index.handler \
  --role "$ROLE_ARN" \
  --zip-file fileb://function.zip \
  --timeout 30 \
  --memory-size 512 \
  --environment "Variables={SOURCE_BUCKET=$SOURCE_BUCKET,DEST_BUCKET=$DEST_BUCKET,RESIZE_WIDTH=300,RESIZE_HEIGHT=300,KEY_PREFIX=students/}" \
  --region $AWS_REGION
```

**Update existing function after code changes:**

```bash
aws lambda update-function-code \
  --function-name image-resize \
  --zip-file fileb://function.zip \
  --region $AWS_REGION
```

### Timeout and memory (Console)

**Lambda → Configuration → General configuration → Edit**

| Setting | Recommended | Reason |
|---------|-------------|--------|
| **Memory** | **512 MB** (try 1024 MB for large photos) | More memory = more CPU; `sharp` is CPU-heavy |
| **Timeout** | **30 s** (up to 60 s for very large images) | Download + resize + upload |

CloudWatch → **Monitor** tab → **View logs in CloudWatch** for errors.

---

## 5. S3 trigger (ObjectCreated on SOURCE only)

Allow S3 to invoke Lambda:

```bash
aws lambda add-permission \
  --function-name image-resize \
  --statement-id s3-invoke-image-resize \
  --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn arn:aws:s3:::$SOURCE_BUCKET \
  --region $AWS_REGION
```

Create notification configuration:

```bash
cat > s3-notification.json << EOF
{
  "LambdaFunctionConfigurations": [
    {
      "Id": "image-resize-on-upload",
      "LambdaFunctionArn": "arn:aws:lambda:${AWS_REGION}:YOUR_ACCOUNT_ID:function:image-resize",
      "Events": ["s3:ObjectCreated:Put", "s3:ObjectCreated:CompleteMultipartUpload"],
      "Filter": {
        "Key": {
          "FilterRules": [
            { "Name": "prefix", "Value": "students/" }
          ]
        }
      }
    }
  ]
}
EOF
```

Replace `YOUR_ACCOUNT_ID`, then:

```bash
aws s3api put-bucket-notification-configuration \
  --bucket $SOURCE_BUCKET \
  --notification-configuration file://s3-notification.json
```

**Console:** S3 → **source bucket** → Properties → Event notifications → Create:

- Event: **All object create events** (or Put + CompleteMultipartUpload)
- Prefix: `students/`
- Destination: Lambda `image-resize`

Do **not** add any notification on the **destination** bucket.

---

## 6. Test the Lambda

### A. Test event (no S3)

1. Upload a real image to `s3://$SOURCE_BUCKET/students/test/photo.jpg` first.
2. Lambda console → **Test** → New event → paste `test-event.json` (edit bucket/key).
3. Run test → expect `status: ok` in response.

### B. End-to-end (real trigger)

1. Use your React app to create a student **with a photo**, or:

```bash
aws s3 cp ./photo.jpg s3://$SOURCE_BUCKET/students/99/$(date +%s).jpg
```

2. Wait a few seconds.
3. List destination bucket:

```bash
aws s3 ls s3://$DEST_BUCKET/students/ --recursive
```

4. Download and check dimensions (local ImageMagick):

```bash
aws s3 cp s3://$DEST_BUCKET/students/99/XXXX.jpg ./resized.jpg
# identify resized.jpg  → should show 300x300
```

### C. CloudWatch Logs

```bash
aws logs tail /aws/lambda/image-resize --follow --region $AWS_REGION
```

Look for: `Uploaded resized image to s3://DEST_BUCKET/...`

---

## 7. Verify resized images

| Check | Expected |
|-------|----------|
| Object in **destination** bucket | Same key path as source (`students/{id}/{timestamp}.jpg`) |
| File size | Smaller than original (usually) |
| Dimensions | 300 × 300 JPEG |
| Source bucket | Original unchanged |
| Lambda invocations | +1 per new upload; **not** triggered by destination writes |
| Log line | `Uploaded resized image to s3://...` |

---

## Environment variables

| Variable | Example | Description |
|----------|---------|-------------|
| `SOURCE_BUCKET` | `cloud-bucket-...-an` | Original uploads |
| `DEST_BUCKET` | `cloud-bucket-...-resized` | Resized output |
| `RESIZE_WIDTH` | `300` | Optional |
| `RESIZE_HEIGHT` | `300` | Optional |
| `KEY_PREFIX` | `students/` | Only process keys under this prefix |

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Cannot find module 'sharp'` | Rebuild zip inside Amazon Linux Docker image |
| `Access Denied` | Check IAM policy bucket ARNs and `students/*` path |
| Lambda never runs | Confirm trigger on **source** bucket only; check prefix |
| Infinite invocations | Use **different** DEST bucket; never write back to SOURCE |
| Timeout | Increase memory to 1024 MB and timeout to 60 s |

---

## Project deliverable note

Your assignment requires Lambda on **item creation**. This function runs on **S3 image upload**, which matches “resize images uploaded to S3” when the app uploads a photo for a new/updated student.
