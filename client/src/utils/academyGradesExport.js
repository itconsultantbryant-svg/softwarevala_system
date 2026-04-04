import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

function safeFilePart(s) {
  return String(s || 'grades')
    .replace(/[^a-z0-9-_]/gi, '_')
    .slice(0, 80);
}

/**
 * Export filtered approved-grade rows to Excel (.xlsx).
 * @param {Array<Object>} rows — same shape as GET /academy/grades/approved
 */
export function exportApprovedGradesExcel(rows) {
  const sheetData = rows.map((g) => ({
    'Student name': g.student_name || '',
    'Student ID': g.student_code || '',
    Email: g.student_email || '',
    Cohort: g.cohort_name || '',
    'Cohort code': g.cohort_code || '',
    'Course code': g.course_code || '',
    'Course title': g.course_title || '',
    Grade: g.grade != null ? String(g.grade) : '',
    'Approved at': g.approved_at ? new Date(g.approved_at).toLocaleString() : ''
  }));

  const ws = XLSX.utils.json_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Approved grades');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `academy-approved-grades_${stamp}.xlsx`);
}

/**
 * Export filtered approved-grade rows to a simple PDF table (landscape A4).
 * @param {Array<Object>} rows
 */
export function exportApprovedGradesPdf(rows) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const margin = 10;
  let y = margin;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const lineH = 5.5;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Prinstine Academy — Approved student grades', margin, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString()}  ·  ${rows.length} record(s)`, margin, y);
  y += 8;

  const col = { student: 10, cohort: 62, course: 92, grade: 175, approved: 188 };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Student', col.student, y);
  doc.text('Cohort', col.cohort, y);
  doc.text('Course', col.course, y);
  doc.text('Grade', col.grade, y);
  doc.text('Approved', col.approved, y);
  y += 4;
  doc.setDrawColor(160);
  doc.line(margin, y, pageW - margin, y);
  y += lineH;

  doc.setFont('helvetica', 'normal');
  rows.forEach((g) => {
    if (y + lineH > pageH - margin) {
      doc.addPage();
      y = margin;
    }
    const studentTxt = `${(g.student_name || '').slice(0, 32)} (${g.student_code || ''})`;
    const cohortTxt = (g.cohort_name || '—').slice(0, 22);
    const courseTxt = `${g.course_code || ''} — ${(g.course_title || '').slice(0, 40)}`;
    doc.text(studentTxt, col.student, y);
    doc.text(cohortTxt, col.cohort, y);
    doc.text(courseTxt, col.course, y);
    doc.text(String(g.grade ?? ''), col.grade, y);
    doc.text(
      g.approved_at ? new Date(g.approved_at).toLocaleString() : '—',
      col.approved,
      y
    );
    y += lineH;
  });

  doc.save(`academy-approved-grades_${safeFilePart(new Date().toISOString().slice(0, 10))}.pdf`);
}
