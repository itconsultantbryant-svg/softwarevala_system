import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import { normalizeUrl } from '../../utils/apiUrl';

const StaffForm = ({ staff, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    username: '',
    phone: '',
    employment_type: 'Full-time',
    position: '',
    department: '',
    employment_date: '',
    base_salary: '',
    bonus_structure: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    address: '',
    profile_image: '',
    // New comprehensive fields
    date_of_birth: '',
    place_of_birth: '',
    nationality: '',
    gender: '',
    marital_status: '',
    national_id: '',
    tax_id: '',
    bank_name: '',
    bank_account_number: '',
    bank_branch: '',
    next_of_kin_name: '',
    next_of_kin_relationship: '',
    next_of_kin_phone: '',
    next_of_kin_address: '',
    qualifications: '',
    previous_employment: '',
    references: '',
    notes: '',
    password: '' // Admin creates password
  });
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    fetchDepartments();
    if (staff) {
      setFormData({
        name: staff.name || '',
        email: staff.email || '',
        username: staff.username || '',
        phone: staff.phone || '',
        employment_type: staff.employment_type || 'Full-time',
        position: staff.position || '',
        department: staff.department || '',
        employment_date: staff.employment_date || '',
        base_salary: staff.base_salary || '',
        bonus_structure: staff.bonus_structure || '',
        emergency_contact_name: staff.emergency_contact_name || '',
        emergency_contact_phone: staff.emergency_contact_phone || '',
        address: staff.address || '',
        profile_image: staff.profile_image || '',
        date_of_birth: staff.date_of_birth || '',
        place_of_birth: staff.place_of_birth || '',
        nationality: staff.nationality || '',
        gender: staff.gender || '',
        marital_status: staff.marital_status || '',
        national_id: staff.national_id || '',
        tax_id: staff.tax_id || '',
        bank_name: staff.bank_name || '',
        bank_account_number: staff.bank_account_number || '',
        bank_branch: staff.bank_branch || '',
        next_of_kin_name: staff.next_of_kin_name || '',
        next_of_kin_relationship: staff.next_of_kin_relationship || '',
        next_of_kin_phone: staff.next_of_kin_phone || '',
        next_of_kin_address: staff.next_of_kin_address || '',
        qualifications: typeof staff.qualifications === 'string' ? staff.qualifications : JSON.stringify(staff.qualifications || []),
        previous_employment: typeof staff.previous_employment === 'string' ? staff.previous_employment : JSON.stringify(staff.previous_employment || []),
        references: typeof staff.references === 'string' ? staff.references : JSON.stringify(staff.references || []),
        notes: staff.notes || '',
        password: '' // Don't show password when editing
      });
    }
  }, [staff]);

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      setDepartments(response.data.departments || []);
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

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
      const staffId = staff?.id || staff?.staff_id || staff?.user_id;
      const uploadUrl = staffId ? `/upload/entity-image/staff/${staffId}` : '/upload/entity-image';
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
      if (staff) {
        // Check if staff has a valid ID - use staff.id, staff_id, or user_id
        const staffId = staff.id || staff.staff_id || staff.user_id;
        if (!staffId || staffId === 'null' || staffId === null) {
          setError('Invalid staff ID. Cannot update this staff member.');
          setLoading(false);
          return;
        }
        await api.put(`/staff/${staffId}`, formData);
      } else {
        await api.post('/staff', formData);
      }
      onClose();
    } catch (err) {
      console.error('Save staff error:', err);
      setError(err.response?.data?.error || 'Failed to save staff member');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              {staff ? 'Edit Staff Member' : 'Add Staff Member'}
            </h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && (
                <div className="alert alert-danger">{error}</div>
              )}

              {/* Profile Image Upload */}
              <div className="mb-3 text-center">
                <div className="position-relative d-inline-block">
                  {formData.profile_image && formData.profile_image.trim() !== '' ? (
                    <img
                      src={formData.profile_image.startsWith('http') ? formData.profile_image : normalizeUrl(formData.profile_image)}
                      alt={formData.name || 'Staff'}
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
                  <input
                    type="text"
                    className="form-control"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Email *</label>
                  <input
                    type="email"
                    className="form-control"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Phone</label>
                  <input
                    type="tel"
                    className="form-control"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Employment Type *</label>
                  <select
                    className="form-select"
                    name="employment_type"
                    value={formData.employment_type}
                    onChange={handleChange}
                    required
                  >
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Internship">Internship</option>
                  </select>
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Position *</label>
                  <input
                    type="text"
                    className="form-control"
                    name="position"
                    value={formData.position}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Department *</label>
                  <select
                    className="form-select"
                    name="department"
                    value={formData.department}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.name}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                  {departments.length === 0 && (
                    <small className="text-muted">No departments available. Create departments first.</small>
                  )}
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Employment Date</label>
                  <input
                    type="date"
                    className="form-control"
                    name="employment_date"
                    value={formData.employment_date}
                    onChange={handleChange}
                  />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Base Salary</label>
                  <input
                    type="number"
                    className="form-control"
                    name="base_salary"
                    value={formData.base_salary}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label">Address</label>
                <textarea
                  className="form-control"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  rows="2"
                />
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Emergency Contact Name</label>
                  <input
                    type="text"
                    className="form-control"
                    name="emergency_contact_name"
                    value={formData.emergency_contact_name}
                    onChange={handleChange}
                  />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Emergency Contact Phone</label>
                  <input
                    type="tel"
                    className="form-control"
                    name="emergency_contact_phone"
                    value={formData.emergency_contact_phone}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Password Field - Only when creating new staff */}
              {!staff && (
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label">Password *</label>
                    <input
                      type="password"
                      className="form-control"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      required
                      placeholder="Create password for staff login"
                    />
                    <small className="text-muted">Staff will use this password with their username to login</small>
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label">Username *</label>
                    <input
                      type="text"
                      className="form-control"
                      name="username"
                      value={formData.username}
                      onChange={handleChange}
                      required
                      placeholder="Staff login username"
                    />
                  </div>
                </div>
              )}

              <hr className="my-4" />
              <h6 className="mb-3">Personal Information</h6>

              <div className="row">
                <div className="col-md-4 mb-3">
                  <label className="form-label">Date of Birth</label>
                  <input
                    type="date"
                    className="form-control"
                    name="date_of_birth"
                    value={formData.date_of_birth}
                    onChange={handleChange}
                  />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label">Place of Birth</label>
                  <input
                    type="text"
                    className="form-control"
                    name="place_of_birth"
                    value={formData.place_of_birth}
                    onChange={handleChange}
                    placeholder="City, Country"
                  />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label">Nationality</label>
                  <input
                    type="text"
                    className="form-control"
                    name="nationality"
                    value={formData.nationality}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Gender</label>
                  <select
                    className="form-select"
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Marital Status</label>
                  <select
                    className="form-select"
                    name="marital_status"
                    value={formData.marital_status}
                    onChange={handleChange}
                  >
                    <option value="">Select Status</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">National ID</label>
                  <input
                    type="text"
                    className="form-control"
                    name="national_id"
                    value={formData.national_id}
                    onChange={handleChange}
                  />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Tax ID</label>
                  <input
                    type="text"
                    className="form-control"
                    name="tax_id"
                    value={formData.tax_id}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <hr className="my-4" />
              <h6 className="mb-3">Banking Information</h6>

              <div className="row">
                <div className="col-md-4 mb-3">
                  <label className="form-label">Bank Name</label>
                  <input
                    type="text"
                    className="form-control"
                    name="bank_name"
                    value={formData.bank_name}
                    onChange={handleChange}
                  />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label">Account Number</label>
                  <input
                    type="text"
                    className="form-control"
                    name="bank_account_number"
                    value={formData.bank_account_number}
                    onChange={handleChange}
                  />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label">Bank Branch</label>
                  <input
                    type="text"
                    className="form-control"
                    name="bank_branch"
                    value={formData.bank_branch}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <hr className="my-4" />
              <h6 className="mb-3">Next of Kin Information</h6>

              <div className="row">
                <div className="col-md-4 mb-3">
                  <label className="form-label">Next of Kin Name</label>
                  <input
                    type="text"
                    className="form-control"
                    name="next_of_kin_name"
                    value={formData.next_of_kin_name}
                    onChange={handleChange}
                  />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label">Relationship</label>
                  <input
                    type="text"
                    className="form-control"
                    name="next_of_kin_relationship"
                    value={formData.next_of_kin_relationship}
                    onChange={handleChange}
                    placeholder="e.g., Spouse, Parent, Sibling"
                  />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label">Next of Kin Phone</label>
                  <input
                    type="tel"
                    className="form-control"
                    name="next_of_kin_phone"
                    value={formData.next_of_kin_phone}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label">Next of Kin Address</label>
                <textarea
                  className="form-control"
                  name="next_of_kin_address"
                  value={formData.next_of_kin_address}
                  onChange={handleChange}
                  rows="2"
                />
              </div>

              <hr className="my-4" />
              <h6 className="mb-3">Additional Information</h6>

              <div className="mb-3">
                <label className="form-label">Qualifications (JSON array or comma-separated)</label>
                <textarea
                  className="form-control"
                  name="qualifications"
                  value={formData.qualifications}
                  onChange={handleChange}
                  rows="3"
                  placeholder='e.g., ["BSc Computer Science", "MSc Information Technology"] or BSc Computer Science, MSc Information Technology'
                />
              </div>

              <div className="mb-3">
                <label className="form-label">Previous Employment (JSON array or comma-separated)</label>
                <textarea
                  className="form-control"
                  name="previous_employment"
                  value={formData.previous_employment}
                  onChange={handleChange}
                  rows="3"
                  placeholder='e.g., ["Company A - Software Developer (2020-2022)", "Company B - IT Support (2018-2020)"]'
                />
              </div>

              <div className="mb-3">
                <label className="form-label">References (JSON array or comma-separated)</label>
                <textarea
                  className="form-control"
                  name="references"
                  value={formData.references}
                  onChange={handleChange}
                  rows="3"
                  placeholder='e.g., ["John Doe - Manager - john@company.com - 1234567890"]'
                />
              </div>

              <div className="mb-3">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-control"
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows="3"
                  placeholder="Additional notes or comments"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading || uploadingImage}>
                {loading ? 'Saving...' : staff ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StaffForm;

