/**
 * Instructor portal helpers — course scope, roster, notifications.
 */
const db = require('../config/database');
const { sendNotificationToUser } = require('./notifications');

async function getInstructorByUserId(userId) {
  if (!userId) return null;
  return db.get(
    `SELECT i.*, u.name, u.email, u.phone, u.profile_image, u.is_active
     FROM instructors i
     JOIN users u ON i.user_id = u.id
     WHERE i.user_id = ?`,
    [userId]
  );
}

async function getInstructorCourseIds(instructor) {
  if (!instructor) return [];
  const ids = new Set();
  if (instructor.courses_assigned) {
    try {
      const parsed = JSON.parse(instructor.courses_assigned);
      if (Array.isArray(parsed)) {
        parsed.forEach((id) => {
          const n = parseInt(id, 10);
          if (!Number.isNaN(n)) ids.add(n);
        });
      }
    } catch (_e) {
      /* ignore invalid JSON */
    }
  }
  const linked = await db.all('SELECT id FROM courses WHERE instructor_id = ?', [instructor.id]);
  (linked || []).forEach((r) => ids.add(r.id));
  return [...ids];
}

async function instructorOwnsCourse(instructor, courseId) {
  const ids = await getInstructorCourseIds(instructor);
  return ids.includes(parseInt(courseId, 10));
}

async function getInstructorCourses(instructor) {
  const ids = await getInstructorCourseIds(instructor);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.all(
    `SELECT c.*, u.name as instructor_name
     FROM courses c
     LEFT JOIN instructors i ON c.instructor_id = i.id
     LEFT JOIN users u ON i.user_id = u.id
     WHERE c.id IN (${placeholders})
     ORDER BY c.course_code ASC`,
    ids
  );
}

async function getStudentsForCourse(courseId) {
  return db.all(
    `SELECT s.id, s.student_id as student_code, s.status, s.approved,
            u.name, u.email, u.phone,
            e.enrollment_date, e.status as enrollment_status
     FROM student_course_enrollments e
     JOIN students s ON e.student_id = s.id
     JOIN users u ON s.user_id = u.id
     WHERE e.course_id = ? AND e.status != 'Dropped'
     ORDER BY u.name ASC`,
    [courseId]
  );
}

async function getStudentsForInstructor(instructor) {
  const ids = await getInstructorCourseIds(instructor);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.all(
    `SELECT DISTINCT s.id, s.student_id as student_code, s.status, s.approved,
            u.name, u.email, u.phone,
            c.id as course_id, c.course_code, c.title as course_title,
            e.enrollment_date, e.status as enrollment_status
     FROM student_course_enrollments e
     JOIN students s ON e.student_id = s.id
     JOIN users u ON s.user_id = u.id
     JOIN courses c ON e.course_id = c.id
     WHERE e.course_id IN (${placeholders}) AND e.status != 'Dropped'
     ORDER BY u.name ASC, c.course_code ASC`,
    ids
  );
}

async function notifyEnrolledStudents(courseId, notification) {
  try {
    const rows = await db.all(
      `SELECT u.id as user_id
       FROM student_course_enrollments e
       JOIN students s ON e.student_id = s.id
       JOIN users u ON s.user_id = u.id
       WHERE e.course_id = ? AND e.status != 'Dropped'`,
      [courseId]
    );
    for (const row of rows || []) {
      await sendNotificationToUser(row.user_id, notification);
    }
  } catch (e) {
    console.error('notifyEnrolledStudents error:', e);
  }
}

async function notifyAcademyCoordinators(notification, excludeUserId = null) {
  try {
    const rows = await db.all(
      `SELECT DISTINCT u.id
       FROM users u
       LEFT JOIN staff_academy_permissions sap
         ON sap.user_id = u.id AND sap.permission_key = 'grades:endorse'
       WHERE u.is_active = 1
         AND (
           sap.permission_key IS NOT NULL
           OR LOWER(TRIM(u.email)) = 'fwallace@prinstinegroup.org'
           OR u.id IN (SELECT manager_id FROM departments WHERE name LIKE '%Academy%' OR name LIKE '%E-Learning%' OR name LIKE '%Elearning%')
         )
         AND u.role IN ('DepartmentHead', 'Staff', 'Admin')`
    );
    for (const row of rows || []) {
      if (excludeUserId && row.id === excludeUserId) continue;
      await sendNotificationToUser(row.id, notification);
    }
  } catch (e) {
    console.error('notifyAcademyCoordinators error:', e);
  }
}

function isInstructorApproved(instructor) {
  return instructor && Number(instructor.approved) === 1;
}

module.exports = {
  getInstructorByUserId,
  getInstructorCourseIds,
  instructorOwnsCourse,
  getInstructorCourses,
  getStudentsForCourse,
  getStudentsForInstructor,
  notifyEnrolledStudents,
  notifyAcademyCoordinators,
  isInstructorApproved
};
