import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../config/api';

const CertificateVerification = () => {
  const { code } = useParams();
  const [certificate, setCertificate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (code) {
      verifyCertificate(code);
    }
  }, [code]);

  const verifyCertificate = async (verificationCode) => {
    try {
      const response = await api.get(`/academy/certificates/verify/${verificationCode}`);
      setCertificate(response.data.certificate);
    } catch (err) {
      setError(err.response?.data?.error || 'Certificate not found');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <img 
          src="/softwarevala-logo.png" 
          alt="Software Vala Liberia" 
          style={{ maxWidth: '200px', height: 'auto', marginBottom: '2rem' }}
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mt-5">
        <div className="card">
          <div className="card-body text-center">
            <div className="mb-4">
              <img 
                src="/softwarevala-logo.png" 
                alt="Software Vala Liberia" 
                style={{ maxWidth: '150px', height: 'auto' }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>
            <i className="bi bi-x-circle text-danger" style={{ fontSize: '4rem' }}></i>
            <h3 className="mt-3">Certificate Not Found</h3>
            <p className="text-muted">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (certificate) {
    return (
      <div className="container mt-5">
        <div className="card">
          <div className="card-body text-center">
            <div className="mb-4">
              <img 
                src="/softwarevala-logo.png" 
                alt="Software Vala Liberia" 
                style={{ maxWidth: '200px', height: 'auto' }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>
            <i className="bi bi-award text-success" style={{ fontSize: '4rem' }}></i>
            <h2 className="mt-3">Certificate Verified</h2>
            <div className="mt-4">
              <p><strong>Certificate ID:</strong> {certificate.certificate_id}</p>
              <p><strong>Student Name:</strong> {certificate.student_name}</p>
              <p><strong>Student ID:</strong> {certificate.student_id}</p>
              <p><strong>Course:</strong> {certificate.course_code} - {certificate.course_title}</p>
              <p><strong>Issue Date:</strong> {certificate.issue_date}</p>
              <p><strong>Grade:</strong> {certificate.grade}</p>
            </div>
            <div className="mt-4">
              <span className="badge bg-success" style={{ fontSize: '1rem' }}>
                <i className="bi bi-check-circle me-2"></i>Valid Certificate
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default CertificateVerification;

