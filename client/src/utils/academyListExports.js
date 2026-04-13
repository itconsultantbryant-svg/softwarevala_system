import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

/** @param {string} base */
function downloadPdf(doc, base) {
  doc.save(`${base}_${stamp()}.pdf`);
}

export function exportCoursesExcel(courses) {
  const rows = (courses || []).map((c) => ({
    'Course code': c.course_code || '',
    Title: c.title || '',
    'Course fee': c.course_fee != null ? Number(c.course_fee) : '',
    Mode: c.mode || '',
    Status: c.status || '',
    'Fee approval': c.fee_approved === 1 ? 'Approved' : c.fee_approved === 2 ? 'Rejected' : 'Pending'
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Courses');
  XLSX.writeFile(wb, `academy-courses_${stamp()}.xlsx`);
}

export function exportCoursesPdf(courses) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const m = 10;
  let y = m;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Prinstine Academy — Courses', m, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString()} · ${(courses || []).length} course(s)`, m, y);
  y += 8;
  (courses || []).forEach((c) => {
    if (y > 185) {
      doc.addPage();
      y = m;
    }
    const line = `${c.course_code || ''} — ${c.title || ''} | ${c.mode || ''} | ${c.status || ''} | Fee: ${c.course_fee ?? ''}`;
    doc.text(line.slice(0, 120), m, y);
    y += 5;
  });
  downloadPdf(doc, 'academy-courses');
}

export function exportStudentsExcel(students) {
  const rows = (students || []).map((s) => ({
    'Student ID': s.student_id || '',
    Name: s.name || '',
    Email: s.email || '',
    Cohort: s.cohort_name || '',
    'Cohort code': s.cohort_code || '',
    Period: s.period || '',
    Status: s.status || '',
    'Approval': s.approved === 1 ? 'Approved' : s.approved === 2 ? 'Rejected' : 'Pending'
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  XLSX.writeFile(wb, `academy-students_${stamp()}.xlsx`);
}

export function exportStudentsPdf(students) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const m = 8;
  let y = m;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Prinstine Academy — Students', m, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString()} · ${(students || []).length} student(s)`, m, y);
  y += 7;
  (students || []).forEach((s) => {
    if (y > 188) {
      doc.addPage();
      y = m;
    }
    const appr = s.approved === 1 ? 'Approved' : s.approved === 2 ? 'Rejected' : 'Pending';
    const line = `${s.student_id || ''} | ${(s.name || '').slice(0, 40)} | ${(s.cohort_name || '—').slice(0, 24)} | ${s.status || ''} | ${appr}`;
    doc.text(line, m, y);
    y += 5;
  });
  downloadPdf(doc, 'academy-students');
}

export function exportInstructorsExcel(instructors) {
  const rows = (instructors || []).map((i) => {
    let nCourses = 0;
    try {
      if (i.courses_assigned) nCourses = JSON.parse(i.courses_assigned).length;
    } catch {
      nCourses = 0;
    }
    return {
      'Instructor ID': i.instructor_id || '',
      Name: i.name || '',
      Email: i.email || '',
      Specialization: i.specialization || '',
      'Courses assigned': nCourses,
      'Approval': i.approved === 1 ? 'Approved' : i.approved === 2 ? 'Rejected' : 'Pending'
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Instructors');
  XLSX.writeFile(wb, `academy-instructors_${stamp()}.xlsx`);
}

export function exportInstructorsPdf(instructors) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const m = 8;
  let y = m;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Prinstine Academy — Instructors (Teachers)', m, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString()} · ${(instructors || []).length} instructor(s)`, m, y);
  y += 7;
  (instructors || []).forEach((i) => {
    if (y > 188) {
      doc.addPage();
      y = m;
    }
    let nCourses = 0;
    try {
      if (i.courses_assigned) nCourses = JSON.parse(i.courses_assigned).length;
    } catch {
      nCourses = 0;
    }
    const appr = i.approved === 1 ? 'Approved' : i.approved === 2 ? 'Rejected' : 'Pending';
    const line = `${i.instructor_id || ''} | ${(i.name || '').slice(0, 36)} | ${(i.specialization || '—').slice(0, 28)} | ${nCourses} course(s) | ${appr}`;
    doc.text(line, m, y);
    y += 5;
  });
  downloadPdf(doc, 'academy-instructors');
}
