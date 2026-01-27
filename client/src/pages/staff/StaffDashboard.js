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
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    fetchStaffInfo();
    fetchStats();
  }, [user]);

  useEffect(() => {
    if (staffInfo) checkDepartmentAccess();
  }, [staffInfo]);

  /** Fetch staff info with role-based access */
  const fetchStaffInfo = async () => {
    setLoading(true);
    setError(null);

    try {
      let myStaff;

      if (['Admin', 'DepartmentHead'].includes(user.role)) {
        const res = await api.get('/staff');
        const staffList = res.data.staff || [];
        myStaff = staffList.find(s => s.user_id === user.id);
      } else {
        // Staff or Assistant Finance Officer can only view themselves
        const res = await api.get(`/staff/${user.id}`);
        myStaff = res.data;
      }

      setStaffInfo(myStaff);
    } catch (err) {
      console.error('Error fetching staff info:', err);
      setError('Unable to fetch your staff information.');
    } finally {
      setLoading(false);
    }
  };

  /** Fetch progress report stats for current user */
  const fetchStats = async () => {
    try {
      const res = await api.get('/progress-reports');
      const reports = res.data.reports || [];
      const myReports = reports.filter(r => r.submitted_by === user.id);

      setStats({
        progressReports: myReports.length,
        pendingReports: myReports.filter(r => r.status === 'pending').length,
        approvedReports: myReports.filter(r => r.status === 'approved').length
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  /** Check if staff belongs to Finance, Marketing, or Academy */
  const checkDepartmentAccess = async () => {
    if (!staffInfo?.department) return;
    const deptName = staffInfo.department.toLowerCase();

    if (!['finance', 'marketing', 'academy'].some(d => deptName.includes(d))) return;

    try {
      const res = await api.get('/departments');
      const matchingDept = res.data.departments.find(d => {
        const dName = d.name?.toLowerCase() || '';
        return (deptName.includes('finance') && dName.includes('finance')) ||
               (deptName.includes('marketing') && dName.includes('marketing')) ||
               (deptName.includes('academy') && dName.includes('academy'));
      });

      if (matchingDept) {
        setDepartment(matchingDept);
        fetchDepartmentReports();
      }
    } catch (err) {
      console.error('Error checking department access:', err);
    }
  };

  /** Fetch department reports */
  const fetchDepartmentReports = async () => {
    if (!department) return;

    try {
      const res = await api.get('/department-reports');
      const reports = res.data.reports || [];
      const deptReports = reports.filter(r => r.department_id === department.id);
      setDepartmentReports(deptReports);
    } catch (err) {
      console.error('Error fetching department reports:', err);
    }
  };

  if (loading) return <div className="text-center mt-5">Loading...</div>;
  if (error) return <div className="text-danger mt-5">{error}</div>;

  /** Render progress report section */
  if (showProgressReport) {
    return (
      <div className="container-fluid">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4>Progress Report</h4>
          <button className="btn btn-secondary" onClick={() => setShowProgressReport(false)}>
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
          <h2>Staff Dashboard</h2>
          <p className="text-muted">Welcome, {user?.name || 'Staff Member'}</p>
        </div>
      </div>

      {/* Staff Info Card */}
      {staffInfo && (
        <div className="row mb-4">
          <div className="col-12">
            <div className="card">
              <div className="card-header bg-primary text-white">
                <h5 className="mb-0"><i className="bi bi-person-circle me-2"></i>My Information</h5>
              </div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-3"><strong>Staff ID:</strong> {staffInfo.staff_id}</div>
                  <div className="col-md-3"><strong>Position:</strong> {staffInfo.position || 'N/A'}</div>
                  <div className="col-md-3"><strong>Department:</strong> {staffInfo.department || 'N/A'}</div>
                  <div className="col-md-3"><strong>Employment Type:</strong> {staffInfo.employment_type || 'N/A'}</div>
                </div>
                {staffInfo.employment_date && (
                  <div className="row mt-2">
                    <div className="col-md-3"><strong>Employment Date:</strong> {new Date(staffInfo.employment_date).toLocaleDateString()}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions & Department Reports */}
      <div className="row mb-4">
        {/* Progress Reports Card */}
        <div className="col-md-4 mb-3">
          <div className="card border-primary h-100">
            <div className="card-header bg-primary text-white">
              <h5 className="mb-0"><i className="bi bi-file-text me-2"></i>Progress Reports</h5>
            </div>
            <div className="card-body text-center">
              <h2>{stats.progressReports}</h2>
              <small className="text-muted">Total Reports</small>
              <div className="mt-2 d-flex justify-content-between">
                <span className="badge bg-warning text-dark">{stats.pendingReports} Pending</span>
                <span className="badge bg-success">{stats.approvedReports} Approved</span>
              </div>
              <button className="btn btn-outline-primary w-100 mt-3" onClick={() => setShowProgressReport(true)}>
                <i className="bi bi-plus-circle me-2"></i>Submit Progress Report
              </button>
            </div>
          </div>
        </div>

        {/* Department Reports (Finance, Marketing, Academy) */}
        {department && (
          <div className="col-md-4 mb-3">
            <div className="card border-warning h-100">
              <div className="card-header bg-warning text-dark">
                <h5 className="mb-0"><i className="bi bi-file-text me-2"></i>{department.name} Reports</h5>
              </div>
              <div className="card-body text-center">
                <h2>{departmentReports.length}</h2>
                <small className="text-muted">{department.name} Reports</small>
                <p className="text-muted small mt-2">Submit {department.name} Department reports (requires approval).</p>
                <button className="btn btn-outline-warning w-100" onClick={() => setShowDepartmentReport(true)}>
                  <i className="bi bi-plus-circle me-2"></i>Submit {department.name} Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Department Report Modal */}
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
