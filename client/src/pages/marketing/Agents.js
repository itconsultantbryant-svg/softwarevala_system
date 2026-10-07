import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api from '../../config/api';
import PageHeader from '../../components/layout/PageHeader';
import './Marketing.css';

export const Agents = () => {
  const [params] = useSearchParams();
  const status = params.get('status') || '';
  const [agents, setAgents] = useState([]);
  useEffect(() => {
    api.get('/marketing-agents/agents', { params: { status } }).then((res) => setAgents(res.data.agents || [])).catch(() => setAgents([]));
  }, [status]);
  return (
    <div className="marketing-page">
      <PageHeader title="Marketing Agents" subtitle={status ? `Status: ${status}` : 'Onboarding through former agents. Agent IDs are issued only at activation.'} />
      <table className="table">
        <thead><tr><th>Agent ID</th><th>Name</th><th>Status</th><th>Phone</th><th>County</th><th /></tr></thead>
        <tbody>
          {agents.map((agent) => (
            <tr key={agent.id}>
              <td>{agent.agent_code || 'Not activated'}</td>
              <td>{agent.full_name}</td>
              <td>{agent.status}</td>
              <td>{agent.phone}</td>
              <td>{agent.county}</td>
              <td><Link to={`/marketing/agents/${agent.id}`}>Profile</Link></td>
            </tr>
          ))}
          {agents.length === 0 && <tr><td colSpan="6" className="text-muted">No agents in this status.</td></tr>}
        </tbody>
      </table>
    </div>
  );
};

export const AgentProfile = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const load = () => api.get(`/marketing-agents/agents/${id}`).then((res) => {
    setData(res.data);
    if (res.data.referralUrl) {
      api.get(`/marketing-agents/agents/${id}/referral-qr`).then((qrRes) => setQr(qrRes.data.dataUrl)).catch(() => setQr(''));
    }
  }).catch((err) => setError(err.response?.data?.error || 'Unable to load agent'));
  useEffect(() => { load(); }, [id]);

  const setItem = async (item, status) => {
    const reason = status === 'WAIVED' ? window.prompt('Waiver reason') : '';
    if (status === 'WAIVED' && !reason) return;
    await api.post(`/marketing-agents/agents/${id}/onboarding/${item.id}`, { status, reason, notes: '' });
    load();
  };

  const activate = async () => {
    if (!window.confirm('Activate this applicant as an official SVL Marketing Agent? An Agent ID will be permanently assigned and will not be reused.')) return;
    try {
      await api.post(`/marketing-agents/agents/${id}/activate`, { confirm: true });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Activation failed');
    }
  };

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return <div className="p-4">Loading agent…</div>;
  const agent = data.agent;
  const items = data.onboarding || [];
  const done = items.filter((item) => item.status === 'COMPLETED' || item.status === 'WAIVED').length;
  const ready = items.length > 0 && done === items.length;
  const downloadQr = () => {
    const link = document.createElement('a');
    link.href = qr;
    link.download = `${agent.agent_code || 'agent'}-referral.png`;
    link.click();
  };
  const engagement = async (action) => {
    const reason = window.prompt(`Reason for ${action}`);
    if (!reason || !window.confirm(`${action} this engagement? This does not renew automatically.`)) return;
    await api.post(`/marketing-agents/agents/${id}/engagement`, { action, reason, confirm: true, days: 90 });
    load();
  };
  return (
    <div className="marketing-page">
      <PageHeader title={agent.full_name} subtitle={`${agent.agent_code || 'Onboarding — no agent ID yet'} · ${agent.status}`} />
      <p>{agent.phone} · {agent.whatsapp} · {agent.email}</p>
      <p>{agent.county} {agent.city} · Activated {agent.activation_date || '—'} · Engagement ends {agent.engagement_end_date || '—'}</p>
      {data.referralUrl && (
        <p>
          Referral: <a href={data.referralUrl} target="_blank" rel="noreferrer">{data.referralUrl}</a>
          <button type="button" className="btn btn-sm btn-outline-primary ms-2" onClick={() => navigator.clipboard.writeText(data.referralUrl)}>Copy link</button>
          <a className="btn btn-sm btn-outline-secondary ms-2" href={data.referralUrl} target="_blank" rel="noreferrer">Open link</a>
          {qr && <img className="d-block mt-2" alt="Referral QR code" src={qr} style={{ width: 140 }} />}
          {qr && <button type="button" className="btn btn-sm btn-outline-primary mt-2" onClick={downloadQr}>Download QR</button>}
        </p>
      )}
      <div className="d-flex gap-2 mb-3 flex-wrap">
        {!agent.agent_code && <button type="button" className="btn btn-success" disabled={!ready} onClick={activate}>Activate agent</button>}
        {['RENEW', 'EXTEND', 'SUSPEND', 'TERMINATE', 'ALLOW_TO_EXPIRE'].map((action) => (
          <button type="button" key={action} className="btn btn-outline-secondary btn-sm" onClick={() => engagement(action)}>{action}</button>
        ))}
      </div>
      <h5>Onboarding {done} / {items.length || 0} complete {items.length ? `(${Math.round((done / items.length) * 100)}%)` : ''}</h5>
      <table className="table table-sm">
        <tbody>
          {(data.onboarding || []).map((item) => (
            <tr key={item.id}>
              <td>{item.label}</td>
              <td>{item.status}</td>
              <td>
                <button type="button" className="btn btn-sm btn-outline-success me-1" onClick={() => setItem(item, 'COMPLETED')}>Complete</button>
                <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => setItem(item, 'WAIVED')}>Waive</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h5>Leads</h5>
      <ul>{(data.leads || []).map((lead) => <li key={lead.id}><Link to={`/marketing/leads/${lead.id}`}>{lead.lead_number}</Link> · {lead.status}</li>)}</ul>
      <h5>Commissions</h5>
      <ul>{(data.commissions || []).map((row) => <li key={row.id}>{row.commission_number}: {row.final_commission} ({row.status})</li>)}</ul>
      <h5>Status history</h5>
      <ul>{(data.history || []).map((row) => <li key={row.id}>{row.effective_date}: {row.status} — {row.reason}</li>)}</ul>
      <ReviewForm id={id} />
      {agent.agent_code && <a className="btn btn-outline-primary" href={`${api.defaults.baseURL}/marketing-agents/agents/${agent.id}/statement.pdf`} onClick={(e) => { e.preventDefault(); api.get(`/marketing-agents/agents/${agent.id}/statement.pdf`, { responseType: 'blob' }).then((res) => { const url = URL.createObjectURL(res.data); const link = document.createElement('a'); link.href = url; link.download = `${agent.agent_code}-statement.pdf`; link.click(); }); }}>Download PDF statement</a>}
    </div>
  );
};

const ReviewForm = ({ id }) => {
  const [form, setForm] = useState({ period_label: '', prospecting: 3, lead_quality: 3, conversion_contribution: 3, follow_up: 3, reporting: 3, conduct: 3, product_knowledge: 3, crm_compliance: 3, revenue_contribution: 3, strengths: '', improvements: '', manager_comments: '', recommendation: 'EXTEND_REVIEW' });
  const save = async () => {
    if (!window.confirm('Save this human performance recommendation?')) return;
    await api.post(`/marketing-agents/agents/${id}/reviews`, form);
    window.alert('Review saved.');
  };
  return (
    <div className="mt-3">
      <h5>Performance review</h5>
      {['prospecting', 'lead_quality', 'conversion_contribution', 'follow_up', 'reporting', 'conduct', 'product_knowledge', 'crm_compliance', 'revenue_contribution'].map((key) => (
        <label key={key} className="d-block mb-1">{key}<input className="form-control" type="number" min="1" max="5" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>
      ))}
      <textarea className="form-control mb-2" placeholder="Strengths" value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} />
      <textarea className="form-control mb-2" placeholder="Improvements" value={form.improvements} onChange={(e) => setForm({ ...form, improvements: e.target.value })} />
      <textarea className="form-control mb-2" placeholder="Manager comments" value={form.manager_comments} onChange={(e) => setForm({ ...form, manager_comments: e.target.value })} />
      <select className="form-select mb-2" value={form.recommendation} onChange={(e) => setForm({ ...form, recommendation: e.target.value })}>
        <option>RENEW</option><option>RENEW_WITH_IMPROVEMENT_PLAN</option><option>EXTEND_REVIEW</option><option>SUSPEND</option><option>DO_NOT_RENEW</option>
      </select>
      <button type="button" className="btn btn-primary" onClick={save}>Save review</button>
    </div>
  );
};
