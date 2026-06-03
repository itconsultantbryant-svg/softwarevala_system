import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../config/api';

const StudentAttendance = () => {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/academy/students/me/attendance');
        setRecords(res.data.records || []);
        setSummary(res.data.summary || []);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load attendance');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="container-fluid py-4"><div className="spinner-border text-primary" role="status" /></div>;
  }

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="mb-0">Attendance & Progress</h3>
        <Link to="/student" className="btn btn-outline-secondary btn-sm">Back to Portal</Link>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}

      {summary.length > 0 && (
        <>
          <h5 className="mb-2">Summary by course</h5>
          <div className="table-responsive mb-4">
            <table className="table table-sm table-bordered">
              <thead className="table-light">
                <tr><th>Course</th><th>Present</th><th>Absent</th><th>Late</th><th>Sessions</th></tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.course_id}>
                    <td>{s.course_code} — {s.course_title}</td>
                    <td className="text-success">{s.present_count}</td>
                    <td className="text-danger">{s.absent_count}</td>
                    <td>{s.late_count}</td>
                    <td>{s.total_sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h5 className="mb-2">Session history</h5>
      <div className="table-responsive">
        <table className="table table-hover">
          <thead><tr><th>Date</th><th>Course</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={4} className="text-muted">No attendance records yet.</td></tr>
            ) : records.map((r) => (
              <tr key={r.id}>
                <td>{r.session_date ? new Date(r.session_date).toLocaleDateString() : '—'}</td>
                <td>{r.course_code} — {r.course_title}</td>
                <td>
                  <span className={`badge bg-${r.status === 'Present' ? 'success' : r.status === 'Absent' ? 'danger' : 'warning'}`}>
                    {r.status}
                  </span>
                </td>
                <td>{r.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StudentAttendance;
