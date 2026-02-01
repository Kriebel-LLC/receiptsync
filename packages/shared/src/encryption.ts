/**
 * Encryption utilities for storing sensitive data like OAuth tokens
 * Uses AES-GCM encryption which is available in Web Crypto API
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM

// Helper to convert to ArrayBuffer in a way that works across different runtimes
// (Cloudflare Workers have stricter ArrayBuffer types)
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as unknown as ArrayBuffer;
}

/**
 * Derives a CryptoKey from a secret string
 */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const secretData = encoder.encode(secret);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(secretData),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const saltData = encoder.encode("receiptsync-salt");
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(saltData),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a string using AES-GCM
 * Returns a base64-encoded string containing IV + ciphertext
 */
export async function encrypt(
  plaintext: string,
  secretKey: string
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Generate a random IV for each encryption
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await deriveKey(secretKey);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as unknown as ArrayBuffer },
    key,
    toArrayBuffer(data)
  );

  // Combine IV + ciphertext
  const ciphertextArray = new Uint8Array(ciphertext);
  const combined = new Uint8Array(iv.length + ciphertextArray.length);
  combined.set(iv);
  combined.set(ciphertextArray, iv.length);

  // Return as base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts a base64-encoded string that was encrypted with encrypt()
 */
export async function decrypt(
  encryptedBase64: string,
  secretKey: string
): Promise<string> {
  // Decode from base64
  const combined = Uint8Array.from(atob(encryptedBase64), (c) =>
    c.charCodeAt(0)
  );

  // Split IV and ciphertext
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const key = await deriveKey(secretKey);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv as unknown as ArrayBuffer },
    key,
    toArrayBuffer(ciphertext)
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}
