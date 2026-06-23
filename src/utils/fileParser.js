import * as XLSX from 'xlsx';
import JSZip from 'jszip';

/**
 * Extract Excel "Place in Cell" images (stored as rich values) from an .xlsx
 * archive and return a map of { sheetRowNumber(1-based): dataURL }.
 *
 * Modern Excel stores in-cell pictures not as drawings but as rich values:
 *   cell[vm] -> metadata.valueMetadata[vm-1].rc.v (m)
 *            -> metadata.futureMetadata(XLRICHVALUE)[m].rvb.i (r)
 *            -> richData/rdrichvalue.rv[r].v[0]  (rel index)
 *            -> richData/richValueRel.rel[idx]   (r:id)
 *            -> richData/_rels/richValueRel.xml.rels  -> media file
 */
async function extractInCellImages(arrayBuffer) {
  const map = {};
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const parser = new DOMParser();
    const readXml = async (path) => {
      const f = zip.file(path);
      if (!f) return null;
      return parser.parseFromString(await f.async('string'), 'application/xml');
    };

    const rvRelRelsDoc = await readXml('xl/richData/_rels/richValueRel.xml.rels');
    const rvRelDoc = await readXml('xl/richData/richValueRel.xml');
    const rdDoc = await readXml('xl/richData/rdrichvalue.xml');
    const metaDoc = await readXml('xl/metadata.xml');
    // No rich-value image data => nothing to extract (e.g. plain CSV/XLSX)
    if (!rvRelRelsDoc || !rvRelDoc || !rdDoc || !metaDoc) return map;

    const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const getRid = (el) =>
      el.getAttributeNS(REL_NS, 'id') || el.getAttribute('r:id') || el.getAttribute('id');

    // rels: r:id -> media target
    const relIdToTarget = {};
    Array.from(rvRelRelsDoc.getElementsByTagName('Relationship')).forEach((r) => {
      relIdToTarget[r.getAttribute('Id')] = r.getAttribute('Target');
    });

    // ordered list of rel r:id
    const relList = Array.from(rvRelDoc.getElementsByTagName('rel')).map(getRid);

    // ordered rv -> first <v> (rel index)
    const rvFirst = Array.from(rdDoc.getElementsByTagName('rv')).map((rv) => {
      const v = rv.getElementsByTagName('v')[0];
      return v ? parseInt(v.textContent, 10) : -1;
    });

    // futureMetadata XLRICHVALUE -> ordered rvb i
    const rvbIndex = [];
    Array.from(metaDoc.getElementsByTagName('futureMetadata')).forEach((fm) => {
      if (fm.getAttribute('name') === 'XLRICHVALUE') {
        Array.from(fm.getElementsByTagName('bk')).forEach((bk) => {
          const rvb =
            bk.getElementsByTagName('xlrd:rvb')[0] || bk.getElementsByTagName('rvb')[0];
          rvbIndex.push(rvb ? parseInt(rvb.getAttribute('i'), 10) : -1);
        });
      }
    });

    // valueMetadata -> ordered rc v
    const valueMeta = [];
    const vmParent = metaDoc.getElementsByTagName('valueMetadata')[0];
    if (vmParent) {
      Array.from(vmParent.getElementsByTagName('bk')).forEach((bk) => {
        const rc = bk.getElementsByTagName('rc')[0];
        valueMeta.push(rc ? parseInt(rc.getAttribute('v'), 10) : -1);
      });
    }

    // media path -> dataURL (cached)
    const mediaCache = {};
    const mediaToDataURL = async (target) => {
      const path = target.replace(/^\.\.\//, 'xl/').replace(/^\//, '');
      if (path in mediaCache) return mediaCache[path];
      const f = zip.file(path);
      if (!f) return null;
      const b64 = await f.async('base64');
      const ext = (path.split('.').pop() || '').toLowerCase();
      const mime =
        ext === 'png' ? 'image/png'
        : ext === 'gif' ? 'image/gif'
        : ext === 'bmp' ? 'image/bmp'
        : ext === 'svg' ? 'image/svg+xml'
        : 'image/jpeg';
      const url = `data:${mime};base64,${b64}`;
      mediaCache[path] = url;
      return url;
    };

    // Find every worksheet and read cells carrying a vm (value metadata) attr
    const sheetFiles = Object.keys(zip.files).filter((n) =>
      /^xl\/worksheets\/sheet\d+\.xml$/.test(n)
    );
    for (const sheetPath of sheetFiles) {
      const wsDoc = await readXml(sheetPath);
      if (!wsDoc) continue;
      for (const c of Array.from(wsDoc.getElementsByTagName('c'))) {
        const vm = c.getAttribute('vm');
        const ref = c.getAttribute('r');
        if (!vm || !ref) continue;
        const rowMatch = ref.match(/\d+/);
        if (!rowMatch) continue;
        const sheetRow = parseInt(rowMatch[0], 10);

        const m = valueMeta[parseInt(vm, 10) - 1];
        if (m == null || m < 0) continue;
        const r = rvbIndex[m];
        if (r == null || r < 0) continue;
        const relIdx = rvFirst[r];
        if (relIdx == null || relIdx < 0) continue;
        const relId = relList[relIdx];
        if (!relId) continue;
        const target = relIdToTarget[relId];
        if (!target) continue;
        const url = await mediaToDataURL(target);
        if (url && !map[sheetRow]) map[sheetRow] = url;
      }
    }
  } catch (err) {
    console.warn('In-cell image extraction skipped:', err);
  }
  return map;
}

const HEADER_ALIASES = {
  'Name': ['name', 'employee name', 'emp name', 'full name'],
  'Designation': ['designation', 'role', 'job title', 'title'],
  'Joining Date': ['joining date', 'date of joining', 'doj', 'joining_date', 'date_of_joining'],
  'Experience': ['experience', 'professional journey', 'journey', 'work experience', 'experience details', 'profile summary', 'professional experience'],
  'Education': ['education', 'qualification', 'academic background', 'educational details', 'degree'],
  'Email': ['email', 'email id', 'email_id', 'email address', 'official email'],
  'Mobile': ['mobile', 'mobile no.', 'mobile no', 'mobile number', 'phone', 'phone number', 'contact', 'contact number'],
  'Family': ['family', 'my family', 'family details', 'family background', 'spouse/children', 'details of family members'],
  'Hobbies': ['hobbies', 'hobbies & interest', 'hobbies & interests', 'interests & hobbies', 'interests', 'hobby', 'leisure'],
  'Image URL': ['image url', 'photo url', 'photo', 'image', 'picture', 'photograph', 'image_url', 'photo_url'],
  'Previous Job': ['previous job', 'previous organisation', 'previous organization', 'previous experience', 'last job', 'last company']
};

/**
 * Normalizes and formats a date string to a premium look (e.g. "28th Apr 2026").
 */
function formatDateStr(dateStr) {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  
  // Check if it already matches something like "17th Feb 2025" or "17 Feb 2025"
  if (/^\d+(st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4}$/.test(trimmed)) {
    if (!trimmed.match(/(st|nd|rd|th)/)) {
      const match = trimmed.match(/^(\d+)\s+([A-Za-z]+)\s+(\d{4})$/);
      if (match) {
        const day = parseInt(match[1]);
        const month = match[2];
        const year = match[3];
        const getOrdinalSuffix = (d) => {
          if (d > 3 && d < 21) return 'th';
          switch (d % 10) {
            case 1:  return "st";
            case 2:  return "nd";
            case 3:  return "rd";
            default: return "th";
          }
        };
        const cleanMonth = month.substring(0, 3).charAt(0).toUpperCase() + month.substring(0, 3).slice(1).toLowerCase();
        return `${day}${getOrdinalSuffix(day)} ${cleanMonth} ${year}`;
      }
    }
    return trimmed;
  }
  
  let parts = trimmed.split(/[\/\-]/);
  let day, month, year;
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      year = parseInt(parts[0]);
      month = parseInt(parts[1]) - 1;
      day = parseInt(parts[2]);
    } else if (parts[2].length === 4) {
      day = parseInt(parts[0]);
      month = parseInt(parts[1]) - 1;
      year = parseInt(parts[2]);
      if (month > 11 && day <= 12) {
        const temp = day;
        day = month + 1;
        month = temp - 1;
      }
    }
  }

  if (day && !isNaN(day) && month !== undefined && !isNaN(month) && month >= 0 && month <= 11 && year && !isNaN(year)) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const cleanMonth = months[month];
    const getOrdinalSuffix = (d) => {
      if (d > 3 && d < 21) return 'th';
      switch (d % 10) {
        case 1:  return "st";
        case 2:  return "nd";
        case 3:  return "rd";
        default: return "th";
      }
    };
    return `${day}${getOrdinalSuffix(day)} ${cleanMonth} ${year}`;
  }

  // Fallback to JS Date parsing
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[d.getMonth()];
    const year = d.getFullYear();
    const getOrdinalSuffix = (d) => {
      if (d > 3 && d < 21) return 'th';
      switch (d % 10) {
        case 1:  return "st";
        case 2:  return "nd";
        case 3:  return "rd";
        default: return "th";
      }
    };
    return `${day}${getOrdinalSuffix(day)} ${monthName} ${year}`;
  }

  return trimmed;
}

/**
 * Parses an Excel (.xlsx/.xls) or CSV file in-memory.
 * Returns a Promise that resolves with { employees: Array, missingColumns: Array }
 * 
 * @param {File} file - The file object from upload
 */
export function parseEmployeeFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Read cells as raw strings; keep blank rows so row indices stay aligned
        // with the real spreadsheet rows (needed to map embedded images by row).
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, blankrows: true });

        if (rawRows.length === 0) {
          reject(new Error('The uploaded file is empty.'));
          return;
        }

        // 1-based spreadsheet row of rawRows[0] (handles sheets not starting at A1)
        let originRow = 1;
        try {
          if (worksheet['!ref']) {
            originRow = XLSX.utils.decode_range(worksheet['!ref']).s.r + 1;
          }
        } catch { /* default to 1 */ }

        // Extract any Excel "Place in Cell" images, keyed by spreadsheet row
        const imageMap = await extractInCellImages(arrayBuffer);

        // Clean headers and find their indices (converting non-breaking spaces to standard space)
        const headers = rawRows[0].map(h => (h !== undefined && h !== null ? String(h).replace(/\xa0/g, ' ').trim() : ''));
        const dataRows = rawRows.slice(1);

        const expectedColumns = [
          'Name',
          'Designation',
          'Joining Date',
          'Experience',
          'Education',
          'Email',
          'Mobile',
          'Family',
          'Hobbies',
          'Image URL',
          'Previous Job'
        ];

        // Map column names to index using robust alias mapping
        const colIndices = {};
        expectedColumns.forEach(col => {
          const aliases = HEADER_ALIASES[col] || [col.toLowerCase()];
          const idx = headers.findIndex(h => {
            if (!h) return false;
            const cleanH = String(h).toLowerCase().trim().replace(/\s+/g, ' ');
            return aliases.includes(cleanH);
          });
          colIndices[col] = idx;
        });

        // Name is absolutely mandatory to identify employees
        if (colIndices['Name'] === -1) {
          reject(new Error('Missing required column: "Name". Please make sure the header matches the template.'));
          return;
        }

        // Identify other missing columns for user awareness
        // (Education and Previous Job are alternative to each other, Image URL is optional)
        const optionalColumns = ['Education', 'Previous Job', 'Image URL'];
        const missingColumns = expectedColumns.filter(col => colIndices[col] === -1 && !optionalColumns.includes(col));

        // Map data rows to structured objects (tracking the real sheet row so
        // embedded images can be matched even when blank rows are skipped).
        const employees = [];
        let empId = 0;
        dataRows.forEach((row, di) => {
          const hasContent =
            row && row.length > 0 &&
            row.some(cell => cell !== null && cell !== undefined && cell !== '');
          // A row counts as valid if it has text content OR an embedded image
          const sheetRow = originRow + 1 + di; // header is at originRow
          const embeddedImage = imageMap[sheetRow] || null;
          if (!hasContent && !embeddedImage) return;

          empId += 1;
          const emp = { id: empId };
          expectedColumns.forEach(col => {
            const idx = colIndices[col];
            if (idx !== -1 && idx < row.length && row[idx] !== undefined && row[idx] !== null) {
              let val = String(row[idx]).trim();
              if (col === 'Joining Date') {
                val = formatDateStr(val);
              }
              // Excel in-cell images leave an error token (e.g. "#VALUE!") in the
              // photo cell — treat that as no URL.
              if (col === 'Image URL' && /^#/.test(val)) {
                val = '';
              }
              emp[col] = val;
            } else {
              emp[col] = '';
            }
          });

          // Attach the embedded photo (data URL) if Excel had one in this row
          if (embeddedImage) {
            emp.base64Image = embeddedImage;
          }

          employees.push(emp);
        });

        if (employees.length === 0) {
          reject(new Error('No valid employee records found in the file.'));
          return;
        }

        resolve({ employees, missingColumns });
      } catch (err) {
        reject(new Error(`Failed to parse file: ${err.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('File reading error.'));
    };

    reader.readAsArrayBuffer(file);
  });
}
