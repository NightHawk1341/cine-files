import { config } from './config';
import crypto from 'crypto';

function generateS3Key(filename: string, folder: string): string {
  const ext = filename.split('.').pop() || '';
  const hash = crypto.randomBytes(8).toString('hex');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  return `${folder}/${date}/${hash}.${ext}`;
}

function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = crypto.createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
  return crypto.createHmac('sha256', kService).update('aws4_request').digest();
}

export async function uploadToS3(
  file: Buffer,
  filename: string,
  mimeType: string,
  folder = 'uploads'
): Promise<string> {
  const key = generateS3Key(filename, folder);
  const { endpoint, region, bucket, accessKey, secretKey } = config.s3;

  const url = `${endpoint}/${bucket}/${key}`;
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const payloadHash = crypto.createHash('sha256').update(file).digest('hex');

  const canonicalHeaders = [
    `content-type:${mimeType}`,
    `host:${endpoint.replace('https://', '')}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n');

  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT',
    `/${bucket}/${key}`,
    '',
    canonicalHeaders,
    '',
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const signingKey = getSignatureKey(secretKey, dateStamp, region, 's3');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Date': amzDate,
      Authorization: authorization,
    },
    body: new Uint8Array(file),
  });

  if (!response.ok) {
    throw new Error(`S3 upload failed: ${response.statusText}`);
  }

  return url;
}

export function getPublicUrl(key: string): string {
  return `${config.s3.endpoint}/${config.s3.bucket}/${key}`;
}
