import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import './CartBillsPage.css'; // Create this CSS file later

const CartBillsPage = () => {
  const { cartId } = useParams(); // Get cartId from URL
  const { currentUser } = useAuth();
  const [bills, setBills] = useState([]);
  const [cartDetails, setCartDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUser || !cartId) return;

    const fetchCartAndBills = async () => {
      setIsLoading(true);
      setError('');
      try {
        // 1. Fetch Cart Details (to verify ownership and display info)
        const cartRef = doc(db, 'carts', cartId);
        const cartSnap = await getDoc(cartRef);

        if (!cartSnap.exists()) {
          throw new Error('Cart not found.');
        }

        const fetchedCartData = cartSnap.data();

        // Security check: Ensure the fetched cart belongs to the current user
        if (fetchedCartData.storeId !== currentUser.uid) {
           throw new Error('You do not have permission to view bills for this cart.');
        }
        setCartDetails(fetchedCartData);

        // 2. Fetch Bills for this Cart
        const billsRef = collection(db, 'bills');
        // Query for bills matching the cart's Firestore ID, ordered by creation time
        const q = query(
          billsRef, 
          where('cartFirestoreId', '==', cartId), 
          orderBy('createdAt', 'desc') // Show newest bills first
        );
        
        const querySnapshot = await getDocs(q);
        const fetchedBills = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setBills(fetchedBills);

      } catch (err) {
        console.error("Error fetching cart bills:", err);
        setError(err.message || 'Failed to load bill information.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCartAndBills();
  }, [cartId, currentUser]);

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleString(); // Convert Firestore Timestamp to readable string
  };

  return (
    <div className="cart-bills-page">
      <div className="cart-bills-container">
        {/* Back Link */}
        <Link to="/carts" className="back-link">&larr; Back to Cart Management</Link>

        {/* Title */}
        <h1 className="cart-bills-title">
           Bills for Cart: {cartDetails ? cartDetails.cartId : 'Loading...'}
        </h1>

        {error && <p className="error-message">Error: {error}</p>}

        {isLoading ? (
          <p>Loading bills...</p>
        ) : (
          <div className="bills-list-container card">
            {bills.length === 0 ? (
              <p>No bills found for this cart.</p>
            ) : (
              <table className="bills-table">
                <thead>
                  <tr>
                    <th>Bill Number</th>
                    <th>Date</th>
                    <th>Items</th>
                    <th>Total Amount</th>
                    {/* Add other relevant columns if needed */}
                  </tr>
                </thead>
                <tbody>
                  {bills.map(bill => (
                    <tr key={bill.id}>
                      <td>{bill.billNumber || bill.id}</td>
                      <td>{formatTimestamp(bill.createdAt)}</td>
                      <td>{bill.items?.length || 0}</td>
                      <td>${bill.totalAmount?.toFixed(2) || 'N/A'}</td>
                      {/* Optional: Add a button/link to view bill details */}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CartBillsPage; 