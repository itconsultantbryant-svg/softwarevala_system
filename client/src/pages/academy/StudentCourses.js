import React, { useEffect, useState } from 'react';
import api from '../../config/api';
import { Link } from 'react-router-dom';

const StudentCourses = () => {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        setError(null);
        const res = await api.get('/academy/students/me/courses');
        setCourses(res.data.courses || []);
      } catch (err) {
        console.error('Failed to fetch courses', err);
        setError(err.response?.data?.error || 'Failed to load courses');
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
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
        <h3 className="mb-0">My Courses</h3>
        <Link to="/student" className="btn btn-outline-secondary btn-sm">Back to Portal</Link>
      </div>
      <table className="table table-hover">
        <thead>
          <tr>
            <th>Course</th>
            <th>Code</th>
            <th>Mode</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {courses.length === 0 ? (
            <tr><td colSpan={4} className="text-muted">No courses enrolled.</td></tr>
          ) : (
            courses.map((c) => (
              <tr key={c.id}>
                <td>{c.title}</td>
                <td>{c.course_code}</td>
                <td>{c.mode}</td>
                <td>
                  <span className={`badge bg-${c.enrollment_status === 'Enrolled' ? 'success' : 'secondary'}`}>
                    {c.enrollment_status || c.course_status}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default StudentCourses;
