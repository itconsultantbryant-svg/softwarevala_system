import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api from '../../config/api';
import PageHeader from '../../components/layout/PageHeader';

const TABS = ['Overview', 'Background', 'Experience', 'Network', 'Assessment', 'Availability', 'Conflict', 'Documents', 'Screening', 'Interview', 'Notes', 'Timeline'];

const STAGE_HELP = {
  NEW: 'Start the review and record a screening score.',
  UNDER_REVIEW: 'Review the screening score, then shortlist or waitlist the applicant.',
  SHORTLISTED: 'Schedule the interview. The application moves to Interview Scheduled automatically when an interview is created.',
  INTERVIEW_SCHEDULED: 'Record the interview assessment. The application moves to Interviewed automatically when the score is saved.',
  INTERVIEWED: 'Review the interview recommendation, then select the applicant for onboarding or mark them not selected.',
  ONBOARDING: 'Continue the onboarding checklist on the agent record, then activate the agent.',
  WAITLISTED: 'Review this applicant again when a place becomes available.',
  NOT_SELECTED: 'No further action is required unless management reopens this application.'
};

const STATUS_ACTIONS = [
  { status: 'UNDER_REVIEW', label: 'Start review' },
  { status: 'SHORTLISTED', label: 'Shortlist' },
  { status: 'WAITLISTED', label: 'Waitlist' },
  { status: 'NOT_SELECTED', label: 'Not selected' },
  { status: 'SELECTED', label: 'Select for onboarding' }
];

const ApplicationProfile = () => {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab');
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(TABS.includes(requestedTab) ? requestedTab : 'Overview');
  const [error, setError] = useState('');
  const [scores, setScores] = useState({ communication: 0, network: 0, sales_ability: 0, technology: 0, reliability: 0, integrity: 0, notes: '' });
  const [interview, setInterview] = useState({ interview_date: '', interview_time: '', format: 'Phone', meeting_link: '' });
  const [score, setScore] = useState({ interview_id: '', communication: 0, mindset: 0, prospecting: 0, judgment: 0, professionalism: 0, availability: 0, strengths: '', concerns: '', notes: '', recommendation: 'CONSIDER' });

  const load = () => api.get(`/marketing-agents/applications/${id}`).then((res) => setData(res.data)).catch((err) => setError(err.response?.data?.error || 'Unable to load application'));
  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    const nextTab = params.get('tab');
    if (nextTab && TABS.includes(nextTab)) setTab(nextTab);
  }, [params]);

  const selectTab = (name) => {
    setTab(name);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', name);
      return next;
    }, { replace: true });
  };

  const changeStatus = async (status) => {
    if (!window.confirm(`Change this application to ${status.replaceAll('_', ' ')}?`)) return;
    await api.post(`/marketing-agents/applications/${id}/status`, { status, confirm: true });
    load();
  };

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return <div className="p-4">Loading application…</div>;
  const app = data.application;
  const linkedAgent = data.linkedAgent;
  const stageHelp = STAGE_HELP[app.status] || 'Review the application and continue the workflow.';

  return (
    <div className="marketing-page">
      <PageHeader title={app.full_name} subtitle={`${app.reference} · ${app.status.replaceAll('_', ' ')}`} />
      <div className="alert alert-info d-flex flex-wrap justify-content-between gap-2 align-items-start">
        <div>
          <strong>Current stage: {app.status.replaceAll('_', ' ')}</strong>
          <div>{stageHelp}</div>
        </div>
        <div className="d-flex flex-wrap gap-2">
          {['NEW', 'UNDER_REVIEW'].includes(app.status) && <button type="button" className="btn btn-sm btn-primary" onClick={() => selectTab('Screening')}>Review screening</button>}
          {app.status === 'SHORTLISTED' && <button type="button" className="btn btn-sm btn-primary" onClick={() => selectTab('Interview')}>Schedule interview</button>}
          {app.status === 'INTERVIEW_SCHEDULED' && <button type="button" className="btn btn-sm btn-primary" onClick={() => selectTab('Interview')}>Record interview</button>}
          {app.status === 'INTERVIEWED' && <button type="button" className="btn btn-sm btn-success" onClick={() => changeStatus('SELECTED')}>Select for onboarding</button>}
          {app.status === 'INTERVIEWED' && <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => changeStatus('NOT_SELECTED')}>Not selected</button>}
          {(app.status === 'ONBOARDING' || app.status === 'SELECTED') && linkedAgent && <Link className="btn btn-sm btn-success" to={`/marketing/agents/${linkedAgent.id}`}>Open onboarding record</Link>}
          <Link className="btn btn-sm btn-outline-secondary" to="/marketing/applications">Back to applications</Link>
        </div>
      </div>
      <div className="d-flex flex-wrap gap-2 mb-3">
        {STATUS_ACTIONS.map(({ status, label }) => (
          <button
            type="button"
            key={status}
            className="btn btn-sm btn-outline-primary"
            disabled={app.status === status || (status === 'SELECTED' && app.status === 'ONBOARDING')}
            onClick={() => changeStatus(status)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="d-flex flex-wrap gap-2 mb-3">
        {TABS.map((name) => <button type="button" key={name} className={`btn btn-sm ${tab === name ? 'btn-primary' : 'btn-light'}`} onClick={() => selectTab(name)}>{name}</button>)}
      </div>
      {tab === 'Overview' && (
        <div>
          <p>Phone: {app.phone} · WhatsApp: {app.whatsapp}</p>
          <p>Email: {app.email}</p>
          <p>County: {app.county} · Area: {app.city}</p>
          <p>Professional status: {app.professional_status}</p>
          <p>Source: {app.source} · Submitted: {app.submitted_at}</p>
          <p>Screening score: {app.screening_total ?? 'Not scored'} · Reviewer: {app.reviewer_name || 'Unassigned'}</p>
          {linkedAgent && (
            <p>
              Onboarding record: <Link to={`/marketing/agents/${linkedAgent.id}`}>{linkedAgent.agent_code || 'Open agent onboarding'}</Link>
              {' '}· Status: {linkedAgent.status}
            </p>
          )}
        </div>
      )}
      {tab === 'Background' && <p>{app.education}<br />{app.background}<br />{app.occupation} · {app.organization}</p>}
      {tab === 'Experience' && <p style={{ whiteSpace: 'pre-wrap' }}>{app.experience || 'No experience recorded.'}</p>}
      {tab === 'Network' && <p>{app.network_sectors}<br />{app.preferred_sectors}<br />{app.network_description}<br />{app.outreach_channels}</p>}
      {tab === 'Assessment' && <pre>{app.scenario_responses}</pre>}
      {tab === 'Availability' && <p>{app.availability}<br />Training: {app.training_availability}<br />Reporting: {app.reporting_willingness}</p>}
      {tab === 'Conflict' && <p style={{ whiteSpace: 'pre-wrap' }}>{app.conflict_disclosure || 'No disclosure recorded.'}</p>}
      {tab === 'Documents' && <ul>{(data.documents || []).map((doc) => <li key={doc.id}>{doc.category}: {doc.file_name || 'Recorded'} ({doc.verification_status})</li>)}</ul>}
      {tab === 'Screening' && (
        <div>
          <p>Scores are advisory. A human still decides shortlist, selection, or rejection.</p>
          {['communication', 'network', 'sales_ability', 'technology', 'reliability', 'integrity'].map((key) => (
            <label key={key} className="d-block mb-2">{key}
              <input className="form-control" type="number" value={scores[key]} onChange={(e) => setScores({ ...scores, [key]: e.target.value })} />
            </label>
          ))}
          <textarea className="form-control mb-2" value={scores.notes} onChange={(e) => setScores({ ...scores, notes: e.target.value })} />
          <button type="button" className="btn btn-primary" onClick={async () => { await api.post(`/marketing-agents/applications/${id}/screening`, scores); load(); }}>Save score</button>
          <ul className="mt-3">{(data.screening || []).map((row) => <li key={row.id}>{row.total}/100 by {row.reviewer_name} on {row.created_at}</li>)}</ul>
        </div>
      )}
      {tab === 'Interview' && (
        <div>
          <div className="row g-2">
            <div className="col-md-3"><input className="form-control" type="date" value={interview.interview_date} onChange={(e) => setInterview({ ...interview, interview_date: e.target.value })} /></div>
            <div className="col-md-2"><input className="form-control" type="time" value={interview.interview_time} onChange={(e) => setInterview({ ...interview, interview_time: e.target.value })} /></div>
            <div className="col-md-3">
              <select className="form-select" value={interview.format} onChange={(e) => setInterview({ ...interview, format: e.target.value })}>
                <option>Physical</option><option>Phone</option><option>Google Meet</option><option>Zoom</option><option>Microsoft Teams</option><option>Other</option>
              </select>
            </div>
            <div className="col-md-4"><input className="form-control" placeholder="Location or meeting link" value={interview.meeting_link} onChange={(e) => setInterview({ ...interview, meeting_link: e.target.value })} /></div>
          </div>
          <button type="button" className="btn btn-primary mt-2" onClick={async () => { await api.post(`/marketing-agents/applications/${id}/interviews`, interview); load(); }}>Schedule interview</button>
          <ul className="mt-3">{(data.interviews || []).map((row) => <li key={row.id}>{row.interview_date} {row.interview_time} · {row.format} · {row.status} · {row.interviewer_name || 'Interviewer'}</li>)}</ul>
          <h5 className="mt-3">Interview assessment</h5>
          <p>A score does not select the applicant. A person still makes that decision.</p>
          <select className="form-select mb-2" value={score.interview_id} onChange={(e) => setScore({ ...score, interview_id: e.target.value })}>
            <option value="">Select interview</option>
            {(data.interviews || []).map((row) => <option key={row.id} value={row.id}>{row.interview_date} {row.format}</option>)}
          </select>
          {['communication', 'mindset', 'prospecting', 'judgment', 'professionalism', 'availability'].map((key) => (
            <label key={key} className="d-block mb-2">{key}
              <input className="form-control" type="number" value={score[key]} onChange={(e) => setScore({ ...score, [key]: e.target.value })} />
            </label>
          ))}
          <p>Total preview: {['communication', 'mindset', 'prospecting', 'judgment', 'professionalism', 'availability'].reduce((sum, key) => sum + (Number(score[key]) || 0), 0)} / 100</p>
          <textarea className="form-control mb-2" placeholder="Strengths" value={score.strengths} onChange={(e) => setScore({ ...score, strengths: e.target.value })} />
          <textarea className="form-control mb-2" placeholder="Concerns" value={score.concerns} onChange={(e) => setScore({ ...score, concerns: e.target.value })} />
          <textarea className="form-control mb-2" placeholder="Interviewer notes" value={score.notes} onChange={(e) => setScore({ ...score, notes: e.target.value })} />
          <select className="form-select mb-2" value={score.recommendation} onChange={(e) => setScore({ ...score, recommendation: e.target.value })}>
            <option>STRONGLY_RECOMMEND</option><option>RECOMMEND</option><option>CONSIDER</option><option>DO_NOT_RECOMMEND</option>
          </select>
          <button type="button" className="btn btn-primary" disabled={!score.interview_id} onClick={async () => { await api.post(`/marketing-agents/interviews/${score.interview_id}/score`, score); load(); }}>Save interview score</button>
          <ul className="mt-3">{(data.interviewScores || []).map((row) => <li key={row.id}>{row.created_at}: {row.total}/100 · {row.recommendation}</li>)}</ul>
        </div>
      )}
      {tab === 'Notes' && <Notes id={id} notes={data.notes} onSaved={load} />}
      {tab === 'Timeline' && <ul>{(data.timeline || []).map((row, index) => <li key={`${row.timestamp}-${index}`}>{row.timestamp}: {row.event}{row.actor ? ` · ${row.actor}` : ''}{row.notes ? ` · ${row.notes}` : ''}</li>)}</ul>}
    </div>
  );
};

const Notes = ({ id, notes, onSaved }) => {
  const [body, setBody] = useState('');
  return (
    <div>
      <textarea className="form-control mb-2" value={body} onChange={(e) => setBody(e.target.value)} />
      <button type="button" className="btn btn-primary mb-3" onClick={async () => { await api.post(`/marketing-agents/applications/${id}/notes`, { body }); setBody(''); onSaved(); }}>Add note</button>
      <ul>{(notes || []).map((note) => <li key={note.id}><strong>{note.author_name}</strong>: {note.body}</li>)}</ul>
    </div>
  );
};

export default ApplicationProfile;
