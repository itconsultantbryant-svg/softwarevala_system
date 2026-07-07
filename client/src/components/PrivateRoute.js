import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const PrivateRoute = ({ children, requiredRole = null, requiredRoles = null }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="d-flex flex-column justify-content-center align-items-center"
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(145deg, #002244 0%, #003366 100%)'
        }}
      >
        <img
          src="/softwarevala-logo.png"
          alt="Software Vala Liberia"
          style={{
            maxWidth: '240px',
            height: 'auto',
            marginBottom: '1.5rem',
            background: '#fff',
            padding: '8px 16px',
            borderRadius: '8px'
          }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <div className="spinner-border text-light mb-2" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="text-white-50 small mb-0">Loading your workspace...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const roleDenied = requiredRoles
    ? !requiredRoles.includes(user.role)
    : requiredRole && user.role !== requiredRole;

  if (roleDenied) {
    if (user.role === 'DepartmentHead') {
      return <Navigate to="/department-dashboard" replace />;
    }
    if (user.role === 'Staff') {
      return <Navigate to="/staff-dashboard" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default PrivateRoute;
