import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../config/api';
import PageHeader from '../../components/layout/PageHeader';
import './Marketing.css';

const STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'MEETING_SCHEDULED', 'PROPOSAL_PREPARATION', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST', 'FOLLOW_UP'];

export const LeadsBoard = () => {
  const [leads, setLeads] = useState([]);
  const [form, setForm] = useState({ company_name: '', contact_name: '', phone: '', email: '', referral_agent_code: '' });

  const load = () => api.get('/marketing-agents/leads').then((res) => setLeads(res.data.leads || [])).catch(() => setLeads([]));
  useEffect(() => { load(); }, []);

  const move = async (lead, status) => {
    const lost_reason = status === 'LOST' ? window.prompt('Why was this lead lost?') : undefined;
    if (status === 'LOST' && !lost_reason) return;
    const create_client = status === 'WON' ? window.confirm('Create a client record from this won lead?') : false;
    await api.post(`/marketing-agents/leads/${lead.id}/status`, { status, lost_reason, create_client });
    load();
  };

  const create = async (event) => {
    event.preventDefault();
    await api.post('/marketing-agents/leads', form);
    setForm({ company_name: '', contact_name: '', phone: '', email: '', referral_agent_code: '' });
    load();
  };

  return (
    <div className="marketing-page">
      <PageHeader title="Leads" subtitle="Referral attribution stays on the lead when sales staff assignment changes." />
      <form className="row g-2 mb-3" onSubmit={create}>
        <div className="col-md-2"><input className="form-control" placeholder="Company" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
        <div className="col-md-2"><input className="form-control" placeholder="Contact" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
        <div className="col-md-2"><input className="form-control" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div className="col-md-2"><input className="form-control" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="col-md-2"><input className="form-control" placeholder="SVL-MA-####" value={form.referral_agent_code} onChange={(e) => setForm({ ...form, referral_agent_code: e.target.value })} /></div>
        <div className="col-md-2"><button className="btn btn-primary w-100">Add lead</button></div>
      </form>
      <div className="kanban">
        {STATUSES.map((status) => (
          <div className="kanban-col" key={status} onDragOver={(e) => e.preventDefault()} onDrop={(e) => move(JSON.parse(e.dataTransfer.getData('lead')), status)}>
            <strong>{status.replaceAll('_', ' ')}</strong>
            {leads.filter((lead) => lead.status === status).map((lead) => (
              <div key={lead.id} className="kanban-card" draggable onDragStart={(e) => e.dataTransfer.setData('lead', JSON.stringify(lead))}>
                <Link to={`/marketing/leads/${lead.id}`}>{lead.lead_number}</Link>
                <div>{lead.company_name || lead.contact_name}</div>
                <small>{lead.agent_code || 'No agent'} · {lead.duplicate_flag || ''}</small>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export const LeadProfile = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [staffId, setStaffId] = useState('');
  const load = () => api.get(`/marketing-agents/leads/${id}`).then((res) => setData(res.data));
  useEffect(() => { load(); }, [id]);
  if (!data) return <div className="p-4">Loading lead…</div>;
  const lead = data.lead;
  return (
    <div className="marketing-page">
      <PageHeader title={lead.lead_number} subtitle={`${lead.status} · ${lead.company_name || ''}`} />
      <p>Contact: {lead.contact_name} · {lead.phone} · {lead.whatsapp} · {lead.email}</p>
      <p>Location: {lead.location} · Industry: {lead.industry}</p>
      <p>Services: {lead.services_interested}</p>
      <p>Challenge: {lead.business_challenge}</p>
      <p>Referral agent: {lead.agent_code || 'None'} {lead.agent_name || ''}</p>
      {lead.attribution_status === 'REVIEW' && <div className="alert alert-warning">Attribution needs review: {lead.attribution_note}. This inquiry is kept, with no commission credit.</div>}
      <p>Assigned staff: {lead.staff_name || 'Unassigned'}</p>
      <p>Source: {lead.source} · UTM: {lead.utm_source} / {lead.utm_medium} / {lead.utm_campaign}</p>
      {lead.duplicate_flag && <div className="alert alert-warning">Possible duplicate: {lead.duplicate_flag}. Choose keep separate, link, or reject. Records are not merged silently.</div>}
      <div className="d-flex gap-2 mb-3">
        <input className="form-control" style={{ maxWidth: 200 }} placeholder="Staff user ID" value={staffId} onChange={(e) => setStaffId(e.target.value)} />
        <button className="btn btn-outline-primary" onClick={async () => { await api.post(`/marketing-agents/leads/${id}/assign`, { assigned_staff_id: Number(staffId) }); load(); }}>Assign staff</button>
        <button className="btn btn-outline-secondary" onClick={async () => { await api.post(`/marketing-agents/leads/${id}/duplicate-decision`, { decision: 'KEEP_SEPARATE' }); load(); }}>Keep separate</button>
      </div>
      <h5>Activity</h5>
      <ul>{(data.activities || []).map((row) => <li key={row.id}>{row.created_at}: {row.action} {row.from_status} → {row.to_status}</li>)}</ul>
      <h5>Proposals</h5>
      <ul>{(data.proposals || []).map((row) => <li key={row.id}>{row.proposal_number} · {row.status} · {row.value}</li>)}</ul>
      <h5>Contracts</h5>
      <ul>{(data.contracts || []).map((row) => <li key={row.id}>{row.contract_number} · {row.status} · {row.contract_value}</li>)}</ul>
    </div>
  );
};

export const Commissions = () => {
  const [rows, setRows] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const load = () => {
    api.get('/marketing-agents/commissions').then((res) => setRows(res.data.commissions || [])).catch(() => setRows([]));
    api.get('/marketing-agents/policies').then((res) => { setPolicies(res.data.policies || []); setTiers(res.data.tiers || []); }).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  const setStatus = async (row, status) => {
    const payment_reference = status === 'PAID' ? window.prompt('Payment reference') : undefined;
    await api.post(`/marketing-agents/commissions/${row.id}/status`, { status, payment_reference });
    load();
  };
  return (
    <div className="marketing-page">
      <PageHeader title="Commissions" subtitle="Calculated from verified cash received. The draft 2026 policy is inactive until management activates it." />
      <h5>Policies</h5>
      <ul>
        {policies.map((policy) => (
          <li key={policy.id}>
            {policy.policy_code} · {policy.version} · from {policy.effective_from || '—'} · {policy.status}
            <div>{tiers.filter((tier) => tier.policy_id === policy.id).map((tier) => `${tier.min_amount}-${tier.max_amount || 'above'} at ${tier.rate_percent}%`).join('; ') || 'No tiers'}</div>
            {policy.status !== 'ACTIVE' && <button className="btn btn-sm btn-outline-success" onClick={async () => { if (window.confirm('Activating this policy will make it available for eligible commission calculations from its effective date.')) { await api.post(`/marketing-agents/policies/${policy.id}/activate`, { confirm: true }); load(); } }}>Activate</button>}
          </li>
        ))}
      </ul>
      <div className="marketing-cards">
        {['CALCULATED', 'UNDER_REVIEW', 'APPROVED', 'PAID', 'HELD', 'REVERSED'].map((status) => (
          <button type="button" key={status} className="marketing-card text-start" onClick={() => setStatusFilter(status)}>
            <strong>{rows.filter((row) => row.status === status).reduce((sum, row) => sum + Number(row.final_commission || 0), 0).toFixed(2)}</strong>
            <span>{status}</span>
          </button>
        ))}
      </div>
      <table className="table table-sm">
        <thead><tr><th>Number</th><th>Agent</th><th>Client</th><th>Contract</th><th>Payment</th><th>Eligible</th><th>Rate</th><th>Gross</th><th>Adjustment</th><th>Final</th><th>Policy</th><th>Status</th><th /></tr></thead>
        <tbody>
          {rows.filter((row) => !statusFilter || row.status === statusFilter).map((row) => (
            <tr key={row.id}>
              <td>{row.commission_number}</td>
              <td>{row.agent_code}</td>
              <td>{row.company_name}</td>
              <td>{row.contract_number}</td>
              <td>{row.payment_number}</td>
              <td>{row.eligible_revenue}</td>
              <td>{row.rate_percent}%</td>
              <td>{row.gross_commission}</td>
              <td>{row.adjustment}</td>
              <td>{row.final_commission}</td>
              <td>{row.policy_code}</td>
              <td>{row.status}</td>
              <td>
                {['UNDER_REVIEW', 'APPROVED', 'PAID', 'HELD'].map((status) => (
                  <button key={status} className="btn btn-sm btn-link" onClick={() => setStatus(row, status)}>{status}</button>
                ))}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="13" className="text-muted">No commissions calculated yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
};

export const ContractsPage = () => {
  const [contracts, setContracts] = useState([]);
  useEffect(() => { api.get('/marketing-agents/contracts').then((res) => setContracts(res.data.contracts || [])).catch(() => setContracts([])); }, []);
  return (
    <div className="marketing-page">
      <PageHeader title="Contracts" subtitle="Referral attribution is copied from the lead and kept after the agent status changes." />
      <table className="table">
        <thead><tr><th>Number</th><th>Client</th><th>Lead</th><th>Agent</th><th>Value</th><th>Status</th></tr></thead>
        <tbody>
          {contracts.map((row) => <tr key={row.id}><td>{row.contract_number}</td><td>{row.company_name}</td><td>{row.lead_number}</td><td>{row.agent_code}</td><td>{row.contract_value}</td><td>{row.status}</td></tr>)}
          {contracts.length === 0 && <tr><td colSpan="6" className="text-muted">No attributed contracts yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
};
