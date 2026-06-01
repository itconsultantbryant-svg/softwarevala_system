const db = require('../config/database');

async function applyEnrollmentGradeFromSubmission(studentId, courseId, gradeVal) {
  const enrollExists = await db.get(
    'SELECT 1 FROM enrollments WHERE student_id = ? AND course_id = ?',
    [studentId, courseId]
  );
  if (!enrollExists) {
    await db.run(
      `INSERT INTO enrollments (student_id, course_id, enrollment_date, status, grade, completion_date)
       VALUES (?, ?, CURRENT_DATE, 'Completed', ?, CURRENT_DATE)`,
      [studentId, courseId, gradeVal]
    );
  } else {
    await db.run(
      `UPDATE enrollments SET grade = ?, status = 'Completed', completion_date = CURRENT_DATE
       WHERE student_id = ? AND course_id = ?`,
      [gradeVal, studentId, courseId]
    );
  }
}

async function clearEnrollmentAfterApprovedGradeRemoved(studentId, courseId) {
  await db.run(
    `UPDATE enrollments SET grade = NULL, status = 'Enrolled', completion_date = NULL
     WHERE student_id = ? AND course_id = ?`,
    [studentId, courseId]
  );
}

module.exports = {
  applyEnrollmentGradeFromSubmission,
  clearEnrollmentAfterApprovedGradeRemoved
};
