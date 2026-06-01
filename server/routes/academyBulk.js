const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../utils/auth');
const { logAction } = require('../utils/audit');
const { hasAcademyPermission } = require('../utils/academyPermissions');
const { applyEnrollmentGradeFromSubmission } = require('../utils/academyGradeEnrollment');
const {
  approveStudentRecord,
  approveInstructorRecord,
  approveCourseFeeRecord,
  endorseGradeRecord,
  finalApproveGradeRecord,
  parseIdList
} = require('../utils/academyApprovalHelpers');

function bulkHandler(processOne) {
  return async (req, res) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

      const ids = parseIdList(req.body.ids);
      if (ids.length === 0) {
        return res.status(400).json({ error: 'No valid ids provided' });
      }

      const approved = req.body.approved !== false;
      const notes = req.body.admin_notes || req.body.notes || null;
      const results = { succeeded: [], failed: [] };

      for (const id of ids) {
        const result = await processOne(id, req.user.id, approved, notes);
        if (result.ok) results.succeeded.push(result.id);
        else results.failed.push({ id: result.id, error: result.error });
      }

      await logAction(
        req.user.id,
        'bulk_academy_approval',
        'academy',
        null,
        { succeeded: results.succeeded.length, failed: results.failed.length },
        req
      );

      res.json({
        message: `Processed ${results.succeeded.length} of ${ids.length}`,
        ...results
      });
    } catch (e) {
      console.error('Bulk approval error:', e);
      res.status(500).json({ error: 'Bulk approval failed' });
    }
  };
}

router.post(
  '/students',
  authenticateToken,
  [
    body('ids').isArray({ min: 1 }).withMessage('ids array is required'),
    body('approved').optional().isBoolean(),
    body('admin_notes').optional().trim()
  ],
  async (req, res, next) => {
    try {
      const can =
        req.user.role === 'Admin' || (await hasAcademyPermission(req.user, 'approve:students'));
      if (!can) return res.status(403).json({ error: 'Insufficient permissions to approve students' });
      next();
    } catch (e) {
      next(e);
    }
  },
  bulkHandler((id, userId, approved, notes) => approveStudentRecord(id, userId, approved, notes))
);

router.post(
  '/instructors',
  authenticateToken,
  [
    body('ids').isArray({ min: 1 }),
    body('approved').optional().isBoolean(),
    body('admin_notes').optional().trim()
  ],
  async (req, res, next) => {
    try {
      const can =
        req.user.role === 'Admin' || (await hasAcademyPermission(req.user, 'approve:instructors'));
      if (!can) return res.status(403).json({ error: 'Insufficient permissions to approve instructors' });
      next();
    } catch (e) {
      next(e);
    }
  },
  bulkHandler((id, userId, approved, notes) => approveInstructorRecord(id, userId, approved, notes))
);

router.post(
  '/course-fees',
  authenticateToken,
  [
    body('ids').isArray({ min: 1 }),
    body('approved').optional().isBoolean(),
    body('admin_notes').optional().trim()
  ],
  async (req, res, next) => {
    try {
      const can =
        req.user.role === 'Admin' || (await hasAcademyPermission(req.user, 'approve:course_fees'));
      if (!can) return res.status(403).json({ error: 'Insufficient permissions to approve course fees' });
      next();
    } catch (e) {
      next(e);
    }
  },
  bulkHandler((id, userId, approved, notes) => approveCourseFeeRecord(id, userId, approved, notes))
);

router.post(
  '/grades/endorse',
  authenticateToken,
  [body('ids').isArray({ min: 1 }), body('notes').optional().trim()],
  async (req, res, next) => {
    try {
      if (!(await hasAcademyPermission(req.user, 'grades:endorse'))) {
        return res.status(403).json({ error: 'Insufficient permissions to endorse grades' });
      }
      next();
    } catch (e) {
      next(e);
    }
  },
  async (req, res) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
      const ids = parseIdList(req.body.ids);
      const notes = req.body.notes || null;
      const results = { succeeded: [], failed: [] };
      for (const id of ids) {
        const result = await endorseGradeRecord(id, req.user.id, notes);
        if (result.ok) results.succeeded.push(result.id);
        else results.failed.push({ id: result.id, error: result.error });
      }
      await logAction(req.user.id, 'bulk_endorse_grades', 'academy', null, { count: results.succeeded.length }, req);
      res.json({ message: `Endorsed ${results.succeeded.length} of ${ids.length}`, ...results });
    } catch (e) {
      console.error('Bulk endorse error:', e);
      res.status(500).json({ error: 'Bulk endorse failed' });
    }
  }
);

router.post(
  '/grades/final-approve',
  authenticateToken,
  [body('ids').isArray({ min: 1 }), body('notes').optional().trim()],
  async (req, res, next) => {
    try {
      if (!(await hasAcademyPermission(req.user, 'grades:final_approve'))) {
        return res.status(403).json({ error: 'Only administrators can final-approve grades' });
      }
      next();
    } catch (e) {
      next(e);
    }
  },
  async (req, res) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
      const ids = parseIdList(req.body.ids);
      const notes = req.body.notes || null;
      const results = { succeeded: [], failed: [] };
      for (const id of ids) {
        const result = await finalApproveGradeRecord(
          id,
          req.user.id,
          notes,
          applyEnrollmentGradeFromSubmission
        );
        if (result.ok) results.succeeded.push(result.id);
        else results.failed.push({ id: result.id, error: result.error });
      }
      await logAction(req.user.id, 'bulk_final_approve_grades', 'academy', null, { count: results.succeeded.length }, req);
      res.json({ message: `Final approved ${results.succeeded.length} of ${ids.length}`, ...results });
    } catch (e) {
      console.error('Bulk final approve error:', e);
      res.status(500).json({ error: 'Bulk final approve failed' });
    }
  }
);

module.exports = router;
