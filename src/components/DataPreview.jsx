import React from 'react';

export default function DataPreview({ employees, missingColumns, fileName, onGenerate, onCancel }) {
  return (
    <div className="preview-card fade-in">
      <div className="preview-header">
        <div>
          <h2 className="preview-title">Data Preview</h2>
          <p className="preview-meta">
            Loaded <strong>{employees.length}</strong> record{employees.length > 1 ? 's' : ''} from <strong>{fileName}</strong>
          </p>
        </div>
        
        {missingColumns.length > 0 && (
          <div style={{
            fontSize: '0.8rem',
            color: 'var(--warning)',
            background: 'rgba(245, 158, 11, 0.1)',
            padding: '4px 10px',
            borderRadius: '4px',
            fontWeight: 600,
            textAlign: 'right'
          }}>
            ⚠️ Missing columns: {missingColumns.join(', ')}
          </div>
        )}
      </div>

      <div className="table-container">
        <table className="preview-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>Name</th>
              <th>Designation</th>
              <th>Joining Date</th>
              <th>Experience</th>
              <th>Education</th>
              <th>Previous Job</th>
              <th>Email</th>
              <th>Mobile</th>
              <th>Family</th>
              <th>Hobbies</th>
              <th>Image URL</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, idx) => (
              <tr key={emp.id}>
                <td>{idx + 1}</td>
                <td style={{ fontWeight: 600, color: 'var(--bpcl-navy)' }}>{emp.Name || '—'}</td>
                <td>{emp.Designation || '—'}</td>
                <td>{emp.Name ? emp['Joining Date'] || '—' : '—'}</td>
                <td>{emp.Experience || '—'}</td>
                <td>{emp.Education || '—'}</td>
                <td>{emp['Previous Job'] || '—'}</td>
                <td>{emp.Email || '—'}</td>
                <td>{emp.Mobile || '—'}</td>
                <td>{emp.Family || '—'}</td>
                <td>{emp.Hobbies || '—'}</td>
                <td title={emp['Image URL']}>{emp['Image URL'] || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="action-section">
        <button className="btn-danger" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary" onClick={onGenerate}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          Generate Posters
        </button>
      </div>
    </div>
  );
}
