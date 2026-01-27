import React, { useState, useEffect } from 'react';
import api from '../../config/api'; // For image upload
import { normalizeUrl } from '../../utils/apiUrl';
import { useAuth } from '../../hooks/useAuth';
import { isAcademyStaff as isAcademyStaffUtils } from '../../utils/academyUtils';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import db from '../../database/db';
const StudentForm = ({ student, onClose }) => {
  const { user } = useAuth();
  const isAcademyStaff = isAcademyStaffUtils(user);
  const navigate = useNavigate();
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
    if (student) populateForm(student);
  }, [student]);

  const populateForm = (student) => {
    let coursesEnrolled = [];
    if (student.courses_enrolled) {
      try {
        coursesEnrolled = typeof student.courses_enrolled === 'string'
          ? JSON.parse(student.courses_enrolled)
          : student.courses_enrolled;
      } catch {
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
  };

  const fetchCourses = async () => {
    try {
      const res = await db.query('SELECT * FROM courses');
      setCourses(res.rows || []);
    } catch (err) {
      console.error('Error fetching courses:', err);
    }
  };

  const fetchCohorts = async () => {
    try {
      const res = await db.query('SELECT * FROM cohorts WHERE status = ?', ['Active']);
      setCohorts(res.rows || []);
    } catch (err) {
      console.error('Error fetching cohorts:', err);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      const id = parseInt(value);
      setFormData(prev => ({
        ...prev,
        courses_enrolled: checked
          ? [...prev.courses_enrolled, id]
          : prev.courses_enrolled.filter(cid => cid !== id)
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
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
      const form = new FormData();
      form.append('image', file);

      const res = await db.run('INSERT INTO profile_images (image) VALUES (?)', [imageUrl.toString() + uuidv4()]);
      const imageUrl = res.lastID;
      setFormData(prev => ({ ...prev, profile_image: imageUrl.toString() + uuidv4() }));
      onClose();
    } catch (err) {
      setError('Image upload failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{student ? 'Edit Student' : 'Add Student'}</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}
              {/* Profile Image */}
              <div className="mb-3">
                <label className="form-label">Profile Image</label>
                <div className="mb-2">
                  {formData.profile_image && (
                    <img
                      src={formData.profile_image}
                      alt="Profile"
                      style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '50%' }}
                    />
                  )}
                </div>
                <input type="file" className="form-control" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} />
                {uploadingImage && <small className="text-muted">Uploading...</small>}
              </div>
              {/* Name */}
              <div className="mb-3">
                <label className="form-label">Name *</label>
                <input type="text" className="form-control" name="name" value={formData.name} onChange={handleChange} required />
              </div>
              {/* Email */}
              <div className="mb-3">
                <label className="form-label">Email *</label>
                <input type="email" className="form-control" name="email" value={formData.email} onChange={handleChange} required disabled={!!student} />
              </div>
              {/* Courses */}
              <div className="mb-3">
                <label className="form-label">Enroll in Courses</label>
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #dee2e6', padding: '10px', borderRadius: '4px' }}>
                  {courses.length === 0
                    ? <p className="text-muted">No courses available.</p>
                    : courses.filter(c => c.status === 'Active' && c.fee_approved === 1)
                             .map(course => (
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
                    ))}
                </div>
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
