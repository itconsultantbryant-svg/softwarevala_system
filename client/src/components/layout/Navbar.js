import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../config/api';
import { getSocket } from '../../config/socket';
import './Navbar.css';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUnreadCount();
      fetchNotifications();

      // Request notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }

      // Listen for real-time notifications via WebSocket
      const socket = getSocket();
      if (socket) {
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
              icon: '/softwarevala-logo.png'
            });
          }
        };

        socket.on('notification', handleNotification);

        return () => {
          socket.off('notification', handleNotification);
        };
      }
    }
  }, [user]);

  const fetchUnreadCount = async () => {
    try {
      const response = await api.get('/notifications/unread-count');
      setUnreadCount(response.data.count);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/notifications?limit=10');
      setNotifications(response.data.notifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const handleLogout = () => {
    logout();
    // Use window.location to ensure proper navigation and avoid 404 errors
    window.location.href = '/login';
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

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      fetchUnreadCount();
      fetchNotifications();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const isActive = (path) => location.pathname === path;

  const getNavLinks = () => {
    const links = [
      { path: '/dashboard', label: 'Dashboard', icon: 'bi-house-door', roles: ['Admin', 'Staff', 'Instructor', 'Student', 'Client', 'Partner'] }
    ];

    if (user?.role === 'Admin') {
      links.push(
        { path: '/staff', label: 'Staff', icon: 'bi-people', roles: ['Admin'] },
        { path: '/clients', label: 'Clients', icon: 'bi-person-badge', roles: ['Admin', 'Staff', 'DepartmentHead'] },
        { path: '/partners', label: 'Partners', icon: 'bi-handshake', roles: ['Admin'] },
        // { path: '/academy', label: 'Academy', icon: 'bi-book', roles: ['Admin', 'Instructor', 'Student'] },
        { path: '/reports', label: 'Reports', icon: 'bi-file-text', roles: ['Admin', 'Staff'] }
      );
    } else if (user?.role === 'Staff') {
      links.push(
        { path: '/clients', label: 'Clients', icon: 'bi-person-badge', roles: ['Admin', 'Staff', 'DepartmentHead'] },
        { path: '/reports', label: 'Reports', icon: 'bi-file-text', roles: ['Admin', 'Staff'] }
      );
    } else if (user?.role === 'DepartmentHead') {
      links.push(
        { path: '/clients', label: 'Clients', icon: 'bi-person-badge', roles: ['Admin', 'Staff', 'DepartmentHead'] },
        { path: '/reports', label: 'Reports', icon: 'bi-file-text', roles: ['Admin', 'Staff', 'DepartmentHead'] }
      );
    } else if (user?.role === 'Instructor') {
      // Academy disabled
      // links.push({ path: '/academy', label: 'Academy', icon: 'bi-book', roles: ['Admin', 'Instructor', 'Student'] });
    } else if (user?.role === 'Student') {
      // Academy disabled
      // links.push({ path: '/academy', label: 'Academy', icon: 'bi-book', roles: ['Admin', 'Instructor', 'Student'] });
    }

    return links.filter(link => link.roles.includes(user?.role));
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark fixed-top">
      <div className="container-fluid">
        <Link className="navbar-brand" to="/dashboard">
          <i className="bi bi-building me-2"></i>
          Software Vala Liberia
        </Link>
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav me-auto">
            {getNavLinks().map((link) => (
              <li key={link.path} className="nav-item">
                <Link
                  className={`nav-link ${isActive(link.path) ? 'active' : ''}`}
                  to={link.path}
                >
                  <i className={`bi ${link.icon} me-1`}></i>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="navbar-nav">
            {/* Notifications */}
            <li className="nav-item dropdown">
              <button
                className="btn btn-link nav-link position-relative"
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <i className="bi bi-bell"></i>
                {unreadCount > 0 && (
                  <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
                    {unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="dropdown-menu dropdown-menu-end notification-dropdown show">
                  <div className="d-flex justify-content-between align-items-center p-2 border-bottom">
                    <h6 className="mb-0">Notifications</h6>
                    {unreadCount > 0 && (
                      <button className="btn btn-sm btn-link" onClick={markAllAsRead}>
                        Mark all as read
                      </button>
                    )}
                  </div>
                  <div className="notification-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <div className="p-3 text-center text-muted">No notifications</div>
                    ) : (
                      notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`dropdown-item ${!notification.is_read ? 'bg-light' : ''}`}
                          onClick={() => {
                            if (!notification.is_read) markAsRead(notification.id);
                            if (notification.link) navigate(notification.link);
                            setShowNotifications(false);
                          }}
                        >
                          <div className="d-flex justify-content-between">
                          <div>
                            <strong>{notification.title || 'Notification'}</strong>
                            <p className="mb-0 small">
                              {typeof notification.message === 'string' 
                                ? notification.message 
                                : (notification.message?.message || JSON.stringify(notification.message))}
                            </p>
                          </div>
                            <span className={`badge bg-${notification.type === 'success' ? 'success' : notification.type === 'warning' ? 'warning' : 'info'}`}>
                              {notification.type}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </li>
            {/* Profile */}
            <li className="nav-item dropdown">
              <button
                className="btn btn-link nav-link dropdown-toggle"
                data-bs-toggle="dropdown"
              >
                <i className="bi bi-person-circle me-1"></i>
                {user?.name || 'User'}
              </button>
              <ul className="dropdown-menu dropdown-menu-end">
                <li>
                  <Link className="dropdown-item" to="/profile">
                    <i className="bi bi-person me-2"></i>Profile
                  </Link>
                </li>
                <li><hr className="dropdown-divider" /></li>
                <li>
                  <button className="dropdown-item" onClick={handleLogout}>
                    <i className="bi bi-box-arrow-right me-2"></i>Logout
                  </button>
                </li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

