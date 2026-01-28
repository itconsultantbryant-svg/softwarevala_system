import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import { normalizeUrl } from '../../utils/apiUrl';

const ClientForm = ({ client, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company_name: '',
    services_availed: [],
    services_fees: '',
    payment_term: '',
    loan_amount: '', // Keep for backward compatibility with existing clients
    loan_interest_rate: '', // Keep for backward compatibility with existing clients
    status: 'Active',
    profile_image: '',
    category: '',
    progress_status: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name || '',
        email: client.email || '',
        phone: client.phone || '',
        company_name: client.company_name || '',
        services_availed: client.services_availed ? (typeof client.services_availed === 'string' ? JSON.parse(client.services_availed) : client.services_availed) : [],
        services_fees: client.services_fees || client.loan_amount || '', // Use loan_amount as fallback for existing clients
        payment_term: client.payment_term || '',
        loan_amount: client.loan_amount || '', // Keep for backward compatibility
        loan_interest_rate: client.loan_interest_rate || '', // Keep for backward compatibility
        status: client.status || 'Active',
        profile_image: client.profile_image || '',
        category: client.category || '',
        progress_status: client.progress_status || ''
      });
    }
  }, [client]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      const services = [...formData.services_availed];
      if (checked) {
        services.push(value);
      } else {
        const index = services.indexOf(value);
        if (index > -1) services.splice(index, 1);
      }
      setFormData({ ...formData, services_availed: services });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB');
      return;
    }

    setUploadingImage(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('type', 'client');

      const response = await api.post('/upload/entity-image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const imageUrl = response.data.imageUrl;
      setFormData(prev => ({ ...prev, profile_image: imageUrl }));
    } catch (err) {
      setError('Failed to upload image: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        company_name: formData.company_name,
        services_availed: formData.services_availed,
        services_fees: parseFloat(formData.services_fees) || 0,
        payment_term: formData.payment_term || null,
        // Keep loan fields for backward compatibility (only send if editing existing client with loan data)
        ...(client && (client.loan_amount || client.loan_interest_rate) ? {
          loan_amount: parseFloat(formData.loan_amount) || client.loan_amount || 0,
          loan_interest_rate: parseFloat(formData.loan_interest_rate) || client.loan_interest_rate || 0
        } : {}),
        status: formData.status,
        profile_image: formData.profile_image,
        category: formData.category,
        progress_status: formData.progress_status
      };

      if (client) {
        await api.put(`/clients/${client.id}`, payload);
      } else {
        await api.post('/clients', payload);
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save client');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{client ? 'Edit Client' : 'Add Client'}</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}

              {/* Profile Image Upload */}
              <div className="mb-3 text-center">
                <div className="position-relative d-inline-block">
                  {formData.profile_image && formData.profile_image.trim() !== '' ? (
                    <img
                      src={formData.profile_image.startsWith('http') ? formData.profile_image : normalizeUrl(formData.profile_image)}
                      alt={formData.name || 'Client'}
                      className="img-fluid rounded-circle mb-2"
                      style={{ width: '100px', height: '100px', objectFit: 'cover', border: '3px solid #dee2e6' }}
                      onError={(e) => {
                        setFormData(prev => ({ ...prev, profile_image: '' }));
                      }}
                    />
                  ) : (
                    <div
                      className="bg-secondary rounded-circle d-inline-flex align-items-center justify-content-center mb-2"
                      style={{
                        width: '100px',
                        height: '100px',
                        border: '3px solid #dee2e6'
                      }}
                    >
                      <i className="bi bi-person" style={{ fontSize: '3rem', color: 'white' }}></i>
                    </div>
                  )}
                  <div>
                    <label className="btn btn-sm btn-outline-primary">
                      <i className="bi bi-camera me-2"></i>
                      {uploadingImage ? 'Uploading...' : (formData.profile_image && formData.profile_image.trim() !== '') ? 'Change Photo' : 'Add Photo'}
                      <input
                        type="file"
                        className="d-none"
                        accept="image/*"
                        onChange={handleImageUpload}
                        disabled={uploadingImage}
                      />
                    </label>
                    {formData.profile_image && formData.profile_image.trim() !== '' && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger ms-2"
                        onClick={() => setFormData(prev => ({ ...prev, profile_image: '' }))}
                      >
                        <i className="bi bi-trash me-1"></i>Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Name *</label>
                  <input type="text" className="form-control" name="name" value={formData.name} onChange={handleChange} required />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Email *</label>
                  <input type="email" className="form-control" name="email" value={formData.email} onChange={handleChange} required disabled={!!client} />
                  {client && <small className="form-text text-muted">Email cannot be changed</small>}
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Phone</label>
                  <input type="tel" className="form-control" name="phone" value={formData.phone} onChange={handleChange} />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Company Name</label>
                  <input type="text" className="form-control" name="company_name" value={formData.company_name} onChange={handleChange} />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label">Services Availed</label>
                <div>
                  {['Consultancy', 'Microfinance', 'Marketing', 'Academy'].map(service => (
                    <div key={service} className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        value={service}
                        checked={formData.services_availed.includes(service)}
                        onChange={handleChange}
                      />
                      <label className="form-check-label">{service}</label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Services Fees</label>
                  <input type="number" className="form-control" name="services_fees" value={formData.services_fees} onChange={handleChange} step="0.01" min="0" />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Payment Term</label>
                  <select className="form-select" name="payment_term" value={formData.payment_term} onChange={handleChange}>
                    <option value="">Select Payment Term</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Annually">Annually</option>
                  </select>
                </div>
              </div>

              {/* Show loan fields only when editing existing client with loan data (for backward compatibility) */}
              {client && (client.loan_amount || client.loan_interest_rate) && (
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label">Loan Amount (Legacy)</label>
                    <input type="number" className="form-control" name="loan_amount" value={formData.loan_amount} onChange={handleChange} step="0.01" />
                    <small className="form-text text-muted">This field is for existing clients only</small>
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label">Loan Interest Rate (%) (Legacy)</label>
                    <input type="number" className="form-control" name="loan_interest_rate" value={formData.loan_interest_rate} onChange={handleChange} step="0.01" />
                    <small className="form-text text-muted">This field is for existing clients only</small>
                  </div>
                </div>
              )}

              <div className="row">
                <div className="col-md-4 mb-3">
                  <label className="form-label">Status</label>
                  <select className="form-select" name="status" value={formData.status} onChange={handleChange}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label">Category</label>
                  <select className="form-select" name="category" value={formData.category} onChange={handleChange}>
                    <option value="">Select Category</option>
                    <option value="student">Student</option>
                    <option value="client for consultancy">Client for Consultancy</option>
                    <option value="client for audit">Client for Audit</option>
                    <option value="others">Others</option>
                  </select>
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label">Progress Status</label>
                  <select className="form-select" name="progress_status" value={formData.progress_status} onChange={handleChange}>
                    <option value="">Select Status</option>
                    <option value="signed contract">Signed Contract</option>
                    <option value="pipeline client">Pipeline Client</option>
                    <option value="submit">Submit</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : client ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ClientForm;

