import React, { useState, useEffect } from 'react';
import { collection, query, where, Timestamp, getAggregateFromServer, sum } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import './TransactionsPage.css'; // To be created

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const TransactionsPage = () => {
  const { currentUser } = useAuth();
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

  useEffect(() => {
    if (!currentUser?.uid) {
      setSummaryLoading(false);
      return; 
    }

    const storeId = currentUser.uid;
    const billsRef = collection(db, 'bills');

    const getStartOfDay = (date) => {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      return Timestamp.fromDate(start);
    };
    
    const getStartOfWeek = (date) => {
        const start = new Date(date);
        const day = start.getDay();
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

        const [today, week, month, sixMonths, year, lifetime] = await Promise.all([
          getSum(todayStart),
          getSum(weekStart),
          getSum(monthStart),
          getSum(sixMonthsAgo),
          getSum(yearStart),
          getSum(null)
        ]);

        setSummaryTotals({
          today, week, month, sixMonths, year, lifetime
        });

      } catch (err) {
        console.error("TransactionsPage: Error fetching transaction summaries:", err);
        setSummaryError("Failed to load transaction summaries.");
      } finally {
        setSummaryLoading(false);
      }
    };

    fetchSummaries();

  }, [currentUser?.uid]);

  return (
    <div className="transactions-page">
      <div className="transactions-container">
        <h1 className="transactions-title">Transactions</h1>
        
        <section className="transactions-summary-section">
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

        <section className="detailed-transactions-section card">
           <h2 className="section-title">Detailed Transactions</h2>
           <p>Detailed transaction list coming soon.</p>
        </section>
      </div>
    </div>
  );
};

const SummaryCard = ({ label, amount }) => (
  <div className="card summary-card">
    <p className="summary-card-label">{label}</p>
    <p className="summary-card-amount">{formatCurrency(amount)}</p>
  </div>
);

export default TransactionsPage; 