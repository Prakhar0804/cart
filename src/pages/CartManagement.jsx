import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { getAuth, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import './CartManagement.css';

const CartManagement = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [carts, setCarts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingCart, setIsAddingCart] = useState(false);
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [storeId, setStoreId] = useState(null);
  const [manualCartId, setManualCartId] = useState('');
  const scannerRef = useRef(null);
  const manualInputRef = useRef(null);

  const [showReauthModal, setShowReauthModal] = useState(false);
  const [cartToDeactivate, setCartToDeactivate] = useState(null);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthError, setReauthError] = useState('');
  const [isReauthenticating, setIsReauthenticating] = useState(false);

  const qrCodeScannerId = "html5-qrcode-reader";
  const auth = getAuth();

  useEffect(() => {
    if (currentUser) {
      setStoreId(currentUser.uid);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!storeId) {
        setIsLoading(false);
        return;
    }

    setIsLoading(true);
    setError('');

    const cartsRef = collection(db, 'carts');
    const q = query(cartsRef, where('storeId', '==', storeId), where('status', '==', 'available'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedCarts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCarts(fetchedCarts);
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching carts with listener:", err);
      setError('Failed to load carts in real-time. Please try again.');
      setIsLoading(false);
    });

    return () => unsubscribe();

  }, [storeId]);

  useEffect(() => {
    let html5QrcodeScannerInstance = null;

    if (showScanner) {
      const scannerElement = document.getElementById(qrCodeScannerId);
      if (!scannerElement) {
        console.error(`Element with id ${qrCodeScannerId} not found. This should not happen.`);
        return;
      }

      if (!scannerRef.current) {
        html5QrcodeScannerInstance = new Html5QrcodeScanner(
          qrCodeScannerId,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            supportedScanTypes: [],
            rememberLastUsedCamera: true,
            showTorchButtonIfSupported: true,
          },
          false
        );

        scannerRef.current = html5QrcodeScannerInstance;
        html5QrcodeScannerInstance.render(handleScanSuccess, handleScanFailure);
      }
    } else {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(error => {
          console.error("Failed to clear html5QrcodeScanner.", error);
        });
        scannerRef.current = null;
      }
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.getState().then(state => {
          if (state === 'SCANNING' || state === 'PAUSED') {
            scannerRef.current.clear().catch(error => {
              console.error("Failed to clear html5QrcodeScanner on cleanup.", error);
            });
          }
          scannerRef.current = null;
        }).catch(err => {
          console.error("Error getting scanner state on cleanup", err);
          if (scannerRef.current?.clear) {
            scannerRef.current.clear().catch(clearErr => {
              console.error("Failed to clear html5QrcodeScanner on cleanup (fallback).", clearErr);
            });
          }
          scannerRef.current = null;
        });
      }
    };
  }, [showScanner]);

  const addCartById = async (cartId) => {
    setError('');
    if (!cartId || !cartId.trim()) {
      setError("Cart ID cannot be empty.");
      return;
    }
    const trimmedCartId = cartId.trim();

    const existingCart = carts.find(cart => cart.id === trimmedCartId);
    if (existingCart) {
       setError(`Cart with ID ${trimmedCartId} already exists or is currently active/available.`);
       return;
    }

    setIsAddingCart(true);
    try {
      // First validate the cartId format (you can add more validation if needed)
      if (!/^[a-zA-Z0-9-_]+$/.test(trimmedCartId)) {
        throw new Error('Cart ID can only contain letters, numbers, hyphens and underscores');
      }
      
      const newCartRef = doc(db, 'carts', trimmedCartId);
      
      const cartData = {
          cartId: trimmedCartId, // Primary identifier
          cartDisplayId: trimmedCartId, // For display purposes
          storeId: currentUser.uid,
          status: 'available',
          addedAt: serverTimestamp(),
          lastActivity: serverTimestamp()
      };

      await setDoc(newCartRef, cartData);

      setManualCartId('');
      console.log(`Cart ${trimmedCartId} added successfully.`);

    } catch (err) {
      console.error("Error adding cart:", err);
      setError(`Failed to add cart ${trimmedCartId}. Error: ${err.message}`);
    } finally {
       setIsAddingCart(false);
    }
  };

  const handleScanSuccess = (decodedText, decodedResult) => {
    console.log(`Scan result: ${decodedText}`, decodedResult);
    setShowScanner(false);
    addCartById(decodedText);
  };

  const handleScanFailure = (error) => {
    // handle scan failure, usually better to ignore and keep scanning.
    // console.warn(`QR error = ${error}`);
    // Optionally set an error state if needed, but often not user-facing
    // setError("QR Scanning error. Please try again or ensure camera permissions.");
  };

  const handleManualAdd = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addCartById(manualCartId);
    }
  };

  const initiateDeactivation = (cartDocId, cartIdentifier) => {
    setCartToDeactivate({ id: cartDocId, identifier: cartIdentifier });
    setReauthPassword('');
    setReauthError('');
    setShowReauthModal(true);
  };

  const handleReauthentication = async (event) => {
    event.preventDefault();
    if (!cartToDeactivate || !currentUser?.email || !reauthPassword) {
      setReauthError('An unexpected error occurred. Please close and try again.');
      return;
    }

    setReauthError('');
    setIsReauthenticating(true);

    const credential = EmailAuthProvider.credential(currentUser.email, reauthPassword);

    try {
      await reauthenticateWithCredential(auth.currentUser, credential);
      setShowReauthModal(false);
      await performCartDeactivation(cartToDeactivate.id, cartToDeactivate.identifier);
    } catch (error) {
      console.error("Re-authentication failed:", error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-mismatch' || error.code === 'auth/invalid-credential') {
        setReauthError('Incorrect password. Please try again.');
      } else {
        setReauthError('Re-authentication failed. Please try again later.');
      }
    } finally {
      setIsReauthenticating(false);
      setReauthPassword('');
    }
  };

  const performCartDeactivation = async (cartDocId, cartIdentifier) => {
     setError('');
     setIsLoading(true);
     try {
       const cartRef = doc(db, 'carts', cartDocId);
       await updateDoc(cartRef, {
         status: 'inactive',
         deactivatedAt: serverTimestamp()
       });

       setCarts(prevCarts => prevCarts.filter(cart => cart.id !== cartDocId));

     } catch (err) {
        console.error("Error deactivating cart:", err);
        setError(`Failed to deactivate cart ${cartIdentifier}. Please try again.`);
     } finally {
        setIsLoading(false);
        setCartToDeactivate(null);
     }
  };

  const renderReauthModal = () => {
    if (!showReauthModal || !cartToDeactivate) return null;

    return (
      <div className="modal-backdrop">
        <div className="modal-content">
          <h2>Confirm Deactivation</h2>
          <p>Please enter your password to deactivate cart: <strong>{cartToDeactivate.identifier}</strong></p>
          <form onSubmit={handleReauthentication}>
            <div className="form-group">
              <label htmlFor="reauthPassword">Password:</label>
              <input
                type="password"
                id="reauthPassword"
                value={reauthPassword}
                onChange={(e) => setReauthPassword(e.target.value)}
                required
                className="modal-input"
              />
            </div>
            {reauthError && <p className="error-message modal-error">{reauthError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setShowReauthModal(false)}
                className="button button-secondary"
                disabled={isReauthenticating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-danger"
                disabled={isReauthenticating || !reauthPassword}
              >
                {isReauthenticating ? 'Verifying...' : 'Confirm Deactivate'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="cart-management-page">
      <div className="cart-management-container">
        <h1 className="cart-management-title">Manage Carts</h1>

        {error && <p className="error-message">{error}</p>}

        <div className="card cart-action-card">
           <button
             onClick={() => {
               setShowScanner(!showScanner);
               if (showScanner && manualInputRef.current) {
                 manualInputRef.current.focus();
               }
             }}
             className="button button-primary add-cart-button"
             disabled={isLoading || isAddingCart}
           >
             {showScanner ? 'Cancel Scan' : 'Scan Cart QR Code'}
           </button>

           <div className={`qr-scanner-section ${!showScanner ? 'hidden' : ''}`}>
             <p className="scanner-instruction">Point camera at the QR code.</p>
             <div id={qrCodeScannerId} className="qr-reader-element"></div>
           </div>

           {!showScanner && (
             <div className="manual-add-section">
               <label htmlFor="manualCartIdInput" className="manual-add-label">
                 Or Scan/Enter Cart ID:
               </label>
               <div className="manual-add-input-group">
                 <input
                   ref={manualInputRef}
                   id="manualCartIdInput"
                   type="text"
                   value={manualCartId}
                   onChange={(e) => setManualCartId(e.target.value)}
                   onKeyDown={handleManualAdd}
                   placeholder="Scan barcode or type ID here"
                   className="manual-add-input"
                   disabled={isAddingCart}
                 />
                 <button
                   onClick={() => addCartById(manualCartId)}
                   className="button button-secondary manual-add-button"
                   disabled={isLoading || isAddingCart || !manualCartId.trim()}
                 >
                   {isAddingCart ? 'Adding...' : 'Add'}
                 </button>
               </div>
             </div>
           )}
        </div>

        <div className="card cart-list-card">
          <h2 className="card-title">Active Carts ({carts.length})</h2>
          {isLoading ? (
            <p>Loading carts...</p>
          ) : carts.length === 0 ? (
            <p>No active carts found. Add carts using the options above.</p>
          ) : (
            <ul className="cart-list">
              {carts.map(cart => (
                <li key={cart.id} className="cart-list-item">
                  <span className="cart-identifier">Cart ID: {cart.id}</span>
                  <div className="cart-actions">
                    <button
                      onClick={() => navigate(`/carts/${cart.id}/bills`)}
                      className="button button-info button-small"
                      disabled={isLoading || isAddingCart || isReauthenticating}
                      title="View Bills"
                    >
                      View Bills
                    </button>
                    <button
                      onClick={() => initiateDeactivation(cart.id, cart.id)}
                      className="button button-danger button-small"
                      disabled={isLoading || isAddingCart || isReauthenticating}
                      title="Deactivate Cart"
                    >
                      Deactivate
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>
      {renderReauthModal()}
    </div>
  );
};

export default CartManagement;