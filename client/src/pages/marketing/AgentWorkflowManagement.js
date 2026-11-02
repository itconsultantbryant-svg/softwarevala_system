import React, { useEffect, useState } from 'react';
import api from '../../config/api';
import PageHeader from '../../components/layout/PageHeader';
import './Marketing.css';

export default function AgentWorkflowManagement() {
  const [weekly, setWeekly] = useState([]); const [monthly, setMonthly] = useState([]); const [payouts, setPayouts] = useState([]); const [sessions, setSessions] = useState([]); const [message, setMessage] = useState('');
  const load = async () => {
    try {
      const [w, m, p, s] = await Promise.all([api.get('/marketing-agents/weekly-reports'), api.get('/marketing-agents/monthly-reports'), api.get('/marketing-agents/payout-requests'), api.get('/marketing-agents/onboarding-sessions')]);
      setWeekly(w.data.reports || []); setMonthly(m.data.reports || []); setPayouts(p.data.requests || []); setSessions(s.data.sessions || []);
    } catch (err) { setMessage(err.response?.data?.error || 'Unable to load agent-management workflows.'); }
  };
  useEffect(() => { load(); }, []);
  const reviewWeekly = async (report) => {
    const feedback = window.prompt(`Feedback for ${report.full_name}, week ${report.week_start}`); if (feedback === null) return;
    const score = window.prompt('Score (optional)');
    try { await api.post(`/marketing-agents/weekly-reports/${report.id}/review`, { status: 'APPROVED', feedback, score: score || null, rating: 'Satisfactory' }); setMessage('Weekly review published.'); load(); } catch (err) { setMessage(err.response?.data?.error || 'Review failed.'); }
  };
  const reviewMonthly = async (report) => {
    const feedback = window.prompt(`Monthly feedback for ${report.full_name}`); if (feedback === null) return;
    try { await api.post(`/marketing-agents/monthly-reports/${report.id}/review`, { feedback, rating: 'Satisfactory' }); setMessage('Monthly review published.'); load(); } catch (err) { setMessage(err.response?.data?.error || 'Review failed.'); }
  };
  const payoutStatus = async (payout, status) => {
    if (!window.confirm(`${status} payout ${payout.request_reference}?`)) return;
    try { await api.post(`/marketing-agents/payout-requests/${payout.id}/status`, { status }); setMessage(`Payout marked ${status}.`); load(); } catch (err) { setMessage(err.response?.data?.error || 'Payout update failed.'); }
  };
  return <div className="marketing-page"><PageHeader title="Agent Workflow Management" subtitle="Review reports, manage payouts, and monitor onboarding sessions." />
    {message && <div className="alert alert-info">{message}</div>}
    <h5>Onboarding sessions</h5><table className="table table-sm"><thead><tr><th>Session</th><th>Date</th><th>Venue</th><th>Attendance</th></tr></thead><tbody>{sessions.map(s => <tr key={s.id}><td>{s.title}</td><td>{s.session_date} {s.start_time}</td><td>{s.venue}</td><td>{s.present_count || 0} / {s.participant_count || 0}</td></tr>)}</tbody></table>
    <h5 className="mt-4">Weekly reports awaiting review</h5><table className="table table-sm"><thead><tr><th>Agent</th><th>Week</th><th>Status</th><th /></tr></thead><tbody>{weekly.map(r => <tr key={r.id}><td>{r.agent_code} {r.full_name}</td><td>{r.week_start}</td><td>{r.status}</td><td><button className="btn btn-sm btn-outline-primary" onClick={() => reviewWeekly(r)}>Review</button></td></tr>)}</tbody></table>
    <h5 className="mt-4">Monthly reports</h5><table className="table table-sm"><thead><tr><th>Agent</th><th>Month</th><th>Status</th><th /></tr></thead><tbody>{monthly.map(r => <tr key={r.id}><td>{r.agent_code} {r.full_name}</td><td>{r.report_month}</td><td>{r.status}</td><td><button className="btn btn-sm btn-outline-primary" onClick={() => reviewMonthly(r)}>Review</button></td></tr>)}</tbody></table>
    <h5 className="mt-4">Payout requests</h5><table className="table table-sm"><thead><tr><th>Agent</th><th>Reference</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>{payouts.map(p => <tr key={p.id}><td>{p.agent_code} {p.full_name}</td><td>{p.request_reference}</td><td>{p.currency} {p.requested_amount}</td><td>{p.status}</td><td>{p.status !== 'PAID' && <><button className="btn btn-sm btn-outline-primary me-1" onClick={() => payoutStatus(p, 'APPROVED')}>Approve</button><button className="btn btn-sm btn-success" onClick={() => payoutStatus(p, 'PAID')}>Mark paid</button></>}</td></tr>)}</tbody></table>
  </div>;
}
