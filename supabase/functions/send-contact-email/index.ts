import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const MAX_FILES = 3;
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES = 7 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/zip",
  "text/plain",
  "application/octet-stream",
]);

type ContactAttachment = {
  filename?: unknown;
  content?: unknown;
  contentType?: unknown;
};

type ContactPayload = {
  name?: unknown;
  company?: unknown;
  email?: unknown;
  telephone?: unknown;
  requirementType?: unknown;
  description?: unknown;
  website?: unknown;
  pageUrl?: unknown;
  attachments?: unknown;
};

function corsHeaders(request: Request): HeadersInit {
  const configuredOrigins = (Deno.env.get("CONTACT_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const requestOrigin = request.headers.get("origin") || "";
  const allowOrigin = configuredOrigins.length === 0
    ? "*"
    : configuredOrigins.includes(requestOrigin)
    ? requestOrigin
    : configuredOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] || character);
}

function safeFilename(value: unknown): string {
  return text(value, 180)
    .replace(/[\r\n\0]/g, "")
    .replace(/[\\/]/g, "-") || "attachment";
}

function base64DecodedSize(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function parseRecipients(value: string): string[] {
  return value
    .split(",")
    .map((email) => email.trim())
    .filter((email) => validateEmail(email));
}

function validateAttachments(raw: unknown): Array<{ filename: string; content: string; content_type: string }> {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error("Invalid attachments payload.");
  if (raw.length > MAX_FILES) throw new Error(`A maximum of ${MAX_FILES} files is allowed.`);

  let totalBytes = 0;
  return raw.map((item: ContactAttachment) => {
    const filename = safeFilename(item?.filename);
    const content = text(item?.content, 12_000_000).replace(/^data:[^;]+;base64,/, "");
    const contentType = text(item?.contentType, 120) || "application/octet-stream";

    if (!content || !/^[A-Za-z0-9+/=]+$/.test(content)) {
      throw new Error(`Invalid attachment content for ${filename}.`);
    }
    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      throw new Error(`Unsupported attachment type for ${filename}.`);
    }

    const bytes = base64DecodedSize(content);
    if (bytes > MAX_FILE_BYTES) throw new Error(`${filename} exceeds the 3 MB limit.`);
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Total attachment size exceeds 7 MB.");

    return {
      filename,
      content,
      content_type: contentType,
    };
  });
}

serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { success: false, error: "Method not allowed." }, 405);
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
    const toRecipients = parseRecipients(Deno.env.get("CONTACT_TO_EMAIL") || "");
    const fromEmail = Deno.env.get("CONTACT_FROM_EMAIL") || "Therm-X Website <onboarding@resend.dev>";

    if (!resendApiKey || toRecipients.length === 0) {
      console.error("Missing RESEND_API_KEY or CONTACT_TO_EMAIL secret.");
      return jsonResponse(request, { success: false, error: "Email service is not configured." }, 503);
    }

    const body = await request.json() as ContactPayload;

    // Honeypot: silently accept likely bot submissions without sending an email.
    if (text(body.website, 200)) {
      return jsonResponse(request, { success: true });
    }

    const name = text(body.name, 120);
    const company = text(body.company, 160);
    const email = text(body.email, 254).toLowerCase();
    const telephone = text(body.telephone, 60);
    const requirementType = text(body.requirementType, 160);
    const description = text(body.description, 6000);
    const pageUrl = text(body.pageUrl, 500);

    if (!name || !email || !telephone || !requirementType || !description) {
      return jsonResponse(request, { success: false, error: "Please complete all required fields." }, 400);
    }
    if (!validateEmail(email)) {
      return jsonResponse(request, { success: false, error: "Please enter a valid email address." }, 400);
    }

    const attachments = validateAttachments(body.attachments);
    const submittedAt = new Date().toISOString();
    const subject = `Website enquiry: ${requirementType}`.replace(/[\r\n]/g, " ").slice(0, 180);

    const rows = [
      ["Name", name],
      ["Company", company || "Not provided"],
      ["Email", email],
      ["Phone", telephone],
      ["Requirement", requirementType],
      ["Submitted", submittedAt],
      ["Page", pageUrl || "Contact page"],
    ];

    const htmlRows = rows.map(([label, value]) => `
      <tr>
        <td style="padding:12px 14px;border-bottom:1px solid #e4eaf4;background:#f8faff;font-weight:800;color:#0b3d91;vertical-align:top;width:150px">${escapeHtml(label)}</td>
        <td style="padding:12px 14px;border-bottom:1px solid #e4eaf4;color:#26344d;vertical-align:top">${escapeHtml(value)}</td>
      </tr>`).join("");

    const html = `<!doctype html>
      <html>
      <body style="margin:0;padding:0;background:#eef3fa;font-family:Arial,Helvetica,sans-serif;color:#16243d">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0">New Therm-X website enquiry from ${escapeHtml(name)}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3fa;padding:28px 12px">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 16px 42px rgba(11,32,96,.14)">
                <tr>
                  <td style="padding:0">
                    <div style="height:7px;background:linear-gradient(90deg,#082b6f 0%,#1556b8 68%,#f5821f 68%,#f5821f 100%)"></div>
                    <div style="background:linear-gradient(135deg,#071f55,#0f4baa 72%);padding:28px 30px;color:#ffffff">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td>
                            <div style="font-size:13px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#f6a04b">THERM-X INNOVATIONS</div>
                            <h1 style="margin:9px 0 6px;font-size:27px;line-height:1.2">New Website Enquiry</h1>
                            <p style="margin:0;color:#dbe8ff;font-size:14px;line-height:1.6">Environmental Test Chambers • Technical Solutions • Service Support</p>
                          </td>
                          <td align="right" style="vertical-align:top">
                            <div style="display:inline-block;padding:9px 13px;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:rgba(255,255,255,.10);font-size:12px;font-weight:700">CONTACT REQUEST</div>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:26px 28px 10px">
                    <div style="padding:16px 18px;border-left:4px solid #f5821f;background:#fff8f1;border-radius:10px;color:#263b61;font-size:14px;line-height:1.65">
                      A new enquiry has been submitted through the Therm-X Innovations website. The required customer details are shown below.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 28px 0">
                    <div style="font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#0b3d91;margin-bottom:10px">Customer Details</div>
                    <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #dde6f4;border-radius:12px;overflow:hidden">${tableRows}</table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:22px 28px 0">
                    <div style="font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#0b3d91;margin-bottom:10px">Requirement Description</div>
                    <div style="padding:18px;border-radius:12px;background:#f4f7fc;border:1px solid #e1e8f3;line-height:1.72;white-space:pre-wrap;color:#26344d">${escapeHtml(description)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:22px 28px 28px">
                    <div style="padding:14px 16px;border-radius:10px;background:#0b2f75;color:#ffffff;font-size:13px;line-height:1.6">
                      Reply directly to this email to contact <strong>${escapeHtml(name)}</strong> at ${escapeHtml(email)}.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:17px 28px;background:#071f55;color:#bcd0f3;font-size:11px;line-height:1.6;text-align:center">
                    Therm-X Innovations • Peenya Industrial Area, Bengaluru – 560058<br>
                    This enquiry was generated from the official Therm-X Innovations website.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>`;

    const plainText = [
      "THERM-X WEBSITE ENQUIRY",
      "",
      ...rows.map(([label, value]) => `${label}: ${value}`),
      "",
      "Description:",
      description,
    ].join("\n");

    const resendResponse = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: toRecipients,
        subject,
        html,
        text: plainText,
        reply_to: email,
        attachments,
      }),
    });

    const resendResult = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) {
      console.error("Resend error:", resendResponse.status, resendResult);
      const message = typeof resendResult?.message === "string"
        ? resendResult.message
        : "Email provider rejected the request.";
      return jsonResponse(request, { success: false, error: message }, 502);
    }

    return jsonResponse(request, {
      success: true,
      messageId: typeof resendResult?.id === "string" ? resendResult.id : null,
    });
  } catch (error) {
    console.error("Contact function error:", error);
    const message = error instanceof Error ? error.message : "Unable to process the enquiry.";
    return jsonResponse(request, { success: false, error: message }, 400);
  }
});
