import React, { useState, useRef } from 'react';
import { parseEmployeeFile } from '../utils/fileParser';

export default function UploadZone({ onDataParsed, onError }) {
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFile = async (file) => {
    if (!file) return;

    const fileExt = file.name.split('.').pop().toLowerCase();
    if (fileExt !== 'xlsx' && fileExt !== 'xls') {
      onError('Unsupported file type. Please upload an Excel (.xlsx or .xls) file.');
      return;
    }

    setLoading(true);
    onError(null);

    try {
      const result = await parseEmployeeFile(file);
      onDataParsed(result.employees, result.missingColumns, file.name);
    } catch (err) {
      onError(err.message || 'Error parsing the file.');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleZoneClick = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="upload-card">
      <div 
        className={`upload-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleZoneClick}
      >
        <input 
          type="file" 
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".xlsx, .xls"
          onChange={handleFileChange}
          disabled={loading}
        />
        <div className="upload-icon">
          {loading ? (
            <div className="spinner" style={{ width: '40px', height: '40px', borderWidth: '3px' }}></div>
          ) : (
            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          )}
        </div>
        <p className="upload-text">
          {loading ? 'Reading file contents...' : 'Drag & Drop Excel File'}
        </p>
        <p className="upload-subtext">
          or click to browse your files (expects .xlsx, .xls)
        </p>
      </div>
    </div>
  );
}
