import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../config/api';
import { useAuth } from '../../hooks/useAuth';
import ProgressReport from '../departments/ProgressReport';
import ReportTemplateRouter from '../departments/ReportTemplateRouter';

const StaffDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [staffInfo, setStaffInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showProgressReport, setShowProgressReport] = useState(false);
  const [showDepartmentReport, setShowDepartmentReport] = useState(false);
  const [department, setDepartment] = useState(null);
  const [reportType, setReportType] = useState(null);
  const [departmentReports, setDepartmentReports] = useState([]);
  const [stats, setStats] = useState({
    progressReports: 0,
    pendingReports: 0,
    approvedReports: 0
  });

  useEffect(() => {
    fetchStaffInfo();
    fetchStats();
  }, []);

  useEffect(() => {
    if (staffInfo) {
      checkDepartmentAccess();
    }
  }, [staffInfo]);

  const checkDepartmentAccess = async () => {
    try {
      // Check if user is Finance, Marketing, or Academy staff
      if (staffInfo && staffInfo.department) {
        const deptName = staffInfo.department.toLowerCase();
        if (deptName.includes('finance') || deptName.includes('marketing') || deptName.includes('academy')) {
          // Get department
          const deptResponse = await api.get('/departments');
          const matchingDept = deptResponse.data.departments.find(d => {
            const dName = d.name ? d.name.toLowerCase() : '';
            return (deptName.includes('finance') && dName.includes('finance')) ||
                   (deptName.includes('marketing') && dName.includes('marketing')) ||
                   (deptName.includes('academy') && dName.includes('academy'));
          });
          if (matchingDept) {
            setDepartment(matchingDept);
            fetchDepartmentReports();
          }
        }
      }
    } catch (error) {
      console.error('Error checking department access:', error);
    }
  };

  const fetchDepartmentReports = async () => {
    try {
      const response = await api.get('/department-reports');
      setDepartmentReports(response.data.reports || []);
    } catch (error) {
      console.error('Error fetching department reports:', error);
    }
  };

  const fetchStaffInfo = async () => {
    try {
      // Get staff record for current user
      const response = await api.get('/staff');
      const staffList = response.data.staff || [];
      const myStaff = staffList.find(s => s.user_id === user.id);
      setStaffInfo(myStaff);
    } catch (error) {
      console.error('Error fetching staff info:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/progress-reports');
      const reports = response.data.reports || [];
      const myReports = reports.filter(r => r.submitted_by === user.id);
      
      setStats({
        progressReports: myReports.length,
        pendingReports: myReports.filter(r => r.status === 'pending').length,
        approvedReports: myReports.filter(r => r.status === 'approved').length
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  if (loading) {
    return (
      <div className="container-fluid">
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (showProgressReport) {
    return (
      <div className="container-fluid">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4>Progress Report</h4>
          <button 
            className="btn btn-secondary"
            onClick={() => setShowProgressReport(false)}
          >
            <i className="bi bi-arrow-left me-2"></i>Back to Dashboard
          </button>
        </div>
        <ProgressReport />
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="row mb-4">
        <div className="col-12">
          <h2 className="mb-0">Staff Dashboard</h2>
          <p className="text-muted">Welcome, {user?.name || 'Staff Member'}</p>
        </div>
      </div>

      {/* Staff Information Card */}
      {staffInfo && (
        <div className="row mb-4">
          <div className="col-12">
            <div className="card">
              <div className="card-header bg-primary text-white">
                <h5 className="mb-0">
                  <i className="bi bi-person-circle me-2"></i>My Information
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

      {/* Quick Actions */}
      <div className="row mb-4">
        <div className="col-md-4 mb-3">
          <div className="card border-primary h-100">
            <div className="card-header bg-primary text-white">
              <h5 className="mb-0">
                <i className="bi bi-file-text me-2"></i>Progress Reports
              </h5>
            </div>
            <div className="card-body">
              <div className="row text-center mb-3">
                <div className="col-12 mb-3">
                  <h2 className="mb-0">{stats.progressReports}</h2>
                  <small className="text-muted">Total Reports</small>
                </div>
              </div>
              <div className="row text-center mb-3">
                <div className="col-6">
                  <div className="badge bg-warning text-dark">{stats.pendingReports} Pending</div>
                </div>
                <div className="col-6">
                  <div className="badge bg-success">{stats.approvedReports} Approved</div>
                </div>
              </div>
              <div className="mt-3">
                <button 
                  className="btn btn-outline-primary w-100"
                  onClick={() => setShowProgressReport(true)}
                >
                  <i className="bi bi-plus-circle me-2"></i>Submit Progress Report
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-4 mb-3">
          <div className="card border-info h-100">
            <div className="card-header bg-info text-white">
              <h5 className="mb-0">
                <i className="bi bi-chat-dots me-2"></i>Communications
              </h5>
            </div>
            <div className="card-body">
              <p className="text-muted">View and respond to communications from admin and other staff members.</p>
              <Link to="/communications" className="btn btn-outline-info w-100">
                <i className="bi bi-arrow-right me-2"></i>View Communications
              </Link>
            </div>
          </div>
        </div>

        <div className="col-md-4 mb-3">
          <div className="card border-success h-100">
            <div className="card-header bg-success text-white">
              <h5 className="mb-0">
                <i className="bi bi-file-earmark-text me-2"></i>Client Reports
              </h5>
            </div>
            <div className="card-body">
              <p className="text-muted">Submit and manage client-specific activity reports.</p>
              <Link to="/staff-client-reports" className="btn btn-outline-success w-100">
                <i className="bi bi-arrow-right me-2"></i>View Client Reports
              </Link>
            </div>
          </div>
        </div>

        {/* Department Report Card (for Finance, Marketing, and Academy Staff) */}
        {staffInfo && department && (staffInfo.department.toLowerCase().includes('finance') || 
                                     staffInfo.department.toLowerCase().includes('marketing') || 
                                     staffInfo.department.toLowerCase().includes('academy')) && (
          <div className="col-md-4 mb-3">
            <div className="card border-warning h-100">
              <div className="card-header bg-warning text-dark">
                <h5 className="mb-0">
                  <i className="bi bi-file-text me-2"></i>{department.name} Reports
                </h5>
              </div>
              <div className="card-body">
                <div className="row text-center mb-3">
                  <div className="col-12 mb-3">
                    <h2 className="mb-0">{departmentReports.length}</h2>
                    <small className="text-muted">{department.name} Reports</small>
                  </div>
                </div>
                <p className="text-muted small">Submit {department.name} Department reports (requires {department.name} Department Head approval).</p>
                <button 
                  className="btn btn-outline-warning w-100"
                  onClick={() => {
                    setReportType(null);
                    setShowDepartmentReport(true);
                  }}
                >
                  <i className="bi bi-plus-circle me-2"></i>Submit {department.name} Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="row mb-4">
        <div className="col-md-4 mb-3">
          <div className="card border-warning h-100">
            <div className="card-header bg-warning text-dark">
              <h5 className="mb-0">
                <i className="bi bi-bell me-2"></i>Notifications
              </h5>
            </div>
            <div className="card-body">
              <p className="text-muted">View notifications and updates from the system.</p>
              <Link to="/notifications-view" className="btn btn-outline-warning w-100">
                <i className="bi bi-arrow-right me-2"></i>View Notifications
              </Link>
            </div>
          </div>
        </div>

        <div className="col-md-4 mb-3">
          <div className="card border-info h-100">
            <div className="card-header bg-info text-white">
              <h5 className="mb-0">
                <i className="bi bi-telephone me-2"></i>Call Memos
              </h5>
            </div>
            <div className="card-body">
              <p className="text-muted">Create and manage client call memos.</p>
              <Link to="/call-memos" className="btn btn-outline-info w-100">
                <i className="bi bi-arrow-right me-2"></i>View Call Memos
              </Link>
            </div>
          </div>
        </div>

        <div className="col-md-4 mb-3">
          <div className="card border-primary h-100">
            <div className="card-header bg-primary text-white">
              <h5 className="mb-0">
                <i className="bi bi-file-earmark-check me-2"></i>Proposals
              </h5>
            </div>
            <div className="card-body">
              <p className="text-muted">Create and manage business proposals.</p>
              <Link to="/proposals" className="btn btn-outline-primary w-100">
                <i className="bi bi-arrow-right me-2"></i>View Proposals
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">
                <i className="bi bi-clock-history me-2"></i>Quick Links
              </h5>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-3 mb-2">
                  <Link to="/profile" className="btn btn-outline-primary w-100">
                    <i className="bi bi-person me-2"></i>My Profile
                  </Link>
                </div>
                <div className="col-md-3 mb-2">
                  <button 
                    className="btn btn-outline-secondary w-100"
                    onClick={() => setShowProgressReport(true)}
                  >
                    <i className="bi bi-file-text me-2"></i>Progress Reports
                  </button>
                </div>
                <div className="col-md-3 mb-2">
                  <Link to="/communications" className="btn btn-outline-info w-100">
                    <i className="bi bi-envelope me-2"></i>Messages
                  </Link>
                </div>
                <div className="col-md-3 mb-2">
                  <Link to="/staff-client-reports" className="btn btn-outline-success w-100">
                    <i className="bi bi-file-earmark-text me-2"></i>Client Reports
                  </Link>
                </div>
                <div className="col-md-3 mb-2">
                  <Link to="/notifications-view" className="btn btn-outline-warning w-100">
                    <i className="bi bi-bell me-2"></i>Notifications
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Department Report Form Modal */}
      {showDepartmentReport && department && (
        <ReportTemplateRouter
          department={department}
          report={null}
          reportType={reportType}
          onClose={() => {
            setShowDepartmentReport(false);
            setReportType(null);
            fetchDepartmentReports();
          }}
        />
      )}
    </div>
  );
};

export default StaffDashboard;

