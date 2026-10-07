import React, { useEffect, useState } from 'react';
import api from '../../config/api';
import PageHeader from '../../components/layout/PageHeader';
import './Marketing.css';

export const WeeklyReports = () => {
  const [reports, setReports] = useState([]);
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState({ agent_id: '', week_start: '', prospects_researched: 0, contacts_made: 0, meaningful_conversations: 0, qualified_leads: 0, meetings: 0, challenges: '', market_feedback: '', support_needed: '', next_week_plan: '' });

  const load = () => {
    api.get('/marketing-agents/weekly-reports').then((res) => setReports(res.data.reports || [])).catch(() => setReports([]));
    api.get('/marketing-agents/agents', { params: { status: 'ACTIVE' } }).then((res) => setAgents(res.data.agents || [])).catch(() => setAgents([]));
  };
  useEffect(() => { load(); }, []);

  const prefill = async (next) => {
    setForm(next);
    if (!next.agent_id || !next.week_start) return;
    const res = await api.get('/marketing-agents/weekly-reports/prefill', { params: { agent_id: next.agent_id, week_start: next.week_start } });
    setForm({ ...next, prospects_researched: res.data.prospects_researched, qualified_leads: res.data.qualified_leads, meetings: res.data.meetings });
  };

  const save = async (event) => {
    event.preventDefault();
    await api.post(`/marketing-agents/agents/${form.agent_id}/weekly-reports`, form);
    load();
  };

  return (
    <div className="marketing-page">
      <PageHeader title="Weekly Reports" subtitle="CRM counts are prefilled. Agents or staff can add the narrative fields." />
      <form className="row g-2 mb-3" onSubmit={save}>
        <div className="col-md-3">
          <select className="form-select" value={form.agent_id} onChange={(e) => prefill({ ...form, agent_id: e.target.value })}>
            <option value="">Agent</option>
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.agent_code} {agent.full_name}</option>)}
          </select>
        </div>
        <div className="col-md-2"><input className="form-control" type="date" value={form.week_start} onChange={(e) => prefill({ ...form, week_start: e.target.value })} /></div>
        {['prospects_researched', 'contacts_made', 'meaningful_conversations', 'qualified_leads', 'meetings'].map((key) => (
          <div className="col-md-2" key={key}><input className="form-control" type="number" placeholder={key} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></div>
        ))}
        <div className="col-12"><textarea className="form-control" placeholder="Challenges" value={form.challenges} onChange={(e) => setForm({ ...form, challenges: e.target.value })} /></div>
        <div className="col-12"><textarea className="form-control" placeholder="Market feedback" value={form.market_feedback} onChange={(e) => setForm({ ...form, market_feedback: e.target.value })} /></div>
        <div className="col-12"><textarea className="form-control" placeholder="Support needed" value={form.support_needed} onChange={(e) => setForm({ ...form, support_needed: e.target.value })} /></div>
        <div className="col-12"><textarea className="form-control" placeholder="Next week plan" value={form.next_week_plan} onChange={(e) => setForm({ ...form, next_week_plan: e.target.value })} /></div>
        <div className="col-12"><button className="btn btn-primary" disabled={!form.agent_id || !form.week_start}>Save report</button></div>
      </form>
      <table className="table table-sm">
        <thead><tr><th>Agent</th><th>Week</th><th>Prospects</th><th>Contacts</th><th>Conversations</th><th>Qualified</th><th>Meetings</th></tr></thead>
        <tbody>
          {reports.map((row) => <tr key={row.id}><td>{row.agent_code}</td><td>{row.week_start}</td><td>{row.prospects_researched}</td><td>{row.contacts_made}</td><td>{row.meaningful_conversations}</td><td>{row.qualified_leads}</td><td>{row.meetings}</td></tr>)}
          {reports.length === 0 && <tr><td colSpan="7" className="text-muted">No weekly reports yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
};

export const PerformancePage = () => {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/marketing-agents/performance').then((res) => setRows(res.data.performance || [])).catch(() => setRows([])); }, []);
  return (
    <div className="marketing-page">
      <PageHeader title="Agent Performance" subtitle="Comparable operating metrics. This is not a ranking by raw lead volume." />
      <table className="table table-sm">
        <thead><tr><th>Agent</th><th>Qualified</th><th>Meetings</th><th>Proposals</th><th>Contracts</th><th>Cash</th><th>Commission</th><th>Conversion</th><th>Reports</th><th>Engagement end</th><th>Review</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}><td>{row.agent_code} {row.full_name}</td><td>{row.qualified_leads}</td><td>{row.meetings}</td><td>{row.proposals}</td><td>{row.contracts_won}</td><td>{row.cash_collected}</td><td>{row.commission_earned}</td><td>{row.conversion_rate}%</td><td>{row.reports_submitted}</td><td>{row.engagement_end_date || '—'}</td><td>{row.review_status || 'None'}</td></tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="11" className="text-muted">No activated agents yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
};

export const MarketingReports = () => {
  const [report, setReport] = useState('lead_conversion');
  const [rows, setRows] = useState([]);
  const load = (next) => {
    setReport(next);
    api.get('/marketing-agents/reports/center', { params: { report: next } }).then((res) => setRows(res.data.rows || [])).catch(() => setRows([]));
  };
  useEffect(() => { load('lead_conversion'); }, []);
  return (
    <div className="marketing-page">
      <PageHeader title="Marketing Reports" subtitle="Live aggregates. Export uses the current report." />
      <div className="d-flex gap-2 mb-3 flex-wrap">
        {['lead_conversion', 'lead_source', 'sector', 'agent_revenue', 'commission', 'outstanding_commission', 'engagement'].map((name) => (
          <button type="button" key={name} className={`btn btn-sm ${report === name ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => load(name)}>{name.replaceAll('_', ' ')}</button>
        ))}
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => api.get('/marketing-agents/reports/export', { params: { report }, responseType: 'blob' }).then((res) => { const url = URL.createObjectURL(res.data); const link = document.createElement('a'); link.href = url; link.download = `${report}.csv`; link.click(); })}>Export CSV</button>
      </div>
      <table className="table table-sm">
        <tbody>
          {rows.map((row) => <tr key={String(row.label)}><td>{row.label}</td><td>{row.count}</td></tr>)}
          {rows.length === 0 && <tr><td className="text-muted">No rows for this report.</td></tr>}
        </tbody>
      </table>
    </div>
  );
};
