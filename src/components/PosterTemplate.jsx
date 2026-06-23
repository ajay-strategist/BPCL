import React from 'react';

export default function PosterTemplate({ employee }) {
  // Title-case a name like "PRAKRITI OJHA" -> "Prakriti Ojha"
  const toTitleCase = (s) =>
    (s || '')
      .toLowerCase()
      .split(/\s+/)
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(' ')
      .trim();

  const getInitials = (name) => {
    if (!name) return 'BP';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  };

  const fullName = (employee.Name || 'Employee Name').trim();
  const displayName = toTitleCase(fullName);
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const initials = getInitials(fullName);
  const designation = employee.Designation || '';
  const joining = employee['Joining Date'] || '';

  // Build the welcome paragraph from the available fields.
  let welcomeText = `The HR Fraternity of BPCL extends a warm welcome to ${displayName}`;
  if (joining && designation) {
    welcomeText += `, who joined us on ${joining} as ${designation}.`;
  } else if (joining) {
    welcomeText += `, who joined us on ${joining}.`;
  } else if (designation) {
    welcomeText += ` as ${designation}.`;
  } else {
    welcomeText += '.';
  }

  const closingText = `We are delighted to have ${firstName} on board and wish them a long and fruitful association with BPCL. Please join us in extending full support and a warm welcome!`;

  // Education -> bullet list (split on ; or newlines)
  const eduItems = (employee.Education || '')
    .split(/[;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Experience: prefer Experience, fall back to Previous Job
  const experienceText = employee.Experience || employee['Previous Job'] || '';

  return (
    <div className="poster-body" id={`poster-el-${employee.id}`}>
      {/* Thin dark top accent bar */}
      <div className="poster-topbar" />

      <div className="poster-grid">
        {/* ===== LEFT COLUMN ===== */}
        <div className="poster-left">
          <div className="poster-photo-wrapper">
            {employee.base64Image ? (
              <img src={employee.base64Image} alt={displayName} className="poster-photo" />
            ) : (
              <div className="poster-photo-placeholder">{initials}</div>
            )}
          </div>

          <h1 className="poster-name">{fullName.toUpperCase()}</h1>
          {designation && <div className="poster-designation">{designation}</div>}

          <p className="poster-welcome">{welcomeText}</p>

          <div className="poster-contact">
            <div className="poster-contact-title">Contact Details:</div>
            {employee.Email && (
              <div className="poster-contact-line">
                Email: <span className="poster-email">{employee.Email}</span>
              </div>
            )}
            {employee.Mobile && (
              <div className="poster-contact-line">
                Mobile: <strong>{employee.Mobile}</strong>
              </div>
            )}
          </div>
        </div>

        {/* ===== RIGHT COLUMN ===== */}
        <div className="poster-right">
          <div className="poster-title-bar">
            Welcome to the BPCL Family &ndash; {displayName}
          </div>

          <div className="poster-right-body">
            {/* EXPERIENCE */}
            {experienceText && (
              <div className="exp-row">
                <div className="ribbon-vertical">EXPERIENCE</div>
                <p className="exp-text">{experienceText}</p>
              </div>
            )}

            {/* EDUCATION */}
            {eduItems.length > 0 && (
              <div className="edu-row">
                <div className="ribbon-banner">EDUCATION</div>
                <ul className="edu-list">
                  {eduItems.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* FAMILY + HOBBIES */}
            {(employee.Family || employee.Hobbies) && (
              <div className="fh-row">
                {employee.Family && (
                  <div className="fh-col">
                    <div className="fh-header">FAMILY</div>
                    <p className="fh-text">{employee.Family}</p>
                  </div>
                )}
                {employee.Hobbies && (
                  <div className="fh-col">
                    <div className="fh-header">HOBBIES &amp; INTERESTS</div>
                    <p className="fh-text">{employee.Hobbies}</p>
                  </div>
                )}
              </div>
            )}

            {/* CLOSING */}
            <div className="poster-closing">{closingText}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
