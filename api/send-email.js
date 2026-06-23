// Vercel serverless function: POST /api/send-email
// Sends a welcome email with the poster PDF attached via SMTP (nodemailer).
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { to, subject, html, text, pdfBase64, filename, smtpSettings } = req.body || {};

  if (!to || !subject || !html) {
    return res.status(400).send('Missing required fields (to, subject, html)');
  }

  // Resolve SMTP configuration (UI settings take priority, fall back to env vars)
  const host = smtpSettings?.host || process.env.SMTP_HOST;
  const port = smtpSettings?.port || process.env.SMTP_PORT;
  const secure =
    smtpSettings?.secure !== undefined ? smtpSettings.secure : process.env.SMTP_SECURE;
  const user = smtpSettings?.user || process.env.SMTP_USER;
  const pass = smtpSettings?.pass || process.env.SMTP_PASS;
  const fromName = smtpSettings?.fromName || process.env.SMTP_FROM_NAME || 'BPCL Welcome';
  const fromEmail =
    smtpSettings?.fromEmail || process.env.SMTP_FROM_EMAIL || user || process.env.SMTP_USER;

  if (!host || !port || !user || !pass) {
    return res
      .status(400)
      .send('SMTP settings are not configured. Please open SMTP Settings in the UI to configure.');
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port, 10),
      secure: secure === true || secure === 'true',
      auth: { user, pass },
      tls: {
        // Tolerate self-signed certs (common on corporate mail servers)
        rejectUnauthorized: false
      }
    });

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text: text || 'Welcome to BPCL! Please find your welcome poster attached.',
      html,
      attachments: []
    };

    if (pdfBase64 && filename) {
      mailOptions.attachments.push({
        filename,
        content: Buffer.from(pdfBase64, 'base64'),
        contentType: 'application/pdf'
      });
    }

    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error);
    return res.status(500).send(`Email delivery failed: ${error.message}`);
  }
}
