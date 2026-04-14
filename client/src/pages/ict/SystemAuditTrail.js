import React, { useState, useEffect, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../../config/api';
import { useAuth } from '../../hooks/useAuth';

function formatDetails(d) {
  if (d == null) return '—';
  if (typeof d === 'object') {
    try {
      return JSON.stringify(d);
    } catch {
      return String(d);
    }
  }
  return String(d);
}

const SystemAuditTrail = () => {
  const { user } = useAuth();
  const [allowed, setAllowed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [filters, setFilters] = useState({
    start: '',
    end: '',
    user_id: '',
    module: '',
    action: '',
    search: ''
  });
  const [appliedFilters, setAppliedFilters] = useState(() => ({
    start: '',
    end: '',
    user_id: '',
    module: '',
    action: '',
    search: ''
  }));

  const checkAccess = useCallback(async () => {
    try {
      await api.get('/audit-logs/access');
      setAllowed(true);
    } catch {
      setAllowed(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (appliedFilters.start) params.set('start', appliedFilters.start);
      if (appliedFilters.end) params.set('end', appliedFilters.end);
      if (appliedFilters.user_id) params.set('user_id', appliedFilters.user_id);
      if (appliedFilters.module) params.set('module', appliedFilters.module);
      if (appliedFilters.action) params.set('action', appliedFilters.action);
      if (appliedFilters.search) params.set('search', appliedFilters.search);
      const res = await api.get(`/audit-logs?${params.toString()}`);
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      console.error(e);
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, appliedFilters]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  useEffect(() => {
    if (allowed !== true) return;
    fetchLogs();
  }, [allowed, fetchLogs]);

  if (allowed === false) {
    const fallback = user?.role === 'Admin' ? '/dashboard' : '/department-dashboard';
    return <Navigate to={fallback} replace />;
  }

  if (allowed === null) {
    return (
      <div className="d-flex justify-content-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h1 className="h4 mb-0">
            <i className="bi bi-journal-text me-2 text-primary"></i>
            System audit trail
          </h1>
          <p className="text-muted small mb-0">
            Business actions and API access across the system. Read-only for Admin and the ICT Department Head.
          </p>
        </div>
        <Link
          to={user?.role === 'Admin' ? '/dashboard' : '/department-dashboard'}
          className="btn btn-outline-secondary btn-sm"
        >
          <i className="bi bi-arrow-left me-1"></i>
          {user?.role === 'Admin' ? 'Dashboard' : 'Department dashboard'}
        </Link>
      </div>

      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <div className="row g-2 align-items-end">
            <div className="col-6 col-md-2">
              <label className="form-label small mb-0">From</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={filters.start}
                onChange={(e) => setFilters((f) => ({ ...f, start: e.target.value }))}
              />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small mb-0">To</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={filters.end}
                onChange={(e) => setFilters((f) => ({ ...f, end: e.target.value }))}
              />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small mb-0">User ID</label>
              <input
                type="number"
                className="form-control form-control-sm"
                placeholder="e.g. 12"
                value={filters.user_id}
                onChange={(e) => setFilters((f) => ({ ...f, user_id: e.target.value }))}
              />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small mb-0">Module</label>
              <input
                className="form-control form-control-sm"
                placeholder="e.g. api:academy"
                value={filters.module}
                onChange={(e) => setFilters((f) => ({ ...f, module: e.target.value }))}
              />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small mb-0">Action</label>
              <input
                className="form-control form-control-sm"
                placeholder="e.g. create_user"
                value={filters.action}
                onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
              />
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label small mb-0">Search</label>
              <input
                className="form-control form-control-sm"
                placeholder="Name, email, path, details…"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              />
            </div>
            <div className="col-12 col-md-auto d-flex gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setAppliedFilters({ ...filters });
                  setPage(1);
                }}
              >
                Apply
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => {
                  const empty = {
                    start: '',
                    end: '',
                    user_id: '',
                    module: '',
                    action: '',
                    search: ''
                  };
                  setFilters(empty);
                  setAppliedFilters(empty);
                  setPage(1);
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-header bg-light d-flex justify-content-between align-items-center py-2">
          <span className="small text-muted">
            {total.toLocaleString()} event(s) · page {page} of {totalPages}
          </span>
          <span className="small text-muted">Signed in as {user?.name || user?.email}</span>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border spinner-border-sm text-primary" role="status" />
            </div>
          ) : (
            <div className="table-responsive" style={{ maxHeight: '70vh' }}>
              <table className="table table-sm table-hover table-striped mb-0 align-middle">
                <thead className="table-light sticky-top">
                  <tr>
                    <th style={{ minWidth: '150px' }}>Time</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Module</th>
                    <th>Record</th>
                    <th style={{ minWidth: '200px' }}>Details</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        No audit entries match your filters.
                      </td>
                    </tr>
                  ) : (
                    logs.map((row) => (
                      <tr key={row.id}>
                        <td className="small text-nowrap">
                          {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                        </td>
                        <td className="small">
                          {row.user_id != null ? (
                            <>
                              <div className="fw-semibold">{row.user_name || '—'}</div>
                              <div className="text-muted">{row.user_email || ''}</div>
                              <div className="text-muted">id {row.user_id}</div>
                            </>
                          ) : (
                            <span className="text-muted">Anonymous</span>
                          )}
                        </td>
                        <td>
                          <code className="small">{row.action}</code>
                        </td>
                        <td className="small">{row.module || '—'}</td>
                        <td className="small">{row.record_id != null ? row.record_id : '—'}</td>
                        <td className="small text-break" style={{ maxWidth: '320px' }}>
                          {formatDetails(row.details)}
                        </td>
                        <td className="small text-muted text-nowrap">{row.ip_address || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {totalPages > 1 && (
          <div className="card-footer d-flex justify-content-center gap-2 py-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        )}
      </div>

      <p className="text-muted small mt-3 mb-0">
        Rows include explicit business events (e.g. approvals, creates) and automatic API access lines (
        <code>http_request</code>) for monitoring daily activity. Login attempts are recorded on successful sign-in;
        failed attempts may appear as unauthenticated API calls where applicable.
      </p>
    </div>
  );
};

export default SystemAuditTrail;
