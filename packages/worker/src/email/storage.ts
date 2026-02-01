import { Attachment } from "./attachments";

/**
 * Store an attachment in R2 storage
 *
 * @param bucket - R2 bucket binding
 * @param key - Storage key (path within bucket)
 * @param attachment - Attachment data to store
 * @returns R2 object metadata
 */
export async function storeAttachmentInR2(
  bucket: R2Bucket,
  key: string,
  attachment: Attachment
): Promise<R2Object> {
  const metadata: R2HTTPMetadata = {
    contentType: attachment.mimeType,
  };

  const customMetadata: Record<string, string> = {
    originalFilename: attachment.filename,
    size: attachment.size.toString(),
    uploadedAt: new Date().toISOString(),
  };

  const result = await bucket.put(key, attachment.content, {
    httpMetadata: metadata,
    customMetadata,
  });

  console.log(`Stored attachment in R2: ${key} (${attachment.size} bytes)`);

  return result;
}

/**
 * Generate a signed URL for accessing an R2 object
 * Note: This requires the bucket to be configured with a custom domain
 * or using Workers to serve the content
 *
 * @param bucket - R2 bucket binding
 * @param key - Storage key (path within bucket)
 * @returns URL string for accessing the object
 */
export function getR2ObjectUrl(bucketName: string, key: string): string {
  // For now, return a relative URL that would be served through the worker
  // In production, this could be a CDN URL or signed URL
  return `/api/receipts/images/${encodeURIComponent(key)}`;
}

/**
 * Retrieve an object from R2 storage
 *
 * @param bucket - R2 bucket binding
 * @param key - Storage key (path within bucket)
 * @returns R2 object with body, or null if not found
 */
export async function getFromR2(
  bucket: R2Bucket,
  key: string
): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}

/**
 * Delete an object from R2 storage
 *
 * @param bucket - R2 bucket binding
 * @param key - Storage key (path within bucket)
 */
export async function deleteFromR2(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
  console.log(`Deleted object from R2: ${key}`);
}

/**
 * List objects in R2 storage with a given prefix
 *
 * @param bucket - R2 bucket binding
 * @param prefix - Key prefix to filter by
 * @returns List of R2 objects
 */
export async function listR2Objects(
  bucket: R2Bucket,
  prefix: string
): Promise<R2Objects> {
  return bucket.list({ prefix });
}
