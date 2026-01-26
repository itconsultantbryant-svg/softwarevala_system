import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../config/api';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import ProgressReport from './departments/ProgressReport';
import { getSocket } from '../config/socket';
import { normalizeUrl } from '../utils/apiUrl';

/* charts omitted for brevity – unchanged */

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  /* ✅ ATTENDANCE STATE */
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [canSignIn, setCanSignIn] = useState(false);
  const [canSignOut, setCanSignOut] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  /* =========================
     FETCH DASHBOARD STATS
  ========================== */
  const fetchStats = async () => {
    try {
      const res = await api.get('/dashboard/stats');
      setStats(res.data?.stats || res.data);
    } catch (err) {
      console.error(err);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     FETCH TODAY ATTENDANCE
  ========================== */
  const fetchTodayAttendance = async () => {
    try {
      const res = await api.get('/attendance/today/status');
      setTodayAttendance(res.data.attendance);
      setCanSignIn(res.data.canSignIn);
      setCanSignOut(res.data.canSignOut);
    } catch (err) {
      console.error('Attendance status error', err);
    }
  };

  /* =========================
     SIGN IN / SIGN OUT
  ========================== */
  const handleSignIn = async () => {
    try {
      setAttendanceLoading(true);
      await api.post('/attendance/sign-in');
      fetchTodayAttendance();
    } catch (err) {
      alert(err.response?.data?.error || 'Sign in failed');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setAttendanceLoading(true);
      await api.post('/attendance/sign-out');
      fetchTodayAttendance();
    } catch (err) {
      alert(err.response?.data?.error || 'Sign out failed');
    } finally {
      setAttendanceLoading(false);
    }
  };

  /* =========================
     EFFECT
  ========================== */
  useEffect(() => {
    fetchStats();

    if (user?.role === 'Staff') {
      fetchTodayAttendance();
    }

    const socket = getSocket();
    if (socket) {
      socket.on('attendance_updated', fetchTodayAttendance);
      return () => socket.off('attendance_updated', fetchTodayAttendance);
    }
  }, []);

  /* =========================
     ROLE REDIRECTS
  ========================== */
  if (user?.role === 'DepartmentHead') {
    return <Navigate to="/department-dashboard" replace />;
  }

  if (loading) {
    return <div className="text-center mt-5">Loading...</div>;
  }

  return (
    <div className="container-fluid">

      <h3 className="mb-4">Welcome back, {user?.name}</h3>

      {/* =========================
         STAFF DASHBOARD
      ========================== */}
      {user?.role === 'Staff' && (
        <div className="row">

          {/* ✅ CURRENT ATTENDANCE CARD */}
          <div className="col-md-6 mb-3">
            <div className="card border-success">
              <div className="card-body">
                <h5 className="card-title">
                  <i className="bi bi-clock me-2"></i>Today’s Attendance
                </h5>

                {todayAttendance ? (
                  <>
                    <p>
                      <strong>Status:</strong>{' '}
                      <span className="badge bg-warning text-dark">
                        {todayAttendance.status}
                      </span>
                    </p>

                    <p>
                      <strong>Sign In:</strong>{' '}
                      {todayAttendance.sign_in_time
                        ? new Date(todayAttendance.sign_in_time).toLocaleTimeString()
                        : 'Not signed in'}
                    </p>

                    <p>
                      <strong>Sign Out:</strong>{' '}
                      {todayAttendance.sign_out_time
                        ? new Date(todayAttendance.sign_out_time).toLocaleTimeString()
                        : 'Not signed out'}
                    </p>
                  </>
                ) : (
                  <p className="text-muted">No attendance recorded today</p>
                )}

                <div className="d-flex gap-2">
                  {canSignIn && (
                    <button
                      className="btn btn-success w-100"
                      onClick={handleSignIn}
                      disabled={attendanceLoading}
                    >
                      <i className="bi bi-box-arrow-in-right me-1"></i>
                      Sign In
                    </button>
                  )}

                  {canSignOut && (
                    <button
                      className="btn btn-danger w-100"
                      onClick={handleSignOut}
                      disabled={attendanceLoading}
                    >
                      <i className="bi bi-box-arrow-right me-1"></i>
                      Sign Out
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* EXISTING STAFF CONTENT */}
          <div className="col-md-6 mb-3">
            <div className="card">
              <div className="card-body">
                <h5>My Reports</h5>
                <p>
                  <strong>Pending:</strong> {stats?.myReports?.pending || 0}<br />
                  <strong>Total:</strong> {stats?.myReports?.total || 0}
                </p>
                <Link to="/reports" className="btn btn-primary">
                  View Reports
                </Link>
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
};

export default Dashboard;
