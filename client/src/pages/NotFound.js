import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const NotFound = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const getDashboardPath = () => {
    if (!user) return '/login';
    switch (user.role) {
      case 'Staff':
        return '/staff-dashboard';
      case 'DepartmentHead':
        return '/department-dashboard';
      case 'Admin':
      default:
        return '/dashboard';
    }
  };

  return (
    <div className="container-fluid sv-page d-flex align-items-center justify-content-center" style={{ minHeight: '75vh' }}>
      <div className="sv-panel text-center" style={{ maxWidth: '480px', width: '100%' }}>
        <div className="sv-panel__head justify-content-center">
          <i className="bi bi-signpost-split-fill" />
          Page Not Found
        </div>
        <div className="sv-panel__body py-5">
          <div className="sv-empty-state border-0 py-2">
            <i className="bi bi-exclamation-triangle-fill" style={{ color: '#C41E3A', opacity: 0.8 }} />
            <h1 className="display-3 fw-bold text-primary mb-2">404</h1>
            <p className="text-muted mb-4">
              The page you&apos;re looking for doesn&apos;t exist or has been moved.
            </p>
          </div>
          <div className="d-flex gap-2 justify-content-center flex-wrap">
            <button type="button" className="btn btn-outline-secondary" onClick={() => navigate(-1)}>
              <i className="bi bi-arrow-left me-2" />Go Back
            </button>
            <Link to={getDashboardPath()} className="btn btn-primary">
              <i className="bi bi-speedometer2 me-2" />Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
