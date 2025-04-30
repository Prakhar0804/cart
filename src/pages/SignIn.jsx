import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';
import './SignIn.css';

const SignIn = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const formRef = useRef(null);

  useEffect(() => {
    gsap.fromTo(formRef.current,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
    );
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, formData.email, formData.password);
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid email or password');
      console.error('Sign in error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signin-page">
      <div ref={formRef} className="signin-form-container" style={{ opacity: 0 }}>
        <div className="signin-card">
          <div className="signin-header">
            <h1 className="signin-title">
              Welcome back
            </h1>
            <p className="signin-subtitle">
              Enter your credentials to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="signin-form">
            <div>
              <input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="signin-input"
                required
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="Password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="signin-input"
                required
              />
            </div>
            {error && (
              <div className="signin-error">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="button button-primary signin-button"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="signin-footer">
            <Link
              to="/signup"
              className="signin-link"
            >
              Don't have an account? Create one
            </Link>
          </div>

          {/* --- TEMPORARY TEST LINK --- */}
          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.9em' }}>
            <p>-- For Testing Only --</p>
            <Link to="/session/TEST_CART_ID">Test Billing Dashboard</Link>
            <p>(Replace TEST_CART_ID with a real ID in the URL)</p>
          </div>
          {/* --- END TEMPORARY TEST LINK --- */}

        </div>
      </div>
    </div>
  );
};

export default SignIn;