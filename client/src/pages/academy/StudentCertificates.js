import React, { useEffect, useState } from 'react';
import api from '../../config/api';
import { Link } from 'react-router-dom';

const StudentCertificates = () => {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCerts = async () => {
      try {
        setError(null);
        const res = await api.get('/academy/students/me/certificates');
        setCertificates(res.data.certificates || []);
      } catch (err) {
        console.error('Failed to fetch certificates', err);
        setError(err.response?.data?.error || 'Failed to load certificates');
      } finally {
        setLoading(false);
      }
    };
    fetchCerts();
  }, []);

  const handleDownload = async (cert) => {
    if (!cert.download_url) {
      alert('Download not available for this certificate.');
      return;
    }
    try {
      const res = await api.get(cert.download_url, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `certificate-${cert.certificate_id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed', err);
      alert(err.response?.data?.error || 'Download failed.');
    }
  };

  if (loading) {
    return (
      <div className="container-fluid py-4">
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container-fluid py-4">
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="mb-0">My Certificates</h3>
        <Link to="/student" className="btn btn-outline-secondary btn-sm">Back to Portal</Link>
      </div>
      {certificates.length === 0 ? (
        <p className="text-muted">No certificates yet.</p>
      ) : (
        <ul className="list-group">
          {certificates.map((cert) => (
            <li key={cert.id} className="list-group-item d-flex justify-content-between align-items-center">
              <div>
                <strong>{cert.course_title}</strong> ({cert.course_code}) — {cert.grade} · {new Date(cert.issue_date).toLocaleDateString()}
              </div>
              {cert.download_url ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => handleDownload(cert)}
                >
                  Download
                </button>
              ) : (
                <span className="text-muted small">File not available</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default StudentCertificates;
