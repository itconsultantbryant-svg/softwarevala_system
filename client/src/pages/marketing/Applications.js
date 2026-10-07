import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../config/api';
import PageHeader from '../../components/layout/PageHeader';
import './Marketing.css';

const Applications = () => {
  const [params, setParams] = useSearchParams();
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [reviewerId, setReviewerId] = useState('');
  const status = params.get('status') || '';

  const load = () => {
    api.get('/marketing-agents/applications/stats').then((res) => setStats(res.data)).catch(() => {});
    api.get('/marketing-agents/applications', { params: { status, search, page: 1, limit: 50 } })
      .then((res) => { setRows(res.data.applications || []); setTotal(res.data.total || 0); })
      .catch(() => setRows([]));
  };

  useEffect(() => { load(); }, [status]);

  const cards = stats ? [
    ['', 'Total', stats.cards.total],
    ['NEW', 'New', stats.cards.new],
    ['UNDER_REVIEW', 'Under review', stats.cards.underReview],
    ['SHORTLISTED', 'Shortlisted', stats.cards.shortlisted],
    ['INTERVIEW_SCHEDULED', 'Interview scheduled', stats.cards.interviewScheduled],
    ['INTERVIEWED', 'Interviewed', stats.cards.interviewed],
    ['ONBOARDING', 'Selected', stats.cards.selected],
    ['WAITLISTED', 'Waitlisted', stats.cards.waitlisted],
    ['NOT_SELECTED', 'Not selected', stats.cards.notSelected]
  ] : [];

  const assign = async () => {
    if (!selected.length || !reviewerId) return;
    await api.post(`/marketing-agents/applications/${selected[0]}/reviewer`, { ids: selected, reviewer_id: Number(reviewerId) });
    setSelected([]);
    load();
  };

  return (
    <div className="marketing-page">
      <PageHeader title="Marketing Agent Applications" subtitle="Applications synced from the recruitment portal. Applicants are not active agents." />
      <div className="marketing-cards">
        {cards.map(([key, label, value]) => (
          <button type="button" key={label} className="marketing-card text-start" onClick={() => setParams(key ? { status: key } : {})}>
            <strong>{value}</strong><span>{label}</span>
          </button>
        ))}
      </div>
      <div className="d-flex gap-2 mb-3">
        <input className="form-control" placeholder="Search name, reference, email, phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="button" className="btn btn-primary" onClick={load}>Search</button>
      </div>
      <div className="d-flex gap-2 mb-3">
        <input className="form-control" style={{ maxWidth: 180 }} placeholder="Reviewer user ID" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} />
        <button type="button" className="btn btn-outline-primary" onClick={assign}>Assign selected</button>
        <span className="text-muted align-self-center">{total} records</span>
      </div>
      <div className="table-responsive">
        <table className="table table-sm">
          <thead>
            <tr>
              <th /><th>Reference</th><th>Applicant</th><th>Phone</th><th>Email</th><th>County</th><th>Status</th><th>Score</th><th>Reviewer</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td><input type="checkbox" checked={selected.includes(row.id)} onChange={(e) => setSelected((cur) => e.target.checked ? [...cur, row.id] : cur.filter((item) => item !== row.id))} /></td>
                <td>{row.reference}</td>
                <td>{row.full_name}</td>
                <td>{row.phone}</td>
                <td>{row.email}</td>
                <td>{row.county}</td>
                <td>{row.status}</td>
                <td>{row.screening_total ?? '—'}</td>
                <td>{row.reviewer_name || '—'}</td>
                <td><Link to={`/marketing/applications/${row.id}`}>Open</Link></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="10" className="text-muted">No applications match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Applications;
