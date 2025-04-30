import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { gsap } from 'gsap';
import './CommandPalette.css';

export const CommandPalette = ({ isOpen, onClose }) => {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const commandListRef = useRef(null);
  const paletteRef = useRef(null);
  const overlayRef = useRef(null);

  const getContextualCommands = () => {
    const commonCommands = [
      { id: 'dashboard', icon: '📊', title: 'Go to Dashboard', action: () => navigate('/dashboard') },
      { id: 'inventory', icon: '📦', title: 'Manage Inventory', action: () => navigate('/inventory') },
      { id: 'carts', icon: '🛒', title: 'Manage Carts', action: () => navigate('/carts') },
    ];

    const authCommands = currentUser ? [
      { 
        id: 'signout', 
        icon: '👋', 
        title: 'Sign Out', 
        action: async () => {
          setLoading(true);
          try {
            await signOut(auth);
            navigate('/signin');
          } catch (err) {
            console.error('Sign out error:', err);
          } finally {
            setLoading(false);
          }
        }
      }
    ] : [
      { id: 'signin', icon: '🔑', title: 'Sign In', action: () => navigate('/signin') },
      { id: 'signup', icon: '✨', title: 'Create Account', action: () => navigate('/signup') }
    ];

    const pageSpecificCommands = {
      '/dashboard': [
        { id: 'transactions', icon: '💳', title: 'View Transactions', action: () => navigate('/transactions') },
        { id: 'reports', icon: '📊', title: 'View Reports', action: () => navigate('/reports') }
      ],
      '/inventory': [
        { id: 'add-item', icon: '➕', title: 'Add New Item', action: () => {} },
        { id: 'low-stock', icon: '⚠️', title: 'View Low Stock Items', action: () => {} }
      ],
      '/carts': [
        { id: 'add-cart', icon: '➕', title: 'Add New Cart', action: () => {} },
        { id: 'view-active-carts', icon: '🟢', title: 'View Active Carts', action: () => {} },
      ]
    };

    return [
      ...(pageSpecificCommands[location.pathname] || []),
      ...commonCommands,
      ...authCommands
    ];
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (isOpen && event.key === 'Escape') {
        gsap.to([paletteRef.current, overlayRef.current], {
          opacity: 0,
          y: -20,
          duration: 0.2,
          onComplete: () => {
            setIsVisible(false);
            onClose();
          }
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      gsap.fromTo(overlayRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.3, ease: 'power2.out' }
      );
      gsap.fromTo(paletteRef.current,
        { opacity: 0, y: -20 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', delay: 0.05 }
      );
    } else {
      if (isVisible) {
        gsap.to([paletteRef.current, overlayRef.current], {
          opacity: 0,
          y: -20,
          duration: 0.2,
          ease: 'power1.in',
          onComplete: () => {
            setIsVisible(false);
          }
        });
      }
    }
  }, [isOpen]);

  const commands = getContextualCommands();
  const filteredCommands = commands.filter(cmd => 
    cmd.title.toLowerCase().includes(search.toLowerCase())
  );

  if (!isVisible && !isOpen) return null;

  return (
    <div ref={overlayRef} className="cp-overlay">
      <div ref={paletteRef} className="cp-container">
        {isVisible && (
          <>
            <div className="cp-input-wrapper">
          <input
            autoFocus
            placeholder="Search commands..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
                className="cp-input"
          />
              <kbd className="cp-kbd">ESC</kbd>
        </div>

            <div ref={commandListRef} className="cp-list-container">
          {loading ? (
                <div className="cp-loading-container">
                  <div className="cp-spinner" />
            </div>
          ) : filteredCommands.length > 0 ? (
            filteredCommands.map(cmd => (
              <button
                key={cmd.id}
                onClick={cmd.action}
                    className="cp-command-button"
              >
                    <div className="cp-command-content">
                      <span className="cp-command-icon">{cmd.icon}</span>
                      <span className="cp-command-title">{cmd.title}</span>
                  {cmd.shortcut && (
                        <kbd className="cp-command-shortcut">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </div>
              </button>
            ))
          ) : (
                <div className="cp-no-results">
              No matching commands found
            </div>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
};
