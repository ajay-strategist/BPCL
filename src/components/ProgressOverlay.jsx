import React from 'react';

export default function ProgressOverlay({ current, total, currentName, statusText }) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="progress-overlay">
      <div className="progress-container">
        <div className="spinner"></div>
        <div className="progress-text">Generating Welcome Posters</div>
        
        <div className="progress-bar-bg">
          <div 
            className="progress-bar-fill" 
            style={{ width: `${percentage}%` }}
          ></div>
        </div>

        <div className="progress-stats">
          {percentage}% Complete
        </div>

        {total > 0 && (
          <div style={{ fontSize: '0.9rem', color: '#cbd5e1', fontWeight: 500 }}>
            Processing: <strong>{currentName || '—'}</strong> ({current} of {total})
          </div>
        )}

        <div style={{ fontSize: '0.8rem', color: 'var(--bpcl-gold-light)', fontStyle: 'italic' }}>
          {statusText || 'Preparing...'}
        </div>
      </div>
    </div>
  );
}
