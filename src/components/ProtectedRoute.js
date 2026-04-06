import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, role }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role && user.role !== role) {
    // Redirect to appropriate dashboard based on user role
    const roleRoutes = {
      admin: '/admin',
      user: '/user',
      gatekeeper: '/gatekeeper'
    };
    return <Navigate to={roleRoutes[user.role] || '/login'} replace />;
  }

  return children;
};

export default ProtectedRoute;
