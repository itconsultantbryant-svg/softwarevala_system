import React, { useMemo, useState, useEffect, useCallback } from 'react';
import api from '../../config/api';
import { useAuth } from '../../hooks/useAuth';
import { getSocket } from '../../config/socket';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

const AttendanceHistory = () => {
  const { user } = useAuth();
  const [attendance, setAttendance] = useState([]);
  const [adminView, setAdminView] = useState(null); // For admin view (week/month/year/date)
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [todayStatus, setTodayStatus] = useState(null);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [lateReason, setLateReason] = useState('');
  const [earlyReason, setEarlyReason] = useState('');
  const [filter, setFilter] = useState({
    dateFrom: '',
    dateTo: '',
    status: ''
  });
  const getDefaultWeekStart = () => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split('T')[0];
  };

  const [adminFilter, setAdminFilter] = useState({
    user_id: '',
    week_start: getDefaultWeekStart(),
    date: '',
    month: '',
    year: new Date().getFullYear(),
    viewType: 'week' // 'week', 'month', 'year', 'date'
  });
  const [approvingId, setApprovingId] = useState(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [bulkSelectedIds, setBulkSelectedIds] = useState([]);
  const [bulkNotes, setBulkNotes] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState('admin'); // Admin defaults to admin view to see staff/dept head attendance

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/attendance');
      setAttendance(response.data.attendance || []);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      // Fetch both Staff and DepartmentHead users for attendance
      const response = await api.get('/users');
      const allUsers = response.data.users || [];
      // Filter to only include Staff and DepartmentHead roles
      const filteredUsers = allUsers.filter(u =>
        u.role === 'Staff' || u.role === 'DepartmentHead'
      );
      setUsers(filteredUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, []);

  const fetchAdminView = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (adminFilter.user_id) params.append('user_id', adminFilter.user_id);

      // Only send the relevant filter for the selected viewType
      if (adminFilter.viewType === 'week' && adminFilter.week_start) {
        params.append('week_start', adminFilter.week_start);
      } else if (adminFilter.viewType === 'date' && adminFilter.date) {
        params.append('date', adminFilter.date);
      } else if (adminFilter.viewType === 'month' && adminFilter.month && adminFilter.year) {
        params.append('month', adminFilter.month);
        params.append('year', adminFilter.year);
      } else if (adminFilter.viewType === 'year' && adminFilter.year) {
        params.append('year', adminFilter.year);
      }

      const response = await api.get(`/attendance/admin/view?${params.toString()}`);
      setAdminView(response.data);
      // Use users from admin view response (includes both Staff and DepartmentHead)
      if (response.data.users) {
        setUsers(response.data.users || []);
      }
    } catch (error) {
      console.error('Error fetching admin view:', error);
    } finally {
      setLoading(false);
    }
  }, [adminFilter]);

  const fetchTodayStatus = useCallback(async () => {
    try {
      const response = await api.get('/attendance/today/status');
      setTodayStatus(response.data);
    } catch (error) {
      console.error('Error fetching today status:', error);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'Admin') {
      fetchAdminView();
      fetchUsers();
    } else {
      fetchAttendance();
    }
    fetchTodayStatus();
    
    // Refresh every minute
    const interval = setInterval(() => {
      fetchTodayStatus();
    }, 60000);
    return () => clearInterval(interval);
  }, [user, fetchAdminView, fetchUsers, fetchAttendance, fetchTodayStatus]);

  // Real-time updates via socket.io
  useEffect(() => {
    if (!user) return;
    
    const socket = getSocket();
    if (!socket) return;
    
    // Wait for socket connection
    if (!socket.connected) {
      socket.once('connect', () => {
        setupSocketListeners();
      });
      return;
    }
    
    setupSocketListeners();
    
    function setupSocketListeners() {

    const handleAttendanceCreated = (data) => {
      console.log('Attendance created event:', data);
      if (user.role === 'Admin') {
        fetchAdminView();
      } else if (data.user_id === user.id) {
        fetchAttendance();
        fetchTodayStatus();
      }
    };

    const handleAttendanceUpdated = (data) => {
      console.log('Attendance updated event:', data);
      if (user.role === 'Admin') {
        fetchAdminView();
      } else if (data.user_id === user.id) {
        fetchAttendance();
        fetchTodayStatus();
      }
    };

    const handleAdminAttendanceUpdated = (data) => {
      console.log('Admin attendance updated event:', data);
      if (user.role === 'Admin') {
        fetchAdminView();
      }
    };

    const handleRequisitionStatusUpdated = (data) => {
      console.log('Requisition status updated event:', data);
      if (user.role === 'Admin' && viewMode === 'admin') {
        // Refresh admin view to show updated requisitions
        setTimeout(() => {
          fetchAdminView();
        }, 300);
      }
    };

    const handleRequisitionCreated = (data) => {
      console.log('Requisition created event:', data);
      if (user.role === 'Admin' && viewMode === 'admin') {
        setTimeout(() => {
          fetchAdminView();
        }, 300);
      }
    };

    socket.on('attendance_created', handleAttendanceCreated);
    socket.on('attendance_updated', handleAttendanceUpdated);
    socket.on('admin_attendance_updated', handleAdminAttendanceUpdated);
    socket.on('requisition_status_updated', handleRequisitionStatusUpdated);
    socket.on('requisition_created', handleRequisitionCreated);

    return () => {
      socket.off('attendance_created', handleAttendanceCreated);
      socket.off('attendance_updated', handleAttendanceUpdated);
      socket.off('admin_attendance_updated', handleAdminAttendanceUpdated);
      socket.off('requisition_status_updated', handleRequisitionStatusUpdated);
      socket.off('requisition_created', handleRequisitionCreated);
    };
    }
  }, [user, viewMode]);

  // (fetch* functions moved above into useCallback for stable deps)

  const handleSignIn = async () => {
    try {
      const now = new Date();
      const standardStartTime = new Date(now);
      standardStartTime.setHours(9, 0, 0, 0);
      const isLate = now > standardStartTime;
      
      if (isLate && !lateReason) {
        alert('Please provide a reason for signing in late (after 9:00 AM)');
        return;
      }
      
      const response = await api.post('/attendance/sign-in', {
        late_reason: isLate ? lateReason : null
      });
      
      alert(response.data.message || 'Signed in successfully');
      setShowSignInModal(false);
      setLateReason('');
      fetchTodayStatus();
      if (user.role === 'Admin') {
        fetchAdminView();
      } else {
        fetchAttendance();
      }
    } catch (error) {
      console.error('Error signing in:', error);
      alert(error.response?.data?.error || 'Failed to sign in');
    }
  };

  const handleSignOut = async () => {
    try {
      const now = new Date();
      const standardEndTime = new Date(now);
      standardEndTime.setHours(17, 0, 0, 0);
      const isEarly = now < standardEndTime;
      
      if (isEarly && !earlyReason) {
        alert('Please provide a reason for signing out early (before 5:00 PM)');
        return;
      }
      
      const response = await api.post('/attendance/sign-out', {
        early_reason: isEarly ? earlyReason : null
      });
      
      alert(response.data.message || 'Signed out successfully');
      setShowSignOutModal(false);
      setEarlyReason('');
      fetchTodayStatus();
      if (user.role === 'Admin') {
        fetchAdminView();
      } else {
        fetchAttendance();
      }
    } catch (error) {
      console.error('Error signing out:', error);
      alert(error.response?.data?.error || 'Failed to sign out');
    }
  };

  const handleApprove = async (attendanceId, status) => {
    if (!approvalNotes && status === 'Rejected') {
      alert('Please provide notes for rejection');
      return;
    }

    try {
      await api.put(`/attendance/${attendanceId}/approve`, {
        status,
        admin_notes: approvalNotes || null
      });
      alert(`Attendance ${status.toLowerCase()} successfully`);
      setApprovingId(null);
      setApprovalNotes('');
      if (user.role === 'Admin' && viewMode === 'admin') {
        fetchAdminView();
      } else {
        fetchAttendance();
      }
    } catch (error) {
      console.error('Error approving attendance:', error);
      alert(error.response?.data?.error || 'Failed to approve attendance');
    }
  };

  const getAdminExportDateRange = () => {
    const viewType = adminFilter.viewType || 'week';
    const now = new Date();

    if (viewType === 'date') {
      const d = adminFilter.date || now.toISOString().split('T')[0];
      return { startDate: d, endDate: d };
    }

    if (viewType === 'month') {
      const year = Number(adminFilter.year || now.getFullYear());
      const month = Number(adminFilter.month || (now.getMonth() + 1));
      const start = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const end = new Date(year, month, 0).toISOString().split('T')[0];
      return { startDate: start, endDate: end };
    }

    if (viewType === 'year') {
      const year = Number(adminFilter.year || now.getFullYear());
      return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
    }

    // week (default)
    const weekStartStr = adminFilter.week_start || getDefaultWeekStart();
    const weekStart = new Date(weekStartStr);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return {
      startDate: weekStart.toISOString().split('T')[0],
      endDate: weekEnd.toISOString().split('T')[0]
    };
  };

  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (adminFilter.user_id) params.append('user_id', adminFilter.user_id);
      const { startDate, endDate } = getAdminExportDateRange();
      params.append('start_date', startDate);
      params.append('end_date', endDate);

      const response = await api.get(`/attendance/export/excel?${params.toString()}`);
      const { data, filename } = response.data;
      
      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
      XLSX.writeFile(wb, filename);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export to Excel');
    }
  };

  const handleExportPDF = async () => {
    try {
      const params = new URLSearchParams();
      if (adminFilter.user_id) params.append('user_id', adminFilter.user_id);
      const { startDate, endDate } = getAdminExportDateRange();
      params.append('start_date', startDate);
      params.append('end_date', endDate);

      const response = await api.get(`/attendance/export/pdf?${params.toString()}`);
      const { data, filename } = response.data;
      
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(data.title, 14, 15);
      doc.setFontSize(10);
      doc.text(`Date Range: ${data.dateRange}`, 14, 25);
      
      // Create table manually
      let y = 35;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 14;
      const colWidths = [25, 40, 50, 30, 30, 15, 15, 20];
      const headers = ['Date', 'Employee', 'Email', 'Sign In', 'Sign Out', 'Late', 'Early', 'Status'];
      
      // Draw header
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      let x = margin;
      headers.forEach((header, i) => {
        doc.text(header, x, y);
        x += colWidths[i];
      });
      
      y += 7;
      doc.setFont(undefined, 'normal');
      
      // Draw rows
      data.records.forEach(record => {
        if (y > pageHeight - 20) {
          doc.addPage();
          y = margin + 10;
        }
        
        const row = [
          record.date,
          record.employee.substring(0, 20),
          record.email.substring(0, 25),
          record.signIn.substring(0, 15),
          record.signOut.substring(0, 15),
          record.late,
          record.early,
          record.status
        ];
        
        x = margin;
        row.forEach((cell, i) => {
          doc.text(String(cell || ''), x, y);
          x += colWidths[i];
        });
        y += 7;
      });

      doc.save(filename);
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      alert('Failed to export to PDF');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      'Pending': { color: 'warning', text: 'Pending' },
      'Approved': { color: 'success', text: 'Approved' },
      'Rejected': { color: 'danger', text: 'Rejected' }
    };
    return badges[status] || { color: 'secondary', text: status };
  };

  const getRequisitionStatusBadge = (status) => {
    if (status.includes('Approved')) {
      return { color: 'success', text: 'Approved' };
    } else if (status.includes('Pending')) {
      return { color: 'warning', text: 'Pending' };
    } else if (status.includes('Rejected')) {
      return { color: 'danger', text: 'Rejected' };
    }
    return { color: 'secondary', text: status };
  };

  const filteredAttendance = attendance.filter(record => {
    if (filter.dateFrom && new Date(record.attendance_date) < new Date(filter.dateFrom)) return false;
    if (filter.dateTo && new Date(record.attendance_date) > new Date(filter.dateTo)) return false;
    if (filter.status && record.status !== filter.status) return false;
    return true;
  });

  // Update admin view when filters change
  useEffect(() => {
    if (user?.role === 'Admin' && viewMode === 'admin') {
      fetchAdminView();
    }
  }, [adminFilter, viewMode, fetchAdminView, user?.role]);

  const adminStats = useMemo(() => {
    const rows = adminView?.attendance || [];
    const pending = rows.filter(r => r.status === 'Pending').length;
    const approved = rows.filter(r => r.status === 'Approved').length;
    const rejected = rows.filter(r => r.status === 'Rejected').length;
    return { total: rows.length, pending, approved, rejected };
  }, [adminView]);

  const pendingRows = useMemo(() => {
    const rows = adminView?.attendance || [];
    return rows.filter((r) => r.status === 'Pending');
  }, [adminView]);

  const bulkToggle = (id) => {
    setBulkSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const bulkToggleAll = (checked) => {
    if (!checked) return setBulkSelectedIds([]);
    setBulkSelectedIds(pendingRows.map((r) => r.id));
  };

  const runBulkDecision = async (status) => {
    if (!bulkSelectedIds.length) {
      alert('Select at least one pending attendance record.');
      return;
    }
    if (status === 'Rejected' && !String(bulkNotes || '').trim()) {
      alert('Please provide notes to reject selected attendance records.');
      return;
    }
    try {
      setBulkSubmitting(true);
      // Run sequentially to avoid overwhelming the server
      for (const id of bulkSelectedIds) {
        await api.put(`/attendance/${id}/approve`, {
          status,
          admin_notes: String(bulkNotes || '').trim() || null
        });
      }
      setBulkSelectedIds([]);
      setBulkNotes('');
      await fetchAdminView();
    } catch (e) {
      console.error('Bulk decision failed:', e);
      alert(e?.response?.data?.error || 'Bulk action failed. Please try again.');
    } finally {
      setBulkSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="row mb-4">
        <div className="col-12 d-flex justify-content-between align-items-center">
          <h2>Attendance History</h2>
          {user.role === 'Admin' && (
            <div className="btn-group" role="group">
              <button
                className={`btn ${viewMode === 'standard' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => {
                  setViewMode('standard');
                  fetchAttendance();
                }}
              >
                Standard View
              </button>
              <button
                className={`btn ${viewMode === 'admin' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => {
                  setViewMode('admin');
                  fetchAdminView();
                }}
              >
                Admin View
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Today's Status Card - Only show in standard view */}
      {viewMode === 'standard' && todayStatus && (
        <div className="card mb-4">
          <div className="card-header bg-primary text-white">
            <h5 className="mb-0">
              <i className="bi bi-calendar-check me-2"></i>Today's Attendance
            </h5>
          </div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-6">
                <p>
                  <strong>Sign In:</strong>{' '}
                  {todayStatus.attendance?.sign_in_time 
                    ? new Date(todayStatus.attendance.sign_in_time).toLocaleString()
                    : 'Not signed in'}
                  {todayStatus.attendance?.sign_in_late && (
                    <span className="badge bg-warning ms-2">LATE</span>
                  )}
                </p>
                {todayStatus.attendance?.sign_in_late_reason && (
                  <p className="text-muted">
                    <small>Reason: {todayStatus.attendance.sign_in_late_reason}</small>
                  </p>
                )}
              </div>
              <div className="col-md-6">
                <p>
                  <strong>Sign Out:</strong>{' '}
                  {todayStatus.attendance?.sign_out_time 
                    ? new Date(todayStatus.attendance.sign_out_time).toLocaleString()
                    : 'Not signed out'}
                  {todayStatus.attendance?.sign_out_early && (
                    <span className="badge bg-warning ms-2">EARLY</span>
                  )}
                </p>
                {todayStatus.attendance?.sign_out_early_reason && (
                  <p className="text-muted">
                    <small>Reason: {todayStatus.attendance.sign_out_early_reason}</small>
                  </p>
                )}
              </div>
            </div>
            <div className="row mt-3">
              <div className="col-12">
                {todayStatus.canSignIn && (
                  <button
                    className="btn btn-success me-2"
                    onClick={() => setShowSignInModal(true)}
                  >
                    <i className="bi bi-box-arrow-in-right me-2"></i>Sign In
                  </button>
                )}
                {todayStatus.canSignOut && (
                  <button
                    className="btn btn-danger"
                    onClick={() => setShowSignOutModal(true)}
                  >
                    <i className="bi bi-box-arrow-right me-2"></i>Sign Out
                  </button>
                )}
                {!todayStatus.canSignIn && !todayStatus.canSignOut && (
                  <span className="badge bg-info">Attendance completed for today</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin View with Weekly Arrangement */}
      {viewMode === 'admin' && user.role === 'Admin' && (
        <>
          {/* Admin Filters */}
          <div className="card mb-4">
            <div className="card-header bg-info text-white">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                <h5 className="mb-0">
                  <i className="bi bi-funnel me-2"></i>Admin Filters
                </h5>
                <div className="d-flex flex-wrap gap-2">
                  <span className="badge bg-dark">Total: {adminStats.total}</span>
                  <span className="badge bg-warning text-dark">Pending: {adminStats.pending}</span>
                  <span className="badge bg-success">Approved: {adminStats.approved}</span>
                  <span className="badge bg-danger">Rejected: {adminStats.rejected}</span>
                </div>
              </div>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-3">
                  <label className="form-label">View</label>
                  <select
                    className="form-select"
                    value={adminFilter.viewType}
                    onChange={(e) => {
                      const viewType = e.target.value;
                      // reset irrelevant fields for cleaner UX
                      setAdminFilter((prev) => ({
                        ...prev,
                        viewType,
                        week_start: viewType === 'week' ? (prev.week_start || getDefaultWeekStart()) : '',
                        date: viewType === 'date' ? prev.date : '',
                        month: viewType === 'month' ? prev.month : '',
                        // keep year for month/year views
                        year: prev.year || new Date().getFullYear()
                      }));
                    }}
                  >
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                    <option value="date">Specific Date</option>
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label">Employee</label>
                  <select
                    className="form-select"
                    value={adminFilter.user_id}
                    onChange={(e) => setAdminFilter({ ...adminFilter, user_id: e.target.value })}
                  >
                    <option value="">All Employees</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
                {adminFilter.viewType === 'week' && (
                  <div className="col-md-3">
                    <label className="form-label">Week Start</label>
                    <input
                      type="date"
                      className="form-control"
                      value={adminFilter.week_start}
                      onChange={(e) => setAdminFilter({ ...adminFilter, week_start: e.target.value })}
                    />
                  </div>
                )}
                {adminFilter.viewType === 'date' && (
                  <div className="col-md-3">
                    <label className="form-label">Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={adminFilter.date}
                      onChange={(e) => setAdminFilter({ ...adminFilter, date: e.target.value })}
                    />
                  </div>
                )}
                {adminFilter.viewType === 'month' && (
                  <>
                    <div className="col-md-3">
                      <label className="form-label">Month</label>
                      <select
                        className="form-select"
                        value={adminFilter.month}
                        onChange={(e) => setAdminFilter({ ...adminFilter, month: e.target.value })}
                      >
                        <option value="">Select Month</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                          <option key={m} value={m}>
                            {new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Year</label>
                      <input
                        type="number"
                        className="form-control"
                        value={adminFilter.year}
                        onChange={(e) => setAdminFilter({ ...adminFilter, year: e.target.value })}
                      />
                    </div>
                  </>
                )}
                {adminFilter.viewType === 'year' && (
                  <div className="col-md-3">
                    <label className="form-label">Year</label>
                    <input
                      type="number"
                      className="form-control"
                      value={adminFilter.year}
                      onChange={(e) => setAdminFilter({ ...adminFilter, year: e.target.value })}
                    />
                  </div>
                )}
              </div>
              <div className="row mt-3">
                <div className="col-12">
                  <button
                    className="btn btn-outline-secondary me-2"
                    onClick={() => {
                      setAdminFilter({
                        user_id: '',
                        week_start: getDefaultWeekStart(),
                        date: '',
                        month: '',
                        year: new Date().getFullYear(),
                        viewType: 'week'
                      });
                    }}
                  >
                    Clear Filters
                  </button>
                  <button
                    className="btn btn-success me-2"
                    onClick={handleExportExcel}
                  >
                    <i className="bi bi-file-earmark-excel me-2"></i>Export Excel
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={handleExportPDF}
                  >
                    <i className="bi bi-file-earmark-pdf me-2"></i>Export PDF
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Pending Approvals (Admin) */}
          {pendingRows.length > 0 && (
            <div className="card mb-4">
              <div className="card-header bg-warning text-dark">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                  <h5 className="mb-0">
                    <i className="bi bi-hourglass-split me-2"></i>
                    Pending Approvals ({pendingRows.length})
                  </h5>
                  <div className="d-flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-success"
                      disabled={bulkSubmitting || bulkSelectedIds.length === 0}
                      onClick={() => runBulkDecision('Approved')}
                    >
                      Approve Selected
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={bulkSubmitting || bulkSelectedIds.length === 0}
                      onClick={() => runBulkDecision('Rejected')}
                    >
                      Reject Selected
                    </button>
                  </div>
                </div>
              </div>
              <div className="card-body">
                <div className="row g-3 align-items-end mb-3">
                  <div className="col-md-8">
                    <label className="form-label">Bulk Notes (required for reject)</label>
                    <input
                      className="form-control"
                      value={bulkNotes}
                      onChange={(e) => setBulkNotes(e.target.value)}
                      placeholder="Notes will be applied to all selected records..."
                      disabled={bulkSubmitting}
                    />
                  </div>
                  <div className="col-md-4">
                    <div className="small text-muted">
                      Selected: <strong>{bulkSelectedIds.length}</strong>
                    </div>
                    {bulkSubmitting && (
                      <div className="small text-muted mt-1">
                        Processing bulk action…
                      </div>
                    )}
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="table table-sm table-hover align-middle">
                    <thead>
                      <tr>
                        <th style={{ width: 34 }}>
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={bulkSelectedIds.length > 0 && bulkSelectedIds.length === pendingRows.length}
                            onChange={(e) => bulkToggleAll(e.target.checked)}
                          />
                        </th>
                        <th>Date</th>
                        <th>Employee</th>
                        <th>Role</th>
                        <th>Sign In</th>
                        <th>Sign Out</th>
                        <th style={{ width: 110 }}>Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingRows.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={bulkSelectedIds.includes(r.id)}
                              onChange={() => bulkToggle(r.id)}
                            />
                          </td>
                          <td>{new Date(r.attendance_date).toLocaleDateString()}</td>
                          <td>
                            <div className="fw-semibold">{r.user_display_name || r.user_name || 'N/A'}</div>
                            <div className="text-muted small">{r.user_email || ''}</div>
                          </td>
                          <td>
                            <span className="badge bg-secondary">{r.user_role || 'N/A'}</span>
                          </td>
                          <td>
                            {r.sign_in_time ? new Date(r.sign_in_time).toLocaleTimeString() : '—'}
                            {r.sign_in_late ? <span className="badge bg-warning text-dark ms-2">Late</span> : null}
                          </td>
                          <td>
                            {r.sign_out_time ? new Date(r.sign_out_time).toLocaleTimeString() : '—'}
                            {r.sign_out_early ? <span className="badge bg-warning text-dark ms-2">Early</span> : null}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => {
                                setApprovingId(r.id);
                                setApprovalNotes('');
                              }}
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Weekly Arrangement View */}
          {adminFilter.viewType === 'week' && adminView && adminView.attendance_by_user && adminView.attendance_by_user.length > 0 ? (
            <div className="card">
              <div className="card-header bg-primary text-white">
                <h5 className="mb-0">
                  <i className="bi bi-calendar-week me-2"></i>Attendance by Week
                </h5>
              </div>
              <div className="card-body">
                {adminView.attendance_by_user.map(userData => (
                  <div key={userData.user_id} className="mb-5">
                    <h4 className="mb-3">{userData.user_name} ({userData.user_email})</h4>
                    {Object.keys(userData.weeks).sort().map(weekKey => {
                      const week = userData.weeks[weekKey];
                      const weekStart = new Date(weekKey);
                      const weekEnd = new Date(weekStart);
                      weekEnd.setDate(weekStart.getDate() + 6);
                      
                      return (
                        <div key={weekKey} className="card mb-3">
                          <div className="card-header bg-light">
                            <strong>Week: {weekStart.toLocaleDateString()} - {weekEnd.toLocaleDateString()}</strong>
                          </div>
                          <div className="card-body">
                            <div className="table-responsive">
                              <table className="table table-sm table-bordered">
                                <thead>
                                  <tr>
                                    <th>Date</th>
                                    <th>Sign In</th>
                                    <th>Sign Out</th>
                                    <th>Status</th>
                                    <th>Requisitions</th>
                                    <th>Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {week.records.map(record => {
                                    const statusBadge = getStatusBadge(record.status);
                                    const requisitions = record.requisitions || [];
                                    
                                    return (
                                      <tr key={record.id}>
                                        <td>{new Date(record.attendance_date).toLocaleDateString()}</td>
                                        <td>
                                          {record.sign_in_time 
                                            ? new Date(record.sign_in_time).toLocaleTimeString()
                                            : 'N/A'}
                                          {record.sign_in_late && (
                                            <span className="badge bg-warning ms-1">Late</span>
                                          )}
                                        </td>
                                        <td>
                                          {record.sign_out_time 
                                            ? new Date(record.sign_out_time).toLocaleTimeString()
                                            : 'N/A'}
                                          {record.sign_out_early && (
                                            <span className="badge bg-warning ms-1">Early</span>
                                          )}
                                        </td>
                                        <td>
                                          <span className={`badge bg-${statusBadge.color}`}>
                                            {statusBadge.text}
                                          </span>
                                        </td>
                                        <td>
                                          {requisitions.length > 0 ? (
                                            <div>
                                              {requisitions.map(req => {
                                                const reqBadge = getRequisitionStatusBadge(req.status);
                                                return (
                                                  <div key={req.id} className="mb-1">
                                                    <span className={`badge bg-${reqBadge.color} me-1`}>
                                                      {req.request_type.replace('_', ' ')}: {reqBadge.text}
                                                    </span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          ) : (
                                            <span className="text-muted">None</span>
                                          )}
                                        </td>
                                        <td>
                                          {record.status === 'Pending' && (
                                            <div className="btn-group" role="group">
                                              <button
                                                className="btn btn-sm btn-success"
                                                onClick={() => {
                                                  setApprovingId(record.id);
                                                  setApprovalNotes('');
                                                }}
                                                title="Approve"
                                              >
                                                <i className="bi bi-check-circle"></i>
                                              </button>
                                              <button
                                                className="btn btn-sm btn-danger"
                                                onClick={() => {
                                                  setApprovingId(record.id);
                                                  setApprovalNotes('');
                                                }}
                                                title="Reject"
                                              >
                                                <i className="bi bi-x-circle"></i>
                                              </button>
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-body text-center py-5">
                <i className="bi bi-calendar-x text-muted" style={{ fontSize: '3rem' }}></i>
                <p className="text-muted mt-3">No attendance records found for the selected filters</p>
              </div>
            </div>
          )}

          {/* Month / Year / Date: Flat table view */}
          {adminFilter.viewType !== 'week' && (
            <div className="card">
              <div className="card-header bg-primary text-white">
                <h5 className="mb-0">
                  <i className="bi bi-table me-2"></i>
                  Attendance ({adminFilter.viewType.toUpperCase()})
                </h5>
              </div>
              <div className="card-body">
                {!adminView?.attendance?.length ? (
                  <div className="text-center py-5">
                    <i className="bi bi-calendar-x text-muted" style={{ fontSize: '3rem' }}></i>
                    <p className="text-muted mt-3">No attendance records found for the selected filters</p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover align-middle">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Employee</th>
                          <th>Role</th>
                          <th>Sign In</th>
                          <th>Sign Out</th>
                          <th>Status</th>
                          <th style={{ width: 120 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminView.attendance.map((record) => {
                          const statusBadge = getStatusBadge(record.status);
                          return (
                            <tr key={record.id}>
                              <td>{new Date(record.attendance_date).toLocaleDateString()}</td>
                              <td>
                                <div className="fw-semibold">{record.user_display_name || record.user_name || 'N/A'}</div>
                                <div className="text-muted small">{record.user_email || ''}</div>
                              </td>
                              <td>
                                <span className="badge bg-secondary">{record.user_role || 'N/A'}</span>
                              </td>
                              <td>
                                {record.sign_in_time ? new Date(record.sign_in_time).toLocaleTimeString() : '—'}
                                {record.sign_in_late ? <span className="badge bg-warning text-dark ms-2">Late</span> : null}
                              </td>
                              <td>
                                {record.sign_out_time ? new Date(record.sign_out_time).toLocaleTimeString() : '—'}
                                {record.sign_out_early ? <span className="badge bg-warning text-dark ms-2">Early</span> : null}
                              </td>
                              <td>
                                <span className={`badge bg-${statusBadge.color}`}>{statusBadge.text}</span>
                              </td>
                              <td>
                                {record.status === 'Pending' ? (
                                  <div className="btn-group btn-group-sm" role="group">
                                    <button
                                      className="btn btn-success"
                                      onClick={() => {
                                        setApprovingId(record.id);
                                        setApprovalNotes('');
                                      }}
                                      title="Approve / Reject"
                                    >
                                      Review
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-muted small">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Standard View */}
      {viewMode === 'standard' && (
        <>
          {/* Filters */}
          <div className="card mb-4">
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-3">
                  <input
                    type="date"
                    className="form-control"
                    placeholder="From Date"
                    value={filter.dateFrom}
                    onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value })}
                  />
                </div>
                <div className="col-md-3">
                  <input
                    type="date"
                    className="form-control"
                    placeholder="To Date"
                    value={filter.dateTo}
                    onChange={(e) => setFilter({ ...filter, dateTo: e.target.value })}
                  />
                </div>
                <div className="col-md-3">
                  <select
                    className="form-select"
                    value={filter.status}
                    onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                  >
                    <option value="">All Statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
                <div className="col-md-3">
                  <button
                    className="btn btn-outline-secondary w-100"
                    onClick={() => setFilter({ dateFrom: '', dateTo: '', status: '' })}
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Attendance Table */}
          <div className="card">
            <div className="card-body">
              {filteredAttendance.length === 0 ? (
                <div className="text-center py-5">
                  <i className="bi bi-calendar-x text-muted" style={{ fontSize: '3rem' }}></i>
                  <p className="text-muted mt-3">No attendance records found</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead>
                      <tr>
                        <th>Date</th>
                        {user.role === 'Admin' && <th>User</th>}
                        <th>Sign In</th>
                        <th>Sign Out</th>
                        <th>Status</th>
                        {user.role === 'Admin' && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAttendance.map((record) => {
                        const statusBadge = getStatusBadge(record.status);
                        return (
                          <tr key={record.id}>
                            <td>{new Date(record.attendance_date).toLocaleDateString()}</td>
                            {user.role === 'Admin' && (
                              <td>{record.user_name || 'N/A'}</td>
                            )}
                            <td>
                              {record.sign_in_time 
                                ? new Date(record.sign_in_time).toLocaleTimeString()
                                : 'N/A'}
                              {record.sign_in_late && (
                                <>
                                  <br />
                                  <small className="text-warning">Late</small>
                                  {record.sign_in_late_reason && (
                                    <>
                                      <br />
                                      <small className="text-muted">{record.sign_in_late_reason}</small>
                                    </>
                                  )}
                                </>
                              )}
                            </td>
                            <td>
                              {record.sign_out_time 
                                ? new Date(record.sign_out_time).toLocaleTimeString()
                                : 'N/A'}
                              {record.sign_out_early && (
                                <>
                                  <br />
                                  <small className="text-warning">Early</small>
                                  {record.sign_out_early_reason && (
                                    <>
                                      <br />
                                      <small className="text-muted">{record.sign_out_early_reason}</small>
                                    </>
                                  )}
                                </>
                              )}
                            </td>
                            <td>
                              <span className={`badge bg-${statusBadge.color}`}>
                                {statusBadge.text}
                              </span>
                            </td>
                            {user.role === 'Admin' && (
                              <td>
                                {record.status === 'Pending' && (
                                  <div className="btn-group" role="group">
                                    <button
                                      className="btn btn-sm btn-success"
                                      onClick={() => {
                                        setApprovingId(record.id);
                                        setApprovalNotes('');
                                      }}
                                      title="Approve"
                                    >
                                      <i className="bi bi-check-circle"></i>
                                    </button>
                                    <button
                                      className="btn btn-sm btn-danger"
                                      onClick={() => {
                                        setApprovingId(record.id);
                                        setApprovalNotes('');
                                      }}
                                      title="Reject"
                                    >
                                      <i className="bi bi-x-circle"></i>
                                    </button>
                                  </div>
                                )}
                                {record.status !== 'Pending' && (
                                  <small className="text-muted">
                                    {record.approver_name || 'N/A'}
                                  </small>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Sign In Modal */}
      {showSignInModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Sign In</h5>
                <button type="button" className="btn-close" onClick={() => {
                  setShowSignInModal(false);
                  setLateReason('');
                }}></button>
              </div>
              <div className="modal-body">
                <p>Current time: {new Date().toLocaleString()}</p>
                <div className="mb-3">
                  <label className="form-label">Late Reason (if applicable)</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={lateReason}
                    onChange={(e) => setLateReason(e.target.value)}
                    placeholder="Please provide a reason if you are signing in late..."
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => {
                  setShowSignInModal(false);
                  setLateReason('');
                }}>Cancel</button>
                <button type="button" className="btn btn-success" onClick={handleSignIn}>
                  Sign In
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sign Out Modal */}
      {showSignOutModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Sign Out</h5>
                <button type="button" className="btn-close" onClick={() => {
                  setShowSignOutModal(false);
                  setEarlyReason('');
                }}></button>
              </div>
              <div className="modal-body">
                <p>Current time: {new Date().toLocaleString()}</p>
                <div className="mb-3">
                  <label className="form-label">Early Sign-Out Reason (if applicable)</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={earlyReason}
                    onChange={(e) => setEarlyReason(e.target.value)}
                    placeholder="Please provide a reason if you are signing out early..."
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => {
                  setShowSignOutModal(false);
                  setEarlyReason('');
                }}>Cancel</button>
                <button type="button" className="btn btn-danger" onClick={handleSignOut}>
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {approvingId && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Approve/Reject Attendance</h5>
                <button type="button" className="btn-close" onClick={() => {
                  setApprovingId(null);
                  setApprovalNotes('');
                }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Notes (required for rejection)</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    placeholder="Enter approval notes..."
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => {
                  setApprovingId(null);
                  setApprovalNotes('');
                }}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-danger me-2"
                  onClick={() => handleApprove(approvingId, 'Rejected')}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={() => handleApprove(approvingId, 'Approved')}
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceHistory;
