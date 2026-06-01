/**
 * Shared single-item approval logic for academy bulk operations.
 */
const db = require('../config/database');
const { sendNotificationToUser } = require('./notifications');

async function approveStudentRecord(studentId, approverUserId, approved, adminNotes) {
  const student = await db.get(
    `SELECT s.id, s.user_id, s.approved, s.courses_enrolled FROM students s WHERE s.id = ?`,
    [studentId]
  );
  if (!student) {
    return { ok: false, error: 'Student not found', id: studentId };
  }
  if (student.approved !== 0) {
    return { ok: false, error: 'Student is not pending approval', id: studentId };
  }

  const approvedStatus = approved ? 1 : 2;
  await db.run(
    `UPDATE students SET approved = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [approvedStatus, approverUserId, adminNotes || null, studentId]
  );
  await db.run('UPDATE users SET is_active = ? WHERE id = ?', [approved ? 1 : 0, student.user_id]);

  if (approved && student.courses_enrolled) {
    try {
      let courseIds = [];
      try {
        courseIds = JSON.parse(student.courses_enrolled);
      } catch (_e) {
        courseIds = String(student.courses_enrolled)
          .replace(/[\[\]]/g, '')
          .split(',')
          .map((id) => parseInt(id.trim(), 10))
          .filter((n) => !Number.isNaN(n));
      }
      const enrollmentDate = new Date().toISOString().split('T')[0];
      for (const courseId of courseIds) {
        const course = await db.get('SELECT id, course_fee FROM courses WHERE id = ?', [courseId]);
        if (!course) continue;
        try {
          await db.run(
            `INSERT INTO student_course_enrollments (student_id, user_id, course_id, enrollment_date, status)
             VALUES (?, ?, ?, ?, 'Enrolled')`,
            [student.id, student.user_id, courseId, enrollmentDate]
          );
        } catch (enrollError) {
          if (!String(enrollError.message || '').includes('UNIQUE')) {
            console.error('Bulk approve enrollment error:', enrollError.message);
          }
        }
        const courseFee = course.course_fee || 0;
        try {
          await db.run(
            `INSERT INTO student_payments (student_id, user_id, course_id, course_fee, amount_paid, balance)
             VALUES (?, ?, ?, ?, 0, ?)`,
            [student.id, student.user_id, courseId, courseFee, courseFee]
          );
        } catch (paymentError) {
          if (!String(paymentError.message || '').includes('UNIQUE')) {
            console.error('Bulk approve payment error:', paymentError.message);
          }
        }
      }
    } catch (error) {
      console.error('Bulk student course enrollments error:', error);
    }
  }

  return { ok: true, id: studentId };
}

async function approveInstructorRecord(instructorId, approverUserId, approved, adminNotes) {
  const instructor = await db.get('SELECT id, user_id, approved FROM instructors WHERE id = ?', [instructorId]);
  if (!instructor) return { ok: false, error: 'Instructor not found', id: instructorId };
  if (instructor.approved !== 0) {
    return { ok: false, error: 'Instructor is not pending approval', id: instructorId };
  }
  const approvedStatus = approved ? 1 : 2;
  await db.run(
    `UPDATE instructors SET approved = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [approvedStatus, approverUserId, adminNotes || null, instructorId]
  );
  await db.run('UPDATE users SET is_active = ? WHERE id = ?', [approved ? 1 : 0, instructor.user_id]);
  return { ok: true, id: instructorId };
}

async function approveCourseFeeRecord(courseId, approverUserId, approved, adminNotes) {
  const course = await db.get('SELECT id, fee_approved FROM courses WHERE id = ?', [courseId]);
  if (!course) return { ok: false, error: 'Course not found', id: courseId };
  if (course.fee_approved !== 0 && course.fee_approved !== null) {
    return { ok: false, error: 'Course fee is not pending approval', id: courseId };
  }
  const feeApproved = approved ? 1 : 2;
  await db.run(
    `UPDATE courses SET fee_approved = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [feeApproved, approverUserId, adminNotes || null, courseId]
  );
  return { ok: true, id: courseId };
}

async function endorseGradeRecord(gradeId, approverUserId, notes) {
  const g = await db.get('SELECT id, status, endorsed_by FROM grade_submissions WHERE id = ?', [gradeId]);
  if (!g) return { ok: false, error: 'Grade submission not found', id: gradeId };
  if (g.status !== 'Pending') return { ok: false, error: 'Submission is not pending', id: gradeId };
  if (g.endorsed_by) return { ok: false, error: 'Already endorsed', id: gradeId };
  await db.run(
    `UPDATE grade_submissions SET endorsed_by = ?, endorsed_at = CURRENT_TIMESTAMP, notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [approverUserId, notes || null, gradeId]
  );
  return { ok: true, id: gradeId };
}

async function finalApproveGradeRecord(gradeId, approverUserId, notes, applyEnrollmentGradeFromSubmission) {
  const g = await db.get(
    'SELECT id, student_id, course_id, proposed_grade, status, submitted_by FROM grade_submissions WHERE id = ?',
    [gradeId]
  );
  if (!g) return { ok: false, error: 'Grade submission not found', id: gradeId };
  if (g.status !== 'Pending') return { ok: false, error: 'Submission is not pending', id: gradeId };

  await db.run(
    `UPDATE grade_submissions SET status = 'Approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [approverUserId, notes || null, gradeId]
  );

  if (applyEnrollmentGradeFromSubmission) {
    await applyEnrollmentGradeFromSubmission(g.student_id, g.course_id, g.proposed_grade);
  }

  const student = await db.get('SELECT user_id FROM students WHERE id = ?', [g.student_id]);
  if (student) {
    try {
      const c = await db.get('SELECT course_code, title FROM courses WHERE id = ?', [g.course_id]);
      await sendNotificationToUser(student.user_id, {
        title: 'Grade approved',
        message: `Your grade ${g.proposed_grade} for ${c ? c.title || c.course_code : 'course'} has been approved.`,
        type: 'info',
        link: '/student/grades',
        senderId: approverUserId
      });
    } catch (_e) {
      /* non-fatal */
    }
  }
  return { ok: true, id: gradeId };
}

function parseIdList(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n) && n > 0))];
}

module.exports = {
  approveStudentRecord,
  approveInstructorRecord,
  approveCourseFeeRecord,
  endorseGradeRecord,
  finalApproveGradeRecord,
  parseIdList
};
