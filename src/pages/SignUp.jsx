import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import './SignUp.css'; // Import the CSS file

const SignUp = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
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
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError(''); // Clear error before trying
    // Add loading state if needed
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        formData.email, 
        formData.password
      );
      
      // Consider adding user profile data here if needed
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email: formData.email,
        createdAt: new Date().toISOString()
        // Add other default fields like displayName: '' if desired
      });

      navigate('/store-registration');
    } catch (err) {
      // Provide more user-friendly errors if possible
      if (err.code === 'auth/email-already-in-use') {
        setError('This email address is already in use.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters long.');
      } else {
        setError('Failed to create account. Please try again.');
      }
      console.error("Sign up error:", err); // Keep detailed log
    }
    // Add finally block to stop loading state if using one
  };

  return (
    <div className="signup-page">
      <div ref={formRef} className="signup-form-container" style={{ opacity: 0 }}>
        <div className="signup-card">
          <div className="signup-header">
            <h1 className="signup-title">
              Create Account
            </h1>
            <p className="signup-subtitle">
              Join Smart Trolley to manage your store
            </p>
          </div>

          <form onSubmit={handleSubmit} className="signup-form">
            <div>
              <input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="signup-input"
              />
            </div>

            <div>
              <input
                type="password"
                placeholder="Password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                className="signup-input"
              />
            </div>

            <div>
              <input
                type="password"
                placeholder="Confirm Password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
                className="signup-input"
              />
            </div>

            {error && (
              <div className="signup-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="button button-primary signup-button"
              // Add disabled state based on loading state if implemented
            >
              Create Account
            </button>
          </form>

          <div className="signup-footer">
            <Link
              to="/signin"
              className="signup-link"
            >
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUp;