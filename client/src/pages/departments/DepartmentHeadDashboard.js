import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../config/api';
import { useAuth } from '../../hooks/useAuth';
import ReportTemplateRouter from './ReportTemplateRouter';
import ProgressReport from './ProgressReport';
import PayrollManagement from './PayrollManagement';
import StudentPaymentManagement from './StudentPaymentManagement';
import { exportToPDF, exportToExcel, exportToWord, printContent, formatReportForExport, convertReportsToExcel, formatStaffClientReportForExport } from '../../utils/exportUtils';

const DepartmentHeadDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [reportType, setReportType] = useState(null); // For ICT: 'weekly' or 'monthly'
  const [editingReport, setEditingReport] = useState(null);
  const [viewingReport, setViewingReport] = useState(null);
  const [department, setDepartment] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0
  });
  
  // Combined dashboard state
  const [staffInfo, setStaffInfo] = useState(null);
  const [staffStats, setStaffStats] = useState({
    progressReports: 0,
    pendingReports: 0,
    approvedReports: 0,
    clientReports: 0
  });
  const [isCombinedDashboard, setIsCombinedDashboard] = useState(false);
  
  // Staff client reports for Marketing Department Head
  const [staffClientReports, setStaffClientReports] = useState([]);
  const [isMarketingDeptHead, setIsMarketingDeptHead] = useState(false);
  const [viewingStaffReport, setViewingStaffReport] = useState(null);
  
  // Clients management for Marketing Department Head
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  
  // Department staff management
  const [departmentStaff, setDepartmentStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  
  // Ready for reporting template integration
  const [reportTemplate, setReportTemplate] = useState(null);
  const [showProgressReport, setShowProgressReport] = useState(false);
  const [showPayrollManagement, setShowPayrollManagement] = useState(false);
  const [showStudentPaymentManagement, setShowStudentPaymentManagement] = useState(false);

  useEffect(() => {
    fetchDepartment();
    fetchReports();
    checkIfStaffMember();
    checkIfMarketingDeptHead();
    fetchUnreadNotifications();
  }, []);
  
  useEffect(() => {
    if (department) {
      fetchDepartmentStaff();
    }
  }, [department]);
  
  useEffect(() => {
    if (isMarketingDeptHead) {
      fetchStaffClientReports();
      fetchClients();
    }
  }, [isMarketingDeptHead]);

  const fetchDepartment = async () => {
    try {
      const response = await api.get('/departments');
      const userEmailLower = user.email.toLowerCase().trim();
      const dept = response.data.departments.find(d => 
        d.manager_id === user.id || 
        (d.head_email && d.head_email.toLowerCase().trim() === userEmailLower)
      );
      setDepartment(dept);
      
      // Log department info for debugging
      if (dept) {
        console.log('Department found:', {
          id: dept.id,
          name: dept.name,
          isMarketing: dept.name?.toLowerCase().includes('marketing')
        });
      } else {
        console.warn('No department found for user:', user.email);
      }
    } catch (error) {
      console.error('Error fetching department:', error);
    }
  };

  const checkIfMarketingDeptHead = async () => {
    try {
      const response = await api.get('/departments');
      const userEmailLower = user.email.toLowerCase().trim();
      const dept = response.data.departments.find(d => 
        (d.manager_id === user.id || 
         (d.head_email && d.head_email.toLowerCase().trim() === userEmailLower)) &&
        d.name && d.name.toLowerCase().includes('marketing')
      );
      setIsMarketingDeptHead(!!dept);
    } catch (error) {
      console.error('Error checking marketing department head:', error);
    }
  };

  const fetchStaffClientReports = async () => {
    try {
      const response = await api.get('/staff-client-reports');
      const reports = response.data.reports || [];
      // Filter for reports that need approval
      const pendingReports = reports.filter(r => 
        r.status === 'Submitted' || r.status === 'Draft'
      );
      setStaffClientReports(pendingReports);
    } catch (error) {
      console.error('Error fetching staff client reports:', error);
    }
  };

  const fetchClients = async () => {
    try {
      setClientsLoading(true);
      const response = await api.get('/clients');
      setClients(response.data.clients || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
      setClients([]);
    } finally {
      setClientsLoading(false);
    }
  };

  const handleMarketingReview = async (reportId, approved) => {
    try {
      await api.put(`/staff-client-reports/${reportId}/marketing-review`, {
        status: approved ? 'Marketing_Manager_Approved' : 'Marketing_Manager_Rejected',
        notes: approved ? 'Approved by Marketing Department Head' : 'Rejected by Marketing Department Head'
      });
      alert(`Report ${approved ? 'approved' : 'rejected'} successfully`);
      fetchStaffClientReports(); // Refresh the list
    } catch (error) {
      console.error('Error reviewing report:', error);
      alert(error.response?.data?.error || 'Failed to review report');
    }
  };

  const fetchReports = async () => {
    try {
      setLoading(true);
      const response = await api.get('/department-reports');
      const reportsData = response.data.reports || [];
      setReports(reportsData);
      
      // Calculate stats (including department head pending reviews)
      setStats({
        total: reportsData.length,
        pending: reportsData.filter(r => r.status === 'Pending' || r.status === 'Pending_DeptHead' || (r.dept_head_status && r.dept_head_status === 'Pending')).length,
        approved: reportsData.filter(r => r.status === 'Approved' || r.status === 'Final_Approved').length,
        rejected: reportsData.filter(r => r.status === 'Rejected' || r.dept_head_status === 'DepartmentHead_Rejected').length
      });
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkIfStaffMember = async () => {
    try {
      // Check if this user also has a staff record
      const response = await api.get('/staff');
      const staffList = response.data.staff || [];
      const myStaff = staffList.find(s => s.user_id === user.id);
      
      if (myStaff) {
        setStaffInfo(myStaff);
        setIsCombinedDashboard(true);
        fetchStaffStats();
      }
    } catch (error) {
      console.error('Error checking staff membership:', error);
    }
  };

  const fetchStaffStats = async () => {
    try {
      // Fetch progress reports
      const progressResponse = await api.get('/progress-reports');
      const progressReports = progressResponse.data.reports || [];
      const myProgressReports = progressReports.filter(r => r.created_by === user.id);
      
      // Fetch client reports
      const clientReportsResponse = await api.get('/staff-client-reports');
      const clientReports = clientReportsResponse.data.reports || [];
      const myClientReports = clientReports.filter(r => r.staff_id === user.id);
      
      setStaffStats({
        progressReports: myProgressReports.length,
        pendingReports: myProgressReports.filter(r => r.status === 'pending').length,
        approvedReports: myProgressReports.filter(r => r.status === 'approved').length,
        clientReports: myClientReports.length
      });
    } catch (error) {
      console.error('Error fetching staff stats:', error);
    }
  };

  const fetchDepartmentStaff = async () => {
    if (!department) return;
    try {
      setStaffLoading(true);
      const response = await api.get(`/staff?department=${encodeURIComponent(department.name)}`);
      setDepartmentStaff(response.data.staff || []);
    } catch (error) {
      console.error('Error fetching department staff:', error);
      setDepartmentStaff([]);
    } finally {
      setStaffLoading(false);
    }
  };

  const fetchUnreadNotifications = async () => {
    try {
      const response = await api.get('/notifications/unread-count');
      setUnreadNotifications(response.data.count || 0);
    } catch (error) {
      console.error('Error fetching unread notifications:', error);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingReport(null);
    setReportType(null);
    fetchReports();
  };

  const handleViewReport = async (reportId) => {
    try {
      const response = await api.get(`/department-reports/${reportId}`);
      setViewingReport(response.data.report);
    } catch (error) {
      console.error('Error fetching report:', error);
      alert('Failed to load report details');
    }
  };

  const handleEditReport = async (reportId) => {
    try {
      const response = await api.get(`/department-reports/${reportId}`);
      const report = response.data.report;
      
      // Only allow editing if status is Pending or Pending_DeptHead
      if (!['Pending', 'Pending_DeptHead'].includes(report.status)) {
        alert('You can only edit reports with Pending status');
        return;
      }
      
      setEditingReport(report);
      // Determine report type from title
      const isMonthly = report.title?.toLowerCase().includes('monthly');
      setReportType(isMonthly ? 'monthly' : 'weekly');
      setShowForm(true);
    } catch (error) {
      console.error('Error fetching report:', error);
      alert('Failed to load report for editing');
    }
  };

  const handleDeleteReport = async (reportId) => {
    if (!window.confirm('Are you sure you want to delete this report? This action cannot be undone.')) {
      return;
    }

    try {
      await api.delete(`/department-reports/${reportId}`);
      alert('Report deleted successfully');
      fetchReports();
    } catch (error) {
      console.error('Error deleting report:', error);
      const errorMsg = error.response?.data?.error || 'Failed to delete report';
      alert(errorMsg);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      'Pending': 'warning',
      'Pending_DeptHead': 'info',
      'DepartmentHead_Approved': 'info',
      'DepartmentHead_Rejected': 'danger',
      'Approved': 'success',
      'Rejected': 'danger',
      'Final_Approved': 'success'
    };
    return badges[status] || 'secondary';
  };

  const handleDeptHeadReview = async (reportId, approved) => {
    if (!window.confirm(`Are you sure you want to ${approved ? 'approve' : 'reject'} this report?`)) {
      return;
    }

    try {
      const status = approved ? 'DepartmentHead_Approved' : 'DepartmentHead_Rejected';
      await api.put(`/department-reports/${reportId}/dept-head-review`, {
        status,
        dept_head_notes: ''
      });
      alert(`Report ${approved ? 'approved' : 'rejected'} successfully`);
      fetchReports();
      if (viewingReport && viewingReport.id === reportId) {
        handleViewReport(reportId);
      }
    } catch (error) {
      console.error('Error reviewing report:', error);
      alert(error.response?.data?.error || 'Failed to review report');
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

  if (showPayrollManagement) {
    return (
      <div className="container-fluid">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4>Payroll Management</h4>
          <button 
            className="btn btn-secondary"
            onClick={() => setShowPayrollManagement(false)}
          >
            <i className="bi bi-arrow-left me-2"></i>Back to Dashboard
          </button>
        </div>
        <PayrollManagement />
      </div>
    );
  }

  if (showStudentPaymentManagement) {
    return (
      <div className="container-fluid">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4>Student Payment Management</h4>
          <button 
            className="btn btn-secondary"
            onClick={() => setShowStudentPaymentManagement(false)}
          >
            <i className="bi bi-arrow-left me-2"></i>Back to Dashboard
          </button>
        </div>
        <StudentPaymentManagement />
      </div>
    );
  }

  const isIctDept = department?.name?.toLowerCase().includes('ict');

  return (
    <div className="container-fluid">
      <div className="row">
        {isIctDept && (
          <aside className="col-12 col-lg-2 mb-3 mb-lg-0">
            <nav className="list-group list-group-flush shadow-sm border rounded" aria-label="ICT dashboard">
              <div className="list-group-item bg-light py-2 fw-semibold small text-uppercase text-muted">ICT</div>
              <Link to="/ict/audit-trail" className="list-group-item list-group-item-action">
                <i className="bi bi-journal-text me-2 text-primary"></i>
                System audit trail
              </Link>
            </nav>
          </aside>
        )}
        <div className={isIctDept ? 'col-12 col-lg-10' : 'col-12'}>
      <div className="row mb-4">
        <div className="col-12 d-flex justify-content-between align-items-center">
          <div>
            <h1 className="h3 mb-0">
              {isCombinedDashboard ? 'Combined Dashboard' : 'Department Head Dashboard'}
            </h1>
            {department && (
              <div>
                <p className="text-muted mb-1">
                  <i className="bi bi-building me-2"></i>{department.name}
                  {isCombinedDashboard && staffInfo && (
                    <span className="badge bg-info ms-2">
                      <i className="bi bi-person-badge me-1"></i>Staff Member
                    </span>
                  )}
                </p>
                <small className="text-muted">
                  <i className="bi bi-person me-1"></i>{department.head_name || user.name}
                </small>
              </div>
            )}
          </div>
          {department?.name?.toLowerCase().includes('ict') ? (
            <div className="btn-group" role="group">
              <button className="btn btn-primary" onClick={() => { setReportType('weekly'); setShowForm(true); }}>
                <i className="bi bi-calendar-week me-2"></i>Submit Weekly Report
              </button>
              <button className="btn btn-outline-primary" onClick={() => { setReportType('monthly'); setShowForm(true); }}>
                <i className="bi bi-calendar-month me-2"></i>Submit Monthly Report
              </button>
              <button className="btn btn-success" onClick={() => setShowProgressReport(true)}>
                <i className="bi bi-graph-up me-2"></i>Progress Report
              </button>
            </div>
          ) : department?.name?.toLowerCase().includes('marketing') ? (
            <div className="btn-group-vertical" role="group">
              <button className="btn btn-primary mb-2" onClick={() => { setReportType('client-specific-activities'); setShowForm(true); }}>
                <i className="bi bi-person-check me-2"></i>Client-Specific Activities Report
              </button>
              <button className="btn btn-outline-primary mb-2" onClick={() => { setReportType('weekly-client-officer'); setShowForm(true); }}>
                <i className="bi bi-calendar-week me-2"></i>Weekly Client Officer Report
              </button>
              <button className="btn btn-outline-secondary mb-2" onClick={() => { setReportType(null); setShowForm(true); }}>
                <i className="bi bi-file-text me-2"></i>General Marketing Report
              </button>
              <button className="btn btn-success" onClick={() => setShowProgressReport(true)}>
                <i className="bi bi-graph-up me-2"></i>Progress Report
              </button>
            </div>
          ) : department?.name?.toLowerCase().includes('finance') ? (
            <div className="btn-group-vertical" role="group">
              <button className="btn btn-primary mb-2" onClick={() => { setReportType(null); setShowForm(true); }}>
                <i className="bi bi-file-text me-2"></i>Submit Report
              </button>
              <button className="btn btn-success mb-2" onClick={() => setShowProgressReport(true)}>
                <i className="bi bi-graph-up me-2"></i>Progress Report
              </button>
              <button className="btn btn-info mb-2" onClick={() => setShowPayrollManagement(true)}>
                <i className="bi bi-cash-coin me-2"></i>Payroll Management
              </button>
              <button className="btn btn-warning" onClick={() => setShowStudentPaymentManagement(true)}>
                <i className="bi bi-credit-card me-2"></i>Student Payments
              </button>
            </div>
          ) : /academy|elearning|e-learning/.test(department?.name?.toLowerCase() || '') ? (
            <div className="btn-group-vertical" role="group">
              <button className="btn btn-primary mb-2" onClick={() => { setReportType(null); setShowForm(true); }}>
                <i className="bi bi-plus-circle me-2"></i>Submit Report
              </button>
              <button className="btn btn-success mb-2" onClick={() => setShowProgressReport(true)}>
                <i className="bi bi-graph-up me-2"></i>Progress Report
              </button>
              <button className="btn btn-warning" onClick={() => setShowStudentPaymentManagement(true)}>
                <i className="bi bi-credit-card me-2"></i>Student Payments
              </button>
            </div>
          ) : (
            <div className="btn-group" role="group">
              <button className="btn btn-primary" onClick={() => { setReportType(null); setShowForm(true); }}>
                <i className="bi bi-plus-circle me-2"></i>Submit Report
              </button>
              <button className="btn btn-success" onClick={() => setShowProgressReport(true)}>
                <i className="bi bi-graph-up me-2"></i>Progress Report
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Staff Information Section (if combined dashboard) */}
      {isCombinedDashboard && staffInfo && (
        <div className="row mb-4">
          <div className="col-12">
            <div className="card">
              <div className="card-header bg-primary text-white">
                <h5 className="mb-0">
                  <i className="bi bi-person-circle me-2"></i>Staff Information
                </h5>
              </div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-3">
                    <strong>Staff ID:</strong> {staffInfo.staff_id}
                  </div>
                  <div className="col-md-3">
                    <strong>Position:</strong> {staffInfo.position || 'N/A'}
                  </div>
                  <div className="col-md-3">
                    <strong>Department:</strong> {staffInfo.department || 'N/A'}
                  </div>
                  <div className="col-md-3">
                    <strong>Employment Type:</strong> {staffInfo.employment_type || 'N/A'}
                  </div>
                </div>
                {staffInfo.employment_date && (
                  <div className="row mt-2">
                    <div className="col-md-3">
                      <strong>Employment Date:</strong> {new Date(staffInfo.employment_date).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Staff Statistics (if combined dashboard) */}
      {isCombinedDashboard && (
        <div className="row mb-4">
          <div className="col-md-3">
            <div className="card text-center border-info">
              <div className="card-body">
                <h5 className="card-title text-info">{staffStats.progressReports}</h5>
                <p className="card-text text-muted mb-0">Progress Reports</p>
              </div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card text-center border-warning">
              <div className="card-body">
                <h5 className="card-title text-warning">{staffStats.pendingReports}</h5>
                <p className="card-text text-muted mb-0">Pending Reports</p>
              </div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card text-center border-success">
              <div className="card-body">
                <h5 className="card-title text-success">{staffStats.approvedReports}</h5>
                <p className="card-text text-muted mb-0">Approved Reports</p>
              </div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card text-center border-primary">
              <div className="card-body">
                <h5 className="card-title text-primary">{staffStats.clientReports}</h5>
                <p className="card-text text-muted mb-0">Client Reports</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Staff Quick Actions (if combined dashboard) */}
      {isCombinedDashboard && (
        <div className="row mb-4">
          <div className="col-12">
            <div className="card">
              <div className="card-header">
                <h5 className="mb-0">
                  <i className="bi bi-lightning-charge me-2"></i>Staff Quick Actions
                </h5>
              </div>
              <div className="card-body">
                <div className="btn-group" role="group">
                  <button
                    className="btn btn-outline-primary"
                    onClick={() => setShowProgressReport(true)}
                  >
                    <i className="bi bi-graph-up me-2"></i>Submit Progress Report
                  </button>
                  <button
                    className="btn btn-outline-success"
                    onClick={() => navigate('/staff-client-reports')}
                  >
                    <i className="bi bi-file-earmark-text me-2"></i>Client Reports
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reporting Section - Ready for template integration */}
      {reportTemplate && (
        <div className="row mb-4">
          <div className="col-12">
            <div className="card">
              <div className="card-header">
                <h5 className="mb-0">Reporting Template</h5>
              </div>
              <div className="card-body">
                {/* Template will be integrated here */}
                <p className="text-muted">Reporting template will be integrated here.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Statistics Section */}
      <div className="row mb-4">
        <div className="col-12 mb-3">
          <h4 className="mb-0">
            <i className="bi bi-bar-chart me-2"></i>Department Overview
          </h4>
          <p className="text-muted small">Key metrics and statistics for your department</p>
        </div>
      </div>

      {/* Primary Statistics Cards */}
      <div className="row mb-4">
        <div className="col-md-3 mb-3">
          <div className="card border-primary h-100 shadow-sm">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-muted text-uppercase small mb-2">Total Reports</h6>
                  <h2 className="mb-0 text-primary">{stats.total}</h2>
                </div>
                <div className="bg-primary bg-opacity-10 rounded-circle p-3">
                  <i className="bi bi-file-text text-primary" style={{ fontSize: '1.5rem' }}></i>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3 mb-3">
          <div className="card border-warning h-100 shadow-sm">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-muted text-uppercase small mb-2">Pending Review</h6>
                  <h2 className="mb-0 text-warning">{stats.pending}</h2>
                </div>
                <div className="bg-warning bg-opacity-10 rounded-circle p-3">
                  <i className="bi bi-clock-history text-warning" style={{ fontSize: '1.5rem' }}></i>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3 mb-3">
          <div className="card border-success h-100 shadow-sm">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-muted text-uppercase small mb-2">Approved</h6>
                  <h2 className="mb-0 text-success">{stats.approved}</h2>
                </div>
                <div className="bg-success bg-opacity-10 rounded-circle p-3">
                  <i className="bi bi-check-circle text-success" style={{ fontSize: '1.5rem' }}></i>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3 mb-3">
          <div className="card border-danger h-100 shadow-sm">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-muted text-uppercase small mb-2">Rejected</h6>
                  <h2 className="mb-0 text-danger">{stats.rejected}</h2>
                </div>
                <div className="bg-danger bg-opacity-10 rounded-circle p-3">
                  <i className="bi bi-x-circle text-danger" style={{ fontSize: '1.5rem' }}></i>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Statistics Row */}
      <div className="row mb-4">
        <div className="col-md-4 mb-3">
          <div className="card border-info h-100 shadow-sm">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-muted text-uppercase small mb-2">Department Staff</h6>
                  <h3 className="mb-0 text-info">{departmentStaff.length}</h3>
                  <small className="text-muted">Active members</small>
                </div>
                <div className="bg-info bg-opacity-10 rounded-circle p-3">
                  <i className="bi bi-people text-info" style={{ fontSize: '1.5rem' }}></i>
                </div>
              </div>
            </div>
          </div>
        </div>
        {isMarketingDeptHead && (
          <div className="col-md-4 mb-3">
            <div className="card border-info h-100 shadow-sm">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <h6 className="text-muted text-uppercase small mb-2">Staff Reports Pending</h6>
                    <h3 className="mb-0 text-info">{staffClientReports.length}</h3>
                    <small className="text-muted">Awaiting approval</small>
                  </div>
                  <div className="bg-info bg-opacity-10 rounded-circle p-3">
                    <i className="bi bi-file-earmark-check text-info" style={{ fontSize: '1.5rem' }}></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="col-md-4 mb-3">
          <div className="card border-warning h-100 shadow-sm">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-muted text-uppercase small mb-2">Notifications</h6>
                  <h3 className="mb-0 text-warning">{unreadNotifications}</h3>
                  <small className="text-muted">Unread messages</small>
                </div>
                <div className="bg-warning bg-opacity-10 rounded-circle p-3">
                  <i className="bi bi-bell text-warning" style={{ fontSize: '1.5rem' }}></i>
                </div>
              </div>
              {unreadNotifications > 0 && (
                <div className="mt-2">
                  <button 
                    className="btn btn-sm btn-outline-warning w-100"
                    onClick={() => navigate('/notifications-view')}
                  >
                    <i className="bi bi-eye me-1"></i>View Notifications
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Department Staff Management Section */}
      {department && (
        <div className="row mb-4">
          <div className="col-12">
            <div className="card shadow-sm">
              <div className="card-header bg-light d-flex justify-content-between align-items-center">
                <h5 className="mb-0">
                  <i className="bi bi-people-fill me-2 text-primary"></i>Department Staff
                </h5>
                <span className="badge bg-primary">{departmentStaff.length} Members</span>
              </div>
              <div className="card-body">
                {staffLoading ? (
                  <div className="text-center py-3">
                    <div className="spinner-border spinner-border-sm text-primary" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </div>
                  </div>
                ) : departmentStaff.length === 0 ? (
                  <div className="text-center py-4">
                    <i className="bi bi-people text-muted" style={{ fontSize: '2rem' }}></i>
                    <p className="text-muted mt-2">No staff members found in this department</p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover">
                      <thead className="table-light">
                        <tr>
                          <th>Staff ID</th>
                          <th>Name</th>
                          <th>Position</th>
                          <th>Email</th>
                          <th>Employment Type</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {departmentStaff.slice(0, 5).map((staff) => (
                          <tr key={staff.id}>
                            <td><strong>{staff.staff_id}</strong></td>
                            <td>{staff.name || 'N/A'}</td>
                            <td>{staff.position || 'N/A'}</td>
                            <td>{staff.email || 'N/A'}</td>
                            <td>
                              <span className="badge bg-secondary">{staff.employment_type || 'N/A'}</span>
                            </td>
                            <td>
                              <span className={`badge bg-${staff.is_active ? 'success' : 'danger'}`}>
                                {staff.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {departmentStaff.length > 5 && (
                      <div className="card-footer bg-light text-center">
                        <button 
                          className="btn btn-outline-primary"
                          onClick={() => navigate('/staff')}
                        >
                          View All {departmentStaff.length} Staff Members <i className="bi bi-arrow-right ms-1"></i>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions Section */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="card shadow-sm">
            <div className="card-header bg-light">
              <h5 className="mb-0">
                <i className="bi bi-lightning-charge me-2 text-warning"></i>Quick Actions
              </h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-3 col-sm-6">
                  <button 
                    className="btn btn-outline-primary w-100 h-100 d-flex flex-column align-items-center justify-content-center p-3"
                    onClick={() => navigate('/department-report-history')}
                  >
                    <i className="bi bi-clock-history mb-2" style={{ fontSize: '1.5rem' }}></i>
                    <span>Report History</span>
                  </button>
                </div>
                <div className="col-md-3 col-sm-6">
                  <button 
                    className="btn btn-outline-info w-100 h-100 d-flex flex-column align-items-center justify-content-center p-3"
                    onClick={() => navigate('/notifications-view')}
                  >
                    <i className="bi bi-bell mb-2" style={{ fontSize: '1.5rem' }}></i>
                    <span>Notifications {unreadNotifications > 0 && <span className="badge bg-danger ms-1">{unreadNotifications}</span>}</span>
                  </button>
                </div>
                <div className="col-md-3 col-sm-6">
                  <button 
                    className="btn btn-outline-success w-100 h-100 d-flex flex-column align-items-center justify-content-center p-3"
                    onClick={() => navigate('/my-reports-history')}
                  >
                    <i className="bi bi-journal-text mb-2" style={{ fontSize: '1.5rem' }}></i>
                    <span>My Reports History</span>
                  </button>
                </div>
                <div className="col-md-3 col-sm-6">
                  <button 
                    className="btn btn-outline-secondary w-100 h-100 d-flex flex-column align-items-center justify-content-center p-3"
                    onClick={() => navigate('/communications')}
                  >
                    <i className="bi bi-chat-dots mb-2" style={{ fontSize: '1.5rem' }}></i>
                    <span>Communications</span>
                  </button>
                </div>
                <div className="col-md-3 col-sm-6">
                  <button 
                    className="btn btn-outline-success w-100 h-100 d-flex flex-column align-items-center justify-content-center p-3"
                    onClick={() => navigate('/meetings')}
                  >
                    <i className="bi bi-calendar-event mb-2" style={{ fontSize: '1.5rem' }}></i>
                    <span>Meetings</span>
                  </button>
                </div>
                <div className="col-md-3 col-sm-6">
                  <button 
                    className="btn btn-outline-warning w-100 h-100 d-flex flex-column align-items-center justify-content-center p-3"
                    onClick={() => navigate('/calendar')}
                  >
                    <i className="bi bi-calendar3 mb-2" style={{ fontSize: '1.5rem' }}></i>
                    <span>Calendar</span>
                  </button>
                </div>
                <div className="col-md-3 col-sm-6">
                  <button 
                    className="btn btn-outline-dark w-100 h-100 d-flex flex-column align-items-center justify-content-center p-3"
                    onClick={() => navigate('/archived-documents')}
                  >
                    <i className="bi bi-archive mb-2" style={{ fontSize: '1.5rem' }}></i>
                    <span>Archived Documents</span>
                  </button>
                </div>
                <div className="col-md-3 col-sm-6">
                  <button 
                    className="btn btn-outline-info w-100 h-100 d-flex flex-column align-items-center justify-content-center p-3"
                    onClick={() => navigate('/call-memos')}
                  >
                    <i className="bi bi-telephone mb-2" style={{ fontSize: '1.5rem' }}></i>
                    <span>Call Memos</span>
                  </button>
                </div>
                <div className="col-md-3 col-sm-6">
                  <button 
                    className="btn btn-outline-primary w-100 h-100 d-flex flex-column align-items-center justify-content-center p-3"
                    onClick={() => navigate('/attendance')}
                  >
                    <i className="bi bi-clock-history mb-2" style={{ fontSize: '1.5rem' }}></i>
                    <span>Attendance</span>
                  </button>
                </div>
                <div className="col-md-3 col-sm-6">
                  <button 
                    className="btn btn-outline-info w-100 h-100 d-flex flex-column align-items-center justify-content-center p-3"
                    onClick={() => navigate('/requisitions')}
                  >
                    <i className="bi bi-file-earmark-text mb-2" style={{ fontSize: '1.5rem' }}></i>
                    <span>Requisitions</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reports List */}
      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Recent Reports</h5>
          <button
            className="btn btn-sm btn-outline-primary"
            onClick={() => navigate('/department-report-history')}
          >
            <i className="bi bi-clock-history me-1"></i>View Full History
          </button>
        </div>
        <div className="card-body">
          {reports.length === 0 ? (
            <div className="text-center py-5">
              <i className="bi bi-file-text" style={{ fontSize: '3rem', color: '#ccc' }}></i>
              <p className="text-muted mt-3">No reports submitted yet</p>
              {department?.name?.toLowerCase().includes('ict') ? (
                <div className="btn-group" role="group">
                  <button className="btn btn-primary" onClick={() => { setReportType('weekly'); setShowForm(true); }}>
                    <i className="bi bi-calendar-week me-2"></i>Submit Weekly Report
                  </button>
                  <button className="btn btn-outline-primary" onClick={() => { setReportType('monthly'); setShowForm(true); }}>
                    <i className="bi bi-calendar-month me-2"></i>Submit Monthly Report
                  </button>
                </div>
              ) : department?.name?.toLowerCase().includes('marketing') ? (
                <div className="btn-group-vertical" role="group">
                  <button className="btn btn-primary mb-2" onClick={() => { setReportType('client-specific-activities'); setShowForm(true); }}>
                    <i className="bi bi-person-check me-2"></i>Client-Specific Activities Report
                  </button>
                  <button className="btn btn-outline-primary mb-2" onClick={() => { setReportType('weekly-client-officer'); setShowForm(true); }}>
                    <i className="bi bi-calendar-week me-2"></i>Weekly Client Officer Report
                  </button>
                  <button className="btn btn-outline-secondary" onClick={() => { setReportType(null); setShowForm(true); }}>
                    <i className="bi bi-file-text me-2"></i>General Marketing Report
                  </button>
                </div>
              ) : (department?.name?.toLowerCase().includes('client engagement') || department?.name?.toLowerCase().includes('audit')) ? (
                <div className="btn-group-vertical" role="group">
                  {department?.name?.toLowerCase().includes('client engagement') ? (
                    <>
                      <button className="btn btn-primary mb-2" onClick={() => { setReportType(null); setShowForm(true); }}>
                        <i className="bi bi-file-text me-2"></i>Client Engagement Report
                      </button>
                      <button className="btn btn-outline-primary" onClick={() => { setReportType('audit'); setShowForm(true); }}>
                        <i className="bi bi-shield-check me-2"></i>Audit Report Template
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-primary mb-2" onClick={() => { setReportType(null); setShowForm(true); }}>
                        <i className="bi bi-shield-check me-2"></i>Audit Report
                      </button>
                      <button className="btn btn-outline-primary" onClick={() => { setReportType('client-engagement'); setShowForm(true); }}>
                        <i className="bi bi-file-text me-2"></i>Client Engagement Report Template
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <button className="btn btn-primary" onClick={() => { setReportType(null); setShowForm(true); }}>
                  Submit Your First Report
                </button>
              )}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Submitted Date</th>
                    <th>Reviewed Date</th>
                    <th>Reviewed By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.slice(0, 5).map((report) => (
                    <tr key={report.id}>
                      <td>
                        <strong>{report.title}</strong>
                        {report.content && report.content.length > 50 && (
                          <>
                            <br />
                            <small className="text-muted">
                              {report.content.substring(0, 50)}...
                            </small>
                          </>
                        )}
                      </td>
                      <td>
                        <span className={`badge bg-${getStatusBadge(report.status)}`}>
                          {report.status === 'Pending_DeptHead' ? 'Pending Review' : report.status}
                        </span>
                        {report.dept_head_status && (
                          <>
                            <br />
                            <span className={`badge bg-${getStatusBadge(report.dept_head_status)} mt-1`} style={{ fontSize: '0.75rem' }}>
                              Dept Head: {report.dept_head_status === 'DepartmentHead_Approved' ? 'Approved' : 
                                         report.dept_head_status === 'DepartmentHead_Rejected' ? 'Rejected' : 'Pending'}
                            </span>
                          </>
                        )}
                      </td>
                      <td>{new Date(report.created_at).toLocaleDateString()}</td>
                      <td>
                        {report.reviewed_at 
                          ? new Date(report.reviewed_at).toLocaleDateString()
                          : report.dept_head_reviewed_at
                          ? new Date(report.dept_head_reviewed_at).toLocaleDateString()
                          : '-'
                        }
                      </td>
                      <td>{report.reviewed_by_name || report.dept_head_reviewed_by_name || '-'}</td>
                      <td>
                        <div className="btn-group" role="group">
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleViewReport(report.id)}
                            title="View Report"
                          >
                            <i className="bi bi-eye"></i>
                          </button>
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => printContent(report.title, formatReportForExport(report, 'department'))}
                            title="Print"
                          >
                            <i className="bi bi-printer"></i>
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => exportToPDF(report.title, formatReportForExport(report, 'department'))}
                            title="Export to PDF"
                          >
                            <i className="bi bi-file-pdf"></i>
                          </button>
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => exportToWord(report.title, formatReportForExport(report, 'department'))}
                            title="Export to Word"
                          >
                            <i className="bi bi-file-word"></i>
                          </button>
                          <button
                            className="btn btn-sm btn-outline-success"
                            onClick={() => exportToExcel(report.title, convertReportsToExcel([report], 'department'))}
                            title="Export to Excel"
                          >
                            <i className="bi bi-file-excel"></i>
                          </button>
                          {/* Show review buttons for Department Head when reports need department head review */}
                          {(report.status === 'Pending_DeptHead' || (report.dept_head_status && report.dept_head_status === 'Pending')) && (
                            <>
                              <button
                                className="btn btn-sm btn-outline-success"
                                onClick={() => handleDeptHeadReview(report.id, true)}
                                title="Approve Report"
                              >
                                <i className="bi bi-check-circle"></i>
                              </button>
                              <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => handleDeptHeadReview(report.id, false)}
                                title="Reject Report"
                              >
                                <i className="bi bi-x-circle"></i>
                              </button>
                            </>
                          )}
                          {(report.status === 'Pending' || report.status === 'Pending_DeptHead') && report.submitted_by === user.id && (
                            <button
                              className="btn btn-sm btn-outline-warning"
                              onClick={() => handleEditReport(report.id)}
                              title="Edit Report"
                            >
                              <i className="bi bi-pencil"></i>
                            </button>
                          )}
                          {report.submitted_by === user.id && (
                            <button
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => handleDeleteReport(report.id)}
                              title="Delete Report"
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reports.length > 5 && (
                <div className="card-footer text-center">
                  <button
                    className="btn btn-outline-primary"
                    onClick={() => navigate('/department-report-history')}
                  >
                    View All {reports.length} Reports <i className="bi bi-arrow-right ms-1"></i>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Clients Management Section - Marketing Department Head Only */}
      {isMarketingDeptHead && (
        <div className="card mt-4">
          <div className="card-header d-flex justify-content-between align-items-center bg-primary text-white">
            <h5 className="mb-0">
              <i className="bi bi-people-fill me-2"></i>Clients Management
            </h5>
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-light text-dark">{clients.length} Clients</span>
              <button
                className="btn btn-sm btn-light"
                onClick={() => navigate('/clients')}
                title="View All Clients"
              >
                <i className="bi bi-arrow-right"></i> View All
              </button>
            </div>
          </div>
          <div className="card-body">
            {clientsLoading ? (
              <div className="text-center py-4">
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : clients.length === 0 ? (
              <div className="text-center py-4">
                <i className="bi bi-people text-muted" style={{ fontSize: '2rem' }}></i>
                <p className="text-muted mt-2">No clients found</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover">
                  <thead className="table-light">
                    <tr>
                      <th>Client ID</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Company</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.slice(0, 10).map((client) => (
                      <tr key={client.id}>
                        <td><strong>{client.client_id || 'N/A'}</strong></td>
                        <td>{client.name || 'N/A'}</td>
                        <td>{client.email || 'N/A'}</td>
                        <td>{client.phone || 'N/A'}</td>
                        <td>{client.company || 'N/A'}</td>
                        <td>
                          <span className="badge bg-info">{client.type || 'N/A'}</span>
                        </td>
                        <td>
                          <span className={`badge bg-${client.status === 'Active' ? 'success' : 'secondary'}`}>
                            {client.status || 'N/A'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => navigate(`/clients/view/${client.id}`)}
                            title="View Client"
                          >
                            <i className="bi bi-eye"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {clients.length > 10 && (
                  <div className="card-footer bg-light text-center">
                    <button
                      className="btn btn-outline-primary"
                      onClick={() => navigate('/clients')}
                    >
                      View All {clients.length} Clients <i className="bi bi-arrow-right ms-1"></i>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Staff Client Reports Section - Marketing Department Head Only */}
      {isMarketingDeptHead && (
        <div className="card mt-4">
          <div className="card-header d-flex justify-content-between align-items-center bg-info text-white">
            <h5 className="mb-0">
              <i className="bi bi-file-earmark-text me-2"></i>Staff Client Reports Pending Approval
            </h5>
            <span className="badge bg-light text-dark">{staffClientReports.length} Pending</span>
          </div>
          <div className="card-body">
            {staffClientReports.length === 0 ? (
              <div className="text-center py-4">
                <i className="bi bi-check-circle text-success" style={{ fontSize: '2rem' }}></i>
                <p className="text-muted mt-2">No staff reports pending approval</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th>Report Title</th>
                      <th>Staff Member</th>
                      <th>Client</th>
                      <th>Department</th>
                      <th>Status</th>
                      <th>Submitted Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffClientReports.map((report) => (
                      <tr key={report.id}>
                        <td>
                          <strong>{report.report_title || report.title}</strong>
                        </td>
                        <td>{report.staff_name || 'N/A'}</td>
                        <td>{report.client_name || 'N/A'}</td>
                        <td>{report.department_name || 'N/A'}</td>
                        <td>
                          <span className={`badge bg-${
                            report.status === 'Submitted' ? 'warning' :
                            report.status === 'Draft' ? 'secondary' :
                            report.status === 'Marketing_Manager_Approved' ? 'success' :
                            report.status === 'Marketing_Manager_Rejected' ? 'danger' : 'info'
                          }`}>
                            {report.status}
                          </span>
                        </td>
                        <td>
                          {report.submitted_at 
                            ? new Date(report.submitted_at).toLocaleDateString()
                            : report.created_at
                            ? new Date(report.created_at).toLocaleDateString()
                            : 'N/A'}
                        </td>
                        <td>
                          <div className="btn-group" role="group">
                            <button
                              className="btn btn-sm btn-outline-primary"
                              onClick={async () => {
                                try {
                                  const response = await api.get(`/staff-client-reports/${report.id}`);
                                  setViewingStaffReport(response.data.report);
                                } catch (error) {
                                  console.error('Error fetching report:', error);
                                  alert('Failed to load report details');
                                }
                              }}
                              title="View Report"
                            >
                              <i className="bi bi-eye"></i>
                            </button>
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => printContent(report.report_title || 'Report', formatStaffClientReportForExport(report))}
                              title="Print"
                            >
                              <i className="bi bi-printer"></i>
                            </button>
                            <button
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => exportToPDF(report.report_title || 'Report', formatStaffClientReportForExport(report))}
                              title="Export to PDF"
                            >
                              <i className="bi bi-file-pdf"></i>
                            </button>
                            <button
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => exportToWord(report.report_title || 'Report', formatStaffClientReportForExport(report))}
                              title="Export to Word"
                            >
                              <i className="bi bi-file-word"></i>
                            </button>
                            <button
                              className="btn btn-sm btn-outline-success"
                              onClick={() => {
                                const excelData = [
                                  [report.report_title || 'Report'],
                                  [],
                                  ['Field', 'Value'],
                                  ['Staff', report.staff_name || 'N/A'],
                                  ['Client', report.client_name || 'N/A'],
                                  ['Department', report.department_name || 'N/A'],
                                  ['Status', report.status || 'N/A'],
                                  ['Date', new Date(report.created_at || report.submitted_at).toLocaleDateString()],
                                  [],
                                  ['Content', formatStaffClientReportForExport(report)]
                                ];
                                exportToExcel(report.report_title || 'Report', excelData);
                              }}
                              title="Export to Excel"
                            >
                              <i className="bi bi-file-excel"></i>
                            </button>
                            {['Submitted', 'Draft'].includes(report.status) && (
                              <>
                                <button
                                  className="btn btn-sm btn-outline-success"
                                  onClick={() => handleMarketingReview(report.id, true)}
                                  title="Approve Report"
                                >
                                  <i className="bi bi-check-circle"></i>
                                </button>
                                <button
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => handleMarketingReview(report.id, false)}
                                  title="Reject Report"
                                >
                                  <i className="bi bi-x-circle"></i>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* View Staff Client Report Modal */}
      {viewingStaffReport && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{viewingStaffReport.report_title || 'Staff Client Report'}</h5>
                <button type="button" className="btn-close" onClick={() => setViewingStaffReport(null)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <strong>Staff Member:</strong> {viewingStaffReport.staff_name || 'N/A'}<br />
                  <strong>Client:</strong> {viewingStaffReport.client_name || 'N/A'}<br />
                  <strong>Department:</strong> {viewingStaffReport.department_name || 'N/A'}<br />
                  <strong>Status:</strong> <span className={`badge bg-${
                    viewingStaffReport.status === 'Submitted' ? 'warning' :
                    viewingStaffReport.status === 'Draft' ? 'secondary' :
                    viewingStaffReport.status === 'Marketing_Manager_Approved' ? 'success' :
                    viewingStaffReport.status === 'Marketing_Manager_Rejected' ? 'danger' : 'info'
                  }`}>{viewingStaffReport.status}</span><br />
                  <strong>Created:</strong> {new Date(viewingStaffReport.created_at || viewingStaffReport.submitted_at).toLocaleString()}
                </div>
                <div className="border-top pt-3">
                  <strong>Content:</strong>
                  <pre className="mt-2 p-3 bg-light" style={{ whiteSpace: 'pre-wrap', maxHeight: '400px', overflow: 'auto' }}>
                    {formatStaffClientReportForExport(viewingStaffReport)}
                  </pre>
                </div>
              </div>
              <div className="modal-footer">
                <div className="btn-group" role="group">
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => printContent(viewingStaffReport.report_title || 'Report', formatStaffClientReportForExport(viewingStaffReport))}
                  >
                    <i className="bi bi-printer me-2"></i>Print
                  </button>
                  <button
                    className="btn btn-outline-danger"
                    onClick={() => exportToPDF(viewingStaffReport.report_title || 'Report', formatStaffClientReportForExport(viewingStaffReport))}
                  >
                    <i className="bi bi-file-pdf me-2"></i>PDF
                  </button>
                  <button
                    className="btn btn-outline-primary"
                    onClick={() => exportToWord(viewingStaffReport.report_title || 'Report', formatStaffClientReportForExport(viewingStaffReport))}
                  >
                    <i className="bi bi-file-word me-2"></i>Word
                  </button>
                  <button
                    className="btn btn-outline-success"
                    onClick={() => {
                      const excelData = [
                        [viewingStaffReport.report_title || 'Report'],
                        [],
                        ['Field', 'Value'],
                        ['Staff', viewingStaffReport.staff_name || 'N/A'],
                        ['Client', viewingStaffReport.client_name || 'N/A'],
                        ['Department', viewingStaffReport.department_name || 'N/A'],
                        ['Status', viewingStaffReport.status || 'N/A'],
                        ['Date', new Date(viewingStaffReport.created_at || viewingStaffReport.submitted_at).toLocaleDateString()],
                        [],
                        ['Content', formatStaffClientReportForExport(viewingStaffReport)]
                      ];
                      exportToExcel(viewingStaffReport.report_title || 'Report', excelData);
                    }}
                  >
                    <i className="bi bi-file-excel me-2"></i>Excel
                  </button>
                </div>
                {['Submitted', 'Draft'].includes(viewingStaffReport.status) && (
                  <>
                    <button
                      className="btn btn-success"
                      onClick={() => {
                        handleMarketingReview(viewingStaffReport.id, true);
                        setViewingStaffReport(null);
                      }}
                    >
                      <i className="bi bi-check-circle me-2"></i>Approve
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        handleMarketingReview(viewingStaffReport.id, false);
                        setViewingStaffReport(null);
                      }}
                    >
                      <i className="bi bi-x-circle me-2"></i>Reject
                    </button>
                  </>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => setViewingStaffReport(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <ReportTemplateRouter
          department={department}
          report={editingReport}
          reportType={reportType}
          onClose={handleFormClose}
        />
      )}

      {showProgressReport && (
        <ProgressReport
          onClose={() => setShowProgressReport(false)}
        />
      )}

      {/* View Report Modal */}
      {viewingReport && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Report Details</h5>
                <button type="button" className="btn-close" onClick={() => setViewingReport(null)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <strong>Title:</strong>
                  <p className="mt-1">{viewingReport.title}</p>
                </div>
                
                <div className="mb-3">
                  <strong>Status:</strong>
                  <div className="mt-1">
                    <span className={`badge bg-${getStatusBadge(viewingReport.status)}`}>
                      {viewingReport.status === 'Pending_DeptHead' ? 'Pending Department Head Review' : viewingReport.status}
                    </span>
                    {viewingReport.dept_head_status && (
                      <>
                        <br />
                        <span className={`badge bg-${getStatusBadge(viewingReport.dept_head_status)} mt-1`}>
                          Department Head: {viewingReport.dept_head_status === 'DepartmentHead_Approved' ? 'Approved' : 
                                           viewingReport.dept_head_status === 'DepartmentHead_Rejected' ? 'Rejected' : 'Pending'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {viewingReport.dept_head_reviewed_by_name && (
                  <div className="mb-3">
                    <strong>Department Head Review:</strong>
                    <p className="mt-1 mb-0">
                      {viewingReport.dept_head_reviewed_by_name}
                      {viewingReport.dept_head_reviewed_at && (
                        <> - {new Date(viewingReport.dept_head_reviewed_at).toLocaleDateString()}</>
                      )}
                    </p>
                    {viewingReport.dept_head_notes && (
                      <div className="border p-2 mt-2 bg-light small">
                        {viewingReport.dept_head_notes}
                      </div>
                    )}
                  </div>
                )}

                <div className="mb-3">
                  <strong>Content:</strong>
                  <div className="border p-3 mt-2 bg-light" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: '0.9rem' }}>
                      {viewingReport.content}
                    </pre>
                  </div>
                </div>

                <div className="row">
                  <div className="col-md-6 mb-3">
                    <strong>Submitted:</strong>
                    <p className="mt-1 mb-0">{new Date(viewingReport.created_at).toLocaleString()}</p>
                  </div>
                  {viewingReport.reviewed_at && (
                    <div className="col-md-6 mb-3">
                      <strong>Reviewed:</strong>
                      <p className="mt-1 mb-0">{new Date(viewingReport.reviewed_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>

                {viewingReport.reviewed_by_name && (
                  <div className="mb-3">
                    <strong>Reviewed By:</strong>
                    <p className="mt-1 mb-0">{viewingReport.reviewed_by_name}</p>
                  </div>
                )}

                {viewingReport.admin_notes && (
                  <div className="mb-3">
                    <strong>Admin Notes:</strong>
                    <div className="border p-2 mt-2 bg-light">
                      {viewingReport.admin_notes}
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                {/* Department Head Review buttons */}
                {(viewingReport.status === 'Pending_DeptHead' || (viewingReport.dept_head_status && viewingReport.dept_head_status === 'Pending')) && (
                  <>
                    <button
                      className="btn btn-success"
                      onClick={() => handleDeptHeadReview(viewingReport.id, true)}
                    >
                      <i className="bi bi-check-circle me-2"></i>Approve
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => handleDeptHeadReview(viewingReport.id, false)}
                    >
                      <i className="bi bi-x-circle me-2"></i>Reject
                    </button>
                  </>
                )}
                {(viewingReport.status === 'Pending' || viewingReport.status === 'Pending_DeptHead') && viewingReport.submitted_by === user.id && (
                  <>
                    <button
                      className="btn btn-warning"
                      onClick={() => {
                        setViewingReport(null);
                        handleEditReport(viewingReport.id);
                      }}
                    >
                      <i className="bi bi-pencil me-2"></i>Edit
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        setViewingReport(null);
                        handleDeleteReport(viewingReport.id);
                      }}
                    >
                      <i className="bi bi-trash me-2"></i>Delete
                    </button>
                  </>
                )}
                {/* Print and Export buttons - available for all reports */}
                <div className="btn-group" role="group">
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => printContent(viewingReport.title, formatReportForExport(viewingReport, 'department'))}
                    title="Print Report"
                  >
                    <i className="bi bi-printer me-2"></i>Print
                  </button>
                  <button
                    className="btn btn-outline-danger"
                    onClick={() => exportToPDF(viewingReport.title, formatReportForExport(viewingReport, 'department'))}
                    title="Export to PDF"
                  >
                    <i className="bi bi-file-pdf me-2"></i>PDF
                  </button>
                  <button
                    className="btn btn-outline-primary"
                    onClick={() => exportToWord(viewingReport.title, formatReportForExport(viewingReport, 'department'))}
                    title="Export to Word"
                  >
                    <i className="bi bi-file-word me-2"></i>Word
                  </button>
                  <button
                    className="btn btn-outline-success"
                    onClick={() => exportToExcel(viewingReport.title, convertReportsToExcel([viewingReport], 'department'))}
                    title="Export to Excel"
                  >
                    <i className="bi bi-file-excel me-2"></i>Excel
                  </button>
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={() => setViewingReport(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
};

export default DepartmentHeadDashboard;


