import React, { useEffect, useState, useCallback } from 'react';
import api from '../../config/api';
import { Link } from 'react-router-dom';
import { downloadGradesheetPdf, openGradesheetPrintWindow } from '../../utils/buildGradesheetPdf';

const StudentGrades = () => {
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sheetLoading, setSheetLoading] = useState(false);

  const fetchGrades = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get('/academy/students/me/grades');
      setGrades(res.data.grades || []);
    } catch (err) {
      console.error('Failed to fetch grades', err);
      setError(err.response?.data?.error || 'Failed to load grades');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGrades();
  }, [fetchGrades]);

  const loadGradesheetPayload = async () => {
    setSheetLoading(true);
    try {
      const res = await api.get('/academy/students/me/gradesheet');
      return res.data;
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load gradesheet');
      return null;
    } finally {
      setSheetLoading(false);
    }
  };

  const handleView = async () => {
    const data = await loadGradesheetPayload();
    if (data) openGradesheetPrintWindow(data, false);
  };

  const handlePrint = async () => {
    const data = await loadGradesheetPayload();
    if (data) openGradesheetPrintWindow(data, true);
  };

  const handleDownloadPdf = async () => {
    const data = await loadGradesheetPayload();
    if (data) downloadGradesheetPdf(data);
  };

  if (loading) {
    return (
      <div className="container-fluid py-4">
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container-fluid py-4">
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h3 className="mb-0">My Grades</h3>
        <div className="d-flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            disabled={sheetLoading}
            onClick={handleView}
          >
            View gradesheet
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            disabled={sheetLoading}
            onClick={handlePrint}
          >
            Print
          </button>
          <button
            type="button"
            className="btn btn-outline-success btn-sm"
            disabled={sheetLoading}
            onClick={handleDownloadPdf}
          >
            Download PDF
          </button>
          <Link to="/student" className="btn btn-outline-secondary btn-sm">Back to Portal</Link>
        </div>
      </div>
      <p className="text-muted">Only approved grades are shown.</p>
      <table className="table table-hover">
        <thead>
          <tr>
            <th>Course</th>
            <th>Code</th>
            <th>Cohort</th>
            <th>Grade</th>
            <th>Approved</th>
          </tr>
        </thead>
        <tbody>
          {grades.length === 0 ? (
            <tr><td colSpan={5} className="text-muted">No grades yet.</td></tr>
          ) : (
            grades.map((g) => (
              <tr key={g.id}>
                <td>{g.title}</td>
                <td>{g.course_code}</td>
                <td>{g.cohort_name || g.cohort_code || '—'}</td>
                <td><strong>{g.grade}</strong></td>
                <td>{g.approved_at ? new Date(g.approved_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default StudentGrades;
