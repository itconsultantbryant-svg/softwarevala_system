import React, { useEffect, useState } from 'react';
import api from '../../config/api';
import { useAuth } from '../../hooks/useAuth';
import { Link } from 'react-router-dom';

const StudentPortal = () => {
  const { user } = useAuth();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudentProfile();
  }, []);

  const fetchStudentProfile = async () => {
    try {
      const res = await api.get('/academy/students/me');
      setStudent(res.data.student);
    } catch (err) {
      console.error('Failed to load student profile', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="spinner-border text-primary" />;
  }

  return (
    <div className="container-fluid">
      <h1 className="h3 mb-3">Student Portal</h1>

      <div className="row g-3">
        <div className="col-md-3">
          <div className="card">
            <div className="card-body">
              <h6>{student?.name}</h6>
              <p className="text-muted mb-1">{student?.email}</p>
              <span className="badge bg-success">{student?.status}</span>
            </div>
          </div>
        </div>

        <div className="col-md-9">
          <div className="row g-3">
            <PortalCard title="My Courses" link="/student/courses" />
            <PortalCard title="Grades" link="/student/grades" />
            <PortalCard title="Certificates" link="/student/certificates" />
            <PortalCard title="Billing & Enrollment" link="/student/billing" />
          </div>
        </div>
      </div>
    </div>
  );
};

const PortalCard = ({ title, link }) => (
  <div className="col-md-3">
    <Link to={link} className="text-decoration-none">
      <div className="card h-100 text-center">
        <div className="card-body">
          <h6>{title}</h6>
        </div>
      </div>
    </Link>
  </div>
);

export default StudentPortal;
