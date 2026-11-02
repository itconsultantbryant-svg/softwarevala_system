import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../config/api';
import { useAuth } from '../../hooks/useAuth';

export default function RequiredPasswordChange() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { updateUser } = useAuth();
  const navigate = useNavigate();
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (newPassword !== confirmPassword) return setError('The new password and confirmation do not match.');
    setSaving(true);
    try {
      const res = await api.post('/auth/change-password', { currentPassword, newPassword });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      updateUser(res.data.user);
      navigate('/agent/dashboard', { replace: true });
    } catch (err) { setError(err.response?.data?.error || 'Unable to change password.'); }
    finally { setSaving(false); }
  };
  return <main className="container py-5" style={{ maxWidth: 560 }}>
    <div className="card shadow-sm"><div className="card-body p-4">
      <h1 className="h4">Create your secure password</h1>
      <p className="text-muted">For your protection, you must replace the temporary password before opening the agent portal.</p>
      {error && <div className="alert alert-danger">{error}</div>}
      <form onSubmit={submit} className="d-grid gap-3">
        <input className="form-control" type="password" required placeholder="Temporary password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        <input className="form-control" type="password" required minLength="8" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <input className="form-control" type="password" required minLength="8" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        <small className="text-muted">Use at least 8 characters with uppercase, lowercase, and a number.</small>
        <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save password and continue'}</button>
      </form>
    </div></div>
  </main>;
}
