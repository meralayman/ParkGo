import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import { NotifierProvider } from './context/NotifierContext';
import WelcomePage from './pages/WelcomePage';
import BookParkingPage from './pages/BookParkingPage';
import ParkingSlotsPage from './pages/ParkingSlotsPage';
import SmartLayoutDesignerPage from './pages/SmartLayoutDesignerPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import PaymentPage from './pages/PaymentPage';
import PaymentReturnPage from './pages/PaymentReturnPage';
import AdminDashboard from './pages/AdminDashboard';
import UserDashboard from './pages/UserDashboard';
import GatekeeperDashboard from './pages/GatekeeperDashboard';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';

function AppRoutes() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/book-parking" element={<BookParkingPage />} />
        <Route path="/book-parking/alexandria-national-university" element={<ParkingSlotsPage />} />
        <Route path="/lot-designer" element={<SmartLayoutDesignerPage />} />
        <Route path="/smart-layout" element={<Navigate to="/lot-designer" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/payment" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />
        <Route path="/payment/return" element={<ProtectedRoute><PaymentReturnPage /></ProtectedRoute>} />
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute role="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/user/*"
          element={
            <ProtectedRoute role="user">
              <UserDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/gatekeeper/*"
          element={
            <ProtectedRoute role="gatekeeper">
              <GatekeeperDashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  );
}

function App() {
  const appContent = (
    <NotifierProvider>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </NotifierProvider>
  );

  if (GOOGLE_CLIENT_ID) {
    return <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{appContent}</GoogleOAuthProvider>;
  }

  return appContent;
}

export default App;
