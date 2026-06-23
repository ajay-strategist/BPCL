import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import nodemailer from 'nodemailer';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'image-proxy',
      configureServer(server) {
        // In-memory store for files (Zero retention: RAM only, cleared instantly on download)
        const tempFileStore = new Map();

        // Helper to parse request body
        const getRequestBody = (req) => {
          return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });
            req.on('end', () => {
              resolve(body);
            });
            req.on('error', err => {
              reject(err);
            });
          });
        };

        // Temporary store endpoint (POST)
        server.middlewares.use('/api/store', async (req, res, next) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          try {
            const body = await getRequestBody(req);
            
            let filename, mimeType, base64Data;
            if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
              const params = new URLSearchParams(body);
              filename = params.get('filename');
              mimeType = params.get('mimeType');
              base64Data = params.get('base64Data');
            } else {
              const json = JSON.parse(body);
              filename = json.filename;
              mimeType = json.mimeType;
              base64Data = json.base64Data;
            }

            if (!filename || !mimeType || !base64Data) {
              res.statusCode = 400;
              res.end('Missing required fields');
              return;
            }

            const buffer = Buffer.from(base64Data, 'base64');
            const token = Math.random().toString(36).substring(2, 15);
            
            console.log(`[Vite Server] Storing file: "${filename}" with token "${token}" (${buffer.length} bytes)`);

            // Store buffer ephemerally in RAM
            tempFileStore.set(token, { filename, mimeType, buffer });
            
            // Self-clean timeout (1 minute safety)
            setTimeout(() => {
              if (tempFileStore.has(token)) {
                console.log(`[Vite Server] Safety timeout: Cleaning up token "${token}"`);
                tempFileStore.delete(token);
              }
            }, 60000);

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ token }));
          } catch (error) {
            console.error('Store middleware error:', error);
            res.statusCode = 500;
            res.end(`Store error: ${error.message}`);
          }
        });

        // Downloader route to bypass browser blob restrictions (GET)
        server.middlewares.use('/api/download-file', async (req, res, next) => {
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          try {
            // URL format: /api/download-file/TOKEN/FILENAME
            // req.url inside Connect middleware will be /TOKEN/FILENAME
            const parts = req.url.split('/');
            const token = parts[1];

            console.log(`[Vite Server] Attempting download for token: "${token}" (req.url: "${req.url}")`);

            if (!token || !tempFileStore.has(token)) {
              console.warn(`[Vite Server] Token "${token}" not found or expired.`);
              res.statusCode = 404;
              res.end('Download expired or not found. Please try generating again.');
              return;
            }

            const fileData = tempFileStore.get(token);
            
            console.log(`[Vite Server] Serving file: "${fileData.filename}" (${fileData.buffer.length} bytes)`);

            // Set download headers to force binary file download and avoid browser viewer/plugin interception
            res.setHeader('Content-Type', fileData.mimeType || 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${fileData.filename}"`);
            res.setHeader('Content-Length', fileData.buffer.length);
            res.setHeader('Cache-Control', 'no-cache, must-revalidate, max-age=0');
            res.end(fileData.buffer);

            // Delete from memory after a short delay (15s) to allow browser download manager to complete the transfer
            setTimeout(() => {
              if (tempFileStore.has(token)) {
                console.log(`[Vite Server] Ephemeral storage: Purged token "${token}" after download completion.`);
                tempFileStore.delete(token);
              }
            }, 15000);
          } catch (error) {
            console.error('Download middleware error:', error);
            res.statusCode = 500;
            res.end(`Download streaming error: ${error.message}`);
          }
        });

        // Proxy route for images
        server.middlewares.use('/api/proxy', async (req, res, next) => {
          const urlParam = req.url.split('?url=')[1];
          if (!urlParam) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'text/plain');
            res.end('Missing URL parameter');
            return;
          }

          const targetUrl = decodeURIComponent(urlParam);

          try {
            const response = await fetch(targetUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });

            if (!response.ok) {
              res.statusCode = response.status;
              res.setHeader('Content-Type', 'text/plain');
              res.end(`Failed to fetch image: ${response.statusText}`);
              return;
            }

            const contentType = response.headers.get('content-type');
            res.setHeader('Content-Type', contentType || 'image/jpeg');
            
            // Allow CORS during development so client can read it
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

            const arrayBuffer = await response.arrayBuffer();
            res.end(Buffer.from(arrayBuffer));
          } catch (error) {
            console.error('[Vite Dev Server] Proxy error:', error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain');
            res.end(`Image proxy error: ${error.message}`);
          }
        });

        // Login validation middleware for local development
        server.middlewares.use('/api/login', async (req, res, next) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          try {
            const body = await getRequestBody(req);
            const json = JSON.parse(body);
            const { username, password } = json;

            if (!username || !password) {
              res.statusCode = 400;
              res.end('Missing username or password');
              return;
            }

            const expectedUser = process.env.ADMIN_USER || 'bpcl_hr';
            const expectedPass = process.env.ADMIN_PASS || 'EnergisingLives2026';

            if (username === expectedUser && password === expectedPass) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, token: 'bpcl-session-' + Math.random().toString(36).substring(2, 10) }));
            } else {
              res.statusCode = 401;
              res.end('Invalid username or password');
            }
          } catch (error) {
            console.error('[Vite Dev Server] Login error:', error);
            res.statusCode = 500;
            res.end(`Login error: ${error.message}`);
          }
        });

        // Send Email middleware for local development
        server.middlewares.use('/api/send-email', async (req, res, next) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          try {
            const body = await getRequestBody(req);
            const json = JSON.parse(body);
            const { to, subject, html, text, pdfBase64, filename, smtpSettings } = json;

            if (!to || !subject || !html) {
              res.statusCode = 400;
              res.end('Missing required fields (to, subject, html)');
              return;
            }

            const host = smtpSettings?.host || process.env.SMTP_HOST;
            const port = smtpSettings?.port || process.env.SMTP_PORT;
            const secure = smtpSettings?.secure !== undefined ? smtpSettings.secure : process.env.SMTP_SECURE;
            const user = smtpSettings?.user || process.env.SMTP_USER;
            const pass = smtpSettings?.pass || process.env.SMTP_PASS;
            const fromName = smtpSettings?.fromName || process.env.SMTP_FROM_NAME || 'BPCL Welcome';
            const fromEmail = smtpSettings?.fromEmail || process.env.SMTP_FROM_EMAIL || user || process.env.SMTP_USER;

            if (!host || !port || !user || !pass) {
              res.statusCode = 400;
              res.end('SMTP settings are not configured. Please open SMTP Settings in the UI to configure.');
              return;
            }

            const transporter = nodemailer.createTransport({
              host,
              port: parseInt(port, 10),
              secure: secure === true || secure === 'true',
              auth: { user, pass },
              tls: {
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
            console.log(`[Vite Dev Server] Sent email to ${to}: messageId=${info.messageId}`);
            
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, messageId: info.messageId }));
          } catch (error) {
            console.error('[Vite Dev Server] Send email error:', error);
            res.statusCode = 500;
            res.end(`Email delivery failed: ${error.message}`);
          }
        });
      }
    }
  ]
});
