import type { IcpAttachmentPayload } from "./icpAttachment";

/** Stay under Convex action argument size limits (~1 MiB). */
export const MAX_ICP_ATTACHMENT_BYTES = 750_000;

export function guessAttachmentMime(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".doc")) return "application/msword";
  return "application/octet-stream";
}

export async function readIcpAttachmentFile(file: File): Promise<IcpAttachmentPayload> {
  if (file.size > MAX_ICP_ATTACHMENT_BYTES) {
    throw new Error(
      `Attachment must be under ${Math.round(MAX_ICP_ATTACHMENT_BYTES / 1024)} KB.`,
    );
  }

  const mimeType = file.type || guessAttachmentMime(file.name);

  if (mimeType === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
    return {
      fileName: file.name,
      mimeType: "text/plain",
      textContent: await file.text(),
    };
  }

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read attachment."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read attachment."));
    reader.readAsDataURL(file);
  });

  return { fileName: file.name, mimeType, base64 };
}
