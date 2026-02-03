import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../config/api';
import { getSocket } from '../config/socket';
import { normalizeUrl } from '../utils/apiUrl';

const Profile = () => {
  const { user, updateUser } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    profile_image: ''
  });
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  
  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // Helper function to normalize image URL
  const normalizeImageUrl = (url) => {
    if (!url) return '';
    // If already a full URL, return as is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // Use centralized URL utility
    return normalizeUrl(url);
  };

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        profile_image: normalizeImageUrl(user.profile_image || '')
      });
    }
  }, [user]);

  // Listen for real-time profile updates
  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      const handleProfileUpdate = (data) => {
        if (data.user_id === user?.id) {
          console.log('Profile updated via socket:', data);
          // Update local form data
          if (data.profile_image !== undefined) {
            setFormData(prev => ({ ...prev, profile_image: data.profile_image }));
          }
          // Update user context
          if (user) {
            updateUser({
              ...user,
              profile_image: data.profile_image || user.profile_image,
              name: data.name || user.name
            });
          }
        }
      };

      socket.on('profile_updated', handleProfileUpdate);

      return () => {
        socket.off('profile_updated', handleProfileUpdate);
      };
    }
  }, [user, updateUser]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setMessage('');
    setError('');
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB');
      return;
    }

    setUploadingImage(true);
    setError('');
    setMessage('');
    
    try {
      const formDataObj = new FormData();
      formDataObj.append('image', file);

      // Upload image - backend now automatically saves to database and deletes old image
      const response = await api.post('/upload/profile-image', formDataObj, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 30000 // 30 second timeout for large images
      });

      const imageUrl = response.data.imageUrl;
      
      // Normalize image URL - ensure it's a full URL for display
      const fullImageUrl = imageUrl.startsWith('http') ? imageUrl : normalizeUrl(imageUrl);
      
      // Update form data with the new image URL (normalized)
      setFormData(prev => ({ ...prev, profile_image: fullImageUrl }));
      
      // Update user context immediately for real-time UI update
      if (user) {
        updateUser({
          ...user,
          profile_image: fullImageUrl
        });
      }
      
      // Refresh user data from server to ensure consistency
      try {
        const meResponse = await api.get('/auth/me');
        if (meResponse.data) {
          const serverUser = meResponse.data;
          const normalizedImageUrl = normalizeImageUrl(serverUser.profile_image || '');
          updateUser({
            ...serverUser,
            profile_image: normalizedImageUrl
          });
          setFormData(prev => ({
            ...prev,
            profile_image: normalizedImageUrl
          }));
        }
      } catch (refreshError) {
        console.warn('Could not refresh user data (non-fatal):', refreshError);
        // Continue - image is already uploaded and displayed
      }
      
      setMessage('Profile image uploaded and saved successfully');
    } catch (err) {
      console.error('Profile image upload error:', err);
      
      let errorMessage = 'Failed to upload image. Please try again.';
      if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.message) {
        if (err.message.includes('timeout')) {
          errorMessage = 'Upload timed out. The image may be too large. Please try a smaller image.';
        } else if (err.message.includes('Network Error')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await api.put('/auth/profile', {
        name: formData.name,
        phone: formData.phone,
        profile_image: formData.profile_image
      });

      // Update user context
      if (response.data.user) {
        updateUser(response.data.user);
      }

      setMessage('Profile updated successfully');
      setIsEditing(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Error updating profile');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        profile_image: user.profile_image || ''
      });
    }
    setIsEditing(false);
    setMessage('');
    setError('');
  };

  const handlePasswordChange = (e) => {
    setPasswordData({
      ...passwordData,
      [e.target.name]: e.target.value
    });
    setPasswordMessage('');
    setPasswordError('');
  };

  const validatePassword = (password) => {
    // Password must be at least 8 characters, contain uppercase, lowercase, and number
    const minLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    
    return {
      valid: minLength && hasUpperCase && hasLowerCase && hasNumber,
      errors: [
        !minLength && 'Password must be at least 8 characters',
        !hasUpperCase && 'Password must contain at least one uppercase letter',
        !hasLowerCase && 'Password must contain at least one lowercase letter',
        !hasNumber && 'Password must contain at least one number'
      ].filter(Boolean)
    };
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordMessage('');
    setPasswordError('');

    // Validation
    if (!passwordData.currentPassword) {
      setPasswordError('Current password is required');
      return;
    }

    if (!passwordData.newPassword) {
      setPasswordError('New password is required');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    const passwordValidation = validatePassword(passwordData.newPassword);
    if (!passwordValidation.valid) {
      setPasswordError(passwordValidation.errors.join(', '));
      return;
    }

    if (passwordData.currentPassword === passwordData.newPassword) {
      setPasswordError('New password must be different from current password');
      return;
    }

    setChangingPassword(true);
    try {
      const response = await api.post('/auth/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });

      setPasswordMessage(response.data.message || 'Password changed successfully');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setShowPasswordForm(false);
    } catch (err) {
      setPasswordError(err.response?.data?.error || 'Failed to change password. Please try again.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleCancelPasswordChange = () => {
    setPasswordData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
    setPasswordMessage('');
    setPasswordError('');
    setShowPasswordForm(false);
  };

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-md-8 offset-md-2">
          <h1 className="h3 mb-4">My Profile</h1>
          
          <div className="card">
            <div className="card-body">
              {/* Profile Image Section */}
              <div className="text-center mb-4">
                <div className="position-relative d-inline-block">
                  {formData.profile_image ? (
                    <img
                      key={formData.profile_image} // Force re-render when URL changes
                      src={formData.profile_image}
                      alt={formData.name || 'Profile'}
                      className="img-fluid rounded-circle"
                      style={{ 
                        width: 'clamp(96px, 28vw, 150px)', 
                        height: 'clamp(96px, 28vw, 150px)', 
                        objectFit: 'cover', 
                        border: '4px solid #dee2e6', 
                        display: 'block',
                        position: 'relative',
                        zIndex: 2
                      }}
                      onError={(e) => {
                        console.error('Profile image failed to load:', formData.profile_image);
                        e.target.style.display = 'none';
                        const placeholder = e.target.parentElement.querySelector('.profile-placeholder');
                        if (placeholder) {
                          placeholder.style.display = 'flex';
                          placeholder.style.zIndex = '1';
                        }
                      }}
                      onLoad={(e) => {
                        // Hide placeholder when image loads successfully
                        const placeholder = e.target.parentElement.querySelector('.profile-placeholder');
                        if (placeholder) {
                          placeholder.style.display = 'none';
                        }
                        e.target.style.zIndex = '2';
                      }}
                    />
                  ) : null}
                  <div
                    className="bg-info rounded-circle d-inline-flex align-items-center justify-content-center profile-placeholder"
                    style={{
                      width: 'clamp(96px, 28vw, 150px)',
                      height: 'clamp(96px, 28vw, 150px)',
                      display: formData.profile_image ? 'none' : 'flex',
                      border: '4px solid #dee2e6',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      zIndex: formData.profile_image ? 1 : 2
                    }}
                  >
                    <i className="bi bi-person" style={{ fontSize: '5rem', color: 'white' }}></i>
                  </div>
                  {isEditing && (
                    <div className="mt-3">
                      <label className="btn btn-sm btn-outline-primary">
                        <i className="bi bi-camera me-2"></i>
                        {uploadingImage ? 'Uploading...' : 'Change Photo'}
                        <input
                          type="file"
                          className="d-none"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={uploadingImage}
                        />
                      </label>
                    </div>
                  )}
                </div>
                {!isEditing && formData.profile_image && (
                  <div className="mt-2">
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => {
                        const newWindow = window.open(formData.profile_image, '_blank');
                        if (!newWindow) {
                          alert('Please allow popups to view the image');
                        }
                      }}
                    >
                      <i className="bi bi-eye me-2"></i>View Full Image
                    </button>
                  </div>
                )}
              </div>

              {message && (
                <div className="alert alert-success alert-dismissible fade show" role="alert">
                  <i className="bi bi-check-circle me-2"></i>
                  {message}
                  <button type="button" className="btn-close" onClick={() => setMessage('')}></button>
                </div>
              )}

              {error && (
                <div className="alert alert-danger alert-dismissible fade show" role="alert">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  {error}
                  <button type="button" className="btn-close" onClick={() => setError('')}></button>
                </div>
              )}

              {!isEditing ? (
                <div>
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label className="form-label text-muted">Full Name</label>
                      <p className="form-control-plaintext fw-bold">{formData.name || 'N/A'}</p>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label text-muted">Email</label>
                      <p className="form-control-plaintext">{formData.email || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label className="form-label text-muted">Phone</label>
                      <p className="form-control-plaintext">{formData.phone || 'N/A'}</p>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label text-muted">Role</label>
                      <p className="form-control-plaintext">
                        <span className={`badge bg-${
                          user?.role === 'Admin' ? 'danger' :
                          user?.role === 'Staff' ? 'primary' :
                          user?.role === 'Instructor' ? 'info' :
                          user?.role === 'Student' ? 'success' :
                          user?.role === 'Client' ? 'warning' : 'secondary'
                        }`}>
                          {user?.role || 'N/A'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setIsEditing(true)}
                    >
                      <i className="bi bi-pencil me-2"></i>Edit Profile
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  {/* Profile Image Upload Section */}
                  <div className="row mb-4">
                    <div className="col-12">
                      <label className="form-label">Profile Image</label>
                      <div className="d-flex align-items-center gap-4">
                        <div className="position-relative">
                          {formData.profile_image ? (
                            <img 
                              key={`edit-${formData.profile_image}`}
                              src={formData.profile_image} 
                              alt="Profile preview" 
                              className="rounded-circle border border-2"
                              style={{ 
                                width: '120px', 
                                height: '120px', 
                                objectFit: 'cover',
                                display: 'block',
                                position: 'relative',
                                zIndex: 2
                              }}
                              onError={(e) => {
                                console.error('Profile image failed to load in edit mode:', formData.profile_image);
                                e.target.style.display = 'none';
                                const placeholder = e.target.parentElement.querySelector('.profile-placeholder-edit');
                                if (placeholder) {
                                  placeholder.style.display = 'flex';
                                  placeholder.style.zIndex = '1';
                                }
                              }}
                              onLoad={(e) => {
                                // Hide placeholder when image loads successfully
                                const placeholder = e.target.parentElement.querySelector('.profile-placeholder-edit');
                                if (placeholder) {
                                  placeholder.style.display = 'none';
                                }
                                e.target.style.zIndex = '2';
                              }}
                            />
                          ) : null}
                          <div 
                            className="bg-secondary rounded-circle d-inline-flex align-items-center justify-content-center border border-2 profile-placeholder-edit"
                            style={{ 
                              width: '120px', 
                              height: '120px',
                              display: formData.profile_image ? 'none' : 'flex',
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              zIndex: formData.profile_image ? 1 : 2
                            }}
                          >
                            <i className="bi bi-person" style={{ fontSize: '3rem', color: 'white' }}></i>
                          </div>
                        </div>
                        <div className="flex-grow-1">
                          <input
                            type="file"
                            className="form-control"
                            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                            onChange={handleImageUpload}
                            disabled={uploadingImage}
                          />
                          <small className="form-text text-muted">
                            {uploadingImage ? 'Uploading...' : 'Upload a profile image (max 5MB, jpeg/png/gif/webp)'}
                          </small>
                          {formData.profile_image && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger mt-2"
                              onClick={() => setFormData(prev => ({ ...prev, profile_image: '' }))}
                            >
                              <i className="bi bi-trash me-1"></i>Remove Image
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label className="form-label">Full Name *</label>
                      <input
                        type="text"
                        className="form-control"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Email</label>
                      <input
                        type="email"
                        className="form-control"
                        name="email"
                        value={formData.email}
                        disabled
                      />
                      <small className="form-text text-muted">Email cannot be changed</small>
                    </div>
                  </div>
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label className="form-label">Phone</label>
                      <input
                        type="tel"
                        className="form-control"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="Enter phone number"
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Role</label>
                      <input
                        type="text"
                        className="form-control"
                        value={user?.role || 'N/A'}
                        disabled
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <button
                      type="submit"
                      className="btn btn-primary me-2"
                      disabled={loading || uploadingImage}
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2"></span>
                          Updating...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-check-circle me-2"></i>Save Changes
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleCancel}
                      disabled={loading || uploadingImage}
                    >
                      <i className="bi bi-x-circle me-2"></i>Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Change Password Section */}
          <div className="card mt-4">
            <div className="card-header">
              <h5 className="mb-0">
                <i className="bi bi-shield-lock me-2"></i>Change Password
              </h5>
            </div>
            <div className="card-body">
              {passwordMessage && (
                <div className="alert alert-success alert-dismissible fade show" role="alert">
                  <i className="bi bi-check-circle me-2"></i>
                  {passwordMessage}
                  <button type="button" className="btn-close" onClick={() => setPasswordMessage('')}></button>
                </div>
              )}

              {passwordError && (
                <div className="alert alert-danger alert-dismissible fade show" role="alert">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  {passwordError}
                  <button type="button" className="btn-close" onClick={() => setPasswordError('')}></button>
                </div>
              )}

              {!showPasswordForm ? (
                <div>
                  <p className="text-muted mb-3">
                    For security reasons, you should change your password regularly. 
                    Your password must be at least 8 characters long and contain uppercase, lowercase, and numeric characters.
                  </p>
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    onClick={() => setShowPasswordForm(true)}
                  >
                    <i className="bi bi-key me-2"></i>Change Password
                  </button>
                </div>
              ) : (
                <form onSubmit={handlePasswordSubmit}>
                  <div className="row mb-3">
                    <div className="col-md-12">
                      <label className="form-label">Current Password *</label>
                      <input
                        type="password"
                        className="form-control"
                        name="currentPassword"
                        value={passwordData.currentPassword}
                        onChange={handlePasswordChange}
                        required
                        autoComplete="current-password"
                      />
                    </div>
                  </div>
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label className="form-label">New Password *</label>
                      <input
                        type="password"
                        className="form-control"
                        name="newPassword"
                        value={passwordData.newPassword}
                        onChange={handlePasswordChange}
                        required
                        autoComplete="new-password"
                        minLength={8}
                      />
                      <small className="form-text text-muted">
                        Must be at least 8 characters with uppercase, lowercase, and number
                      </small>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Confirm New Password *</label>
                      <input
                        type="password"
                        className="form-control"
                        name="confirmPassword"
                        value={passwordData.confirmPassword}
                        onChange={handlePasswordChange}
                        required
                        autoComplete="new-password"
                        minLength={8}
                      />
                    </div>
                  </div>
                  {passwordData.newPassword && (
                    <div className="mb-3">
                      <small className="text-muted">Password strength:</small>
                      <div className="progress" style={{ height: '5px' }}>
                        <div
                          className={`progress-bar ${
                            validatePassword(passwordData.newPassword).valid
                              ? 'bg-success'
                              : passwordData.newPassword.length >= 4
                              ? 'bg-warning'
                              : 'bg-danger'
                          }`}
                          role="progressbar"
                          style={{
                            width: `${
                              validatePassword(passwordData.newPassword).valid
                                ? 100
                                : passwordData.newPassword.length >= 4
                                ? 50
                                : 25
                            }%`
                          }}
                        ></div>
                      </div>
                    </div>
                  )}
                  <div className="mt-4">
                    <button
                      type="submit"
                      className="btn btn-primary me-2"
                      disabled={changingPassword}
                    >
                      {changingPassword ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2"></span>
                          Changing...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-check-circle me-2"></i>Change Password
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleCancelPasswordChange}
                      disabled={changingPassword}
                    >
                      <i className="bi bi-x-circle me-2"></i>Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
