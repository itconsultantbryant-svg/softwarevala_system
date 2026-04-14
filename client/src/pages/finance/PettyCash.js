import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import { useAuth } from '../../hooks/useAuth';
import { getSocket } from '../../config/socket';

const PettyCash = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [custodians, setCustodians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [summary, setSummary] = useState({ total_deposited: 0, total_withdrawn: 0, closing_balance: 0 });
  const [canDelete, setCanDelete] = useState(false);
  const [formData, setFormData] = useState({
    transaction_date: new Date().toISOString().slice(0, 16),
    petty_cash_custodian_id: '',
    amount_deposit: '',
    amount_withdrawal: '',
    description: '',
    charged_to: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchTransactions();
    fetchCustodians();
    checkDeletePermission();
    
    const socket = getSocket();
    if (socket) {
      socket.on('petty_cash_created', handlePettyCashCreated);
      socket.on('petty_cash_updated', handlePettyCashUpdated);
      socket.on('petty_cash_deleted', handlePettyCashDeleted);
      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
      });
      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });
      
      return () => {
        socket.off('petty_cash_created', handlePettyCashCreated);
        socket.off('petty_cash_updated', handlePettyCashUpdated);
        socket.off('petty_cash_deleted', handlePettyCashDeleted);
        socket.off('connect_error');
        socket.off('error');
      };
    }
  }, []);

  useEffect(() => {
    applyFilters();
  }, [transactions, fromDate, toDate]);

  useEffect(() => {
    // Clear errors when form is closed
    if (!showForm) {
      setError('');
      setSuccess('');
    }
  }, [showForm]);

  const checkDeletePermission = async () => {
    // Only Assistant Finance Officer and Finance Department Head can delete
    if (user?.role === 'Admin') {
      setCanDelete(false);
      return;
    }
    
    try {
      // Check if user is Finance Department Head
      if (user?.role === 'DepartmentHead') {
        const response = await api.get('/departments');
        const userEmailLower = user.email.toLowerCase().trim();
        const financeDept = response.data.departments.find(d => 
          (d.manager_id === user.id || 
           (d.head_email && d.head_email.toLowerCase().trim() === userEmailLower)) &&
          d.name && d.name.toLowerCase().includes('finance')
        );
        setCanDelete(!!financeDept);
        return;
      }

      // Check if user is Assistant Finance Officer (Staff in Finance or sean@)
      if (user?.role === 'Staff') {
        const email = ((user.email ?? '') + '').toLowerCase().trim();
        if (email === 'sean@prinstinegroup.org') {
          setCanDelete(true);
          return;
        }
        try {
          const response = await api.get('/staff');
          const staffList = response.data.staff || [];
          const myStaff = staffList.find(s => s.user_id === user.id);
          if (myStaff && myStaff.department && myStaff.department.toLowerCase().includes('finance')) {
            setCanDelete(true);
            return;
          }
        } catch (e) {
          // /staff may 403 for non-HR Staff; treat as no delete
        }
      }

      setCanDelete(false);
    } catch (error) {
      console.error('Error checking delete permission:', error);
      setCanDelete(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      
      const response = await api.get('/finance/petty-cash', { params });
      setTransactions(response.data.transactions || []);
      setSummary(response.data.summary || {
        total_deposited: 0,
        total_withdrawn: 0,
        closing_balance: 0
      });
    } catch (error) {
      console.error('Error fetching transactions:', error);
      const errorMessage = error.response?.data?.error || 
                          error.message || 
                          (error.code === 'ERR_NETWORK' ? 'Network error. Please check your connection.' : 'Failed to load petty cash entries');
      setError(errorMessage);
      setTransactions([]);
      setSummary({ total_deposited: 0, total_withdrawn: 0, closing_balance: 0 });
    } finally {
      setLoading(false);
    }
  };

  const fetchCustodians = async () => {
    try {
      const response = await api.get('/finance/petty-cash/custodians');
      setCustodians(response.data.custodians || []);
      if (!response.data.custodians || response.data.custodians.length === 0) {
        console.warn('No custodians available');
      }
    } catch (error) {
      console.error('Error fetching custodians:', error);
      setCustodians([]);
      // Don't show error to user for custodians, just log it
      if (error.response?.status === 403) {
        console.error('Access denied to custodians endpoint');
      }
    }
  };

  const applyFilters = () => {
    let filtered = [...transactions];
    
    if (fromDate) {
      filtered = filtered.filter(t => 
        new Date(t.transaction_date) >= new Date(fromDate)
      );
    }
    if (toDate) {
      filtered = filtered.filter(t => 
        new Date(t.transaction_date) <= new Date(toDate + 'T23:59:59')
      );
    }
    
    setFilteredTransactions(filtered);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Prevent double submission
    if (submitting) {
      return;
    }

    // Validation
    if (!formData.transaction_date) {
      setError('Transaction date and time is required');
      return;
    }

    if (!formData.petty_cash_custodian_id) {
      setError('Please select a custodian');
      return;
    }

    const deposit = parseFloat(formData.amount_deposit) || 0;
    const withdrawal = parseFloat(formData.amount_withdrawal) || 0;

    if (deposit === 0 && withdrawal === 0) {
      setError('Please enter either deposit or withdrawal amount');
      return;
    }

    if (deposit > 0 && withdrawal > 0) {
      setError('Cannot have both deposit and withdrawal in the same transaction');
      return;
    }

    if (deposit < 0 || withdrawal < 0) {
      setError('Amounts cannot be negative');
      return;
    }

    setSubmitting(true);
    try {
      // Convert datetime-local format to ISO8601 format for backend validation
      let transactionDate = formData.transaction_date;
      if (transactionDate && !transactionDate.includes('T')) {
        // If it's just a date, add time
        transactionDate = transactionDate + 'T00:00:00';
      } else if (transactionDate && transactionDate.includes('T') && !transactionDate.includes(':')) {
        // If missing time, add default time
        transactionDate = transactionDate + ':00:00';
      }
      // Ensure it's in ISO8601 format (add seconds and Z if not present)
      if (transactionDate && !transactionDate.includes('Z') && !transactionDate.match(/[+-]\d{2}:\d{2}$/)) {
        // If no timezone, assume local time and convert to ISO string
        try {
          const date = new Date(transactionDate);
          if (!isNaN(date.getTime())) {
            transactionDate = date.toISOString();
          }
        } catch (e) {
          // If conversion fails, try adding :00 for seconds
          if (transactionDate.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
            transactionDate = transactionDate + ':00';
          }
        }
      }

      const payload = {
        transaction_date: transactionDate,
        petty_cash_custodian_id: formData.petty_cash_custodian_id,
        amount_deposit: deposit > 0 ? deposit : 0,
        amount_withdrawal: withdrawal > 0 ? withdrawal : 0,
        description: formData.description || '',
        charged_to: formData.charged_to || ''
      };

      if (editingTransaction && editingTransaction.id) {
        await api.put(`/finance/petty-cash/${editingTransaction.id}`, payload);
        setSuccess('Petty cash entry updated successfully');
      } else {
        await api.post('/finance/petty-cash', payload);
        setSuccess('Petty cash entry created successfully');
      }
      
      // Clear form and close modal after a short delay to show success message
      setTimeout(() => {
        setShowForm(false);
        setEditingTransaction(null);
        setFormData({
          transaction_date: new Date().toISOString().slice(0, 16),
          petty_cash_custodian_id: '',
          amount_deposit: '',
          amount_withdrawal: '',
          description: '',
          charged_to: ''
        });
        setSubmitting(false);
      }, 500);
      
      await fetchTransactions();
    } catch (error) {
      setSubmitting(false);
      console.error('Error saving petty cash entry:', error);
      
      let errorMessage = 'Failed to save petty cash entry';
      
      if (error.response) {
        // Server responded with error
        if (error.response.data?.errors && Array.isArray(error.response.data.errors)) {
          // Multiple validation errors
          errorMessage = error.response.data.errors.map(err => err.msg || err.message).join(', ');
        } else if (error.response.data?.error) {
          errorMessage = error.response.data.error;
        } else if (error.response.status === 403) {
          errorMessage = 'You do not have permission to perform this action.';
        } else if (error.response.status === 404) {
          errorMessage = 'Entry not found.';
        } else if (error.response.status === 400) {
          errorMessage = error.response.data?.message || 'Invalid data provided. Please check your input.';
        }
      } else if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
    }
  };

  const handleEdit = (transaction) => {
    if (!transaction || !transaction.id) {
      setError('Invalid transaction data');
      return;
    }

    try {
      setEditingTransaction(transaction);
      
      // Convert ISO8601 date back to datetime-local format for input field
      let transactionDate = new Date().toISOString().slice(0, 16);
      if (transaction.transaction_date) {
        try {
          const date = new Date(transaction.transaction_date);
          if (!isNaN(date.getTime())) {
            // Convert to datetime-local format (YYYY-MM-DDTHH:mm)
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            transactionDate = `${year}-${month}-${day}T${hours}:${minutes}`;
          }
        } catch (e) {
          console.warn('Invalid transaction date, using current date');
        }
      }
      
      setFormData({
        transaction_date: transactionDate,
        petty_cash_custodian_id: String(
          transaction.petty_cash_custodian_id ?? transaction.custodian_id ?? ''
        ),
        amount_deposit: transaction.amount_deposited || '',
        amount_withdrawal: transaction.amount_withdrawn || '',
        description: transaction.description || '',
        charged_to: transaction.charged_to || ''
      });
      setShowForm(true);
      setError('');
    } catch (error) {
      console.error('Error preparing edit form:', error);
      setError('Failed to load transaction for editing');
    }
  };

  const handleDelete = async (id) => {
    if (!id) {
      setError('Invalid entry ID');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this petty cash entry? This action cannot be undone.')) {
      return;
    }

    try {
      setError('');
      await api.delete(`/finance/petty-cash/${id}`);
      setSuccess('Petty cash entry deleted successfully');
      await fetchTransactions();
    } catch (error) {
      console.error('Error deleting petty cash entry:', error);
      const errorMessage = error.response?.data?.error || 
                          (error.response?.status === 403 ? 'You do not have permission to delete this entry.' :
                          error.response?.status === 404 ? 'Entry not found.' :
                          error.code === 'ERR_NETWORK' ? 'Network error. Please check your connection and try again.' : 
                          'Failed to delete petty cash entry');
      setError(errorMessage);
    }
  };

  const handlePettyCashCreated = (data) => {
    fetchTransactions();
  };

  const handlePettyCashUpdated = (data) => {
    fetchTransactions();
  };

  const handlePettyCashDeleted = (data) => {
    fetchTransactions();
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString();
  };

  const formatCurrency = (amount) => {
    return `$${parseFloat(amount || 0).toFixed(2)}`;
  };

  if (loading) {
    return <div className="container mt-4"><div className="text-center">Loading...</div></div>;
  }

  return (
    <div className="container-fluid mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Petty Cash Management</h2>
        <div className="d-flex gap-2">
          {user?.role === 'Admin' && (
            <button 
              className="btn btn-warning"
              onClick={async () => {
                if (!window.confirm('Are you sure you want to reset all petty cash balances to zero? This will recalculate all balances from scratch. This action cannot be undone.')) {
                  return;
                }
                try {
                  await api.post('/finance/petty-cash/reset-all-balances');
                  setSuccess('All petty cash balances have been reset to zero');
                  fetchTransactions();
                } catch (error) {
                  setError(error.response?.data?.error || 'Failed to reset balances');
                }
              }}
            >
              <i className="bi bi-arrow-counterclockwise me-2"></i>Reset All Balances
            </button>
          )}
          <button 
            className="btn btn-primary"
            onClick={() => {
              setShowForm(true);
              setEditingTransaction(null);
              setFormData({
                transaction_date: new Date().toISOString().slice(0, 16),
                petty_cash_custodian_id: '',
                amount_deposit: '',
                amount_withdrawal: '',
                description: '',
                charged_to: ''
              });
            }}
          >
            <i className="bi bi-plus-circle me-2"></i>Add Petty Cash Entry
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Date Filters */}
      <div className="card mb-4">
        <div className="card-body">
          <h5 className="card-title">Filter Reports</h5>
          <div className="row">
            <div className="col-md-4">
              <label className="form-label">From Date</label>
              <input
                type="date"
                className="form-control"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  fetchTransactions();
                }}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">To Date</label>
              <input
                type="date"
                className="form-control"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  fetchTransactions();
                }}
              />
            </div>
            <div className="col-md-4 d-flex align-items-end">
              <button 
                className="btn btn-secondary"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  fetchTransactions();
                }}
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="row mb-4">
        <div className="col-md-4">
          <div className="card">
            <div className="card-body">
              <h6 className="card-subtitle mb-2 text-muted">Total Deposited</h6>
              <h4 className="text-success">{formatCurrency(summary.total_deposited)}</h4>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card">
            <div className="card-body">
              <h6 className="card-subtitle mb-2 text-muted">Total Withdrawn</h6>
              <h4 className="text-danger">{formatCurrency(summary.total_withdrawn)}</h4>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card">
            <div className="card-body">
              <h6 className="card-subtitle mb-2 text-muted">Closing Balance</h6>
              <h4 className="text-primary">{formatCurrency(summary.closing_balance)}</h4>
            </div>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="card">
        <div className="card-header">
          <h5 className="mb-0">Petty Cash Entries</h5>
        </div>
        <div className="card-body">
          {filteredTransactions.length === 0 ? (
            <p className="text-center text-muted">No petty cash entries found</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-striped">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Custodian</th>
                    <th>Amount Deposit</th>
                    <th>Amount Withdrawal</th>
                    <th>Balance</th>
                    <th>Description</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>{formatDate(transaction.transaction_date)}</td>
                      <td>{transaction.custodian_name || 'N/A'}</td>
                      <td className="text-success">
                        {transaction.amount_deposited > 0 ? formatCurrency(transaction.amount_deposited) : '-'}
                      </td>
                      <td className="text-danger">
                        {transaction.amount_withdrawn > 0 ? formatCurrency(transaction.amount_withdrawn) : '-'}
                      </td>
                      <td className="fw-bold">{formatCurrency(transaction.balance)}</td>
                      <td>{transaction.description || '-'}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline-primary me-2"
                          onClick={() => handleEdit(transaction)}
                        >
                          <i className="bi bi-pencil"></i>
                        </button>
                        {canDelete && (
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleDelete(transaction.id)}
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {editingTransaction ? 'Edit Petty Cash Entry' : 'Create Petty Cash Entry'}
                </h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={() => {
                    setShowForm(false);
                    setEditingTransaction(null);
                  }}
                ></button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label className="form-label">Date and Time *</label>
                    <input
                      type="datetime-local"
                      className="form-control"
                      value={formData.transaction_date}
                      onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Petty Cash Custodian *</label>
                    <select
                      className="form-select"
                      value={formData.petty_cash_custodian_id}
                      onChange={(e) => setFormData({ ...formData, petty_cash_custodian_id: e.target.value })}
                      required
                    >
                      <option value="">Select custodian...</option>
                      {custodians.map((custodian) => (
                        <option key={custodian.id} value={custodian.id}>
                          {custodian.name} ({custodian.role_type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Amount Deposit</label>
                      <input
                        type="number"
                        className="form-control"
                        step="0.01"
                        min="0"
                        value={formData.amount_deposit}
                        onChange={(e) => setFormData({ ...formData, amount_deposit: e.target.value, amount_withdrawal: '' })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Amount Withdrawal</label>
                      <input
                        type="number"
                        className="form-control"
                        step="0.01"
                        min="0"
                        value={formData.amount_withdrawal}
                        onChange={(e) => setFormData({ ...formData, amount_withdrawal: e.target.value, amount_deposit: '' })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-control"
                      rows="3"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Optional description"
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Charged To</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.charged_to}
                      onChange={(e) => setFormData({ ...formData, charged_to: e.target.value })}
                      placeholder="Optional expense category"
                    />
                  </div>

                  <div className="d-flex justify-content-end">
                    <button
                      type="button"
                      className="btn btn-secondary me-2"
                      onClick={() => {
                        setShowForm(false);
                        setEditingTransaction(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                      {submitting ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          {editingTransaction ? 'Updating...' : 'Creating...'}
                        </>
                      ) : (
                        editingTransaction ? 'Update' : 'Create'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PettyCash;

