import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const tempFileStore = new Map();

// Temporary store endpoint (POST)
app.post('/api/store', (req, res) => {
  const { filename, mimeType, base64Data } = req.body;
  if (!filename || !mimeType || !base64Data) {
    return res.status(400).send('Missing required fields (filename, mimeType, base64Data)');
  }

  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const token = Math.random().toString(36).substring(2, 15);
    
    // Store buffer ephemerally in RAM
    tempFileStore.set(token, { filename, mimeType, buffer });
    
    // Self-clean timeout (1 minute safety)
    setTimeout(() => {
      tempFileStore.delete(token);
    }, 60000);

    res.json({ token });
  } catch (error) {
    console.error('Store API error:', error);
    res.status(500).send(`Store error: ${error.message}`);
  }
});

// Downloader route to bypass browser blob restrictions (GET)
app.get('/api/download-file/:token/:filename', (req, res) => {
  const { token } = req.params;

  if (!token || !tempFileStore.has(token)) {
    return res.status(404).send('Download expired or not found. Please try generating again.');
  }

  try {
    const fileData = tempFileStore.get(token);
    
    // Set download headers to force binary file download and avoid browser viewer/plugin interception
    res.setHeader('Content-Type', fileData.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileData.filename}"`);
    res.setHeader('Content-Length', fileData.buffer.length);
    res.setHeader('Cache-Control', 'no-cache, must-revalidate, max-age=0');
    res.send(fileData.buffer);

    // Delete from memory after a short delay (15s) to allow browser download manager to complete the transfer
    setTimeout(() => {
      if (tempFileStore.has(token)) {
        tempFileStore.delete(token);
      }
    }, 15000);
  } catch (error) {
    console.error('Download API error:', error);
    res.status(500).send(`Download streaming error: ${error.message}`);
  }
});

// In-memory CORS proxy for fetching employee images
app.get('/api/proxy', async (req, res) => {
  const urlParam = req.query.url;
  if (!urlParam) {
    return res.status(400).send('Missing URL parameter');
  }

  const targetUrl = decodeURIComponent(urlParam);

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    res.setHeader('Content-Type', contentType || 'image/jpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error('Proxy API error:', error);
    if (!res.headersSent) {
      res.status(500).send(`Image proxy error: ${error.message}`);
    }
  }
});

// Endpoint for HR Login validation
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send('Missing username or password');
  }

  const expectedUser = process.env.ADMIN_USER || 'bpcl_hr';
  const expectedPass = process.env.ADMIN_PASS || 'EnergisingLives2026';

  if (username === expectedUser && password === expectedPass) {
    res.json({ success: true, token: 'bpcl-session-' + Math.random().toString(36).substring(2, 10) });
  } else {
    res.status(401).send('Invalid username or password');
  }
});

// Endpoint to send email with welcome poster attached
app.post('/api/send-email', async (req, res) => {
  const { to, subject, html, text, pdfBase64, filename, smtpSettings } = req.body;

  if (!to || !subject || !html) {
    return res.status(400).send('Missing required fields (to, subject, html)');
  }

  // Resolve SMTP configuration (settings from body or environment variables)
  const host = smtpSettings?.host || process.env.SMTP_HOST;
  const port = smtpSettings?.port || process.env.SMTP_PORT;
  const secure = smtpSettings?.secure !== undefined ? smtpSettings.secure : process.env.SMTP_SECURE;
  const user = smtpSettings?.user || process.env.SMTP_USER;
  const pass = smtpSettings?.pass || process.env.SMTP_PASS;
  const fromName = smtpSettings?.fromName || process.env.SMTP_FROM_NAME || 'BPCL Welcome';
  const fromEmail = smtpSettings?.fromEmail || process.env.SMTP_FROM_EMAIL || user || process.env.SMTP_USER;

  if (!host || !port || !user || !pass) {
    return res.status(400).send('SMTP settings are not configured. Please open SMTP Settings in the UI to configure.');
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port, 10),
      secure: secure === true || secure === 'true',
      auth: { user, pass },
      tls: {
        // Do not fail on invalid certs (common in corporate mail servers)
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
        filename: filename,
        content: Buffer.from(pdfBase64, 'base64'),
        contentType: 'application/pdf'
      });
    }

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email Server] Sent email to ${to}: messageId=${info.messageId}`);
    res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error(`[Email Server] Error sending email to ${to}:`, error);
    res.status(500).send(`Email delivery failed: ${error.message}`);
  }
});

// Serve static assets from Vite build in production
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback all other routes to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`BPCL Poster Generator server running on port ${PORT}`);
});
