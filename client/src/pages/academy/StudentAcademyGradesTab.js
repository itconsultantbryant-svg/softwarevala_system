import React, { useMemo, useState, useEffect, useCallback } from 'react';
import api from '../../config/api';
import { downloadGradesheetPdf, openGradesheetPrintWindow } from '../../utils/buildGradesheetPdf';

/**
 * Academy page tab: all admin-approved grades with cohort / course / student filters and search.
 */
const StudentAcademyGradesTab = ({ cohorts = [], courses = [], students = [] }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('student_name');
  const [sortDir, setSortDir] = useState('asc');
  const [gradesheetLoading, setGradesheetLoading] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/academy/grades/approved');
      setRows(res.data.grades || []);
    } catch (e) {
      console.error(e);
      setError(e.response?.data?.error || 'Failed to load approved grades');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    const q = search.trim().toLowerCase();
    if (cohortId) {
      list = list.filter((g) => String(g.cohort_id || '') === String(cohortId));
    }
    if (courseId) {
      list = list.filter((g) => String(g.course_id) === String(courseId));
    }
    if (studentId) {
      list = list.filter((g) => String(g.student_id) === String(studentId));
    }
    if (q) {
      list = list.filter((g) => {
        const name = (g.student_name || '').toLowerCase();
        const code = (g.student_code || '').toLowerCase();
        return name.includes(q) || code.includes(q);
      });
    }
    const dir = sortDir === 'desc' ? -1 : 1;
    const sorted = [...list].sort((a, b) => {
      let va;
      let vb;
      switch (sortKey) {
        case 'course_title':
          va = `${a.course_code} ${a.course_title}`;
          vb = `${b.course_code} ${b.course_title}`;
          break;
        case 'cohort_name':
          va = a.cohort_name || '';
          vb = b.cohort_name || '';
          break;
        case 'grade':
          va = String(a.grade || '');
          vb = String(b.grade || '');
          break;
        case 'approved_at':
          va = a.approved_at ? new Date(a.approved_at).getTime() : 0;
          vb = b.approved_at ? new Date(b.approved_at).getTime() : 0;
          break;
        default:
          va = (a.student_name || '').toLowerCase();
          vb = (b.student_name || '').toLowerCase();
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return sorted;
  }, [rows, cohortId, courseId, studentId, search, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const openGradesheet = async (studentDbId) => {
    setGradesheetLoading(studentDbId);
    try {
      const res = await api.get(`/academy/students/${studentDbId}/gradesheet`);
      return res.data;
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to load gradesheet');
      return null;
    } finally {
      setGradesheetLoading(null);
    }
  };

  const onView = async (studentDbId) => {
    const data = await openGradesheet(studentDbId);
    if (data) openGradesheetPrintWindow(data, false);
  };

  const onPrint = async (studentDbId) => {
    const data = await openGradesheet(studentDbId);
    if (data) openGradesheetPrintWindow(data, true);
  };

  const onDownload = async (studentDbId) => {
    const data = await openGradesheet(studentDbId);
    if (data) downloadGradesheetPdf(data);
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-body">
        <h5 className="card-title mb-3">Student grades (admin-approved)</h5>
        {error && <div className="alert alert-danger">{error}</div>}

        <div className="row g-2 mb-3">
          <div className="col-md-3">
            <label className="form-label small mb-0">Cohort</label>
            <select
              className="form-select form-select-sm"
              value={cohortId}
              onChange={(e) => setCohortId(e.target.value)}
            >
              <option value="">All cohorts</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.code ? `(${c.code})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label small mb-0">Course</label>
            <select
              className="form-select form-select-sm"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            >
              <option value="">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.course_code} — {c.title}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label small mb-0">Student</label>
            <select
              className="form-select form-select-sm"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">All students</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.student_id})
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label small mb-0">Search (name or ID)</label>
            <input
              type="search"
              className="form-control form-control-sm"
              placeholder="Type to filter…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <p className="text-muted small mb-2">
          Showing {filtered.length} of {rows.length} record{rows.length === 1 ? '' : 's'} — filters apply instantly.
        </p>

        <div className="table-responsive">
          <table className="table table-sm table-hover">
            <thead>
              <tr>
                <th role="button" onClick={() => handleSort('student_name')}>
                  Student {sortKey === 'student_name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th role="button" onClick={() => handleSort('cohort_name')}>
                  Cohort {sortKey === 'cohort_name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th role="button" onClick={() => handleSort('course_title')}>
                  Course {sortKey === 'course_title' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th role="button" onClick={() => handleSort('grade')}>
                  Grade {sortKey === 'grade' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th role="button" onClick={() => handleSort('approved_at')}>
                  Approved {sortKey === 'approved_at' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th>Gradesheet</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted text-center py-4">
                    No approved grades match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <strong>{g.student_name}</strong>
                      <br />
                      <small className="text-muted">{g.student_code}</small>
                    </td>
                    <td>{g.cohort_name || '—'}</td>
                    <td>
                      {g.course_title} <small className="text-muted">({g.course_code})</small>
                    </td>
                    <td>
                      <strong>{g.grade}</strong>
                    </td>
                    <td>{g.approved_at ? new Date(g.approved_at).toLocaleString() : '—'}</td>
                    <td>
                      <div className="btn-group btn-group-sm">
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          disabled={gradesheetLoading === g.student_id}
                          onClick={() => onView(g.student_id)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          disabled={gradesheetLoading === g.student_id}
                          onClick={() => onPrint(g.student_id)}
                        >
                          Print
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-success"
                          disabled={gradesheetLoading === g.student_id}
                          onClick={() => onDownload(g.student_id)}
                        >
                          PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default StudentAcademyGradesTab;
