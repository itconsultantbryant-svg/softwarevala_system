import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../config/api';

const StudentMaterials = () => {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/academy/students/me/materials');
        setMaterials(res.data.materials || []);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load materials');
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
        <h3 className="mb-0">Course Materials & Assignments</h3>
        <Link to="/student" className="btn btn-outline-secondary btn-sm">Back to Portal</Link>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="row g-3">
        {materials.length === 0 ? (
          <div className="col-12 text-muted">No materials posted for your courses yet.</div>
        ) : materials.map((m) => (
          <div className="col-md-6 col-lg-4" key={m.id}>
            <div className="card h-100">
              <div className="card-body">
                <span className="badge bg-primary mb-2">{m.course_code}</span>
                <h5 className="card-title">{m.title}</h5>
                {m.description && <p className="card-text small text-muted">{m.description}</p>}
                {m.due_date && (
                  <p className="small mb-2"><strong>Due:</strong> {new Date(m.due_date).toLocaleDateString()}</p>
                )}
                {m.link_url && (
                  <a href={m.link_url} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-primary">
                    Open material
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StudentMaterials;
