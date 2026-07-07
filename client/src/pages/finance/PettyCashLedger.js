import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../config/api';
import { useAuth } from '../../hooks/useAuth';

const PettyCashLedger = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ledgers, setLedgers] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLedgerForm, setShowLedgerForm] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [selectedLedger, setSelectedLedger] = useState(null);
  const [isFinanceDeptHead, setIsFinanceDeptHead] = useState(false);
  const [formData, setFormData] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    starting_balance: 0,
    petty_cash_custodian_id: '',
    date_from: new Date().toISOString().split('T')[0],
    date_to: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
  });
  const [transactionData, setTransactionData] = useState({
    transaction_date: new Date().toISOString().split('T')[0],
    description: '',
    amount_deposited: '',
    amount_withdrawn: '',
    charged_to: '',
    received_by_type: 'Staff',
    received_by_staff_id: '',
    received_by_name: '',
    attachment: null
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const expenseCategories = [
    'Office Supplies',
    'Transport',
    'Refreshments',
    'Utilities',
    'Communication',
    'Maintenance',
    'Other'
  ];

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  useEffect(() => {
    fetchLedgers();
    fetchStaffMembers();
    checkFinanceDeptHead();
  }, []);

  const checkFinanceDeptHead = async () => {
    if (user?.role === 'DepartmentHead') {
      try {
        const response = await api.get('/departments');
        const userEmailLower = user.email.toLowerCase().trim();
        const dept = response.data.departments.find(d => 
          (d.manager_id === user.id || 
           (d.head_email && d.head_email.toLowerCase().trim() === userEmailLower)) &&
          d.name && d.name.toLowerCase().includes('finance')
        );
        setIsFinanceDeptHead(!!dept);
      } catch (error) {
        console.error('Error checking finance department head:', error);
      }
    }
  };

  const fetchLedgers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/finance/petty-cash/ledgers');
      setLedgers(response.data.ledgers || []);
    } catch (error) {
      console.error('Error fetching ledgers:', error);
      setError('Failed to load petty cash ledgers');
    } finally {
      setLoading(false);
    }
  };

  const fetchStaffMembers = async () => {
    try {
      const response = await api.get('/staff');
      // Show all staff, department heads, and admin users (backend already filters based on role)
      const allStaff = response.data.staff || [];
      setStaffMembers(allStaff);
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  };

  const handleCreateLedger = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      // Find the selected staff member to determine if we need to use user_id
      const selectedStaff = staffMembers.find(s => 
        (s.id && s.id.toString() === formData.petty_cash_custodian_id) || 
        (s.user_id && s.user_id.toString() === formData.petty_cash_custodian_id)
      );
      
      const payload = {
        ...formData,
        // Backend accepts petty_cash_custodian_id which can be either staff.id or user.id
        petty_cash_custodian_id: selectedStaff?.id || selectedStaff?.user_id || formData.petty_cash_custodian_id
      };
      
      await api.post('/finance/petty-cash/ledgers', payload);
      setSuccess('Petty cash ledger created successfully');
      setShowLedgerForm(false);
      setFormData({
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        starting_balance: 0,
        petty_cash_custodian_id: '',
        date_from: new Date().toISOString().split('T')[0],
        date_to: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
      });
      fetchLedgers();
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to create ledger');
    }
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const formDataObj = new FormData();
      Object.keys(transactionData).forEach(key => {
        if (key !== 'attachment' && transactionData[key]) {
          formDataObj.append(key, transactionData[key]);
        }
      });
      if (transactionData.attachment) {
        formDataObj.append('attachment', transactionData.attachment);
      }

      await api.post(`/finance/petty-cash/ledgers/${selectedLedger.id}/transactions`, formDataObj, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setSuccess('Transaction added successfully');
      setShowTransactionForm(false);
      setTransactionData({
        transaction_date: new Date().toISOString().split('T')[0],
        description: '',
        amount_deposited: '',
        amount_withdrawn: '',
        charged_to: '',
        received_by_type: 'Staff',
        received_by_staff_id: '',
        received_by_name: '',
        attachment: null
      });
      fetchLedgers();
      if (selectedLedger) {
        fetchLedgerDetails(selectedLedger.id);
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to add transaction');
    }
  };

  const fetchLedgerDetails = async (ledgerId) => {
    try {
      const response = await api.get(`/finance/petty-cash/ledgers/${ledgerId}`);
      const updatedLedger = response.data.ledger;
      setSelectedLedger(updatedLedger);
      setLedgers(prev => prev.map(l => l.id === ledgerId ? updatedLedger : l));
    } catch (error) {
      console.error('Error fetching ledger details:', error);
    }
  };

  const handleViewLedger = async (ledger) => {
    await fetchLedgerDetails(ledger.id);
  };

  const handleApproveLedger = async (ledgerId, approved) => {
    if (!window.confirm(`Are you sure you want to ${approved ? 'approve' : 'reject'} this ledger?`)) {
      return;
    }

    try {
      await api.put(`/finance/petty-cash/ledgers/${ledgerId}/approve`, { approved });
      setSuccess(`Ledger ${approved ? 'approved' : 'rejected'} successfully`);
      fetchLedgers();
      if (selectedLedger && selectedLedger.id === ledgerId) {
        fetchLedgerDetails(ledgerId);
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to update approval status');
    }
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
          <h1 className="h3 mb-0">Petty Cash Ledger</h1>
          <button className="btn btn-primary" onClick={() => setShowLedgerForm(true)}>
            <i className="bi bi-plus-circle me-2"></i>Create New Ledger
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Ledgers List */}
      <div className="card">
        <div className="card-body">
          {ledgers.length === 0 ? (
            <div className="text-center text-muted p-4">
              No petty cash ledgers found. Click "Create New Ledger" to get started.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Custodian</th>
                    <th>Starting Balance</th>
                    <th>Total Deposited</th>
                    <th>Total Withdrawn</th>
                    <th>Closing Balance</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgers.map((ledger) => (
                    <tr key={ledger.id}>
                      <td><strong>{months[ledger.month - 1]} {ledger.year}</strong></td>
                      <td>{ledger.custodian_name || 'N/A'}</td>
                      <td>${parseFloat(ledger.starting_balance || 0).toFixed(2)}</td>
                      <td>${parseFloat(ledger.total_deposited || 0).toFixed(2)}</td>
                      <td>${parseFloat(ledger.total_withdrawn || 0).toFixed(2)}</td>
                      <td><strong>${parseFloat(ledger.closing_balance || ledger.starting_balance || 0).toFixed(2)}</strong></td>
                      <td>
                        <span className={`badge bg-${
                          ledger.approval_status === 'Approved' ? 'success' :
                          ledger.approval_status === 'Pending_Admin' ? 'info' :
                          ledger.approval_status === 'Pending_DeptHead' ? 'warning' :
                          ledger.approval_status === 'Rejected' ? 'danger' : 'secondary'
                        }`}>
                          {ledger.approval_status === 'Pending_DeptHead' ? 'Pending Dept Head' :
                           ledger.approval_status === 'Pending_Admin' ? 'Pending Admin' :
                           ledger.approval_status}
                        </span>
                        {ledger.dept_head_status && (
                          <>
                            <br />
                            <small className="text-muted">
                              Dept Head: {ledger.dept_head_status === 'Approved' ? '✓ Approved' : 
                                         ledger.dept_head_status === 'Rejected' ? '✗ Rejected' : 'Pending'}
                            </small>
                          </>
                        )}
                        {ledger.admin_status && (
                          <>
                            <br />
                            <small className="text-muted">
                              Admin: {ledger.admin_status === 'Approved' ? '✓ Approved' : 
                                     ledger.admin_status === 'Rejected' ? '✗ Rejected' : 'Pending'}
                            </small>
                          </>
                        )}
                      </td>
                      <td>
                        <button 
                          className="btn btn-sm btn-outline-info me-2"
                          onClick={() => handleViewLedger(ledger)}
                        >
                          <i className="bi bi-eye me-1"></i>View
                        </button>
                        {!ledger.locked && (
                          <>
                            {/* Finance Department Head can approve if status is Pending_DeptHead */}
                            {isFinanceDeptHead && ledger.approval_status === 'Pending_DeptHead' && (
                              <>
                                <button 
                                  className="btn btn-sm btn-outline-success me-2"
                                  onClick={() => handleApproveLedger(ledger.id, true)}
                                >
                                  <i className="bi bi-check-circle me-1"></i>Approve
                                </button>
                                <button 
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => handleApproveLedger(ledger.id, false)}
                                >
                                  <i className="bi bi-x-circle me-1"></i>Reject
                                </button>
                              </>
                            )}
                            {/* Admin can approve if status is Pending_Admin */}
                            {user?.role === 'Admin' && ledger.approval_status === 'Pending_Admin' && (
                              <>
                                <button 
                                  className="btn btn-sm btn-outline-success me-2"
                                  onClick={() => handleApproveLedger(ledger.id, true)}
                                >
                                  <i className="bi bi-check-circle me-1"></i>Approve
                                </button>
                                <button 
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => handleApproveLedger(ledger.id, false)}
                                >
                                  <i className="bi bi-x-circle me-1"></i>Reject
                                </button>
                              </>
                            )}
                          </>
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

      {/* Create Ledger Form */}
      {showLedgerForm && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Create Petty Cash Ledger</h5>
                <button type="button" className="btn-close" onClick={() => setShowLedgerForm(false)}></button>
              </div>
              <form onSubmit={handleCreateLedger}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Month *</label>
                    <select 
                      className="form-select" 
                      value={formData.month} 
                      onChange={(e) => setFormData({...formData, month: parseInt(e.target.value)})}
                      required
                    >
                      {months.map((month, index) => (
                        <option key={index + 1} value={index + 1}>{month}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Year *</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={formData.year}
                      onChange={(e) => setFormData({...formData, year: parseInt(e.target.value)})}
                      min="2020" 
                      max="2100"
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Starting Balance (Amount Brought Forward)</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={formData.starting_balance}
                      onChange={(e) => setFormData({...formData, starting_balance: parseFloat(e.target.value) || 0})}
                      step="0.01"
                      min="0"
                    />
                    <small className="form-text text-muted">Leave 0 to auto-calculate from previous month</small>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Petty Cash Custodian *</label>
                    <select 
                      className="form-select" 
                      value={formData.petty_cash_custodian_id}
                      onChange={(e) => setFormData({...formData, petty_cash_custodian_id: e.target.value})}
                      required
                    >
                      <option value="">Select custodian...</option>
                      {staffMembers.map((staff) => (
                        <option key={staff.user_id || staff.id} value={staff.id || staff.user_id}>
                          {staff.name} - {staff.staff_id || `User ID: ${staff.user_id}`} {staff.department ? `(${staff.department})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Period From Date *</label>
                      <input 
                        type="date" 
                        className="form-control" 
                        value={formData.date_from}
                        onChange={(e) => setFormData({...formData, date_from: e.target.value})}
                        required
                      />
                      <small className="form-text text-muted">Start date for this ledger period</small>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Period To Date *</label>
                      <input 
                        type="date" 
                        className="form-control" 
                        value={formData.date_to}
                        onChange={(e) => setFormData({...formData, date_to: e.target.value})}
                        required
                      />
                      <small className="form-text text-muted">End date for this ledger period</small>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowLedgerForm(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Create Ledger</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Selected Ledger View */}
      {selectedLedger && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-xl">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  PETTY CASH LEDGER – {months[selectedLedger.month - 1]} {selectedLedger.year}
                </h5>
                <button type="button" className="btn-close" onClick={() => setSelectedLedger(null)}></button>
              </div>
              <div className="modal-body">
                <div className="row mb-3">
                  <div className="col-md-6">
                    <strong>Company:</strong> SOFTWARE VALA LIBERIA
                  </div>
                  <div className="col-md-6">
                    <strong>Custodian:</strong> {selectedLedger.custodian_name}
                  </div>
                </div>
                <div className="row mb-3">
                  <div className="col-md-4">
                    <strong>Starting Balance:</strong> ${parseFloat(selectedLedger.starting_balance || 0).toFixed(2)}
                  </div>
                  <div className="col-md-4">
                    <strong>Total Deposited:</strong> ${parseFloat(selectedLedger.total_deposited || 0).toFixed(2)}
                  </div>
                  <div className="col-md-4">
                    <strong>Total Withdrawn:</strong> ${parseFloat(selectedLedger.total_withdrawn || 0).toFixed(2)}
                  </div>
                </div>
                <div className="row mb-3">
                  <div className="col-md-12">
                    <strong>Closing Balance:</strong> <span className="h5">${parseFloat(selectedLedger.closing_balance || selectedLedger.starting_balance || 0).toFixed(2)}</span>
                  </div>
                </div>

                {!selectedLedger.locked && (
                  <button 
                    className="btn btn-primary mb-3"
                    onClick={() => setShowTransactionForm(true)}
                  >
                    <i className="bi bi-plus-circle me-2"></i>Add Transaction
                  </button>
                )}

                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Slip No.</th>
                        <th>Description</th>
                        <th>Amount Deposited</th>
                        <th>Amount Withdrawn</th>
                        <th>Balance</th>
                        <th>Charged To</th>
                        <th>Received By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLedger.transactions && selectedLedger.transactions.length > 0 ? (
                        selectedLedger.transactions.map((t) => (
                          <tr key={t.id}>
                            <td>{new Date(t.transaction_date).toLocaleDateString()}</td>
                            <td>{t.petty_cash_slip_no}</td>
                            <td>{t.description}</td>
                            <td>{t.amount_deposited > 0 ? '$' + parseFloat(t.amount_deposited).toFixed(2) : '-'}</td>
                            <td>{t.amount_withdrawn > 0 ? '$' + parseFloat(t.amount_withdrawn).toFixed(2) : '-'}</td>
                            <td><strong>${parseFloat(t.balance).toFixed(2)}</strong></td>
                            <td>{t.charged_to}</td>
                            <td>{t.received_by_name || 'N/A'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="8" className="text-center text-muted">No transactions yet</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setSelectedLedger(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Transaction Form */}
      {showTransactionForm && selectedLedger && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add Transaction</h5>
                <button type="button" className="btn-close" onClick={() => setShowTransactionForm(false)}></button>
              </div>
              <form onSubmit={handleAddTransaction}>
                <div className="modal-body">
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Transaction Date *</label>
                      <input 
                        type="date" 
                        className="form-control" 
                        value={transactionData.transaction_date}
                        onChange={(e) => setTransactionData({...transactionData, transaction_date: e.target.value})}
                        required
                      />
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Expense Category / Charged To *</label>
                      <select 
                        className="form-select" 
                        value={transactionData.charged_to}
                        onChange={(e) => setTransactionData({...transactionData, charged_to: e.target.value})}
                        required
                      >
                        <option value="">Select category...</option>
                        {expenseCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Description *</label>
                    <textarea 
                      className="form-control" 
                      value={transactionData.description}
                      onChange={(e) => setTransactionData({...transactionData, description: e.target.value})}
                      rows="3"
                      required
                    />
                  </div>
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Amount Deposited</label>
                      <input 
                        type="number" 
                        className="form-control" 
                        value={transactionData.amount_deposited}
                        onChange={(e) => setTransactionData({
                          ...transactionData, 
                          amount_deposited: e.target.value,
                          amount_withdrawn: '' // Clear withdrawal if deposit entered
                        })}
                        step="0.01"
                        min="0"
                      />
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Amount Withdrawn</label>
                      <input 
                        type="number" 
                        className="form-control" 
                        value={transactionData.amount_withdrawn}
                        onChange={(e) => setTransactionData({
                          ...transactionData, 
                          amount_withdrawn: e.target.value,
                          amount_deposited: '' // Clear deposit if withdrawal entered
                        })}
                        step="0.01"
                        min="0"
                      />
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Received By Type</label>
                    <select 
                      className="form-select" 
                      value={transactionData.received_by_type}
                      onChange={(e) => setTransactionData({...transactionData, received_by_type: e.target.value})}
                    >
                      <option value="Staff">Staff</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  {transactionData.received_by_type === 'Staff' ? (
                    <div className="mb-3">
                      <label className="form-label">Received By (Staff) *</label>
                      <select 
                        className="form-select" 
                        value={transactionData.received_by_staff_id}
                        onChange={(e) => setTransactionData({...transactionData, received_by_staff_id: e.target.value})}
                        required
                      >
                        <option value="">Select staff...</option>
                        {staffMembers.map((staff) => (
                          <option key={staff.user_id || staff.id} value={staff.id || staff.user_id}>
                            {staff.name} - {staff.staff_id || `User ID: ${staff.user_id}`} {staff.department ? `(${staff.department})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="mb-3">
                      <label className="form-label">Received By (Name) *</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={transactionData.received_by_name}
                        onChange={(e) => setTransactionData({...transactionData, received_by_name: e.target.value})}
                        required
                      />
                    </div>
                  )}
                  <div className="mb-3">
                    <label className="form-label">Attachment (Receipt/Voucher)</label>
                    <input 
                      type="file" 
                      className="form-control" 
                      accept="image/*,.pdf"
                      onChange={(e) => setTransactionData({...transactionData, attachment: e.target.files[0]})}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowTransactionForm(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Add Transaction</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PettyCashLedger;

