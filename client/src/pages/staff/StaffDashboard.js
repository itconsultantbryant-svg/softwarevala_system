import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import { useAuth } from '../../hooks/useAuth';
import ProgressReport from '../departments/ProgressReport';
import ReportTemplateRouter from '../departments/ReportTemplateRouter';
import {
  DashboardShell,
  MetricTile,
  ActionTile,
  QuickLinks,
  InfoPanel
} from '../../components/dashboard/DashboardShell';

const StaffDashboard = () => {
  const { user } = useAuth();
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
      <DashboardShell title="Progress Report" subtitle="Submit and track your work progress" showLogo={false}>
        <button
          type="button"
          className="btn btn-outline-secondary mb-3"
          onClick={() => setShowProgressReport(false)}
        >
          <i className="bi bi-arrow-left me-2" />Back to Dashboard
        </button>
        <ProgressReport />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title="Staff Dashboard"
      subtitle={`Welcome, ${user?.name || 'Staff Member'} — Software Vala Liberia`}
      badge={staffInfo?.department || 'Staff Portal'}
      badgeIcon="bi-briefcase-fill"
    >
      {staffInfo && (
        <InfoPanel title="My Information" icon="bi-person-vcard-fill">
          <div className="row g-3">
            <div className="col-md-3"><strong>Staff ID:</strong> {staffInfo.staff_id}</div>
            <div className="col-md-3"><strong>Position:</strong> {staffInfo.position || 'N/A'}</div>
            <div className="col-md-3"><strong>Department:</strong> {staffInfo.department || 'N/A'}</div>
            <div className="col-md-3"><strong>Employment:</strong> {staffInfo.employment_type || 'N/A'}</div>
            {staffInfo.employment_date && (
              <div className="col-md-3">
                <strong>Start Date:</strong> {new Date(staffInfo.employment_date).toLocaleDateString()}
              </div>
            )}
          </div>
        </InfoPanel>
      )}

      <div className="sv-dashboard__section-title">
        <i className="bi bi-speedometer2" />
        Your Overview
      </div>
      <div className="sv-metric-grid">
        <MetricTile icon="bi-journal-check" label="Progress Reports" value={stats.progressReports} variant="navy" />
        <MetricTile icon="bi-hourglass-split" label="Pending" value={stats.pendingReports} variant="red" />
        <MetricTile icon="bi-check2-circle" label="Approved" value={stats.approvedReports} variant="green" />
      </div>

      <div className="sv-dashboard__section-title">
        <i className="bi bi-lightning-charge-fill" />
        Work Tools
      </div>
      <div className="sv-action-grid">
        <ActionTile
          icon="bi-clipboard-data-fill"
          title="Progress Reports"
          description="Submit weekly progress updates and track approval status."
          onClick={() => setShowProgressReport(true)}
          actionLabel="Submit Report"
          headVariant="navy"
        />
        <ActionTile
          icon="bi-chat-square-dots-fill"
          title="Communications"
          description="View and respond to messages from admin and colleagues."
          to="/communications"
          actionLabel="Open Messages"
          headVariant="teal"
        />
        <ActionTile
          icon="bi-file-earmark-person-fill"
          title="Client Reports"
          description="Submit and manage client-specific activity reports."
          to="/staff-client-reports"
          actionLabel="View Reports"
          headVariant="slate"
        />
        {staffInfo && department && (staffInfo.department.toLowerCase().includes('finance') ||
          staffInfo.department.toLowerCase().includes('marketing')) && (
          <ActionTile
            icon="bi-building-fill-gear"
            title={`${department.name} Reports`}
            description={`Submit ${department.name} department reports for head approval.`}
            onClick={() => { setReportType(null); setShowDepartmentReport(true); }}
            actionLabel="Submit Department Report"
            headVariant="red"
            btnVariant="red"
          />
        )}
        <ActionTile
          icon="bi-bell-fill"
          title="Notifications"
          description="Stay updated with system alerts and announcements."
          to="/notifications-view"
          actionLabel="View Alerts"
          headVariant="red"
          btnVariant="red"
        />
        <ActionTile
          icon="bi-telephone-fill"
          title="Call Memos"
          description="Create and manage client call memos."
          to="/call-memos"
          actionLabel="Open Call Memos"
          headVariant="teal"
        />
        <ActionTile
          icon="bi-file-earmark-richtext-fill"
          title="Proposals"
          description="Create and manage business proposals."
          to="/proposals"
          actionLabel="View Proposals"
          headVariant="navy"
        />
      </div>

      <QuickLinks
        links={[
          { icon: 'bi-person-fill', label: 'My Profile', to: '/profile' },
          { icon: 'bi-clipboard-data', label: 'Progress Reports', onClick: () => setShowProgressReport(true) },
          { icon: 'bi-envelope-fill', label: 'Messages', to: '/communications' },
          { icon: 'bi-file-earmark-text', label: 'Client Reports', to: '/staff-client-reports' },
          { icon: 'bi-bell', label: 'Notifications', to: '/notifications-view' },
          { icon: 'bi-calendar3', label: 'Calendar', to: '/calendar' }
        ]}
      />

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
    </DashboardShell>
  );
};

export default StaffDashboard;

