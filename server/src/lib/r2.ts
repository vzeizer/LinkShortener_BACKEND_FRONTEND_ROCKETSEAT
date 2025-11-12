import { S3Client } from '@aws-sdk/client-s3';
import { env } from '../env';

export const r2 = new S3Client({
  region: 'auto',
  // O endpoint do R2 é específico da sua conta
  endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.CLOUDFLARE_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_SECRET_ACCESS_KEY,
  },
});