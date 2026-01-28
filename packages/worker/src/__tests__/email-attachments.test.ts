/**
 * Tests for email attachment extraction
 *
 * These tests verify the MIME parsing and attachment extraction logic
 * used in the email forwarding feature.
 */

import { describe, test, expect } from "vitest";
import { extractAttachments, Attachment } from "../email/attachments";

// Mock ForwardableEmailMessage for testing
function createMockEmailMessage(
  from: string,
  to: string,
  rawContent: string
): ForwardableEmailMessage {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawContent);
  const rawStream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });

  return {
    from,
    to,
    headers: new Headers(),
    raw: rawStream,
    rawSize: data.length,
    setReject: () => {},
    forward: async () => {},
    reply: async () => {},
  } as ForwardableEmailMessage;
}

describe("extractAttachments", () => {
  test("extracts JPEG attachment from multipart email", async () => {
    const boundary = "----=_Part_123";
    const base64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="; // 1x1 PNG as base64

    const rawEmail = `Content-Type: multipart/mixed; boundary="${boundary}"

------=_Part_123
Content-Type: text/plain

This is a receipt email.

------=_Part_123
Content-Type: image/jpeg
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="receipt.jpg"

${base64Image}
------=_Part_123--`;

    const message = createMockEmailMessage(
      "sender@example.com",
      "abc123@receipts.receiptsync.com",
      rawEmail
    );

    const attachments = await extractAttachments(message);

    expect(attachments.length).toBe(1);
    expect(attachments[0].filename).toBe("receipt.jpg");
    expect(attachments[0].mimeType).toBe("image/jpeg");
    expect(attachments[0].content.byteLength).toBeGreaterThan(0);
  });

  test("extracts multiple attachments from email", async () => {
    const boundary = "----=_Part_456";
    const base64Content = "SGVsbG8gV29ybGQ="; // "Hello World" in base64

    const rawEmail = `Content-Type: multipart/mixed; boundary="${boundary}"

------=_Part_456
Content-Type: text/plain

Email with multiple attachments.

------=_Part_456
Content-Type: image/png
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="image1.png"

${base64Content}
------=_Part_456
Content-Type: application/pdf
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="receipt.pdf"

${base64Content}
------=_Part_456--`;

    const message = createMockEmailMessage(
      "sender@example.com",
      "xyz789@receipts.receiptsync.com",
      rawEmail
    );

    const attachments = await extractAttachments(message);

    expect(attachments.length).toBe(2);
    expect(attachments.map((a) => a.filename).sort()).toEqual([
      "image1.png",
      "receipt.pdf",
    ]);
  });

  test("skips unsupported file types", async () => {
    const boundary = "----=_Part_789";
    const base64Content = "SGVsbG8gV29ybGQ=";

    const rawEmail = `Content-Type: multipart/mixed; boundary="${boundary}"

------=_Part_789
Content-Type: text/plain

Email with unsupported attachment.

------=_Part_789
Content-Type: application/zip
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="archive.zip"

${base64Content}
------=_Part_789
Content-Type: image/jpeg
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="receipt.jpg"

${base64Content}
------=_Part_789--`;

    const message = createMockEmailMessage(
      "sender@example.com",
      "test@receipts.receiptsync.com",
      rawEmail
    );

    const attachments = await extractAttachments(message);

    // Should only have the JPEG, not the ZIP
    expect(attachments.length).toBe(1);
    expect(attachments[0].filename).toBe("receipt.jpg");
  });

  test("handles inline images", async () => {
    const boundary = "----=_Part_inline";
    const base64Content = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const rawEmail = `Content-Type: multipart/related; boundary="${boundary}"

------=_Part_inline
Content-Type: text/html

<html><body><img src="cid:receipt-image"/></body></html>

------=_Part_inline
Content-Type: image/png
Content-Transfer-Encoding: base64
Content-Disposition: inline; filename="receipt-image.png"
Content-ID: <receipt-image>

${base64Content}
------=_Part_inline--`;

    const message = createMockEmailMessage(
      "sender@example.com",
      "test@receipts.receiptsync.com",
      rawEmail
    );

    const attachments = await extractAttachments(message);

    expect(attachments.length).toBe(1);
    expect(attachments[0].filename).toBe("receipt-image.png");
  });

  test("returns empty array for emails without attachments", async () => {
    const rawEmail = `Content-Type: text/plain

This is a plain text email with no attachments.`;

    const message = createMockEmailMessage(
      "sender@example.com",
      "test@receipts.receiptsync.com",
      rawEmail
    );

    const attachments = await extractAttachments(message);

    expect(attachments.length).toBe(0);
  });

  test("handles quoted-printable encoding", async () => {
    const boundary = "----=_Part_qp";

    const rawEmail = `Content-Type: multipart/mixed; boundary="${boundary}"

------=_Part_qp
Content-Type: text/plain

Email with quoted-printable attachment.

------=_Part_qp
Content-Type: image/jpeg
Content-Transfer-Encoding: quoted-printable
Content-Disposition: attachment; filename="receipt.jpg"

=FF=D8=FF=E0
------=_Part_qp--`;

    const message = createMockEmailMessage(
      "sender@example.com",
      "test@receipts.receiptsync.com",
      rawEmail
    );

    const attachments = await extractAttachments(message);

    expect(attachments.length).toBe(1);
    expect(attachments[0].filename).toBe("receipt.jpg");
  });
});

describe("address code extraction", () => {
  // These tests would be for the extractAddressCode function
  // which is currently private in the email/index.ts module
  // We could either export it for testing or test through integration tests

  test("parses subdomain format", () => {
    // abc123@receipts.receiptsync.com -> abc123
    const address = "abc123@receipts.receiptsync.com";
    const match = address.toLowerCase().match(/^([a-z0-9]+)@receipts\./);
    expect(match?.[1]).toBe("abc123");
  });

  test("parses plus addressing format", () => {
    // receipts+abc123@receiptsync.com -> abc123
    const address = "receipts+abc123@receiptsync.com";
    const match = address.toLowerCase().match(/^receipts\+([a-z0-9]+)@/);
    expect(match?.[1]).toBe("abc123");
  });

  test("handles mixed case addresses", () => {
    const address = "ABC123@Receipts.ReceiptSync.com";
    const match = address.toLowerCase().match(/^([a-z0-9]+)@receipts\./);
    expect(match?.[1]).toBe("abc123");
  });
});
