import { jsPDF } from 'jspdf';

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Download official Prinstine Academy gradesheet as PDF.
 * @param {Object} payload — from GET /academy/students/.../gradesheet
 */
export function downloadGradesheetPdf(payload) {
  const doc = new jsPDF();
  const margin = 20;
  let y = 18;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(String(payload.academyName || 'Prinstine Academy'), margin, y);
  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const dateStr = payload.issuedDate
    ? new Date(payload.issuedDate).toLocaleDateString(undefined, { dateStyle: 'long' })
    : new Date().toLocaleDateString(undefined, { dateStyle: 'long' });
  doc.text(`Date: ${dateStr}`, margin, y);
  y += 8;
  doc.setFontSize(11);
  doc.text(`Student: ${payload.studentName || ''}`, margin, y);
  y += 7;
  doc.text(`Student ID: ${payload.studentCode || ''}`, margin, y);
  y += 7;
  const cohort = [payload.cohortName, payload.cohortCode].filter(Boolean).join(' — ');
  doc.text(`Cohort: ${cohort || '—'}`, margin, y);
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.text('Course', margin, y);
  doc.text('Grade', 140, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  (payload.grades || []).forEach((g) => {
    const line = `${g.course_code || ''} — ${g.course_title || ''}`;
    const split = doc.splitTextToSize(line, 110);
    doc.text(split, margin, y);
    doc.text(String(g.grade || ''), 140, y);
    y += Math.max(7, split.length * 5);
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  });
  y += 12;
  doc.text('_________________________________', margin, y);
  y += 10;
  doc.text(payload.ceoName || 'Prince S. Cooper', margin, y);
  y += 6;
  doc.text(payload.ceoTitle || 'Chief Executive Officer, Prinstine Academy', margin, y);
  const fname = `gradesheet-${(payload.studentCode || 'student').replace(/[^a-z0-9-_]/gi, '_')}.pdf`;
  doc.save(fname);
}

/**
 * Open a printable HTML view (user can use browser Print to PDF).
 * @param {boolean} autoPrint — if true, opens print dialog
 */
export function openGradesheetPrintWindow(payload, autoPrint = false) {
  const w = window.open('', '_blank');
  if (!w) return;
  const rows = (payload.grades || [])
    .map(
      (g) =>
        `<tr><td>${escapeHtml(g.course_code)} — ${escapeHtml(g.course_title)}</td><td><strong>${escapeHtml(String(g.grade))}</strong></td></tr>`
    )
    .join('');
  const cohort = [payload.cohortName, payload.cohortCode].filter(Boolean).join(' — ') || '—';
  const dateStr = payload.issuedDate
    ? new Date(payload.issuedDate).toLocaleDateString(undefined, { dateStyle: 'long' })
    : new Date().toLocaleDateString(undefined, { dateStyle: 'long' });
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Gradesheet — ${escapeHtml(payload.studentCode)}</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;padding:32px;max-width:720px;margin:0 auto;color:#111;}
    h1{font-size:1.35rem;margin:0 0 8px;}
    .meta{margin:16px 0;line-height:1.6;}
    table{border-collapse:collapse;width:100%;margin-top:16px;}
    th,td{border:1px solid #ccc;padding:10px;text-align:left;}
    th{background:#f5f5f5;}
    .sig{margin-top:56px;}
    .line{border-top:1px solid #333;width:240px;margin-bottom:8px;}
    @media print { body { padding: 16px; } }
  </style></head><body>
  <h1>${escapeHtml(payload.academyName || 'Prinstine Academy')}</h1>
  <p class="meta"><strong>Date:</strong> ${escapeHtml(dateStr)}<br/>
  <strong>Student:</strong> ${escapeHtml(payload.studentName)}<br/>
  <strong>Student ID:</strong> ${escapeHtml(payload.studentCode)}<br/>
  <strong>Cohort:</strong> ${escapeHtml(cohort)}</p>
  <table><thead><tr><th>Course</th><th>Grade</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="sig"><div class="line"></div>
  <p><strong>${escapeHtml(payload.ceoName || 'Prince S. Cooper')}</strong><br/>
  <small>${escapeHtml(payload.ceoTitle || 'Chief Executive Officer, Prinstine Academy')}</small></p></div>
  ${autoPrint ? '<script>window.onload=function(){window.print();}</script>' : ''}
  </body></html>`);
  w.document.close();
}
