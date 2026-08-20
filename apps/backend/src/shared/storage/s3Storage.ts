import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { env } from '../../config/env.js';
import type { StoragePort } from './storagePort.js';

const s3Client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  // The AWS SDK v3 body is a web ReadableStream in some runtimes and a
  // Node.js Readable in others, depending on the environment — this
  // handles both without importing runtime-specific helper packages.
  const maybeByteArrayStream = stream as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof maybeByteArrayStream.transformToByteArray === 'function') {
    const bytes = await maybeByteArrayStream.transformToByteArray();
    return Buffer.from(bytes);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export const s3Storage: StoragePort = {
  async putObject(key, body, contentType) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  },

  async getObject(key) {
    const result = await s3Client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    if (!result.Body) {
      throw new Error(`S3 object has no body: ${key}`);
    }
    return streamToBuffer(result.Body);
  },

  async deleteObject(key) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  },

  getPublicUrl(key) {
    return `${env.S3_PUBLIC_BASE_URL}/${key}`;
  },
};
