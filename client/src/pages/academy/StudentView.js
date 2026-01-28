import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../config/api';
import { normalizeUrl } from '../../utils/apiUrl';

const StudentView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get(`/academy/students/${id}`)
      .then((res) => {
        if (!cancelled) setStudent(res.data.student);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to load student');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="container-fluid">
        <div className="d-flex justify-content-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="container-fluid">
        <button className="btn btn-outline-secondary mb-3" onClick={() => navigate('/academy')}>
          ← Back
        </button>
        <div className="alert alert-danger">{error || 'Student not found'}</div>
      </div>
    );
  }

  const imgSrc = student.profile_image && student.profile_image.trim() !== ''
    ? (student.profile_image.startsWith('http') ? student.profile_image : normalizeUrl(student.profile_image))
    : null;

  return (
    <div className="container-fluid">
      <button className="btn btn-outline-secondary mb-3" onClick={() => navigate('/academy')}>
        ← Back
      </button>

      <div className="card">
        <div className="card-body text-center">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={student.name}
              className="img-fluid rounded-circle mb-3"
              style={{ width: '150px', height: '150px', objectFit: 'cover' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div className="bg-secondary rounded-circle d-inline-flex align-items-center justify-content-center"
                 style={{ width: '150px', height: '150px' }}>
              <i className="bi bi-person text-white" style={{ fontSize: '4rem' }}></i>
            </div>
          )}
          <h4>{student.name}</h4>
          <p className="text-muted">{student.email}</p>
          <span className={`badge bg-${student.status === 'Active' ? 'success' : 'secondary'} fs-6`}>
            {student.status || 'Active'}
          </span>
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <h5 className="card-title">Student Details</h5>
          <p className="card-text"><strong>Student ID:</strong> {student.student_id}</p>
          <p className="card-text"><strong>Email:</strong> {student.email}</p>
          <p className="card-text"><strong>Phone:</strong> {student.phone || 'N/A'}</p>
          <p className="card-text"><strong>Status:</strong> <span className={`badge bg-${student.status === 'Active' ? 'success' : 'secondary'} fs-6`}>{student.status || 'Active'}</span></p>
        </div>
      </div>
    </div>
  );
};

export default StudentView;
