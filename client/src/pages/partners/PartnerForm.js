import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import { normalizeUrl } from '../../utils/apiUrl';

const PartnerForm = ({ partner, onClose }) => {
  const [formData, setFormData] = useState({
    company_name: '',
    contact_person: '',
    partnership_type: 'Affiliate',
    status: 'Active',
    notes: '',
    email: '',
    phone: '',
    name: '',
    profile_image: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (partner) {
      setFormData({
        company_name: partner.company_name || '',
        contact_person: partner.contact_person || '',
        partnership_type: partner.partnership_type || 'Affiliate',
        status: partner.status || 'Active',
        notes: partner.notes || '',
        email: partner.email || '',
        phone: partner.phone || '',
        name: partner.name || '',
        profile_image: partner.profile_image || ''
      });
    }
  }, [partner]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
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
      fd.append('type', 'partner');

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
        company_name: formData.company_name,
        contact_person: formData.contact_person,
        partnership_type: formData.partnership_type,
        status: formData.status,
        notes: formData.notes,
        email: formData.email,
        phone: formData.phone,
        name: formData.name,
        profile_image: formData.profile_image
      };

      if (partner) {
        await api.put(`/partners/${partner.id}`, payload);
      } else {
        await api.post('/partners', payload);
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save partner');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{partner ? 'Edit Partner' : 'Add Partner'}</h5>
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
                      alt={formData.company_name || 'Partner'}
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
                      <i className="bi bi-building" style={{ fontSize: '3rem', color: 'white' }}></i>
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

              <div className="mb-3">
                <label className="form-label">Company Name *</label>
                <input type="text" className="form-control" name="company_name" value={formData.company_name} onChange={handleChange} required />
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Contact Person</label>
                  <input type="text" className="form-control" name="contact_person" value={formData.contact_person} onChange={handleChange} />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-control" name="email" value={formData.email} onChange={handleChange} disabled={!!partner} />
                  {partner && <small className="form-text text-muted">Email cannot be changed</small>}
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Phone</label>
                  <input type="tel" className="form-control" name="phone" value={formData.phone} onChange={handleChange} />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Contact Name</label>
                  <input type="text" className="form-control" name="name" value={formData.name} onChange={handleChange} />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label">Partnership Type *</label>
                <select className="form-select" name="partnership_type" value={formData.partnership_type} onChange={handleChange} required>
                  <option value="Affiliate">Affiliate</option>
                  <option value="Sponsor">Sponsor</option>
                  <option value="Collaborator">Collaborator</option>
                  <option value="Vendor">Vendor</option>
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label">Status</label>
                <select className="form-select" name="status" value={formData.status} onChange={handleChange}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Terminated">Terminated</option>
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label">Notes</label>
                <textarea className="form-control" name="notes" value={formData.notes} onChange={handleChange} rows="3" />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : partner ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PartnerForm;

