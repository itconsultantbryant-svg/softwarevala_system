/**
 * Targets Management - Production Ready Frontend Component
 * 
 * Features:
 * - View all targets with real-time updates
 * - Create, edit, delete targets (Admin only)
 * - View target progress history
 * - Approve/reject target progress entries (Admin only)
 * - Real-time calculations: net_amount, progress_percentage, remaining_amount
 * - Comprehensive error handling
 * - Instructions and help text
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import api from '../../config/api';
import { getSocket } from '../../config/socket';

const Targets = () => {
  const { user } = useAuth();
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [targetProgress, setTargetProgress] = useState([]);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [users, setUsers] = useState([]);
  const [sharingHistory, setSharingHistory] = useState([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareForm, setShareForm] = useState({
    to_user_id: '',
    amount: '',
    reason: ''
  });
  const [activeTab, setActiveTab] = useState('targets'); // 'targets' or 'sharing'
  
  // Refs to track current state without causing re-renders
  const selectedTargetRef = useRef(null);
  const showProgressModalRef = useRef(false);
  
  // Keep refs in sync with state
  useEffect(() => {
    selectedTargetRef.current = selectedTarget;
    showProgressModalRef.current = showProgressModal;
  }, [selectedTarget, showProgressModal]);

  // Form states
  const [createForm, setCreateForm] = useState({
    user_id: '',
    target_amount: '',
    category: '',
    period_start: new Date().toISOString().split('T')[0],
    period_end: '',
    notes: ''
  });

  const [editForm, setEditForm] = useState({
    target_amount: '',
    category: '',
    period_start: '',
    period_end: '',
    status: '',
    notes: ''
  });

  // Fetch targets
  const fetchTargets = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setError('');
      }
      const response = await api.get('/targets');
      
      // Update targets state, preserving any local updates
      setTargets(prevTargets => {
        const newTargets = response.data.targets || [];
        // Merge with existing to preserve any pending socket updates
        return newTargets.map(newTarget => {
          const existing = prevTargets.find(t => t.id === newTarget.id);
          // Use existing data if it's newer or if we're in the middle of a real-time update
          if (existing && existing._lastUpdate && existing._lastUpdate > Date.now() - 1000) {
            return existing;
          }
          return newTarget;
        });
      });
    } catch (err) {
      const isNetworkError = err.code === 'ERR_NETWORK' || 
                            err.code === 'ERR_INTERNET_DISCONNECTED' ||
                            err.code === 'ERR_CONNECTION_CLOSED';
      
      if (isNetworkError) {
        if (!silent) {
          console.warn('Network error fetching targets - will retry via real-time updates');
        }
      } else {
        console.error('Error fetching targets:', err);
        if (!silent) {
          setError(err.response?.data?.error || 'Failed to load targets');
        }
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  // Fetch users for dropdown (Admin for target creation, Staff/DeptHead for fund sharing)
  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      // Filter to only Staff and DepartmentHead (exclude Admin, Client, Partner, etc.)
      const allUsers = response.data.users || [];
      const filteredUsers = allUsers.filter(u => 
        u.role === 'Staff' || u.role === 'DepartmentHead'
      );
      setUsers(filteredUsers);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  // Fetch target progress
  const fetchTargetProgress = async (targetId) => {
    try {
      const response = await api.get(`/targets/${targetId}/progress`);
      setTargetProgress(response.data.progress || []);
    } catch (err) {
      console.error('Error fetching target progress:', err);
    }
  };

  // Fetch sharing history
  const fetchSharingHistory = async () => {
    try {
      const response = await api.get('/targets/fund-sharing/history');
      setSharingHistory(response.data.history || []);
    } catch (err) {
      console.error('Error fetching sharing history:', err);
    }
  };

  // Initial load
  useEffect(() => {
    fetchTargets();
    fetchUsers();
    fetchSharingHistory();
  }, []);

  // Real-time socket updates
  useEffect(() => {
    if (!user) return;

    const socket = getSocket();
    if (!socket) return;

    // Debounce function to prevent excessive API calls
    let fetchTimeout;
    const debouncedFetchTargets = () => {
      clearTimeout(fetchTimeout);
      fetchTimeout = setTimeout(() => {
        fetchTargets();
      }, 500); // Wait 500ms before fetching
    };

    const handleTargetCreated = () => {
      debouncedFetchTargets();
    };

    const handleTargetUpdated = (data) => {
      // Update target in state with new data
      if (data && data.id) {
        setTargets(prevTargets => {
          const exists = prevTargets.some(t => t.id === data.id);
          if (exists) {
            // Update existing target with new metrics
            return prevTargets.map(target => {
              if (target.id === data.id) {
                // Merge all metrics if provided, otherwise keep existing
                return {
                  ...target,
                  net_amount: data.net_amount !== undefined ? parseFloat(data.net_amount) : target.net_amount,
                  progress_percentage: data.progress_percentage !== undefined ? data.progress_percentage : target.progress_percentage,
                  remaining_amount: data.remaining_amount !== undefined ? parseFloat(data.remaining_amount) : target.remaining_amount,
                  total_progress: data.total_progress !== undefined ? parseFloat(data.total_progress) : target.total_progress,
                  shared_in: data.shared_in !== undefined ? parseFloat(data.shared_in) : target.shared_in,
                  shared_out: data.shared_out !== undefined ? parseFloat(data.shared_out) : target.shared_out,
                  target_amount: data.target_amount !== undefined ? parseFloat(data.target_amount) : target.target_amount,
                  status: data.status !== undefined ? data.status : target.status,
                  _lastUpdate: Date.now()
                };
              }
              return target;
            });
          } else {
            // New target, fetch all
            debouncedFetchTargets();
            return prevTargets;
          }
        });
        
        // Update selected target if viewing it
        const currentSelected = selectedTargetRef.current;
        if (currentSelected && currentSelected.id === data.id) {
          setSelectedTarget(prev => ({
            ...prev,
            net_amount: data.net_amount !== undefined ? parseFloat(data.net_amount) : prev.net_amount,
            progress_percentage: data.progress_percentage !== undefined ? data.progress_percentage : prev.progress_percentage,
            remaining_amount: data.remaining_amount !== undefined ? parseFloat(data.remaining_amount) : prev.remaining_amount,
            total_progress: data.total_progress !== undefined ? parseFloat(data.total_progress) : prev.total_progress,
            shared_in: data.shared_in !== undefined ? parseFloat(data.shared_in) : prev.shared_in,
            shared_out: data.shared_out !== undefined ? parseFloat(data.shared_out) : prev.shared_out
          }));
        }
      } else {
        // No data, fetch all
        debouncedFetchTargets();
      }
    };

    const handleTargetDeleted = (data) => {
      if (data && data.id) {
        setTargets(prevTargets => prevTargets.filter(target => target.id !== data.id));
        // Close modal if viewing deleted target (use ref)
        const currentSelected = selectedTargetRef.current;
        if (currentSelected && currentSelected.id === data.id) {
          setShowProgressModal(false);
          setSelectedTarget(null);
        }
      }
    };

    const handleTargetProgressUpdated = (data) => {
      if (data && data.target_id) {
        console.log('handleTargetProgressUpdated received data:', JSON.stringify(data, null, 2));
        console.log('Data details:', {
          target_id: data.target_id,
          net_amount: data.net_amount,
          total_progress: data.total_progress,
          progress_percentage: data.progress_percentage,
          remaining_amount: data.remaining_amount,
          action: data.action
        });
        
        // Update target metrics in real-time from socket data (no API call needed)
        setTargets(prevTargets => {
          return prevTargets.map(target => {
            if (target.id === data.target_id) {
              // Only update if we have valid metrics data
              const hasValidMetrics = data.net_amount !== undefined || 
                                    data.total_progress !== undefined ||
                                    data.remaining_amount !== undefined;
              
              if (!hasValidMetrics) {
                console.warn('Socket event missing metrics data, fetching from API...');
                // If metrics are missing, fetch from API
                setTimeout(() => fetchTargets(), 500);
                return target;
              }
              
              const updatedTarget = {
                ...target,
                net_amount: data.net_amount !== undefined ? parseFloat(data.net_amount) : target.net_amount,
                progress_percentage: data.progress_percentage !== undefined ? data.progress_percentage : target.progress_percentage,
                remaining_amount: data.remaining_amount !== undefined ? parseFloat(data.remaining_amount) : target.remaining_amount,
                total_progress: data.total_progress !== undefined ? parseFloat(data.total_progress) : target.total_progress,
                shared_in: data.shared_in !== undefined ? parseFloat(data.shared_in) : target.shared_in,
                shared_out: data.shared_out !== undefined ? parseFloat(data.shared_out) : target.shared_out,
                _lastUpdate: Date.now() // Track when this was last updated
              };
              
              console.log('Updated target from socket event:', {
                target_id: data.target_id,
                old_net_amount: target.net_amount,
                new_net_amount: updatedTarget.net_amount,
                old_total_progress: target.total_progress,
                new_total_progress: updatedTarget.total_progress,
                old_remaining: target.remaining_amount,
                new_remaining: updatedTarget.remaining_amount
              });
              
              return updatedTarget;
            }
            return target;
          });
        });
        
        // Update selected target if viewing it (use ref to get latest value)
        const currentSelected = selectedTargetRef.current;
        if (currentSelected && currentSelected.id === data.target_id) {
          setSelectedTarget(prev => ({
            ...prev,
            net_amount: data.net_amount !== undefined ? parseFloat(data.net_amount) : prev.net_amount,
            progress_percentage: data.progress_percentage !== undefined ? data.progress_percentage : prev.progress_percentage,
            remaining_amount: data.remaining_amount !== undefined ? parseFloat(data.remaining_amount) : prev.remaining_amount,
            total_progress: data.total_progress !== undefined ? parseFloat(data.total_progress) : prev.total_progress,
            shared_in: data.shared_in !== undefined ? parseFloat(data.shared_in) : prev.shared_in,
            shared_out: data.shared_out !== undefined ? parseFloat(data.shared_out) : prev.shared_out
          }));
          
          // Refresh progress modal if viewing this target (use ref)
          if (showProgressModalRef.current) {
            fetchTargetProgress(data.target_id);
          }
        }
      }
    };

    const handleFundShared = () => {
      fetchSharingHistory();
      // Fund sharing affects targets, so update targets after a delay
      debouncedFetchTargets();
    };

    socket.on('target_created', handleTargetCreated);
    socket.on('target_updated', handleTargetUpdated);
    socket.on('target_deleted', handleTargetDeleted);
    socket.on('target_progress_updated', handleTargetProgressUpdated);
    socket.on('fund_shared', handleFundShared);

    return () => {
      clearTimeout(fetchTimeout);
      socket.off('target_created', handleTargetCreated);
      socket.off('target_updated', handleTargetUpdated);
      socket.off('target_deleted', handleTargetDeleted);
      socket.off('target_progress_updated', handleTargetProgressUpdated);
      socket.off('fund_shared', handleFundShared);
    };
  }, [user]); // Removed selectedTarget from dependencies - it shouldn't re-setup socket listeners

  // Handle create target
  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await api.post('/targets', createForm);
      setShowCreateModal(false);
      setCreateForm({
        user_id: '',
        target_amount: '',
        category: '',
        period_start: new Date().toISOString().split('T')[0],
        period_end: '',
        notes: ''
      });
      fetchTargets();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create target');
    }
  };

  // Handle edit target
  const handleEdit = (target) => {
    setSelectedTarget(target);
    setEditForm({
      target_amount: target.target_amount,
      category: target.category || '',
      period_start: target.period_start,
      period_end: target.period_end || '',
      status: target.status || 'Active',
      notes: target.notes || '',
      manual_net_amount: undefined // Reset manual override
    });
    setShowEditModal(true);
  };

  // Handle update target
  const handleUpdate = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const updateData = { ...editForm };
      
      // If manual net_amount is set, include it for manual override
      if (updateData.manual_net_amount !== undefined && updateData.manual_net_amount !== '') {
        updateData.manual_net_amount_override = parseFloat(updateData.manual_net_amount);
        delete updateData.manual_net_amount; // Remove the form field
      }
      
      const response = await api.put(`/targets/${selectedTarget.id}`, updateData);
      
      // If manual override was used, the response should include updated metrics
      if (response.data && response.data.target) {
        // Update state immediately from response
        setTargets(prevTargets => prevTargets.map(target => 
          target.id === selectedTarget.id ? { ...target, ...response.data.target } : target
        ));
      }
      
      setShowEditModal(false);
      setSelectedTarget(null);
      
      // Refresh to ensure all metrics are up to date
      setTimeout(() => fetchTargets(), 300);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update target');
    }
  };

  // Handle delete target
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this target?')) {
      return;
    }

    try {
      await api.delete(`/targets/${id}`);
      fetchTargets();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete target');
    }
  };

  // Handle view progress
  const handleViewProgress = async (target) => {
    // Update with latest target data from state if available
    const latestTarget = targets.find(t => t.id === target.id) || target;
    setSelectedTarget(latestTarget);
    await fetchTargetProgress(latestTarget.id);
    setShowProgressModal(true);
  };

  // Handle approve/reject progress
  const handleApproveProgress = async (progressId, status) => {
    try {
      const response = await api.put(`/targets/progress/${progressId}/approve`, { status });
      
      // Update target state immediately from response data
      if (response.data && response.data.target) {
        const updatedTarget = response.data.target;
        setTargets(prevTargets => prevTargets.map(target => {
          if (target.id === updatedTarget.id) {
            // Merge all metrics from response
            return {
              ...target,
              net_amount: parseFloat(updatedTarget.net_amount || 0),
              progress_percentage: updatedTarget.progress_percentage || '0.00',
              remaining_amount: parseFloat(updatedTarget.remaining_amount || 0),
              total_progress: parseFloat(updatedTarget.total_progress || 0),
              shared_in: parseFloat(updatedTarget.shared_in || 0),
              shared_out: parseFloat(updatedTarget.shared_out || 0),
              _lastUpdate: Date.now()
            };
          }
          return target;
        }));
        
        // Update selected target if viewing it
        if (selectedTarget && selectedTarget.id === updatedTarget.id) {
          setSelectedTarget(prev => ({
            ...prev,
            net_amount: parseFloat(updatedTarget.net_amount || 0),
            progress_percentage: updatedTarget.progress_percentage || '0.00',
            remaining_amount: parseFloat(updatedTarget.remaining_amount || 0),
            total_progress: parseFloat(updatedTarget.total_progress || 0),
            shared_in: parseFloat(updatedTarget.shared_in || 0),
            shared_out: parseFloat(updatedTarget.shared_out || 0)
          }));
        }
      }
      
      // Refresh progress modal if viewing this target
      if (selectedTarget && response.data && response.data.target) {
        await fetchTargetProgress(response.data.target.id);
      }
      
      // Refetch targets so the target area shows updated totals (progress increases)
      fetchTargets(true);
      setTimeout(() => {
        if (response.data?.target && parseFloat(response.data.target.total_progress || 0) > 0) {
          setTargets(prev => prev.map(t =>
            t.id === response.data.target.id
              ? { ...t, ...response.data.target, _lastUpdate: Date.now() }
              : t
          ));
        }
      }, 400);
    } catch (err) {
      const isNetworkError = err.code === 'ERR_NETWORK' || 
                            err.code === 'ERR_INTERNET_DISCONNECTED';
      
      if (!isNetworkError) {
        alert(err.response?.data?.error || 'Failed to update progress entry');
        // On error, fetch to get latest state
        fetchTargets();
      }
    }
  };

  // Handle share funds
  const handleShareFunds = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await api.post('/targets/fund-sharing', shareForm);
      setShowShareModal(false);
      setShareForm({
        to_user_id: '',
        amount: '',
        reason: ''
      });
      fetchTargets();
      fetchSharingHistory();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to share funds');
    }
  };

  // Get current user's target for fund sharing validation
  const getUserTarget = () => {
    return targets.find(t => t.user_id === user?.id && t.status === 'Active');
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center p-5">
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
          <div>
            <h2 className="mb-0">Targets Management</h2>
            <p className="text-muted mb-0">
              Manage employee targets and track progress in real-time
            </p>
          </div>
          <div>
            {(user?.role === 'Staff' || user?.role === 'DepartmentHead') && (
              <button
                className="btn btn-success me-2"
                onClick={() => setShowShareModal(true)}
              >
                <i className="bi bi-arrow-left-right me-2"></i>Share Funds
              </button>
            )}
            {user?.role === 'Admin' && (
              <button
                className="btn btn-primary"
                onClick={() => setShowCreateModal(true)}
              >
                <i className="bi bi-plus-circle me-2"></i>Create Target
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="alert alert-info mb-4">
        <h5><i className="bi bi-info-circle me-2"></i>How It Works</h5>
        <ul className="mb-0">
          <li><strong>Admin Target</strong> = Sum of all employee and department head targets (auto-aggregated)</li>
          <li><strong>Net Amount</strong> = Approved Progress + Funds Shared In - Funds Shared Out</li>
          <li><strong>Progress Percentage</strong> = (Net Amount / Target Amount) × 100</li>
          <li><strong>Remaining Amount</strong> = Target Amount - Net Amount (minimum 0)</li>
          <li>Progress entries from progress reports start as <strong>Pending</strong> and require Admin approval</li>
          <li>Only <strong>Approved</strong> progress entries are counted in calculations</li>
          <li>Fund sharing: You must have more funds than the share amount (net_amount &gt; share_amount)</li>
          <li>Everyone can view all targets, progress history, and fund sharing history</li>
          <li>All updates are synchronized in real-time across all users</li>
        </ul>
        </div>

      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button 
            className={`nav-link ${activeTab === 'targets' ? 'active' : ''}`}
            onClick={() => setActiveTab('targets')}
          >
            <i className="bi bi-bullseye me-2"></i>Targets
          </button>
        </li>
        <li className="nav-item">
          <button 
            className={`nav-link ${activeTab === 'sharing' ? 'active' : ''}`}
            onClick={() => setActiveTab('sharing')}
          >
            <i className="bi bi-arrow-left-right me-2"></i>Fund Sharing History
          </button>
        </li>
      </ul>

      {/* Targets Table */}
      {activeTab === 'targets' && (
      <div className="card">
        <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover">
              <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Target Amount</th>
                    <th>Net Amount</th>
                  <th>Progress %</th>
                    <th>Remaining</th>
                    <th>Category</th>
                    <th>Status</th>
                  <th>Period</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                {targets.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center text-muted">
                      No targets found
                    </td>
                  </tr>
                ) : (
                  targets.map((target) => (
                    <tr key={target.id}>
                      <td>{target.user_name}</td>
                      <td>{formatCurrency(target.target_amount)}</td>
                      <td>
                        <span className={`fw-bold ${parseFloat(target.net_amount) >= 0 ? 'text-success' : 'text-danger'}`}>
                          {formatCurrency(target.net_amount)}
                        </span>
                      </td>
                      <td>
                        <span className="badge bg-info">
                          {target.progress_percentage}%
                        </span>
                      </td>
                      <td>{formatCurrency(target.remaining_amount)}</td>
                      <td>{target.category || 'N/A'}</td>
                      <td>
                        <span className={`badge bg-${
                          target.status === 'Active' ? 'success' :
                          target.status === 'Completed' ? 'primary' :
                          target.status === 'Cancelled' ? 'danger' : 'secondary'
                        }`}>
                          {target.status || 'Active'}
                        </span>
                      </td>
                      <td>
                        {target.period_start && (
                          <>
                            {new Date(target.period_start).toLocaleDateString()}
                            {target.period_end && ` - ${new Date(target.period_end).toLocaleDateString()}`}
                            </>
                          )}
                      </td>
                      <td>
                          <button
                          className="btn btn-sm btn-outline-info me-2"
                          onClick={() => handleViewProgress(target)}
                            title="View Progress"
                          >
                            <i className="bi bi-graph-up"></i>
                          </button>
                        {user?.role === 'Admin' && (
                          <>
              <button
                              className="btn btn-sm btn-outline-primary me-2"
                              onClick={() => handleEdit(target)}
                              title="Edit"
              >
                              <i className="bi bi-pencil"></i>
              </button>
                              <button
                                className="btn btn-sm btn-outline-danger"
                              onClick={() => handleDelete(target.id)}
                              title="Delete"
                              >
                              <i className="bi bi-trash"></i>
                              </button>
                          </>
                          )}
                      </td>
                        </tr>
                  ))
                )}
                    </tbody>
                  </table>
          </div>
        </div>
      </div>
      )}

      {/* Fund Sharing History */}
      {activeTab === 'sharing' && (
        <div className="card">
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Amount</th>
                    <th>Reason</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sharingHistory.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center text-muted">
                        No fund sharing history found
                      </td>
                    </tr>
                  ) : (
                    sharingHistory.map((share) => (
                      <tr key={share.id}>
                        <td>{new Date(share.created_at).toLocaleDateString()}</td>
                        <td>{share.from_user_name || 'Unknown'}</td>
                        <td>{share.to_user_name || 'Unknown'}</td>
                        <td>{formatCurrency(share.amount)}</td>
                        <td>{share.reason || 'N/A'}</td>
                        <td>
                          <span className={`badge bg-${
                            share.status === 'Active' ? 'success' :
                            share.status === 'Reversed' ? 'danger' : 'secondary'
                          }`}>
                            {share.status || 'Active'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Share Funds Modal */}
      {showShareModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Share Funds</h5>
                <button type="button" className="btn-close" onClick={() => setShowShareModal(false)}></button>
              </div>
              <form onSubmit={handleShareFunds}>
                <div className="modal-body">
                  {error && <div className="alert alert-danger">{error}</div>}
                  
                  {(() => {
                    const userTarget = getUserTarget();
                    return userTarget && (
                      <div className="alert alert-info">
                        <strong>Your Current Net Amount:</strong> {formatCurrency(userTarget.net_amount)}
                        <br />
                        <small>You can only share funds if your net amount is greater than the share amount.</small>
                      </div>
                    );
                  })()}

                  <div className="mb-3">
                    <label className="form-label">Share To *</label>
                    <select
                      className="form-select"
                      value={shareForm.to_user_id}
                      onChange={(e) => setShareForm({ ...shareForm, to_user_id: e.target.value })}
                      required
                    >
                      <option value="">Select Employee/Department Head</option>
                      {users
                        .filter(u => u.id !== user?.id && (u.role === 'Staff' || u.role === 'DepartmentHead'))
                        .map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.email}) - {u.role}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Amount *</label>
                    <input
                      type="number"
                      className="form-control"
                      step="0.01"
                      min="0.01"
                      value={shareForm.amount}
                      onChange={(e) => setShareForm({ ...shareForm, amount: e.target.value })}
                      required
                    />
                    <small className="form-text text-muted">
                      You must have more funds than this amount to share.
                    </small>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Reason (Optional)</label>
                    <textarea
                      className="form-control"
                      rows="3"
                      value={shareForm.reason}
                      onChange={(e) => setShareForm({ ...shareForm, reason: e.target.value })}
                      placeholder="Enter reason for sharing funds..."
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowShareModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-success">Share Funds</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Create Target Modal */}
      {showCreateModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Create Target</h5>
                <button type="button" className="btn-close" onClick={() => setShowCreateModal(false)}></button>
              </div>
              <form onSubmit={handleCreate}>
                <div className="modal-body">
                  {error && <div className="alert alert-danger">{error}</div>}
                  
                  <div className="mb-3">
                    <label className="form-label">Employee *</label>
                    <select
                      className="form-select"
                      value={createForm.user_id}
                      onChange={(e) => setCreateForm({ ...createForm, user_id: e.target.value })}
                      required
                    >
                      <option value="">Select Employee</option>
                      {users
                        .filter(u => u.role === 'Staff' || u.role === 'DepartmentHead')
                        .map(user => (
                          <option key={user.id} value={user.id}>{user.name} ({user.email}) - {user.role}</option>
                        ))}
                    </select>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Target Amount *</label>
                    <input
                      type="number"
                      className="form-control"
                      step="0.01"
                      min="0"
                      value={createForm.target_amount}
                      onChange={(e) => setCreateForm({ ...createForm, target_amount: e.target.value })}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Category</label>
                    <select
                      className="form-select"
                      value={createForm.category}
                      onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                    >
                      <option value="">Select Category</option>
                      <option value="Employee">Employee</option>
                      <option value="Client for Consultancy">Client for Consultancy</option>
                      <option value="Client for Audit">Client for Audit</option>
                      <option value="Student">Student</option>
                      <option value="Others">Others</option>
                    </select>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Period Start *</label>
                    <input
                      type="date"
                      className="form-control"
                      value={createForm.period_start}
                      onChange={(e) => setCreateForm({ ...createForm, period_start: e.target.value })}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Period End</label>
                    <input
                      type="date"
                      className="form-control"
                      value={createForm.period_end}
                      onChange={(e) => setCreateForm({ ...createForm, period_end: e.target.value })}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Notes</label>
                    <textarea
                      className="form-control"
                      rows="3"
                      value={createForm.notes}
                      onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">Create Target</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Target Modal */}
      {showEditModal && selectedTarget && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Target</h5>
                <button type="button" className="btn-close" onClick={() => setShowEditModal(false)}></button>
              </div>
              <form onSubmit={handleUpdate}>
                <div className="modal-body">
                  {error && <div className="alert alert-danger">{error}</div>}
                  
                  <div className="mb-3">
                    <label className="form-label">Target Amount</label>
                      <input
                        type="number"
                      className="form-control"
                        step="0.01"
                        min="0"
                        value={editForm.target_amount}
                        onChange={(e) => setEditForm({ ...editForm, target_amount: e.target.value })}
                      />
                    </div>

                  <div className="mb-3">
                    <label className="form-label">Category</label>
                    <select
                      className="form-select"
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    >
                      <option value="">Select Category</option>
                      <option value="Employee">Employee</option>
                      <option value="Client for Consultancy">Client for Consultancy</option>
                      <option value="Client for Audit">Client for Audit</option>
                      <option value="Student">Student</option>
                      <option value="Others">Others</option>
                    </select>
                  </div>

                      <div className="mb-3">
                    <label className="form-label">Status</label>
                    <select
                      className="form-select"
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    >
                      <option value="Active">Active</option>
                      <option value="Completed">Completed</option>
                      <option value="Extended">Extended</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>

                      <div className="mb-3">
                        <label className="form-label">Period Start</label>
                        <input
                          type="date"
                          className="form-control"
                          value={editForm.period_start ? (typeof editForm.period_start === 'string' ? editForm.period_start.split('T')[0] : new Date(editForm.period_start).toISOString().split('T')[0]) : ''}
                          onChange={(e) => setEditForm({ ...editForm, period_start: e.target.value })}
                        />
                      </div>

                      <div className="mb-3">
                        <label className="form-label">Period End</label>
                        <input
                          type="date"
                          className="form-control"
                          value={editForm.period_end ? (typeof editForm.period_end === 'string' ? editForm.period_end.split('T')[0] : new Date(editForm.period_end).toISOString().split('T')[0]) : ''}
                          onChange={(e) => setEditForm({ ...editForm, period_end: e.target.value })}
                        />
                      </div>

                  <div className="mb-3">
                    <label className="form-label">Notes</label>
                    <textarea
                      className="form-control"
                      rows="3"
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    />
                  </div>

                  {/* Manual Net Amount Override (Admin only) */}
                  {user && user.role === 'Admin' && (
                    <>
                      <div className="mb-3">
                        <label className="form-label">
                          Manual Net Amount Override 
                          <small className="text-muted ms-2">(Optional - will recalculate progress and remaining)</small>
                        </label>
                        <input
                          type="number"
                          className="form-control"
                          step="0.01"
                          min="0"
                          placeholder={selectedTarget?.net_amount || "0.00"}
                          value={editForm.manual_net_amount !== undefined ? editForm.manual_net_amount : ''}
                          onChange={(e) => setEditForm({ ...editForm, manual_net_amount: e.target.value || undefined })}
                        />
                        <small className="text-muted">
                          Current Net Amount: {formatCurrency(selectedTarget?.net_amount || 0)} | 
                          Current Progress: {selectedTarget?.progress_percentage || '0.00'}% | 
                          Current Remaining: {formatCurrency(selectedTarget?.remaining_amount || 0)}
                        </small>
                      </div>
                      <div className="alert alert-info">
                        <small>
                          <strong>Note:</strong> Setting a manual net amount will automatically recalculate the progress percentage and remaining amount based on the target amount.
                        </small>
                      </div>
                    </>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">Update Target</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Progress History Modal */}
      {showProgressModal && selectedTarget && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Progress History - {selectedTarget.user_name}</h5>
                <button type="button" className="btn-close" onClick={() => setShowProgressModal(false)}></button>
              </div>
                <div className="modal-body">
                  <div className="mb-3">
                  <strong>Target Amount:</strong> {formatCurrency(selectedTarget.target_amount)}<br />
                  <strong>Net Amount:</strong> {formatCurrency(selectedTarget.net_amount)}<br />
                  <strong>Progress:</strong> {selectedTarget.progress_percentage}%<br />
                  <strong>Remaining:</strong> {formatCurrency(selectedTarget.remaining_amount)}
                  </div>

                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Category</th>
                        <th>Status</th>
                        <th>Source</th>
                        {user?.role === 'Admin' && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {targetProgress.length === 0 ? (
                        <tr>
                          <td colSpan={user?.role === 'Admin' ? 6 : 5} className="text-center text-muted">
                            No progress entries found
                          </td>
                        </tr>
                      ) : (
                        targetProgress.map((progress) => (
                        <tr key={progress.id}>
                            <td>{progress.transaction_date ? new Date(progress.transaction_date).toLocaleDateString() : 'N/A'}</td>
                            <td>{formatCurrency(progress.amount || progress.progress_amount)}</td>
                            <td>{progress.category || 'N/A'}</td>
                          <td>
                            <span className={`badge bg-${
                              progress.status === 'Approved' ? 'success' :
                                progress.status === 'Rejected' ? 'danger' : 'warning'
                            }`}>
                              {progress.status || 'Pending'}
                            </span>
                          </td>
                            <td>{progress.progress_report_name || 'Manual Entry'}</td>
                            {user?.role === 'Admin' && progress.status === 'Pending' && (
                            <td>
                                  <button
                                  className="btn btn-sm btn-success me-1"
                                    onClick={() => handleApproveProgress(progress.id, 'Approved')}
                                    title="Approve"
                                  >
                                  <i className="bi bi-check"></i>
                                  </button>
                                  <button
                                    className="btn btn-sm btn-danger"
                                    onClick={() => handleApproveProgress(progress.id, 'Rejected')}
                                    title="Reject"
                                  >
                                  <i className="bi bi-x"></i>
                                  </button>
                            </td>
                          )}
                        </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
            </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowProgressModal(false)}>
                  Close
                </button>
          </div>
        </div>
      </div>
        </div>
      )}
    </div>
  );
};

export default Targets;

