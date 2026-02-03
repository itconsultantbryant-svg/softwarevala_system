import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import { normalizeUrl } from '../../utils/apiUrl';

const UserForm = ({ user, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    username: '',
    phone: '',
    role: 'Staff',
    password: '',
    is_active: true,
    profile_image: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        username: user.username || '',
        phone: user.phone || '',
        role: user.role || 'Staff',
        password: '',
        is_active: user.is_active !== undefined ? user.is_active : true,
        profile_image: user.profile_image || ''
      });
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
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
      const uploadUrl = user?.id
        ? `/upload/entity-image/user/${user.id}`
        : '/upload/entity-image';
      const response = await api.post(uploadUrl, fd, {
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
        username: formData.username,
        phone: formData.phone,
        role: formData.role,
        is_active: formData.is_active,
        profile_image: formData.profile_image
      };

      if (!user && formData.password) {
        payload.password = formData.password;
      }

      if (user) {
        await api.put(`/users/${user.id}`, payload);
      } else {
        await api.post('/users', payload);
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{user ? 'Edit User' : 'Add User'}</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}

              <div className="row mb-3">
                <div className="col-md-4">
                  <label className="form-label">Profile Image</label>
                  <div className="mb-2">
                    {formData.profile_image && (
                      <img src={formData.profile_image.startsWith('http') ? formData.profile_image : normalizeUrl(formData.profile_image)} alt="Profile" style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '50%' }} />
                    )}
                  </div>
                  <input type="file" className="form-control" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} />
                  {uploadingImage && <small className="text-muted">Uploading...</small>}
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Name *</label>
                  <input type="text" className="form-control" name="name" value={formData.name} onChange={handleChange} required />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Email *</label>
                  <input type="email" className="form-control" name="email" value={formData.email} onChange={handleChange} required disabled={!!user} />
                  {user && <small className="form-text text-muted">Email cannot be changed</small>}
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Username</label>
                  <input type="text" className="form-control" name="username" value={formData.username} onChange={handleChange} />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Phone</label>
                  <input type="tel" className="form-control" name="phone" value={formData.phone} onChange={handleChange} />
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Role *</label>
                  <select className="form-select" name="role" value={formData.role} onChange={handleChange} required>
                    <option value="Admin">Admin</option>
                    <option value="Staff">Staff</option>
                    <option value="Instructor">Instructor</option>
                    <option value="Student">Student</option>
                    <option value="Client">Client</option>
                    <option value="Partner">Partner</option>
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Status</label>
                  <select className="form-select" name="is_active" value={formData.is_active ? 1 : 0} onChange={(e) => setFormData({...formData, is_active: e.target.value === '1'})}>
                    <option value={1}>Active</option>
                    <option value={0}>Inactive</option>
                  </select>
                </div>
              </div>

              {!user && (
                <div className="mb-3">
                  <label className="form-label">Password</label>
                  <input type="password" className="form-control" name="password" value={formData.password} onChange={handleChange} placeholder="Leave empty for default password" />
                  <small className="form-text text-muted">Default: User@123</small>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading || uploadingImage}>
                {loading ? 'Saving...' : user ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UserForm;

