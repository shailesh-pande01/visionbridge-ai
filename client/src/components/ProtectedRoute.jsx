import React, { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';

const ProtectedRoute = ({ allowedRoles }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) return <div>Loading...</div>;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // User is logged in but doesn't have the right role
    if (user.role === 'volunteer') {
      return <Navigate to="/volunteer/dashboard" replace />;
    } else {
      return <Navigate to="/user/home" replace />;
    }
  }

  return <Outlet />;
};

export default ProtectedRoute;
