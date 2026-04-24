import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, role }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return (
      <Navigate
        to={role === 'admin' ? '/login/admin' : '/login'}
        replace
        state={{ from: location, requireAdmin: role === 'admin' }}
      />
    );
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
