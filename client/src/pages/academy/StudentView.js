import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import db from '../../database/db';
import { normalizeUrl } from '../../utils/apiUrl';

const StudentView = () => {
  const [student, setStudent] = useState(null);
  useEffect(() => {
    fetchStudent();
  }, []);

  const fetchStudent = async () => {
    try {
      const res = await db.query('SELECT * FROM students');
      setStudent(res);
    } catch (err) {
      console.error('Error fetching student:', err);
    }
  };

  if (!student) return <div>Student not found</div>;

  return (
    <div className="container-fluid mt-3">
      <div className="row mb-4">
        <div className="col-12 d-flex justify-content-between align-items-center">
          <button className="btn btn-outline-secondary" onClick={() => navigate('/academy')}>
            <i className="bi bi-arrow-left me-2"></i>Back
          </button>
          <h3>Student Details</h3>
        </div>
      </div>

      <div className="row">
        <div className="col-md-4">
          <div className="card text-center">
            <div className="card-body">
              {student.profile_image ? (
                <img src={normalizeUrl(student.profile_image)} alt={student.name} className="img-fluid rounded-circle mb-3" style={{ width: '150px', height: '150px', objectFit: 'cover' }} />
              ) : (
                <div className="bg-secondary rounded-circle d-inline-flex align-items-center justify-content-center mb-3" style={{ width: '150px', height: '150px' }}>
                  <i className="bi bi-person" style={{ fontSize: '4rem', color: 'white' }}></i>
                </div>
              )}
              <h4>{student.name}</h4>
              <p className="text-muted">{student.email}</p>
              <span className={`badge bg-${student.status === 'Active' ? 'success' : 'secondary'} fs-6`}>{student.status}</span>
            </div>
          </div>
        </div>

        <div className="col-md-8">
          <div className="card">
            <div className="card-header"><h5>Student Information</h5></div>
            <div className="card-body">
              <p><strong>Student ID:</strong> {student.student_id}</p>
              <p><strong>Phone:</strong> {student.phone || 'N/A'}</p>
              <p><strong>Enrollment Date:</strong> {student.enrollment_date ? new Date(student.enrollment_date).toLocaleDateString() : 'N/A'}</p>
              <p><strong>Status:</strong> {student.status}</p>
              {coursesEnrolled.length > 0 && (
                <p>
                  <strong>Courses Enrolled:</strong>{' '}
                  {coursesEnrolled.map((id, idx) => (
                    <span key={idx} className="badge bg-info me-1">Course #{id}</span>
                  ))}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentView;
