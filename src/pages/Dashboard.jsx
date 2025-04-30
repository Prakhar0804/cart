import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, Timestamp, getAggregateFromServer, sum } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { CommandPalette } from '../components/CommandPalette';
import './Dashboard.css'; // Import the CSS file

// Helper function to format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const Dashboard = () => {
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [loadingStore, setLoadingStore] = useState(true);
  const [storeError, setStoreError] = useState('');
  const [storeData, setStoreData] = useState(null);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // --- State for Transaction Summaries ---
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');
  const [summaryTotals, setSummaryTotals] = useState({
    today: 0,
    week: 0,
    month: 0,
    sixMonths: 0,
    year: 0,
    lifetime: 0,
  });
  // --- End Summary State ---

  useEffect(() => {
    if (!currentUser) {
      console.log("Dashboard: No current user found in effect.");
      setLoadingStore(false);
      setStoreError("User not authenticated.");
      return; 
    }
    console.log("Dashboard: Fetching store data for user:", currentUser.uid);
    const fetchStoreData = async () => {
      setLoadingStore(true);
      setStoreError('');
      try {
        const storeRef = doc(db, 'stores', currentUser.uid);
        const storeDoc = await getDoc(storeRef);
        if (storeDoc.exists()) {
          const data = storeDoc.data();
          console.log("Dashboard: Store data found:", data);
          setStoreData(data);
        } else {
          console.log("Dashboard: Store document does not exist for UID:", currentUser.uid);
          setStoreError('Store data not found. Please complete registration.');
        }
      } catch (err) {
        console.error('Dashboard: Error fetching store data:', err);
        setStoreError('Failed to load store data due to an error.');
      } finally {
        setLoadingStore(false);
      }
    };
    fetchStoreData();

    const handleKeydown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [currentUser]);

  // --- Fetch Transaction Summaries Effect ---
  useEffect(() => {
    if (!currentUser?.uid) {
      setSummaryLoading(false);
      return; 
    }

    const storeId = currentUser.uid;
    const billsRef = collection(db, 'bills');

    // Helper to get start of day
    const getStartOfDay = (date) => {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      return Timestamp.fromDate(start);
    };
    
    // Helper to get start of week (assuming Sunday as start)
    const getStartOfWeek = (date) => {
        const start = new Date(date);
        const day = start.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const diff = start.getDate() - day;
        start.setDate(diff);
        start.setHours(0, 0, 0, 0);
        return Timestamp.fromDate(start);
    };

    const fetchSummaries = async () => {
      setSummaryLoading(true);
      setSummaryError('');
      try {
        const now = new Date();
        const todayStart = getStartOfDay(now);
        const weekStart = getStartOfWeek(now);
        const monthStart = Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth(), 1));
        const sixMonthsAgo = Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()));
        const yearStart = Timestamp.fromDate(new Date(now.getFullYear(), 0, 1));

        const getSum = async (startDate) => {
            const constraints = [where('storeId', '==', storeId)];
            if (startDate) {
                constraints.push(where('createdAt', '>=', startDate));
            }
            const q = query(billsRef, ...constraints);
            const snapshot = await getAggregateFromServer(q, { totalAmount: sum('totalAmount') });
            return snapshot.data().totalAmount ?? 0;
        };

        // Fetch sums concurrently
        const [today, week, month, sixMonths, year, lifetime] = await Promise.all([
          getSum(todayStart),
          getSum(weekStart),
          getSum(monthStart),
          getSum(sixMonthsAgo),
          getSum(yearStart),
          getSum(null) // Lifetime - no start date needed
        ]);

        setSummaryTotals({
          today,
          week,
          month,
          sixMonths,
          year,
          lifetime
        });

      } catch (err) {
        console.error("Dashboard: Error fetching transaction summaries:", err);
        setSummaryError("Failed to load transaction summaries.");
      } finally {
        setSummaryLoading(false);
      }
    };

    fetchSummaries();

  }, [currentUser?.uid]);

  if (loadingStore) {
    return (
      <div className="dashboard-loading-page">
        <div className="dashboard-loading-spinner" />
      </div>
    );
  }

  if (storeError) {
    return (
      <div className="dashboard-error-page">
        <div className="card dashboard-error-card">
          <h2 className="dashboard-error-title">Error Loading Dashboard</h2>
          <p className="dashboard-error-message">{storeError}</p>
          <button
            onClick={() => navigate('/store-registration')}
            className="button button-primary dashboard-error-button"
          >
            {storeError.includes('not found') ? 'Complete Store Setup' : 'Try Again'} 
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="dashboard-page">
        <div className="dashboard-container">
          <header className="dashboard-header">
            <div>
              <h1 className="dashboard-title">
                {storeData?.storeName || 'Dashboard'}
              </h1>
              <p className="dashboard-subtitle">
                {storeData?.storeType}
              </p>
            </div>
            <button
              onClick={() => setIsCommandOpen(true)}
              className="button button-secondary dashboard-command-button"
            >
              <span>Search...</span>
              <kbd className="dashboard-command-kbd">⌘K</kbd>
            </button>
          </header>

          <section className="dashboard-summary-section">
            <h2 className="section-title">Transaction Totals</h2>
            {summaryLoading ? (
              <p>Loading summaries...</p>
            ) : summaryError ? (
              <p className="error-message">{summaryError}</p>
            ) : (
              <div className="summary-cards-grid">
                <SummaryCard label="Today" amount={summaryTotals.today} />
                <SummaryCard label="This Week" amount={summaryTotals.week} />
                <SummaryCard label="This Month" amount={summaryTotals.month} />
                <SummaryCard label="Last 6 Months" amount={summaryTotals.sixMonths} />
                <SummaryCard label="This Year" amount={summaryTotals.year} />
                <SummaryCard label="Lifetime" amount={summaryTotals.lifetime} />
              </div>
            )}
          </section>

          <div className="dashboard-grid">
            <div className="card dashboard-card dashboard-details-card">
              <h2 className="dashboard-card-title">Store Details</h2>
              <div className="dashboard-details-grid">
                <div>
                  <p className="dashboard-details-label">Location</p>
                  <p className="dashboard-details-value">{storeData?.location || '-'}</p>
                </div>
                <div>
                  <p className="dashboard-details-label">Contact</p>
                  <p className="dashboard-details-value">{storeData?.phone || '-'}</p>
                </div>
              </div>
            </div>

            <div className="card dashboard-card">
              <h2 className="dashboard-card-title">Quick Actions</h2>
              <div className="dashboard-quick-actions-list">
                <QuickAction 
                  icon="📦" 
                  label="Manage Inventory" 
                  onClick={() => navigate('/inventory')}
                />
                <QuickAction 
                  icon="💳" 
                  label="View Transactions" 
                  onClick={() => navigate('/transactions')}
                />
                <QuickAction 
                  icon="🛒"
                  label="Manage Carts" 
                  onClick={() => navigate('/carts')}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <CommandPalette 
        isOpen={isCommandOpen} 
        onClose={() => setIsCommandOpen(false)} 
      />
    </>
  );
};

const SummaryCard = ({ label, amount }) => (
  <div className="card summary-card">
    <p className="summary-card-label">{label}</p>
    <p className="summary-card-amount">{formatCurrency(amount)}</p>
  </div>
);

const QuickAction = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="quick-action-button"
  >
    <span className="quick-action-icon">{icon}</span>
    <span className="quick-action-label">{label}</span>
  </button>
);

export default Dashboard;