/**
 * Turn an uploaded ICP document into a plain-text Fiber search query via OpenAI.
 */

export type IcpAttachmentPayload = {
  fileName: string;
  mimeType: string;
  /** Base64-encoded file bytes (no data: URL prefix). */
  base64?: string;
  /** Plain-text file contents (e.g. .txt read on the client). */
  textContent?: string;
};

export class IcpAttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IcpAttachmentError";
  }
}

const EXTRACTION_SYSTEM = `You extract ideal customer profile (ICP) descriptions for B2B lead discovery.
Return ONLY a concise plain-text search query (1-4 sentences) covering target job titles/roles, company type or industry, company stage or size, geography, and any other explicit filters from the document.
No markdown, bullet lists, labels, or preamble.`;

function buildExtractionPrompt(fileName: string, userHint?: string): string {
  let text = `Extract the ICP (ideal customer profile) from the document "${fileName}".`;
  if (userHint?.trim()) {
    text += ` Also incorporate this additional context from the user: "${userHint.trim()}".`;
  }
  return text;
}

async function openAiChatCompletion(
  apiKey: string,
  messages: Array<{ role: string; content: unknown }>,
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new IcpAttachmentError(
      `OpenAI could not read the attachment (${response.status}): ${body.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new IcpAttachmentError("OpenAI returned an empty ICP from the attachment.");
  }
  return content;
}

async function extractIcpFromAttachment(
  apiKey: string,
  attachment: IcpAttachmentPayload,
  userHint?: string,
): Promise<string> {
  const prompt = buildExtractionPrompt(attachment.fileName, userHint);

  if (attachment.textContent != null) {
    return openAiChatCompletion(apiKey, [
      { role: "system", content: EXTRACTION_SYSTEM },
      {
        role: "user",
        content: `${prompt}\n\nDocument contents:\n${attachment.textContent}`,
      },
    ]);
  }

  if (attachment.base64) {
    const dataUrl = `data:${attachment.mimeType};base64,${attachment.base64}`;
    return openAiChatCompletion(apiKey, [
      { role: "system", content: EXTRACTION_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "file",
            file: {
              filename: attachment.fileName,
              file_data: dataUrl,
            },
          },
        ],
      },
    ]);
  }

  throw new IcpAttachmentError("Attachment has no readable content.");
}

/** Merge optional textarea hint + attachment into one Fiber-ready ICP string. */
export async function resolveFiberIcpQuery(
  openaiApiKey: string,
  userIcp: string,
  attachment?: IcpAttachmentPayload,
): Promise<string> {
  const hint = userIcp.trim();

  if (!attachment) {
    if (!hint) {
      throw new IcpAttachmentError("Enter an ICP description before searching.");
    }
    return hint;
  }

  const fromDocument = await extractIcpFromAttachment(
    openaiApiKey,
    attachment,
    hint || undefined,
  );
  const resolved = fromDocument.trim();
  if (!resolved) {
    throw new IcpAttachmentError("Could not extract an ICP from the attachment.");
  }
  return resolved;
}
