import React, { useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';

import Header from './components/Header';
import UploadZone from './components/UploadZone';
import DataPreview from './components/DataPreview';
import PosterTemplate from './components/PosterTemplate';
import ProgressOverlay from './components/ProgressOverlay';

import './App.css';

export default function App() {
  const [employees, setEmployees] = useState([]);
  const [missingColumns, setMissingColumns] = useState([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState(null);
  
  // Generation & progress state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentName: '', statusText: '' });
  const [zipBlob, setZipBlob] = useState(null);
  const [success, setSuccess] = useState(false);

  // New State Variables for PDF Generation Fix & Email Integration
  const [activeGeneratingEmployee, setActiveGeneratingEmployee] = useState(null);
  const [showSmtpModal, setShowSmtpModal] = useState(false);
  const [emailStatus, setEmailStatus] = useState({}); // { [empId]: 'idle' | 'sending' | 'sent' | 'failed' }
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!sessionStorage.getItem('bpcl_admin_session');
  });
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [smtpSettings, setSmtpSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('bpcl_smtp_settings');
      return saved ? JSON.parse(saved) : {
        host: '',
        port: '587',
        secure: false,
        user: '',
        pass: '',
        fromName: 'BPCL Welcome Team',
        fromEmail: ''
      };
    } catch {
      return {
        host: '',
        port: '587',
        secure: false,
        user: '',
        pass: '',
        fromName: 'BPCL Welcome Team',
        fromEmail: ''
      };
    }
  });

  const handleDataParsed = (parsedEmployees, parsedMissing, name) => {
    setEmployees(parsedEmployees);
    setMissingColumns(parsedMissing);
    setFileName(name);
    setError(null);
    setSuccess(false);
    setZipBlob(null);
  };

  const handleCancel = () => {
    purgeAllData();
  };

  const purgeAllData = () => {
    setEmployees([]);
    setMissingColumns([]);
    setFileName('');
    setError(null);
    setIsGenerating(false);
    setZipBlob(null);
    setSuccess(false);
    setProgress({ current: 0, total: 0, currentName: '', statusText: '' });
    setActiveGeneratingEmployee(null);
    setEmailStatus({});
  };

  const handleLogout = () => {
    sessionStorage.removeItem('bpcl_admin_session');
    setIsLoggedIn(false);
    setLoginUsername('');
    setLoginPassword('');
    purgeAllData();
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginUsername || !loginPassword) {
      setLoginError('Please enter both username and password.');
      return;
    }

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });

      if (!response.ok) {
        const errMsg = await response.text();
        throw new Error(errMsg || 'Invalid username or password.');
      }

      const { token } = await response.json();
      sessionStorage.setItem('bpcl_admin_session', token);
      setIsLoggedIn(true);
      setLoginError(null);
    } catch (err) {
      console.error('Login error:', err);
      setLoginError(err.message || 'Login failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGenerate = async () => {
    if (employees.length === 0) return;

    setIsGenerating(true);
    setError(null);
    setProgress({
      current: 0,
      total: employees.length,
      currentName: 'Initializing...',
      statusText: 'Preparing in-memory workers...'
    });

    try {
      // Step 1: Pre-fetch images through proxy to convert them to local Base64
      const employeesWithImages = [];
      
      for (let i = 0; i < employees.length; i++) {
        const emp = { ...employees[i] };
        setProgress({
          current: i + 1,
          total: employees.length,
          currentName: emp.Name,
          statusText: 'Fetching employee image...'
        });

        const imageUrl = emp['Image URL'];
        const isHttpUrl = typeof imageUrl === 'string' && /^https?:\/\//i.test(imageUrl.trim());

        if (emp.base64Image) {
          // Already have an embedded "Place in Cell" image from the Excel file
          setProgress({
            current: i + 1,
            total: employees.length,
            currentName: emp.Name,
            statusText: 'Using embedded photo from Excel...'
          });
        } else if (isHttpUrl) {
          try {
            // Fetch via the Express proxy to bypass browser CORS constraints
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(imageUrl.trim())}`;
            const response = await fetch(proxyUrl);

            if (response.ok) {
              const blob = await response.blob();
              const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('FileReader error'));
                reader.readAsDataURL(blob);
              });
              emp.base64Image = base64;
            } else {
              console.warn(`Failed to fetch image for ${emp.Name}: ${response.statusText}`);
              emp.base64Image = null; // Falls back to initials
            }
          } catch (fetchErr) {
            console.error(`Error fetching image for ${emp.Name}:`, fetchErr);
            emp.base64Image = null; // Falls back to initials
          }
        } else {
          emp.base64Image = null;
        }
        employeesWithImages.push(emp);
      }

      // Step 2: Update state with base64 images so offscreen templates render them
      setEmployees(employeesWithImages);

      // Step 3: Wait a short moment to ensure the browser finishes rendering & decoding the base64 images in the DOM
      setProgress({
        current: employees.length,
        total: employees.length,
        currentName: 'Rendering',
        statusText: 'Decoding image buffers & layouts...'
      });
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Step 4: Loop through rendered posters and capture them one-by-one to prevent clipping
      const zip = new JSZip();
      const employeesWithBlobs = [];

      for (let i = 0; i < employeesWithImages.length; i++) {
        const emp = employeesWithImages[i];
        
        // Set as active generating employee so only this poster is rendered in the offscreen container
        setActiveGeneratingEmployee(emp);
        
        // Wait for React rendering to finish and images to decode (300ms)
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        setProgress({
          current: i + 1,
          total: employeesWithImages.length,
          currentName: emp.Name,
          statusText: 'Generating PDF page...'
        });

        const element = document.getElementById(`poster-el-${emp.id}`);
        if (!element) {
          throw new Error(`Failed to find rendering element for ${emp.Name}`);
        }

        // Ensure every <img> in the poster is fully loaded AND decoded before
        // html2canvas snapshots the DOM — otherwise the photo can come out blank.
        const imgs = Array.from(element.querySelectorAll('img'));
        await Promise.all(
          imgs.map((img) => {
            // Wait for the resource to load
            const loaded = img.complete
              ? Promise.resolve()
              : new Promise((resolve) => {
                  img.onload = resolve;
                  img.onerror = resolve; // don't block on a broken image
                });
            // Then wait for the browser to decode it into pixels
            return loaded
              .then(() => (img.decode ? img.decode().catch(() => {}) : null));
          })
        );

        // Capture HTML layout at double-resolution (high crisp print quality).
        // Images are inlined as base64 (same-origin data URIs), so no taint occurs.
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          logging: false,
          allowTaint: false,
          backgroundColor: '#ffffff',
          imageTimeout: 15000
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        // Define a 4:3 landscape PDF matching the poster (1123 x 842px @ 96dpi).
        // Using unit:'px' with a matching format keeps the aspect ratio exact
        // (no stretching/distortion of the captured poster).
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'px',
          format: [1123, 842]
        });

        // Fill the full borderless page with the captured poster
        pdf.addImage(imgData, 'JPEG', 0, 0, 1123, 842);
        const pdfBlob = pdf.output('blob');
        
        // Save PDF blob on the employee object for individual downloading
        emp.pdfBlob = pdfBlob;

        // Normalize employee name for filename
        const safeName = emp.Name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        const pdfFileName = `${safeName}_Welcome_Poster.pdf`;
        
        // Save PDF blob in the ZIP directory structure
        zip.file(pdfFileName, pdfBlob);
        employeesWithBlobs.push(emp);
      }
      
      // Clear active generating employee
      setActiveGeneratingEmployee(null);

      // Step 5: Update the state with employees containing PDF blobs
      setEmployees(employeesWithBlobs);

      // Step 6: Compile the ZIP file in-memory
      setProgress({
        current: employees.length,
        total: employees.length,
        currentName: 'Packaging',
        statusText: 'Building ZIP compression archive...'
      });

      const zipContentBlob = await zip.generateAsync({ type: 'blob' });
      setZipBlob(zipContentBlob);
      setSuccess(true);
    } catch (err) {
      console.error(err);
      setError(`Poster Generation Failed: ${err.message}`);
      setActiveGeneratingEmployee(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const saveSmtpSettings = (settings) => {
    setSmtpSettings(settings);
    localStorage.setItem('bpcl_smtp_settings', JSON.stringify(settings));
  };

  // Handle sending email to a single employee
  const handleSendEmail = async (emp) => {
    if (!emp.pdfBlob) return;
    if (!emp.Email) {
      setError(`No email address available for ${emp.Name}.`);
      return;
    }

    setEmailStatus(prev => ({ ...prev, [emp.id]: 'sending' }));
    setError(null);
    
    try {
      const base64Pdf = await blobToBase64(emp.pdfBlob);
      const safeName = emp.Name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      const filename = `${safeName}_Welcome_Poster.pdf`;
      
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <div style="background: linear-gradient(135deg, #001f5c 0%, #003087 100%); padding: 30px; text-align: center; border-bottom: 4px solid #D4AF37;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 0.5px;">Welcome to the BPCL Family!</h1>
          </div>
          <div style="padding: 30px; line-height: 1.6; color: #1f2937;">
            <p style="font-size: 16px; font-weight: bold; margin-top: 0;">Dear ${emp.Name},</p>
            <p style="font-size: 15px;">A very warm welcome to <strong>Bharat Petroleum Corporation Limited</strong>! We are thrilled to have you join our team as <strong>${emp.Designation}</strong>.</p>
            <p style="font-size: 15px;">Your unique talents, skills, and perspectives are a valuable addition to our department. We are confident that you will play an instrumental role in our journey of <em>Energising Lives</em>.</p>
            <p style="font-size: 15px;">To celebrate your arrival, we have designed a personalized <strong>Welcome Poster</strong> for you. Please find the PDF welcome poster attached to this email.</p>
            <p style="font-size: 15px; margin-bottom: 0;">We look forward to working alongside you and supporting your professional growth at BPCL.</p>
          </div>
          <div style="background: #f8fafc; padding: 20px 30px; border-top: 1px solid #cbd5e1; text-align: center; font-size: 12px; color: #4b5563;">
            <strong style="color: #003087;">Bharat Petroleum Corporation Limited</strong><br>
            HR Department • Energising Lives
          </div>
        </div>
      `;

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emp.Email,
          subject: `Welcome to BPCL, ${emp.Name}!`,
          html: emailHtml,
          text: `Dear ${emp.Name},\n\nWelcome to Bharat Petroleum Corporation Limited! We are thrilled to have you join us as ${emp.Designation}. Please find your welcome poster attached.\n\nBest regards,\nBPCL HR Department`,
          pdfBase64: base64Pdf,
          filename: filename,
          smtpSettings: smtpSettings
        })
      });

      if (!response.ok) {
        const errMsg = await response.text();
        throw new Error(errMsg || `Server error: ${response.statusText}`);
      }

      setEmailStatus(prev => ({ ...prev, [emp.id]: 'sent' }));
    } catch (err) {
      console.error(`Email send error for ${emp.Name}:`, err);
      setEmailStatus(prev => ({ ...prev, [emp.id]: 'failed' }));
      setError(`Failed to send email to ${emp.Name}: ${err.message}`);
    }
  };

  // Handle sending emails to all employees
  const handleSendEmailAll = async () => {
    // Validate SMTP Settings
    const { host, port, user, pass } = smtpSettings;
    if (!host || !port || !user || !pass) {
      setError('Please configure SMTP settings before sending emails.');
      setShowSmtpModal(true);
      return;
    }

    setError(null);
    
    // Loop and send with brief delay to prevent server overload
    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      if (emp.Email) {
        await handleSendEmail(emp);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  };

  // Helper to convert Blob to Base64 (ephemeral processing)
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Client-side blob download. Needs no backend, has no upload size limit, and
  // works on stateless serverless hosting (e.g. Vercel). The browser saves the
  // file using the anchor's `download` attribute.
  const triggerGetDownload = async (filename, mimeType, blob) => {
    try {
      // Ensure the blob carries the right MIME type so the extension is kept.
      const typedBlob =
        blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });

      const url = URL.createObjectURL(typedBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.rel = 'noopener';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        if (link.parentNode === document.body) link.remove();
        URL.revokeObjectURL(url);
      }, 1500);
    } catch (err) {
      console.error('Download error:', err);
      setError(`Download failed: ${err.message}`);
    }
  };

  const handleDownloadSinglePdf = async (emp) => {
    if (!emp.pdfBlob) return;
    const safeName = emp.Name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const filename = `${safeName}_Welcome_Poster.pdf`;
    await triggerGetDownload(filename, 'application/pdf', emp.pdfBlob);
  };

  const handleDownloadAllIndividual = () => {
    employees.forEach((emp, idx) => {
      setTimeout(() => {
        handleDownloadSinglePdf(emp);
      }, idx * 400);
    });
  };

  const handleDownloadZip = async () => {
    if (!zipBlob) return;
    const filename = `BPCL_Welcome_Posters_${Date.now()}.zip`;
    await triggerGetDownload(filename, 'application/zip', zipBlob);
  };

  if (!isLoggedIn) {
    return (
      <>
        <Header />
        <main className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 180px)' }}>
          <div className="login-card fade-in">
            <div className="login-header">
              <h2>🔒 HR Portal Login</h2>
              <p>Authentication required to configure sender details & generate posters</p>
            </div>
            
            <form onSubmit={handleLoginSubmit} className="login-form">
              {loginError && (
                <div className="login-error-msg">
                  ❌ {loginError}
                </div>
              )}
              
              <div className="form-group">
                <label>Username</label>
                <input 
                  type="text" 
                  value={loginUsername}
                  onChange={e => setLoginUsername(e.target.value)}
                  placeholder="Enter HR username"
                  required
                />
              </div>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>Password</label>
                <input 
                  type="password" 
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="Enter portal password"
                  required
                />
              </div>

              <button 
                type="submit" 
                className="btn-primary" 
                style={{ width: '100%', justifyContent: 'center', marginTop: '1.5rem', boxShadow: 'none' }}
                disabled={isLoggingIn}
              >
                {isLoggingIn ? 'Verifying...' : 'Authenticate & Enter'}
              </button>
            </form>
          </div>
        </main>
        
        <footer style={{
          textAlign: 'center',
          padding: '2rem 1rem',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          borderTop: '1px solid var(--border-color)',
          marginTop: 'auto',
          background: '#ffffff'
        }}>
          <div>Bharat Petroleum Corporation Limited © 2026. All rights reserved.</div>
        </footer>
      </>
    );
  }

  return (
    <>
      <Header />
      
      <main className="main-content">
        {/* Top Control Bar with Logged In User, SMTP trigger, and Logout */}
        <div className="control-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', padding: '0.75rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="sender-identity-summary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            <span style={{ fontWeight: 700, color: 'var(--bpcl-navy)' }}>👤 Sender Identity:</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {smtpSettings.fromEmail || smtpSettings.user || 'SMTP Not Configured'} {smtpSettings.fromName ? `(${smtpSettings.fromName})` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button 
              className="btn-smtp-settings-trigger"
              onClick={() => setShowSmtpModal(true)}
              style={{
                background: 'transparent',
                border: '1px solid var(--bpcl-navy)',
                color: 'var(--bpcl-navy)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 1rem',
                borderRadius: '6px',
                transition: 'var(--transition-smooth)'
              }}
            >
              ⚙️ Update Sender Details
            </button>
            <button 
              className="btn-logout"
              onClick={handleLogout}
              style={{
                background: 'transparent',
                border: '1px solid var(--error)',
                color: 'var(--error)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 1rem',
                borderRadius: '6px',
                transition: 'var(--transition-smooth)'
              }}
            >
              🚪 Log Out
            </button>
          </div>
        </div>

        {/* Template Download Area */}
        {employees.length === 0 && !success && (
          <div className="template-section">
            <a 
              href="/BPCL_Welcome_Poster_Template.xlsx" 
              download="BPCL_Welcome_Poster_Template.xlsx" 
              className="btn-template" 
              style={{ textDecoration: 'none' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Excel Template
            </a>
          </div>
        )}

        {/* Errors */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--error)',
            color: 'var(--error)',
            padding: '1rem',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 500
          }}>
            ❌ {error}
          </div>
        )}

        {/* Upload Zone */}
        {employees.length === 0 && !success && (
          <UploadZone onDataParsed={handleDataParsed} onError={setError} />
        )}

        {/* Data Preview */}
        {employees.length > 0 && !success && (
          <DataPreview 
            employees={employees}
            missingColumns={missingColumns}
            fileName={fileName}
            onGenerate={handleGenerate}
            onCancel={handleCancel}
          />
        )}

        {/* Download Zone (Success Screen) */}
        {success && (
          <div className="success-card fade-in" style={{ maxWidth: '750px', width: '100%', margin: '0 auto' }}>
            <div className="success-icon">🎉</div>
            <h2 className="success-title">Welcome Posters Generated Successfully!</h2>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '550px', margin: '0.5rem 0 1rem 0', fontSize: '0.95rem' }}>
              All posters have been generated entirely in-memory. You can send welcome emails to employees or download the PDFs below.
            </p>

            {/* Individual Employee Download & Email List */}
            <div className="download-list">
              {employees.map((emp) => {
                const status = emailStatus[emp.id] || 'idle';
                let emailBtnText = 'Send Email';
                let emailBtnClass = 'btn-email-single';
                if (status === 'sending') {
                  emailBtnText = 'Sending...';
                  emailBtnClass = 'btn-email-single sending';
                } else if (status === 'sent') {
                  emailBtnText = 'Sent ✅';
                  emailBtnClass = 'btn-email-single sent';
                } else if (status === 'failed') {
                  emailBtnText = 'Failed ❌';
                  emailBtnClass = 'btn-email-single failed';
                }

                return (
                  <div className="download-item" key={emp.id}>
                    <div className="download-item-info">
                      <div className="download-item-name">{emp.Name}</div>
                      <div className="download-item-desc">
                        {emp.Designation} {emp.Email ? `• ${emp.Email}` : '• (No Email Provided)'}
                      </div>
                    </div>
                    <div className="download-item-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        className="btn-download-single"
                        onClick={() => handleDownloadSinglePdf(emp)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download PDF
                      </button>
                      
                      {emp.Email ? (
                        <button 
                          className={emailBtnClass}
                          onClick={() => handleSendEmail(emp)}
                          disabled={status === 'sending'}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                          {emailBtnText}
                        </button>
                      ) : (
                        <button className="btn-email-single disabled" disabled title="No email address specified in uploaded file">
                          No Email
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Batch Action Buttons */}
            <div className="success-actions">
              <button className="btn-download-individual" onClick={handleDownloadAllIndividual}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download All (One by One)
              </button>
              
              <button className="btn-download-zip" onClick={handleDownloadZip}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download All (ZIP)
              </button>

              <button className="btn-send-emails-batch" onClick={handleSendEmailAll}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
                Send Mail to All (Batch)
              </button>

              <button className="btn-reset-session" onClick={handleCancel}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
                Reset & Purge Session
              </button>
            </div>

            {/* Zero Retention Policy notice */}
            <div className="security-notice-card">
              🔒 <strong>Zero Data Retention Policy:</strong> Your data is held temporarily in your browser's RAM and is never stored on the server or database. Once you have downloaded your files, click <strong>"Reset & Purge Session"</strong> (or close the tab) to completely wipe all employee records from memory.
            </div>
          </div>
        )}

        {/* Offscreen rendering container for capturing A4 canvases */}
        {activeGeneratingEmployee && (
          <div className="poster-container-offscreen">
            <PosterTemplate employee={activeGeneratingEmployee} />
          </div>
        )}

        {/* Loading Overlay */}
        {isGenerating && (
          <ProgressOverlay 
            current={progress.current}
            total={progress.total}
            currentName={progress.currentName}
            statusText={progress.statusText}
          />
        )}
      </main>

      {/* SMTP Settings Modal */}
      {showSmtpModal && (
        <div className="modal-overlay">
          <div className="modal-card fade-in">
            <div className="modal-header">
              <h3>⚙️ SMTP Mail Server Settings</h3>
              <button className="btn-close-modal" onClick={() => setShowSmtpModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.4 }}>
                Configure SMTP details below to send welcome emails directly to employees. Settings are saved locally in your browser's memory and are sent securely with each email dispatch.
              </p>
              
              <div className="form-grid">
                <div className="form-group">
                  <label>SMTP Host</label>
                  <input 
                    type="text" 
                    value={smtpSettings.host} 
                    onChange={e => setSmtpSettings({ ...smtpSettings, host: e.target.value })}
                    placeholder="smtp.gmail.com or mail.corp.in"
                  />
                </div>
                
                <div className="form-group">
                  <label>SMTP Port</label>
                  <input 
                    type="text" 
                    value={smtpSettings.port} 
                    onChange={e => setSmtpSettings({ ...smtpSettings, port: e.target.value })}
                    placeholder="587"
                  />
                </div>
                
                <div className="form-group inline-checkbox">
                  <input 
                    type="checkbox" 
                    id="secure-check"
                    checked={smtpSettings.secure} 
                    onChange={e => setSmtpSettings({ ...smtpSettings, secure: e.target.checked })}
                  />
                  <label htmlFor="secure-check">Use SSL/TLS (Secure Connection on Port 465)</label>
                </div>
                
                <div className="form-group">
                  <label>SMTP Username / Login Account</label>
                  <input 
                    type="text" 
                    value={smtpSettings.user} 
                    onChange={e => setSmtpSettings({ ...smtpSettings, user: e.target.value })}
                    placeholder="your-email@yourdomain.com"
                  />
                </div>
                
                <div className="form-group">
                  <label>SMTP Password</label>
                  <input 
                    type="password" 
                    value={smtpSettings.pass} 
                    onChange={e => setSmtpSettings({ ...smtpSettings, pass: e.target.value })}
                    placeholder="SMTP App Password"
                  />
                </div>

                <div className="form-group">
                  <label>Sender Name</label>
                  <input 
                    type="text" 
                    value={smtpSettings.fromName} 
                    onChange={e => setSmtpSettings({ ...smtpSettings, fromName: e.target.value })}
                    placeholder="BPCL Welcome Team"
                  />
                </div>

                <div className="form-group">
                  <label>Sender Email (Leave blank to use Username)</label>
                  <input 
                    type="email" 
                    value={smtpSettings.fromEmail} 
                    onChange={e => setSmtpSettings({ ...smtpSettings, fromEmail: e.target.value })}
                    placeholder="no-reply@corp.bharatpetroleum.in"
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button className="btn-danger" style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem' }} onClick={() => setShowSmtpModal(false)}>Cancel</button>
              <button className="btn-primary" style={{ padding: '0.6rem 1.5rem', fontSize: '0.9rem', boxShadow: 'none' }} onClick={() => {
                saveSmtpSettings(smtpSettings);
                setShowSmtpModal(false);
              }}>Save Configuration</button>
            </div>
          </div>
        </div>
      )}

      <footer style={{
        textAlign: 'center',
        padding: '2rem 1rem',
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        borderTop: '1px solid var(--border-color)',
        marginTop: 'auto',
        background: '#ffffff'
      }}>
        <div>Bharat Petroleum Corporation Limited © 2026. All rights reserved.</div>
        <div style={{ marginTop: '0.25rem', color: 'var(--success)', fontWeight: 600 }}>
          🔒 Ephemeral Session: Zero Data Retention Policy Active (In-Memory Processing Only)
        </div>
      </footer>
    </>
  );
}
