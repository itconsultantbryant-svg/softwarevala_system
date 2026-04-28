import React, { useState } from 'react';
import api from '../../config/api';
import { normalizeUrl } from '../../utils/apiUrl';

const CertificateView = ({ certificate, onClose }) => {
  const [downloading, setDownloading] = useState('');

  const handleDownload = async (format) => {
    try {
      setDownloading(format);
      const response = await api.get(`/certificates/${certificate.id}/download/${format}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `certificate-${certificate.certificate_id}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download certificate');
    } finally {
      setDownloading('');
    }
  };

  const calculateDuration = () => {
    if (certificate.course_start_date && certificate.course_end_date) {
      const start = new Date(certificate.course_start_date);
      const end = new Date(certificate.course_end_date);
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const months = Math.floor(diffDays / 30);
      const days = diffDays % 30;
      
      if (months > 0) {
        return `${months} month${months > 1 ? 's' : ''}${days > 0 ? ` ${days} day${days > 1 ? 's' : ''}` : ''}`;
      }
      return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
    }
    return 'N/A';
  };

  const getFileUrl = () => {
    if (certificate.file_path) {
      return normalizeUrl(certificate.file_path);
    }
    return null;
  };

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-xl">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Certificate Details</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <div className="row">
              <div className="col-md-4">
                <div className="card mb-3">
                  <div className="card-body text-center">
                    {certificate.student_image ? (
                      <img
                        src={normalizeUrl(certificate.student_image)}
                        alt={certificate.student_name}
                        className="img-fluid rounded-circle mb-3"
                        style={{ width: '150px', height: '150px', objectFit: 'cover' }}
                      />
                    ) : (
                      <div className="bg-info rounded-circle d-inline-flex align-items-center justify-content-center mb-3" style={{ width: '150px', height: '150px' }}>
                        <i className="bi bi-person" style={{ fontSize: '4rem', color: 'white' }}></i>
                      </div>
                    )}
                    <h4>{certificate.student_name}</h4>
                    <p className="text-muted">Student ID: {certificate.student_code}</p>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <h6 className="mb-0">Course Information</h6>
                  </div>
                  <div className="card-body">
                    <p><strong>Course Code:</strong> {certificate.course_code}</p>
                    <p><strong>Course Title:</strong> {certificate.course_title}</p>
                    <p><strong>Duration:</strong> {calculateDuration()}</p>
                    {certificate.course_start_date && (
                      <p><strong>Start Date:</strong> {new Date(certificate.course_start_date).toLocaleDateString()}</p>
                    )}
                    {certificate.course_end_date && (
                      <p><strong>End Date:</strong> {new Date(certificate.course_end_date).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="col-md-8">
                <div className="card mb-3">
                  <div className="card-header">
                    <h6 className="mb-0">Certificate Information</h6>
                  </div>
                  <div className="card-body">
                    <div className="row mb-3">
                      <div className="col-md-6">
                        <strong>Certificate ID:</strong>
                        <p>{certificate.certificate_id}</p>
                      </div>
                      <div className="col-md-6">
                        <strong>Issue Date:</strong>
                        <p>{certificate.issue_date ? new Date(certificate.issue_date).toLocaleDateString() : 'N/A'}</p>
                      </div>
                    </div>
                    {certificate.completion_date && (
                      <div className="row mb-3">
                        <div className="col-md-6">
                          <strong>Completion Date:</strong>
                          <p>{new Date(certificate.completion_date).toLocaleDateString()}</p>
                        </div>
                        <div className="col-md-6">
                          <strong>Grade:</strong>
                          <p>
                            {certificate.grade ? (
                              <span className="badge bg-success">{certificate.grade}</span>
                            ) : (
                              'N/A'
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                    {certificate.verification_code && (
                      <div className="mb-3">
                        <strong>Verification Code:</strong>
                        <p><code>{certificate.verification_code}</code></p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Certificate Preview */}
                {getFileUrl() && (
                  <div className="card mb-3">
                    <div className="card-header">
                      <h6 className="mb-0">Certificate Preview</h6>
                    </div>
                    <div className="card-body text-center">
                      {certificate.file_type === 'pdf' ? (
                        <div className="p-4">
                          <i className="bi bi-file-pdf" style={{ fontSize: '5rem', color: '#dc3545' }}></i>
                          <p className="mt-3">PDF Certificate</p>
                          <a href={getFileUrl()} target="_blank" rel="noopener noreferrer" className="btn btn-outline-danger">
                            <i className="bi bi-eye me-2"></i>View PDF
                          </a>
                        </div>
                      ) : (
                        <img
                          src={getFileUrl()}
                          alt="Certificate"
                          className="img-fluid"
                          style={{ maxHeight: '500px' }}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Download Options */}
                <div className="card">
                  <div className="card-header">
                    <h6 className="mb-0">Download Options</h6>
                  </div>
                  <div className="card-body">
                    <div className="d-flex gap-2 flex-wrap">
                      <button
                        className="btn btn-outline-primary"
                        onClick={() => handleDownload('png')}
                        disabled={downloading === 'png'}
                      >
                        {downloading === 'png' ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2"></span>
                            Downloading...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-download me-2"></i>Download PNG
                          </>
                        )}
                      </button>
                      <button
                        className="btn btn-outline-success"
                        onClick={() => handleDownload('jpeg')}
                        disabled={downloading === 'jpeg'}
                      >
                        {downloading === 'jpeg' ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2"></span>
                            Downloading...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-download me-2"></i>Download JPEG
                          </>
                        )}
                      </button>
                      <button
                        className="btn btn-outline-danger"
                        onClick={() => handleDownload('pdf')}
                        disabled={downloading === 'pdf'}
                      >
                        {downloading === 'pdf' ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2"></span>
                            Downloading...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-download me-2"></i>Download PDF
                          </>
                        )}
                      </button>
                      {certificate.file_type && (
                        <button
                          className="btn btn-outline-secondary"
                          onClick={() => handleDownload('original')}
                          disabled={downloading === 'original'}
                        >
                          {downloading === 'original' ? (
                            <>
                              <span className="spinner-border spinner-border-sm me-2"></span>
                              Downloading...
                            </>
                          ) : (
                            <>
                              <i className="bi bi-download me-2"></i>Download Original ({certificate.file_type.toUpperCase()})
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CertificateView;

