import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * Redirects authenticated user to role-appropriate home.
 * Use for path "/" inside PrivateRoute.
 */
const NavigateToAppHome = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  switch (user.role) {
    case 'DepartmentHead':
      return <Navigate to="/department-dashboard" replace />;
    case 'Staff':
      return <Navigate to="/staff-dashboard" replace />;
    case 'Student':
      // Academy disabled — route students to main dashboard
      return <Navigate to="/dashboard" replace />;
    case 'Instructor':
      // Academy disabled — route instructors to main dashboard
      return <Navigate to="/dashboard" replace />;
    default:
      return <Navigate to="/dashboard" replace />;
  }
};

export default NavigateToAppHome;
