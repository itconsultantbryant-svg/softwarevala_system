import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../config/api';
import PageHeader from '../../components/layout/PageHeader';
import './Marketing.css';

const SalesOverview = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/marketing-agents/reports/overview')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Unable to load sales overview'));
  }, []);

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return <div className="p-4">Loading sales overview…</div>;

  const cards = [
    ['Applications', data.applications],
    ['Awaiting review', data.awaitingReview],
    ['Shortlisted', data.shortlisted],
    ['Active agents', data.activeAgents],
    ['New leads', data.newLeads],
    ['Qualified leads', data.qualified],
    ['Meetings', data.meetings],
    ['Proposals', data.proposals],
    ['Won clients', data.won],
    ['Cash collected', Number(data.collected || 0).toFixed(2)],
    ['Commission pending', Number(data.commissionPending || 0).toFixed(2)],
    ['Commission paid', Number(data.paid || 0).toFixed(2)]
  ];
  const bars = (title, items) => (
    <div className="col-md-6 mb-3">
      <h5>{title}</h5>
      {(items || []).map((row) => (
        <div className="bar-row" key={`${title}-${row.label}`}><span>{row.label}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, Number(row.count) || 0)}%` }} /></div><span>{row.count}</span></div>
      ))}
      {(items || []).length === 0 && <p className="text-muted">No records yet.</p>}
    </div>
  );

  return (
    <div className="marketing-page">
      <PageHeader title="Sales Overview" subtitle="Marketing agent recruitment, pipeline, and commission totals from live records." />
      <div className="marketing-cards">
        {cards.map(([label, value]) => (
          <div className="marketing-card" key={label}><strong>{value}</strong><span>{label}</span></div>
        ))}
      </div>
      <div className="row">
        {bars('Applications trend', data.applicationTrend)}
        {bars('Lead pipeline', data.pipeline)}
        {bars('Leads by sector', data.sectors)}
        {bars('Leads by agent', data.byAgent)}
        {bars('Revenue by agent', data.revenueByAgent)}
        {bars('Commission trend', data.commissionTrend)}
      </div>
      <h5>Action center</h5>
      <p>Awaiting review: {(data.awaitingList || []).map((row) => <Link key={row.id} className="me-2" to={`/marketing/applications/${row.id}`}>{row.reference}</Link>)}{(data.awaitingList || []).length === 0 && 'None'}</p>
      <p>Interviews today: {(data.interviewsToday || []).map((row) => <span key={row.id} className="me-2">{row.full_name} {row.interview_time}</span>)}{(data.interviewsToday || []).length === 0 && 'None'}</p>
      <p>Overdue follow-ups: {(data.overdue || []).map((row) => <Link key={row.id} className="me-2" to={`/marketing/leads/${row.id}`}>{row.lead_number}</Link>)}{(data.overdue || []).length === 0 && 'None'}</p>
      <p>Engagements ending within 30 days: {(data.expiring || []).map((row) => <Link key={row.id} className="me-2" to={`/marketing/agents/${row.id}`}>{row.agent_code || row.full_name}</Link>)}{(data.expiring || []).length === 0 && 'None'}</p>
      <p>Pending commission reviews: {(data.pendingCommissions || []).map((row) => <span key={row.id} className="me-2">{row.commission_number}</span>)}{(data.pendingCommissions || []).length === 0 && 'None'}</p>
    </div>
  );
};

export default SalesOverview;
