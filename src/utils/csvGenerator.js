/**
 * Generates and triggers download of the sample CSV template for BPCL Employee details.
 */
export function downloadSampleCSV() {
  const headers = [
    'Name',
    'Designation',
    'Joining Date',
    'Experience',
    'Education',
    'Email',
    'Mobile',
    'Family',
    'Hobbies',
    'Image URL'
  ];

  const sampleRow = [
    'PRAKRITI OJHA',
    'Sr. Manager - (HRD)',
    '17th Feb 2025',
    'Over 16 years of rich experience in Human Resources...',
    'PGDM (HR) - LIBA Chennai; BA (Hons) - St. Xavier\'s',
    'prakritiojha@bharatpetroleum.in',
    '9748809975',
    'Husband is a business man and son is studying in second standard.',
    'Watching movies cooking and listening to music.',
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400' // Let's use a real public image URL so that when they download and generate, it actually works!
  ];

  // Helper to escape double quotes and wrap in quotes if needed
  const escapeCSVField = (field) => {
    if (field === null || field === undefined) return '';
    const stringified = String(field);
    if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
      return `"${stringified.replace(/"/g, '""')}"`;
    }
    return stringified;
  };

  const csvContent = [
    headers.map(escapeCSVField).join(','),
    sampleRow.map(escapeCSVField).join(',')
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  link.setAttribute('href', url);
  link.setAttribute('download', 'bpcl_welcome_poster_template.csv');
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
