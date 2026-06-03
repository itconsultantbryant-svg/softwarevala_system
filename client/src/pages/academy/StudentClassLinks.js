import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../config/api';

const StudentClassLinks = () => {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/academy/students/me/class-links');
        setLinks(res.data.links || []);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load class links');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="container-fluid py-4"><div className="spinner-border text-primary" role="status" /></div>;
  }

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="mb-0">Online Class Links</h3>
        <Link to="/student" className="btn btn-outline-secondary btn-sm">Back to Portal</Link>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="card"><div className="card-body table-responsive">
        <table className="table table-hover mb-0">
          <thead><tr><th>Course</th><th>Title</th><th>Platform</th><th>Posted</th><th></th></tr></thead>
          <tbody>
            {links.length === 0 ? (
              <tr><td colSpan={5} className="text-muted">No class links for your courses yet.</td></tr>
            ) : links.map((l) => (
              <tr key={l.id}>
                <td><strong>{l.course_code}</strong><br /><small className="text-muted">{l.course_title}</small></td>
                <td>{l.title || 'Online class'}</td>
                <td><span className="badge bg-secondary">{l.platform || 'Other'}</span></td>
                <td>{l.created_at ? new Date(l.created_at).toLocaleString() : '—'}</td>
                <td>
                  <a href={l.link_url} target="_blank" rel="noreferrer" className="btn btn-sm btn-primary">
                    Join class
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </div>
  );
};

export default StudentClassLinks;
