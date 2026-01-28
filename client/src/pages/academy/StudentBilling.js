import React, { useEffect, useState } from 'react';
import api from '../../config/api';
import { Link } from 'react-router-dom';

const StudentBilling = () => {
  const [billing, setBilling] = useState({ balances: [], pending: [], transactions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestForm, setRequestForm] = useState({ course_id: '', amount: '', payment_method: '', payment_reference: '', notes: '' });
  const [period, setPeriod] = useState('');
  const [success, setSuccess] = useState(null);

  const fetchBilling = async () => {
    try {
      setError(null);
      const res = await api.get('/academy/students/me/billing');
      setBilling({
        balances: res.data.balances || [],
        pending: res.data.pending || [],
        transactions: res.data.transactions || []
      });
    } catch (err) {
      console.error('Failed to fetch billing', err);
      setError(err.response?.data?.error || 'Failed to load billing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBilling();
  }, []);

  const handleGenerateInvoice = async () => {
    setGenerating(true);
    setSuccess(null);
    try {
      await api.post('/academy/students/me/billing/generate-invoice', { period: period || undefined });
      setSuccess('Invoice generated. Finance has been notified.');
      setPeriod('');
      fetchBilling();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate invoice');
    } finally {
      setGenerating(false);
    }
  };

  const handleRequestPayment = async (e) => {
    e.preventDefault();
    const { course_id, amount, payment_method, payment_reference, notes } = requestForm;
    if (!course_id || !amount || parseFloat(amount) <= 0) {
      setError('Select a course and enter a valid amount.');
      return;
    }
    setRequesting(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/student-payments/request-payment', {
        course_id: parseInt(course_id, 10),
        amount: parseFloat(amount),
        payment_method: payment_method || undefined,
        payment_reference: payment_reference || undefined,
        notes: notes || undefined
      });
      setSuccess('Payment request submitted. Pending finance approval.');
      setRequestForm({ course_id: '', amount: '', payment_method: '', payment_reference: '', notes: '' });
      fetchBilling();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit payment request');
    } finally {
      setRequesting(false);
    }
  };

  const withBalance = billing.balances.filter((b) => (parseFloat(b.balance) || 0) > 0);

  if (loading) {
    return (
      <div className="container-fluid py-4">
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="mb-0">Billing & Payments</h3>
        <Link to="/student" className="btn btn-outline-secondary btn-sm">Back to Portal</Link>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="row g-3">
        <div className="col-lg-8">
          <div className="card mb-3">
            <div className="card-header fw-bold">Per-course balances</div>
            <div className="card-body p-0">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Code</th>
                    <th className="text-end">Fee</th>
                    <th className="text-end">Paid</th>
                    <th className="text-end">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {billing.balances.length === 0 ? (
                    <tr><td colSpan={5} className="text-muted">No billing records.</td></tr>
                  ) : (
                    billing.balances.map((b) => (
                      <tr key={b.id}>
                        <td>{b.title}</td>
                        <td>{b.course_code}</td>
                        <td className="text-end">{parseFloat(b.course_fee || 0).toFixed(2)}</td>
                        <td className="text-end">{parseFloat(b.amount_paid || 0).toFixed(2)}</td>
                        <td className="text-end fw-bold">{parseFloat(b.balance || 0).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card mb-3">
            <div className="card-header fw-bold">Payment history</div>
            <div className="card-body p-0">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Date</th>
                    <th className="text-end">Amount</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {billing.transactions.length === 0 ? (
                    <tr><td colSpan={6} className="text-muted">No transactions yet.</td></tr>
                  ) : (
                    billing.transactions.map((t) => (
                      <tr key={t.id}>
                        <td>{t.title} ({t.course_code})</td>
                        <td>{t.payment_date ? new Date(t.payment_date).toLocaleDateString() : '—'}</td>
                        <td className="text-end">{parseFloat(t.amount || 0).toFixed(2)}</td>
                        <td>{t.payment_method || '—'}</td>
                        <td>{t.payment_reference || '—'}</td>
                        <td>
                          <span className={`badge bg-${
                            t.status === 'Approved' ? 'success' : t.status === 'Rejected' ? 'danger' : 'warning'
                          }`}>
                            {t.status}
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

        <div className="col-lg-4">
          {billing.pending.length > 0 && (
            <div className="alert alert-warning mb-3">
              <strong>Pending approval:</strong> {billing.pending.length} payment request(s) awaiting finance.
            </div>
          )}

          <div className="card mb-3">
            <div className="card-header fw-bold">Generate invoice</div>
            <div className="card-body">
              <div className="mb-2">
                <label className="form-label small">Period (optional)</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="e.g. Q1 2026"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn btn-outline-primary w-100"
                disabled={generating || billing.balances.length === 0}
                onClick={handleGenerateInvoice}
              >
                {generating ? 'Generating…' : 'Generate invoice'}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header fw-bold">Request payment</div>
            <div className="card-body">
              <form onSubmit={handleRequestPayment}>
                <div className="mb-2">
                  <label className="form-label small">Course</label>
                  <select
                    className="form-select form-select-sm"
                    value={requestForm.course_id}
                    onChange={(e) => setRequestForm((f) => ({ ...f, course_id: e.target.value }))}
                    required
                  >
                    <option value="">Select…</option>
                    {withBalance.map((b) => (
                      <option key={b.id} value={b.course_id}>
                        {b.course_code} — Balance: {parseFloat(b.balance).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-2">
                  <label className="form-label small">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="form-control form-control-sm"
                    value={requestForm.amount}
                    onChange={(e) => setRequestForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label small">Payment method (optional)</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="e.g. Bank transfer"
                    value={requestForm.payment_method}
                    onChange={(e) => setRequestForm((f) => ({ ...f, payment_method: e.target.value }))}
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label small">Reference (optional)</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="e.g. transaction ID"
                    value={requestForm.payment_reference}
                    onChange={(e) => setRequestForm((f) => ({ ...f, payment_reference: e.target.value }))}
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label small">Notes (optional)</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    value={requestForm.notes}
                    onChange={(e) => setRequestForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary w-100"
                  disabled={requesting || withBalance.length === 0}
                >
                  {requesting ? 'Submitting…' : 'Submit payment request'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentBilling;
