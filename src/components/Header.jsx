import React from 'react';

export default function Header() {
  return (
    <header className="app-header">
      <div className="header-container">
        <div className="logo-section">
          {/* Custom vector SVG representation of BPCL Logo */}
          <svg className="bpcl-logo-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            {/* Outer Blue Circle */}
            <circle cx="50" cy="50" r="48" fill="#003087" stroke="#FFFFFF" strokeWidth="2"/>
            
            {/* Gold flame background pattern for depth */}
            <path d="M 50 15 
                     C 65 30, 75 45, 75 65 
                     C 75 80, 62 88, 50 88 
                     C 38 88, 25 80, 25 65 
                     C 25 45, 35 30, 50 15 Z" 
                  fill="#FFC72C" />
            
            {/* Inner Navy Leaf/Droplet for Petroleum symbol */}
            <path d="M 50 30 
                     C 58 40, 65 52, 65 65 
                     C 65 74, 58 80, 50 80 
                     C 42 80, 35 74, 35 65 
                     C 35 52, 42 40, 50 30 Z" 
                  fill="#003087" />

            {/* Glowing gold dot/flame center representing energy */}
            <circle cx="50" cy="62" r="10" fill="#FFC72C" />
            <path d="M 50 48 L 52 56 L 50 58 L 48 56 Z" fill="#FFC72C" />
          </svg>
          <div className="brand-text">
            <h1>BPCL Welcome Poster Generator</h1>
            <p>Bharat Petroleum Corporation Limited • Human Resource Department</p>
          </div>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#D4AF37', fontWeight: 600 }}>
          Energising Lives
        </div>
      </div>
    </header>
  );
}
