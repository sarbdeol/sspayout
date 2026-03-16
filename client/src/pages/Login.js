import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const user = await login(username, password);
      if (user.role === 'superadmin') navigate('/admin/dashboard');
      else navigate('/merchant/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img src="/sspaylogo.png" alt="SSPay" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'contain' }} />

          <div>
            <div className="login-title">SSPay Gateway</div>
            <div className="login-subtitle">Management System</div>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-control" type="text" placeholder="Enter username"
              value={username} onChange={e => setUsername(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-control" type="password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> Signing in...</> : 'Sign In'}
          </button>
        </form>
        
      </div>
    </div>
  );
}