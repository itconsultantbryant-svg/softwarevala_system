import React, { useEffect, useState } from 'react';
import api from '../../config/api';
import { Link } from 'react-router-dom';

const StudentGrades = () => {
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchGrades = async () => {
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
    };
    fetchGrades();
  }, []);

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
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="mb-0">My Grades</h3>
        <Link to="/student" className="btn btn-outline-secondary btn-sm">Back to Portal</Link>
      </div>
      <p className="text-muted">Only approved grades are shown.</p>
      <table className="table table-hover">
        <thead>
          <tr>
            <th>Course</th>
            <th>Code</th>
            <th>Grade</th>
            <th>Approved</th>
          </tr>
        </thead>
        <tbody>
          {grades.length === 0 ? (
            <tr><td colSpan={4} className="text-muted">No grades yet.</td></tr>
          ) : (
            grades.map((g) => (
              <tr key={g.id}>
                <td>{g.title}</td>
                <td>{g.course_code}</td>
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
