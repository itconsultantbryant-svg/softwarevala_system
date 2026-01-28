import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../config/api';

const STUDENT_PAYMENT_EMAILS = ['sean@prinstinegroup.org', 'cvulue@prinstinegroup.org'];

const StudentPaymentRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user && !loading) {
      setChecking(false);
      return;
    }
    if (!user || loading) return;

    const check = async () => {
      const email = ((user.email ?? '') + '').toLowerCase().trim();
      const role = (user.role ?? '').toString();

      if (role === 'Admin') {
        setHasAccess(true);
        setChecking(false);
        return;
      }
      if (STUDENT_PAYMENT_EMAILS.includes(email)) {
        setHasAccess(true);
        setChecking(false);
        return;
      }
      if (role === 'DepartmentHead') {
        try {
          const res = await api.get('/departments');
          const dept = (res.data.departments || []).find(
            (d) =>
              (d.manager_id === user.id ||
                ((d.head_email || '').toLowerCase().trim() === email)) &&
              (d.name || '').toLowerCase().match(/finance|academy|elearning/)
          );
          setHasAccess(!!dept);
        } catch (e) {
          setHasAccess(false);
        }
        setChecking(false);
        return;
      }

      setHasAccess(false);
      setChecking(false);
    };

    check();
  }, [user, loading]);

  if (loading || checking) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!hasAccess) return <Navigate to="/dashboard" replace />;

  return children;
};

export default StudentPaymentRoute;
