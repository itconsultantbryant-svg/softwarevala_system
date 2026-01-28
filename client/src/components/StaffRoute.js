import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const HR_OFFICER_EMAILS = ['samantha@prinstinegroup.org'];

const StaffRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const email = ((user.email ?? '') + '').toLowerCase().trim();
  const role = (user.role ?? '').toString();
  const hasAccess =
    role === 'Admin' ||
    role === 'HumanResourcesDepartmentHead' ||
    HR_OFFICER_EMAILS.includes(email);

  if (!hasAccess) {
    return <Navigate to={role === 'Staff' ? '/staff-dashboard' : '/dashboard'} replace />;
  }

  return children;
};

export default StaffRoute;
