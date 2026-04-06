import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import './AuthPages.css';

const GmailIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
    <path d="M16.364 11.73V21.09h3.819c.904 0 1.636-.732 1.636-1.636V5.457l-5.455 6.273z" fill="#FBBC05"/>
    <path d="M7.636 21.09V11.73L1.636 5.457C.022 6.673 0 8.48 0 8.48v11.973c0 .904.732 1.636 1.636 1.636h6z" fill="#34A853"/>
    <path d="M24 5.457l-5.455 6.273V3.273l2.182-1.636C21.69-.393 24 .76 24 2.783v2.674z" fill="#4285F4"/>
  </svg>
);

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginWithGoogle, user } = useAuth();
  const fromSignup = location.state?.fromSignup;
  const [formData, setFormData] = useState({
    usernameOrEmail: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setGoogleLoading(true);
      setError('');
      const result = await loginWithGoogle(tokenResponse.access_token);
      if (result.success) {
        const roleRoutes = { admin: '/admin', user: '/user', gatekeeper: '/gatekeeper' };
        navigate(roleRoutes[result.user.role] || '/user');
      } else setError(result.error);
      setGoogleLoading(false);
    },
    onError: () => {
      setError('Google sign-in was cancelled or failed');
      setGoogleLoading(false);
    },
  });

  useEffect(() => {
    // Redirect if already logged in
    if (user) {
      const roleRoutes = {
        admin: '/admin',
        user: '/user',
        gatekeeper: '/gatekeeper'
      };
      navigate(roleRoutes[user.role] || '/user');
    }
  }, [user, navigate]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.usernameOrEmail || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);

    const result = await login(formData.usernameOrEmail, formData.password);

    setLoading(false);

    if (result.success) {
      // Redirect based on role
      const roleRoutes = {
        admin: '/admin',
        user: '/user',
        gatekeeper: '/gatekeeper'
      };
      navigate(roleRoutes[result.user.role] || '/user');
    } else {
      setError(result.error || 'Invalid username/email or password');
    }
  };

  return (
    <div className="auth-page-wrap">
      <Navbar showAuthLinks />
      <div className="auth-container">
      <div className="auth-card">
        <h2>Welcome Back</h2>
        <p className="auth-subtitle">Login to your ParkGo account</p>

        {fromSignup && <div className="success-message">Account created successfully! Please log in.</div>}
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="usernameOrEmail">Username or Email *</label>
            <input
              type="text"
              id="usernameOrEmail"
              name="usernameOrEmail"
              value={formData.usernameOrEmail}
              onChange={handleChange}
              required
              placeholder="Enter your username or email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password *</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="Enter your password"
            />
          </div>

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>

          {process.env.REACT_APP_GOOGLE_CLIENT_ID && (
            <>
              <div className="auth-divider">or</div>
              <button
                type="button"
                className="auth-button auth-button-google"
                onClick={() => { setError(''); googleLogin(); }}
                disabled={googleLoading}
              >
                <span className="auth-google-icon"><GmailIcon /></span>
                {googleLoading ? 'Signing in...' : 'Continue with Gmail'}
              </button>
            </>
          )}
        </form>

        <p className="auth-footer">
          Don't have an account? <Link to="/signup">Sign up here</Link>
        </p>
      </div>
    </div>
    </div>
  );
};

export default LoginPage;
