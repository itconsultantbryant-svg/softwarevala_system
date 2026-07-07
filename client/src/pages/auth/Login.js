import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../config/api';
import './Auth.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/health', { timeout: 60000 }).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const loginId = email.trim().toLowerCase();

    try {
      const result = await login(loginId, password);

      if (result && result.success) {
        const userStr = localStorage.getItem('user');
        if (userStr) {
          try {
            const user = JSON.parse(userStr);
            const role = (user.role || '').toString().trim().toLowerCase();
            if (role === 'departmenthead') navigate('/department-dashboard');
            else if (role === 'staff') navigate('/staff-dashboard');
            else navigate('/dashboard');
          } catch {
            navigate('/dashboard');
          }
        } else {
          navigate('/dashboard');
        }
      } else {
        setError(result?.error || 'Login failed. Please try again.');
        setLoading(false);
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="text-center mb-4">
          <div className="auth-logo-container">
            <img
              src="/softwarevala-logo.png"
              alt="Software Vala Liberia Logo"
              className="auth-logo"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'block';
              }}
            />
            <i className="bi bi-building text-primary auth-logo-fallback" style={{ fontSize: '3rem', display: 'none' }} />
          </div>
          <h2 className="mt-2 mb-0">Software Vala Liberia</h2>
          <span className="auth-tagline">The Name of Trust</span>
          <p className="auth-subtitle mb-0">Office Management System</p>
        </div>

        {error && (
          <div className="alert alert-danger mb-3" role="alert">
            <i className="bi bi-shield-exclamation me-2" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="email" className="form-label">
              <i className="bi bi-envelope-fill me-2" />Email or Username
            </label>
            <input
              type="text"
              className="form-control"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              placeholder="admin@softwarevalalib.app"
            />
          </div>

          <div className="mb-3">
            <label htmlFor="password" className="form-label">
              <i className="bi bi-lock-fill me-2" />Password
            </label>
            <div className="input-group">
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-control"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <i className={`bi ${showPassword ? 'bi-eye-slash-fill' : 'bi-eye-fill'}`} />
              </button>
            </div>
          </div>

          <div className="mb-4 d-flex justify-content-between align-items-center">
            <div className="form-check">
              <input type="checkbox" className="form-check-input" id="remember" />
              <label className="form-check-label" htmlFor="remember">Remember me</label>
            </div>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>

          <button type="submit" className="btn btn-primary w-100" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" />
                Signing in...
              </>
            ) : (
              <>
                <i className="bi bi-box-arrow-in-right me-2" />
                Sign In
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <strong>Software Vala Liberia</strong> — Secure office management portal
        </div>
      </div>
    </div>
  );
};

export default Login;
