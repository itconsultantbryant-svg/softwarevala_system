const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../utils/auth');
const { safeQuery, safeQueryAll } = require('../utils/safeQuery');

// Get dashboard statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user.id;

    let stats = {};

    if (role === 'Admin') {
      // Admin sees all stats
      const [
        totalStaff,
        totalClients,
        totalPartners,
        totalStudents,
        totalInstructors,
        totalCourses,
        pendingReports,
        activeMarketingPlans,
        totalUsers,
        totalDepartments,
        totalCertificates
      ] = await safeQueryAll([
        { sql: 'SELECT COUNT(*) as count FROM staff' },
        { sql: 'SELECT COUNT(*) as count FROM clients' },
        { sql: 'SELECT COUNT(*) as count FROM partners' },
        { sql: 'SELECT COUNT(*) as count FROM students WHERE status = ?', params: ['Active'] },
        { sql: 'SELECT COUNT(*) as count FROM instructors' },
        { sql: 'SELECT COUNT(*) as count FROM courses WHERE status = ?', params: ['Active'] },
        { sql: 'SELECT COUNT(*) as count FROM department_reports WHERE status = ?', params: ['Pending'] },
        { sql: 'SELECT COUNT(*) as count FROM marketing_plans WHERE status = ?', params: ['Active'] },
        { sql: 'SELECT COUNT(*) as count FROM users WHERE is_active = ?', params: [1] },
        { sql: 'SELECT COUNT(*) as count FROM departments' },
        { sql: 'SELECT COUNT(*) as count FROM certificates' }
      ]);

      const fullTimeResult = await safeQuery('SELECT COUNT(*) as count FROM staff WHERE employment_type = ?', ['Full-time']);
      const partTimeResult = await safeQuery('SELECT COUNT(*) as count FROM staff WHERE employment_type = ?', ['Part-time']);
      const internshipResult = await safeQuery('SELECT COUNT(*) as count FROM staff WHERE employment_type = ?', ['Internship']);
      const activeClientsResult = await safeQuery('SELECT COUNT(*) as count FROM clients WHERE status = ?', ['Active']);
      const withLoansResult = await safeQuery('SELECT COUNT(*) as count FROM clients WHERE loan_amount > 0');
      const enrollmentsResult = await safeQuery('SELECT COUNT(*) as count FROM enrollments WHERE status = ?', ['Enrolled']);
      const totalReportsResult = await safeQuery('SELECT COUNT(*) as count FROM department_reports');
      const totalMarketingResult = await safeQuery('SELECT COUNT(*) as count FROM marketing_plans');
      const activePartnersResult = await safeQuery('SELECT COUNT(*) as count FROM partners WHERE status = ?', ['Active']);

      stats = {
        staff: {
          total: totalStaff?.count || 0,
          fullTime: fullTimeResult?.count || 0,
          partTime: partTimeResult?.count || 0,
          internship: internshipResult?.count || 0
        },
        clients: {
          total: totalClients?.count || 0,
          active: activeClientsResult?.count || 0,
          withLoans: withLoansResult?.count || 0
        },
        partners: {
          total: totalPartners?.count || 0,
          active: activePartnersResult?.count || 0
        },
        academy: {
          students: totalStudents?.count || 0,
          instructors: totalInstructors?.count || 0,
          courses: totalCourses?.count || 0,
          enrollments: enrollmentsResult?.count || 0
        },
        certificates: {
          total: totalCertificates?.count || 0
        },
        departments: {
          total: totalDepartments?.count || 0
        },
        users: {
          total: totalUsers?.count || 0
        },
        reports: {
          pending: pendingReports?.count || 0,
          total: totalReportsResult?.count || 0
        },
        marketing: {
          active: activeMarketingPlans?.count || 0,
          total: totalMarketingResult?.count || 0
        }
      };
    } else if (role === 'Staff') {
      // Staff sees limited stats
      const staff = await db.get('SELECT id, department FROM staff WHERE user_id = ?', [userId]);
      const pendingReportsResult = await db.get('SELECT COUNT(*) as count FROM reports WHERE submitted_by = ? AND status = ?', [userId, 'Pending']);
      const totalReportsResult = await db.get('SELECT COUNT(*) as count FROM reports WHERE submitted_by = ?', [userId]);
      const totalClientsResult = await db.get('SELECT COUNT(*) as count FROM clients');
      
      stats = {
        myReports: {
          pending: pendingReportsResult?.count || 0,
          total: totalReportsResult?.count || 0
        },
        clients: {
          total: totalClientsResult?.count || 0
        }
      };
    } else if (role === 'Student') {
      const student = await db.get('SELECT id FROM students WHERE user_id = ?', [userId]);
      if (student) {
        const enrollmentsResult = await db.get('SELECT COUNT(*) as count FROM enrollments WHERE student_id = ?', [student.id]);
        const certificatesResult = await db.get('SELECT COUNT(*) as count FROM certificates WHERE student_id = ?', [student.id]);
        stats = {
          enrollments: enrollmentsResult?.count || 0,
          certificates: certificatesResult?.count || 0
        };
      } else {
        stats = { enrollments: 0, certificates: 0 };
      }
    } else if (role === 'Instructor') {
      const instructor = await db.get('SELECT id FROM instructors WHERE user_id = ?', [userId]);
      if (instructor) {
        const coursesResult = await db.get('SELECT COUNT(*) as count FROM courses WHERE instructor_id = ? AND status = ?', [instructor.id, 'Active']);
        stats = {
          courses: coursesResult?.count || 0
        };
      } else {
        stats = { courses: 0 };
      }
    } else if (role === 'Client') {
      const client = await db.get('SELECT id, total_consultations, loan_amount FROM clients WHERE user_id = ?', [userId]);
      if (client) {
        stats = {
          consultations: client.total_consultations || 0,
          loanAmount: client.loan_amount || 0
        };
      } else {
        stats = { consultations: 0, loanAmount: 0 };
      }
    }

    res.json({ stats });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// Global search
router.get('/search', authenticateToken, [
  // Validation middleware can be added here
], async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json({ results: [] });
    }

    const searchTerm = `%${q}%`;
    const results = [];

    // Search users/staff
    const staff = await db.all(
      `SELECT 'staff' as type, s.id, s.staff_id as identifier, u.name, u.email, u.profile_image, u.role, u.phone
       FROM staff s
       JOIN users u ON s.user_id = u.id
       WHERE u.name LIKE ? OR u.email LIKE ? OR s.staff_id LIKE ?
       LIMIT 5`,
      [searchTerm, searchTerm, searchTerm]
    );
    results.push(...staff);

    // Search clients
    const clients = await db.all(
      `SELECT 'client' as type, c.id, c.client_id as identifier, u.name, u.email, u.profile_image, u.role, u.phone
       FROM clients c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE u.name LIKE ? OR u.email LIKE ? OR c.client_id LIKE ? OR c.company_name LIKE ?
       LIMIT 5`,
      [searchTerm, searchTerm, searchTerm, searchTerm]
    );
    results.push(...clients);

    // Search students
    const students = await db.all(
      `SELECT 'student' as type, s.id, s.student_id as identifier, u.name, u.email, u.profile_image, u.role, u.phone
       FROM students s
       JOIN users u ON s.user_id = u.id
       WHERE u.name LIKE ? OR u.email LIKE ? OR s.student_id LIKE ?
       LIMIT 5`,
      [searchTerm, searchTerm, searchTerm]
    );
    results.push(...students);

    // Search all users (including those not in staff/students/clients)
    const users = await db.all(
      `SELECT 'user' as type, u.id, u.email as identifier, u.name, u.email, u.profile_image, u.role, u.phone
       FROM users u
       WHERE (u.name LIKE ? OR u.email LIKE ? OR u.username LIKE ?)
       AND u.id NOT IN (
         SELECT COALESCE(user_id, 0) FROM staff
         UNION
         SELECT COALESCE(user_id, 0) FROM students
         UNION
         SELECT COALESCE(user_id, 0) FROM clients WHERE user_id IS NOT NULL
       )
       LIMIT 5`,
      [searchTerm, searchTerm, searchTerm]
    );
    results.push(...users);

    // Add profile_image and role to existing results
    const enrichedResults = results.map(result => ({
      ...result,
      profile_image: result.profile_image || null,
      role: result.role || null,
      phone: result.phone || null
    }));

    res.json({ results: enrichedResults });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;

