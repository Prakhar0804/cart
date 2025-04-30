import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import './StoreRegistration.css';

const StoreRegistration = () => {
  const [formData, setFormData] = useState({
    storeName: '',
    storeType: '',
    location: '',
    phone: '',
    upiId: ''
  });
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const formRef = useRef(null);
  const progressRef = useRef(null);
  const totalSteps = 5;

  useEffect(() => {
    gsap.fromTo(formRef.current,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
    );
  }, []);

  useEffect(() => {
    gsap.to(progressRef.current, {
      width: `${(step / totalSteps) * 100}%`,
      duration: 0.3,
      ease: 'power2.out'
    });
  }, [step]);

  const handleSubmit = async () => {
    if (!validateCurrentStep()) return;
    
    setLoading(true);
    try {
      await setDoc(doc(db, 'stores', currentUser.uid), {
        ...formData,
        userId: currentUser.uid,
        email: currentUser.email,
        createdAt: new Date().toISOString()
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const validateCurrentStep = () => {
    setError('');
    switch(step) {
      case 1:
        if (!formData.storeName.trim()) {
          setError('Store name is required');
          return false;
        }
        break;
      case 2:
        if (!formData.storeType) {
          setError('Please select a store type');
          return false;
        }
        break;
      case 3:
        if (!formData.location.trim()) {
          setError('Store location is required');
          return false;
        }
        break;
      case 4:
        if (!formData.phone.match(/^\d{10}$/)) {
          setError('Please enter a valid 10-digit phone number');
          return false;
        }
        break;
      case 5:
        if (!formData.upiId.trim() || !formData.upiId.includes('@')) {
          setError('Please enter a valid UPI ID (e.g., yourname@bank)');
          return false;
        }
        break;
    }
    return true;
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      if (step === totalSteps) {
        handleSubmit();
      } else {
        setStep(step + 1);
      }
    }
  };

  const renderStepContent = () => {
    switch(step) {
      case 1:
        return (
          <div className="store-reg-step">
            <h2 className="store-reg-title">
              What's your store name?
            </h2>
            <input
              type="text"
              value={formData.storeName}
              onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
              className="store-reg-input"
              placeholder="Enter store name"
              required
            />
          </div>
        );
      case 2:
        return (
          <div className="store-reg-step">
            <h2 className="store-reg-title">
              What type of store is it?
            </h2>
            <select
              value={formData.storeType}
              onChange={(e) => setFormData({ ...formData, storeType: e.target.value })}
              className="store-reg-select"
              required
            >
              <option value="">Select store type</option>
              <option value="grocery">Grocery Store</option>
              <option value="supermarket">Supermarket</option>
              <option value="convenience">Convenience Store</option>
              <option value="department">Department Store</option>
              <option value="other">Other</option>
            </select>
          </div>
        );
      case 3:
        return (
          <div className="store-reg-step">
            <h2 className="store-reg-title">
              Where is your store located?
            </h2>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="store-reg-input"
              placeholder="Enter store address"
              required
            />
          </div>
        );
      case 4:
        return (
          <div className="store-reg-step">
            <h2 className="store-reg-title">
              What's your contact number?
            </h2>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="store-reg-input"
              placeholder="Enter phone number"
              pattern="[0-9]{10}"
              required
            />
            <p className="store-reg-helper-text">
              Enter a 10-digit phone number
            </p>
          </div>
        );
      case 5:
        return (
          <div className="store-reg-step">
            <h2 className="store-reg-title">
              Enter your UPI ID for receiving payments
            </h2>
            <input
              type="text"
              value={formData.upiId}
              onChange={(e) => setFormData({ ...formData, upiId: e.target.value })}
              className="store-reg-input"
              placeholder="e.g., yourname@bank or phone@upi"
              required
            />
            <p className="store-reg-helper-text">
              Customers will use this to pay.
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="store-reg-page">
      <div ref={formRef} className="store-reg-form-container" style={{ opacity: 0 }}>
        <div className="store-reg-card">
          <div className="store-reg-progress-track">
            <div
              ref={progressRef}
              className="store-reg-progress-bar"
            />
          </div>

          <div className="store-reg-content">
            {renderStepContent()}

            {error && (
              <div className="store-reg-error">
                {error}
              </div>
            )}

            <div className="store-reg-actions">
              <button
                onClick={() => setStep(step - 1)}
                disabled={step === 1 || loading}
                className="button button-secondary store-reg-button-back"
              >
                Back
              </button>
              <button
                onClick={handleNext}
                disabled={loading}
                className="button button-primary store-reg-button-next"
              >
                {loading && (
                  <div className="store-reg-spinner" />
                )}
                {loading ? 'Processing...' : step === totalSteps ? 'Complete Registration' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoreRegistration;