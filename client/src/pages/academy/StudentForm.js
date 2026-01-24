import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import { normalizeUrl } from '../../utils/apiUrl';
import { useAuth } from '../../hooks/useAuth';

const StudentForm = ({ student, onClose }) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    username: '',
    phone: '',
    enrollment_date: '',
    status: 'Active',
    profile_image: '',
    courses_enrolled: [],
    cohort_id: '',
    period: '',
    date_of_birth: '',
    place_of_birth: '',
    nationality: '',
    gender: '',
    marital_status: '',
    national_id: '',
    password: ''
  });
  const [courses, setCourses] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    fetchCourses();
    fetchCohorts();
    if (student) {
      // Parse courses_enrolled if it's a JSON string
      let coursesEnrolled = [];
      if (student.courses_enrolled) {
        try {
          coursesEnrolled = typeof student.courses_enrolled === 'string' 
            ? JSON.parse(student.courses_enrolled) 
            : student.courses_enrolled;
        } catch (e) {
          coursesEnrolled = [];
        }
      }
      
      setFormData({
        name: student.name || '',
        email: student.email || '',
        username: student.username || '',
        phone: student.phone || '',
        enrollment_date: student.enrollment_date ? student.enrollment_date.split('T')[0] : '',
        status: student.status || 'Active',
        profile_image: student.profile_image || '',
        courses_enrolled: coursesEnrolled,
        cohort_id: student.cohort_id || '',
        period: student.period || '',
        date_of_birth: student.date_of_birth || '',
        place_of_birth: student.place_of_birth || '',
        nationality: student.nationality || '',
        gender: student.gender || '',
        marital_status: student.marital_status || '',
        national_id: student.national_id || '',
        password: ''
      });
    }
  }, [student]);

  const fetchCourses = async () => {
    try {
      const response = await api.get('/academy/courses');
      setCourses(response.data.courses || []);
    } catch (error) {
      console.error('Error fetching courses:', error);
    }
  };

  const fetchCohorts = async () => {
    try {
      const response = await api.get('/academy/cohorts?status=Active');
      setCohorts(response.data.cohorts || []);
    } catch (error) {
      console.error('Error fetching cohorts:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      const courseId = parseInt(value);
      setFormData(prev => ({
        ...prev,
        courses_enrolled: checked
          ? [...prev.courses_enrolled, courseId]
          : prev.courses_enrolled.filter(id => id !== courseId)
      }));
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
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
    try {
      const formDataObj = new FormData();
      formDataObj.append('image', file);

      const response = await api.post('/upload/profile-image', formDataObj, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      // Construct full URL if needed
      const imageUrl = response.data.imageUrl;
      // If it's a relative URL, prepend the backend base URL
      const fullImageUrl = imageUrl.startsWith('http') ? imageUrl : normalizeUrl(imageUrl);
      setFormData(prev => ({ ...prev, profile_image: fullImageUrl }));
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
        enrollment_date: formData.enrollment_date,
        status: formData.status,
        profile_image: formData.profile_image,
        courses_enrolled: formData.courses_enrolled,
        cohort_id: formData.cohort_id || null,
        period: formData.period || null,
        date_of_birth: formData.date_of_birth || null,
        place_of_birth: formData.place_of_birth || null,
        nationality: formData.nationality || null,
        gender: formData.gender || null,
        marital_status: formData.marital_status || null,
        national_id: formData.national_id || null,
        password: formData.password || null
      };

      if (student) {
        await api.put(`/academy/students/${student.id}`, payload);
      } else {
        const response = await api.post('/academy/students', payload);
        if (user?.role !== 'Admin' && response.data?.message) {
          alert(response.data.message);
        }
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save student');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{student ? 'Edit Student' : 'Add Student'}</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}
              {!student && user?.role !== 'Admin' && (
                <div className="alert alert-info">
                  <i className="bi bi-info-circle me-2"></i>
                  This student will be created and submitted for admin approval before being activated. Course enrollments and payment records will be created upon approval.
                </div>
              )}

              <div className="row mb-3">
                <div className="col-md-4">
                  <label className="form-label">Profile Image</label>
                  <div className="mb-2">
                    {formData.profile_image && (
                      <img src={formData.profile_image} alt="Profile" style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '50%' }} />
                    )}
                  </div>
                  <input type="file" className="form-control" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} />
                  {uploadingImage && <small className="text-muted">Uploading...</small>}
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label">Name *</label>
                <input type="text" className="form-control" name="name" value={formData.name} onChange={handleChange} required />
              </div>

              <div className="mb-3">
                <label className="form-label">Email *</label>
                <input type="email" className="form-control" name="email" value={formData.email} onChange={handleChange} required disabled={!!student} />
                {student && <small className="form-text text-muted">Email cannot be changed</small>}
              </div>

              <div className="mb-3">
                <label className="form-label">Username</label>
                <input type="text" className="form-control" name="username" value={formData.username} onChange={handleChange} />
              </div>

              <div className="mb-3">
                <label className="form-label">Phone</label>
                <input type="tel" className="form-control" name="phone" value={formData.phone} onChange={handleChange} />
              </div>

              <div className="mb-3">
                <label className="form-label">Enrollment Date</label>
                <input type="date" className="form-control" name="enrollment_date" value={formData.enrollment_date} onChange={handleChange} />
              </div>

              <div className="mb-3">
                <label className="form-label">Cohort</label>
                <select
                  className="form-select"
                  name="cohort_id"
                  value={formData.cohort_id}
                  onChange={handleChange}
                >
                  <option value="">Select a cohort (optional)</option>
                  {cohorts.map((cohort) => (
                    <option key={cohort.id} value={cohort.id}>
                      {cohort.name} {cohort.code ? `(${cohort.code})` : ''}
                    </option>
                  ))}
                </select>
                <small className="form-text text-muted">
                  Assign this student to a cohort
                </small>
              </div>

              <div className="mb-3">
                <label className="form-label">Period</label>
                <input
                  type="text"
                  className="form-control"
                  name="period"
                  value={formData.period}
                  onChange={handleChange}
                  placeholder="e.g., Q1 2024, Fall 2024, 2024-2025"
                />
                <small className="form-text text-muted">
                  Academic period or term (optional)
                </small>
              </div>

              <div className="mb-3">
                <label className="form-label">Date of Birth</label>
                <input type="date" className="form-control" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} />
              </div>

              <div className="mb-3">
                <label className="form-label">Place of Birth</label>
                <input type="text" className="form-control" name="place_of_birth" value={formData.place_of_birth} onChange={handleChange} />
              </div>

              <div className="mb-3">
                <label className="form-label">Nationality</label>
                <input type="text" className="form-control" name="nationality" value={formData.nationality} onChange={handleChange} />
              </div>

              <div className="mb-3">
                <label className="form-label">Gender</label>
                <select className="form-select" name="gender" value={formData.gender} onChange={handleChange}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label">Status</label>
                <select className="form-select" name="status" value={formData.status} onChange={handleChange}>
                  <option value="Active">Active</option>
                  <option value="Graduated">Graduated</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Dropped">Dropped</option>
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label">Enroll in Courses</label>
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #dee2e6', padding: '10px', borderRadius: '4px' }}>
                  {courses.length === 0 ? (
                    <p className="text-muted">No courses available. Create courses first.</p>
                  ) : (
                    courses
                      .filter(course => course.status === 'Active' && course.fee_approved === 1)
                      .map((course) => (
                        <div key={course.id} className="form-check">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            value={course.id}
                            checked={formData.courses_enrolled.includes(course.id)}
                            onChange={handleChange}
                            id={`course-${course.id}`}
                          />
                          <label className="form-check-label" htmlFor={`course-${course.id}`}>
                            {course.course_code} - {course.title} (${parseFloat(course.course_fee || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                          </label>
                        </div>
                      ))
                  )}
                </div>
                <small className="form-text text-muted">
                  Only approved courses with fees are shown. Student payment records will be created automatically.
                </small>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading || uploadingImage}>
                {loading ? 'Saving...' : student ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StudentForm;

