import React, { useEffect, useState } from 'react';
import api from '../../config/api';

const StudentCourses = () => {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/academy/students/my-courses')
      .then(res => setCourses(res.data.courses))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="spinner-border" />;

  return (
    <div className="container-fluid">
      <h3>My Courses</h3>
      <table className="table table-hover">
        <thead>
          <tr>
            <th>Course</th>
            <th>Mode</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {courses.map(c => (
            <tr key={c.id}>
              <td>{c.title}</td>
              <td>{c.mode}</td>
              <td>
                <span className="badge bg-success">{c.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default StudentCourses;
