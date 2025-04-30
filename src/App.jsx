import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import Dashboard from './pages/Dashboard'
import StoreRegistration from './pages/StoreRegistration'
import CartManagement from './pages/CartManagement'
import SettingsPage from './pages/SettingsPage'
import CartBillsPage from './pages/CartBillsPage'
import TransactionsPage from './pages/TransactionsPage'
import InventoryPage from './pages/InventoryPage'
import BillingDashboardPage from './pages/BillingDashboardPage'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import AuthenticatedLayout from './components/layout/AuthenticatedLayout'

function App() {
  return (
    <ErrorBoundary>
        <AuthProvider>
              <Routes>
                <Route path="/signin" element={<SignIn />} />
                <Route path="/signup" element={<SignUp />} />
          <Route path="/session/:cartId" element={<BillingDashboardPage />} />
          <Route element={<ProtectedRoute><AuthenticatedLayout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/store-registration" element={<StoreRegistration />} />
            <Route path="/carts" element={<CartManagement />} />
            <Route path="/carts/:cartId/bills" element={<CartBillsPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/signin" replace />} />
              </Routes>
        </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
