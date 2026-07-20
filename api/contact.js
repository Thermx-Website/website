const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const MAX_FILES = 3;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/zip',
  'text/plain',
  'application/octet-stream'
]);

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character] || character);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function parseRecipients(value) {
  return String(value || '')
    .split(',')
    .map((email) => email.trim())
    .filter(isValidEmail);
}

function safeFilename(value) {
  return cleanText(value, 180)
    .replace(/[\r\n\0]/g, '')
    .replace(/[\\/]/g, '-') || 'attachment';
}

function decodedBase64Size(base64) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function validateAttachments(rawAttachments) {
  if (rawAttachments == null) return [];
  if (!Array.isArray(rawAttachments)) throw new Error('Invalid attachments payload.');
  if (rawAttachments.length > MAX_FILES) throw new Error(`Maximum ${MAX_FILES} attachments allowed.`);

  let totalBytes = 0;
  return rawAttachments.map((attachment) => {
    const filename = safeFilename(attachment?.filename);
    const content = cleanText(attachment?.content, 6_000_000).replace(/^data:[^;]+;base64,/, '');
    const contentType = cleanText(attachment?.contentType, 120) || 'application/octet-stream';

    if (!content || !/^[A-Za-z0-9+/=]+$/.test(content)) {
      throw new Error(`Invalid attachment: ${filename}`);
    }
    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      throw new Error(`Unsupported file type: ${filename}`);
    }

    const size = decodedBase64Size(content);
    if (size > MAX_FILE_BYTES) throw new Error(`${filename} exceeds the 2 MB limit.`);
    totalBytes += size;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Total attachment size must be 3 MB or less.');

    return { filename, content, content_type: contentType };
  });
}

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ success: false, error: 'Method not allowed.' });
  }

  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    const toRecipients = parseRecipients(process.env.CONTACT_TO_EMAIL);
    const fromEmail = process.env.CONTACT_FROM_EMAIL || 'Therm-X Website <enquiries@thermxinnovations.com>';

    if (!resendApiKey || toRecipients.length === 0) {
      console.error('Missing RESEND_API_KEY or CONTACT_TO_EMAIL.');
      return response.status(503).json({ success: false, error: 'Email service is not configured.' });
    }

    const body = typeof request.body === 'string' ? JSON.parse(request.body) : (request.body || {});

    // Hidden honeypot field. Bots are accepted silently without sending mail.
    if (cleanText(body.website, 200)) {
      return response.status(200).json({ success: true });
    }

    const name = cleanText(body.name, 120);
    const company = cleanText(body.company, 160);
    const email = cleanText(body.email, 254).toLowerCase();
    const telephone = cleanText(body.telephone, 60);
    const requirementType = cleanText(body.requirementType, 160);
    const description = cleanText(body.description, 6000);
    const pageUrl = cleanText(body.pageUrl, 500);

    if (!name || !email || !telephone || !requirementType || !description) {
      return response.status(400).json({ success: false, error: 'Please complete all required fields.' });
    }
    if (!isValidEmail(email)) {
      return response.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    const attachments = validateAttachments(body.attachments);
    const submittedAt = new Date().toISOString();
    const subject = `Website enquiry: ${requirementType}`.replace(/[\r\n]/g, ' ').slice(0, 180);

    const rows = [
      ['Name', name],
      ['Company', company || 'Not provided'],
      ['Email', email],
      ['Phone', telephone],
      ['Requirement', requirementType],
      ['Submitted', submittedAt],
      ['Page', pageUrl || 'Contact page']
    ];

    const tableRows = rows.map(([label, value]) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e6ebf3;font-weight:700;color:#0b2060;vertical-align:top;width:150px">${escapeHtml(label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e6ebf3;color:#26344d;vertical-align:top">${escapeHtml(value)}</td>
      </tr>`).join('');

    const html = `<!doctype html>
      <html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#1f2d45">
        <div style="max-width:720px;margin:24px auto;padding:0 14px">
          <div style="background:#0b2060;padding:24px;border-radius:18px 18px 0 0;color:#fff">
            <div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.85">Therm-X Innovations</div>
            <h1 style="margin:8px 0 0;font-size:25px">New website enquiry</h1>
          </div>
          <div style="background:#fff;padding:22px;border-radius:0 0 18px 18px;box-shadow:0 12px 34px rgba(12,35,88,.10)">
            <table role="presentation" style="width:100%;border-collapse:collapse">${tableRows}</table>
            <div style="margin-top:22px">
              <div style="font-weight:700;color:#0b2060;margin-bottom:8px">Description</div>
              <div style="padding:16px;border-radius:12px;background:#f6f8fc;line-height:1.65;white-space:pre-wrap">${escapeHtml(description)}</div>
            </div>
            <p style="margin:20px 0 0;font-size:12px;color:#64748b">Reply to this email to respond directly to ${escapeHtml(name)}.</p>
          </div>
        </div>
      </body></html>`;

    const plainText = [
      'THERM-X WEBSITE ENQUIRY',
      '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      'Description:',
      description
    ].join('\n');

    const resendResponse = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: toRecipients,
        subject,
        html,
        text: plainText,
        reply_to: email,
        attachments
      })
    });

    const resendResult = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) {
      console.error('Resend error:', resendResponse.status, resendResult);
      return response.status(502).json({
        success: false,
        error: typeof resendResult?.message === 'string' ? resendResult.message : 'Email provider rejected the request.'
      });
    }

    return response.status(200).json({ success: true, messageId: resendResult?.id || null });
  } catch (error) {
    console.error('Contact API error:', error);
    return response.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unable to process the enquiry.'
    });
  }
};
