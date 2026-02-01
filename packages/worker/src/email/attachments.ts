/**
 * Attachment extracted from an email
 */
export interface Attachment {
  filename: string;
  mimeType: string;
  content: ArrayBuffer;
  size: number;
}

/**
 * Supported attachment MIME types for receipt processing
 */
const SUPPORTED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  // PDFs
  "application/pdf",
]);

/**
 * Maximum attachment size (10MB)
 */
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

/**
 * Extract attachments from an incoming email message
 *
 * Handles:
 * - Regular MIME attachments (files attached to the email)
 * - Inline images (embedded in HTML email body)
 * - Multiple attachments per email
 */
export async function extractAttachments(
  message: ForwardableEmailMessage
): Promise<Attachment[]> {
  const attachments: Attachment[] = [];

  // Get the raw email content - message.raw is a ReadableStream
  const rawEmail = message.raw;

  // Parse the email to extract attachments
  // We need to read the raw email as text to parse MIME parts
  const emailText = await streamToText(rawEmail);

  // Parse MIME structure
  const parts = parseMimeParts(emailText);

  for (const part of parts) {
    // Check if this is a supported attachment type
    if (!SUPPORTED_MIME_TYPES.has(part.contentType.toLowerCase())) {
      console.log(`Skipping unsupported content type: ${part.contentType}`);
      continue;
    }

    // Check size limit
    if (part.content.byteLength > MAX_ATTACHMENT_SIZE) {
      console.log(
        `Skipping attachment ${part.filename}: size ${part.content.byteLength} exceeds limit ${MAX_ATTACHMENT_SIZE}`
      );
      continue;
    }

    attachments.push({
      filename: part.filename || `attachment-${Date.now()}.${getExtension(part.contentType)}`,
      mimeType: part.contentType,
      content: part.content,
      size: part.content.byteLength,
    });
  }

  return attachments;
}

interface MimePart {
  contentType: string;
  filename?: string;
  content: ArrayBuffer;
  isInline: boolean;
}

/**
 * Parse MIME parts from raw email text
 * This is a simplified parser that handles common email formats
 */
function parseMimeParts(emailText: string): MimePart[] {
  const parts: MimePart[] = [];

  // Find the boundary from Content-Type header
  const boundaryMatch = emailText.match(/boundary="?([^"\r\n;]+)"?/i);
  if (!boundaryMatch) {
    // Not a multipart email, check if it's a single-part with attachment
    return parseSinglePart(emailText);
  }

  const boundary = boundaryMatch[1];
  const boundaryRegex = new RegExp(`--${escapeRegex(boundary)}`, "g");

  // Split by boundary
  const sections = emailText.split(boundaryRegex);

  for (const section of sections) {
    if (!section.trim() || section.trim() === "--") {
      continue;
    }

    const part = parseMimeSection(section);
    if (part) {
      parts.push(part);
    }
  }

  return parts;
}

/**
 * Parse a single MIME section
 */
function parseMimeSection(section: string): MimePart | null {
  // Split headers from body
  const headerBodySplit = section.indexOf("\r\n\r\n");
  if (headerBodySplit === -1) {
    // Try with just \n\n
    const altSplit = section.indexOf("\n\n");
    if (altSplit === -1) {
      return null;
    }
  }

  const splitIndex =
    section.indexOf("\r\n\r\n") !== -1
      ? section.indexOf("\r\n\r\n")
      : section.indexOf("\n\n");

  const headers = section.substring(0, splitIndex);
  const body = section.substring(splitIndex).trim();

  // Extract Content-Type
  const contentTypeMatch = headers.match(/Content-Type:\s*([^;\r\n]+)/i);
  if (!contentTypeMatch) {
    return null;
  }

  const contentType = contentTypeMatch[1].trim().toLowerCase();

  // Check if it's an attachment or inline
  const dispositionMatch = headers.match(/Content-Disposition:\s*([^;\r\n]+)/i);
  const isAttachment =
    dispositionMatch?.[1].toLowerCase().includes("attachment") ?? false;
  const isInline =
    dispositionMatch?.[1].toLowerCase().includes("inline") ?? false;

  // Only process attachments and inline images
  if (!isAttachment && !isInline && !contentType.startsWith("image/")) {
    return null;
  }

  // Extract filename
  let filename: string | undefined;
  const filenameMatch =
    headers.match(/filename="?([^"\r\n;]+)"?/i) ||
    headers.match(/name="?([^"\r\n;]+)"?/i);
  if (filenameMatch) {
    filename = filenameMatch[1].trim();
  }

  // Extract Content-Transfer-Encoding
  const encodingMatch = headers.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);
  const encoding = encodingMatch?.[1].trim().toLowerCase() || "7bit";

  // Decode the body based on encoding
  let content: ArrayBuffer;
  if (encoding === "base64") {
    content = base64ToArrayBuffer(body.replace(/[\r\n\s]/g, ""));
  } else if (encoding === "quoted-printable") {
    content = quotedPrintableToArrayBuffer(body);
  } else {
    // 7bit or 8bit - treat as plain text
    const encoded = new TextEncoder().encode(body);
    content = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
  }

  return {
    contentType,
    filename,
    content,
    isInline,
  };
}

/**
 * Parse a single-part email (non-multipart)
 */
function parseSinglePart(emailText: string): MimePart[] {
  // For single-part emails, there's usually no useful attachment
  // Just return empty array
  return [];
}

/**
 * Convert base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // In Cloudflare Workers, we can use atob
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  // Ensure we return an ArrayBuffer, not ArrayBufferLike
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/**
 * Convert quoted-printable encoded string to ArrayBuffer
 */
function quotedPrintableToArrayBuffer(qp: string): ArrayBuffer {
  // Decode quoted-printable
  const decoded = qp
    .replace(/=\r?\n/g, "") // Remove soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );

  const encoded = new TextEncoder().encode(decoded);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
}

/**
 * Convert ReadableStream to text
 */
async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Combine chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder().decode(combined);
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Get file extension from MIME type
 */
function getExtension(mimeType: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "application/pdf": "pdf",
  };
  return extensions[mimeType.toLowerCase()] || "bin";
}
