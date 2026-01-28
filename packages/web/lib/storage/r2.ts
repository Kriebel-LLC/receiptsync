import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/web-env";

const getS3Client = () => {
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
};

export interface UploadUrlParams {
  key: string;
  contentType: string;
  expiresIn?: number;
}

export async function getPresignedUploadUrl({
  key,
  contentType,
  expiresIn = 3600,
}: UploadUrlParams): Promise<string> {
  const client = getS3Client();

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn });
}

export interface DownloadUrlParams {
  key: string;
  expiresIn?: number;
}

export async function getPresignedDownloadUrl({
  key,
  expiresIn = 3600,
}: DownloadUrlParams): Promise<string> {
  // If a public URL is configured, use it instead of presigned URLs
  if (env.R2_PUBLIC_URL) {
    return `${env.R2_PUBLIC_URL}/${key}`;
  }

  const client = getS3Client();

  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn });
}

export async function deleteObject(key: string): Promise<void> {
  const client = getS3Client();

  const command = new DeleteObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
  });

  await client.send(command);
}

export function generateReceiptKey(
  orgId: string,
  receiptId: string,
  filename: string
): string {
  const extension = filename.split(".").pop() || "jpg";
  return `receipts/${orgId}/${receiptId}/original.${extension}`;
}
