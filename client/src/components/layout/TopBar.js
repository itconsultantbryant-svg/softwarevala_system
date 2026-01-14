import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../config/api';
import { initSocket, disconnectSocket } from '../../config/socket';
import './TopBar.css';

const TopBar = () => {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showNotifications || showProfileMenu) {
        const target = event.target;
        const isClickInside = target.closest('.topbar-item') || target.closest('.topbar-dropdown');
        if (!isClickInside) {
          setShowNotifications(false);
          setShowProfileMenu(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications, showProfileMenu]);

  useEffect(() => {
    if (user) {
      // Initialize socket connection for real-time notifications
      const socket = initSocket(user.id);
      
      fetchUnreadCount();
      fetchNotifications();

      // Request notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }

      // Listen for real-time profile updates and notifications via WebSocket
      if (socket) {
        const handleProfileUpdate = (data) => {
          if (data.user_id === user.id) {
            console.log('Profile updated via socket:', data);
            // Refresh user data to get updated profile image
            api.get('/auth/me')
              .then(response => {
                if (response.data?.user) {
                  const updatedUserData = response.data.user;
                  // Update user context
                  updateUser(updatedUserData);
                }
              })
              .catch(err => console.error('Error fetching updated profile:', err));
          }
        };

        const handleNotification = (notification) => {
          // Parse notification if it's a string
          let parsedNotification = notification;
          if (typeof notification === 'string') {
            try {
              parsedNotification = JSON.parse(notification);
            } catch (e) {
              // If parsing fails, create a proper notification object
              parsedNotification = {
                id: Date.now(),
                title: 'Notification',
                message: notification,
                type: 'info',
                is_read: 0,
                created_at: new Date().toISOString()
              };
            }
          }
          
          // Ensure notification has required fields
          if (!parsedNotification.id) {
            parsedNotification.id = parsedNotification.id || Date.now();
          }
          if (!parsedNotification.created_at) {
            parsedNotification.created_at = new Date().toISOString();
          }
          if (!parsedNotification.is_read) {
            parsedNotification.is_read = 0;
          }
          
          // Extract title and message properly
          const title = parsedNotification.title || 'Notification';
          let message = parsedNotification.message;
          
          // Handle message if it's a JSON string
          if (typeof message === 'string') {
            try {
              // Try to parse if it looks like JSON
              if (message.trim().startsWith('{') || message.trim().startsWith('[')) {
                const parsed = JSON.parse(message);
                // If parsed is an object, extract meaningful content
                if (typeof parsed === 'object' && parsed !== null) {
                  message = parsed.message || parsed.title || JSON.stringify(parsed);
                } else {
                  message = parsed;
                }
              }
            } catch (e) {
              // Not JSON, use as-is
            }
          } else if (typeof message === 'object' && message !== null) {
            // If message is an object, extract meaningful content
            message = message.message || message.title || JSON.stringify(message);
          }
          
          // Add new notification to the list
          setNotifications(prev => [{
            ...parsedNotification,
            title,
            message
          }, ...prev]);
          setUnreadCount(prev => prev + 1);
          
          // Show browser notification if permission granted
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
              body: message,
              icon: '/prinstine-logo.png'
            });
          }
        };

        socket.on('profile_updated', handleProfileUpdate);
        socket.on('notification', handleNotification);

        // Poll for notifications every 30 seconds as backup
        const interval = setInterval(() => {
          fetchUnreadCount();
          fetchNotifications();
        }, 30000);

        return () => {
          socket.off('profile_updated', handleProfileUpdate);
          socket.off('notification', handleNotification);
          clearInterval(interval);
        };
      }
    }

    return () => {
      disconnectSocket();
    };
  }, [user, updateUser]);

  const fetchUnreadCount = async () => {
    try {
      const response = await api.get('/notifications/unread-count');
      setUnreadCount(response.data.count || 0);
    } catch (error) {
      // Only log if it's not a network error (connection issues are expected during offline periods)
      if (error.code !== 'ERR_NETWORK' && error.code !== 'ERR_INTERNET_DISCONNECTED' && error.message !== 'Network Error') {
      console.error('Error fetching unread count:', error);
      }
      // Silently fail for network errors - they'll be retried on next connection
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/notifications?limit=10');
      setNotifications(response.data.notifications || []);
    } catch (error) {
      // Only log if it's not a network error (connection issues are expected during offline periods)
      if (error.code !== 'ERR_NETWORK' && error.code !== 'ERR_INTERNET_DISCONNECTED' && error.message !== 'Network Error') {
      console.error('Error fetching notifications:', error);
      }
      // Silently fail for network errors - they'll be retried on next connection
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const markAsRead = async (notificationId) => {
    try {
      await api.put(`/notifications/${notificationId}/read`);
      fetchUnreadCount();
      fetchNotifications();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleNotificationClick = async (notification) => {
    // Mark as read if not already read
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    
    // Close dropdown
    setShowNotifications(false);
    
    // Handle navigation based on notification link
    if (notification.link) {
      const link = notification.link;
      
      // Parse the link to determine navigation behavior
      if (link.startsWith('/attendance')) {
        // For attendance, navigate to attendance page
        navigate('/attendance');
      } else if (link.startsWith('/requisitions/')) {
        // Extract requisition ID
        const requisitionId = link.split('/requisitions/')[1]?.split('?')[0]?.split('#')[0];
        navigate('/requisitions');
        // After navigation, try to find and highlight the requisition
        setTimeout(() => {
          // Try multiple selectors to find the requisition
          const selectors = [
            `[data-requisition-id="${requisitionId}"]`,
            `[data-id="${requisitionId}"]`,
            `tr[data-requisition-id="${requisitionId}"]`,
            `.requisition-item[data-id="${requisitionId}"]`
          ];
          
          let element = null;
          for (const selector of selectors) {
            element = document.querySelector(selector);
            if (element) break;
          }
          
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight-item');
            setTimeout(() => element.classList.remove('highlight-item'), 2000);
          } else {
            // If element not found, try to find by text content
            const allElements = document.querySelectorAll('[data-requisition-id], [data-id]');
            allElements.forEach(el => {
              const id = el.getAttribute('data-requisition-id') || el.getAttribute('data-id');
              if (id === requisitionId) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('highlight-item');
                setTimeout(() => el.classList.remove('highlight-item'), 2000);
              }
            });
          }
        }, 800);
      } else if (link.startsWith('/progress-reports/')) {
        // Navigate to progress reports page
        navigate('/reports');
      } else if (link.startsWith('/department-reports')) {
        navigate('/department-reports');
      } else if (link.startsWith('/staff-client-reports/')) {
        const reportId = link.split('/staff-client-reports/')[1]?.split('?')[0]?.split('#')[0];
        navigate('/staff-client-reports');
        if (reportId) {
          setTimeout(() => {
            const element = document.querySelector(`[data-report-id="${reportId}"]`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              element.classList.add('highlight-item');
              setTimeout(() => element.classList.remove('highlight-item'), 2000);
            }
          }, 800);
        }
      } else if (link.startsWith('/meetings/')) {
        const meetingId = link.split('/meetings/')[1]?.split('?')[0]?.split('#')[0];
        navigate('/meetings');
        if (meetingId) {
          setTimeout(() => {
            const selectors = [
              `[data-meeting-id="${meetingId}"]`,
              `[data-id="${meetingId}"]`,
              `tr[data-meeting-id="${meetingId}"]`
            ];
            
            let element = null;
            for (const selector of selectors) {
              element = document.querySelector(selector);
              if (element) break;
            }
            
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              element.classList.add('highlight-item');
              setTimeout(() => element.classList.remove('highlight-item'), 2000);
            }
          }, 800);
        }
      } else {
        // Default navigation - handle any other links
        navigate(link);
      }
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  if (!user) return null;

  return (
    <div className="topbar">
      <div className="topbar-content">
        <div className="topbar-left">
          <img 
            src="/prinstine-logo.png" 
            alt="Prinstine Group" 
            className="topbar-logo"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <h5 className="mb-0 topbar-title">Dashboard</h5>
        </div>
        
        <div className="topbar-right">
          {/* Notifications */}
          <div className="topbar-item">
            <button
              className="topbar-notification-btn"
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowProfileMenu(false);
              }}
            >
              <i className="bi bi-bell"></i>
              {unreadCount > 0 && (
                <span className="topbar-badge">{unreadCount}</span>
              )}
            </button>
            {showNotifications && (
              <div className="topbar-dropdown notification-dropdown">
                <div className="topbar-dropdown-header">
                  <h6 className="mb-0">Notifications</h6>
                  {unreadCount > 0 && (
                    <button className="btn btn-sm btn-link p-0" onClick={markAllAsRead}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="topbar-dropdown-body">
                  {notifications.length === 0 ? (
                    <div className="text-center text-muted p-3">No notifications</div>
                  ) : (
                    notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`topbar-dropdown-item ${!notification.is_read ? 'unread' : ''}`}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className="d-flex justify-content-between align-items-start">
                          <div className="flex-grow-1">
                            <strong>{notification.title || 'Notification'}</strong>
                            <p className="mb-0 small text-muted">
                              {typeof notification.message === 'string' 
                                ? notification.message 
                                : (notification.message?.message || JSON.stringify(notification.message))}
                            </p>
                            <small className="text-muted">
                              {notification.created_at 
                                ? new Date(notification.created_at).toLocaleString()
                                : 'Just now'}
                            </small>
                          </div>
                          <span className={`badge bg-${
                            notification.type === 'success' ? 'success' :
                            notification.type === 'warning' ? 'warning' :
                            notification.type === 'error' ? 'danger' : 'info'
                          } ms-2`}>
                            {notification.type || 'info'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Profile Menu */}
          <div className="topbar-item">
            <button
              className="topbar-profile-btn"
              onClick={() => {
                setShowProfileMenu(!showProfileMenu);
                setShowNotifications(false);
              }}
            >
              {user.profile_image ? (
                <img 
                  src={user.profile_image} 
                  alt={user.name || 'User'} 
                  className="topbar-avatar"
                  onError={(e) => {
                    // Hide image and show icon if image fails to load
                    e.target.style.display = 'none';
                    const icon = e.target.nextSibling;
                    if (icon) icon.style.display = 'inline-block';
                  }}
                  onLoad={(e) => {
                    // Hide icon when image loads successfully
                    const icon = e.target.nextSibling;
                    if (icon) icon.style.display = 'none';
                  }}
                />
              ) : null}
              <i 
                className="bi bi-person-circle" 
                style={{ display: user.profile_image ? 'none' : 'inline-block' }}
              ></i>
              <span className="ms-2">{user.name || 'User'}</span>
              <i className="bi bi-chevron-down ms-2"></i>
            </button>
            {showProfileMenu && (
              <div className="topbar-dropdown profile-dropdown">
                <Link
                  to="/profile"
                  className="topbar-dropdown-item"
                  onClick={() => setShowProfileMenu(false)}
                >
                  <i className="bi bi-person me-2"></i>Profile
                </Link>
                <div className="topbar-dropdown-divider"></div>
                <button
                  className="topbar-dropdown-item text-danger"
                  onClick={handleLogout}
                >
                  <i className="bi bi-box-arrow-right me-2"></i>Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopBar;
