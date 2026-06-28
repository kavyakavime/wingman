/** Parse "Subject: …\n\n[body]" rewrite text from segment_rewrites. */
export function parseRewriteDraft(rewrittenDraft: string): {
  subject: string;
  body: string;
} {
  const text = rewrittenDraft.trim();
  if (!text) {
    throw new Error("Rewrite draft is empty.");
  }

  const subjectMatch = text.match(/^Subject:\s*(.+?)(?:\n\n|\n)/i);
  if (!subjectMatch) {
    throw new Error(
      'Rewrite draft must start with "Subject: …" followed by a blank line and body.',
    );
  }

  const subject = subjectMatch[1].trim();
  const bodyStart = subjectMatch[0].length;
  const body = text.slice(bodyStart).trim();

  if (!subject) {
    throw new Error("Rewrite draft is missing a subject line.");
  }
  if (!body) {
    throw new Error("Rewrite draft is missing a body after the subject.");
  }

  return { subject, body };
}

/** Plain text → minimal HTML for Orange Slice transactional send. */
export function plainTextToHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}
