import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import Inscription from './components/auth/Inscription';
import PatientRegistration from './components/auth/PatientRegistration';
import AccountActivation from './components/auth/AccountActivation';
import Agenda from './components/Agenda';
import Announcements from './components/announcements/Announcements';
import Parameters from './components/Parameters';
import Layout from './components/Layout';
import TableauDeBord from './components/TableauDeBord';
import AppointmentRequests from './components/AppointmentRequests';

const AuthLoadingScreen = () => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500">{t('common.loading')}</p>
    </div>
  );
};

// Protected Route component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, authInitialized } = useSelector((state) => state.user);
  if (!authInitialized) return <AuthLoadingScreen />;
  return isAuthenticated ? children : <Navigate to="/inscription" replace />;
};

// Doctor-only Route component
const DoctorRoute = ({ children }) => {
  const { role, authInitialized } = useSelector((state) => state.user);
  if (!authInitialized) return <AuthLoadingScreen />;
  return (role || '').toLowerCase() === 'doctor' ? children : <Navigate to="/agenda" replace />;
};

// Public Route component (redirects to default workspace if already authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, role, authInitialized } = useSelector((state) => state.user);
  if (!authInitialized) return <AuthLoadingScreen />;
  if (isAuthenticated) {
    const target = (role || '').toLowerCase() === 'doctor' ? '/tableau-de-bord' : '/agenda';
    return <Navigate to={target} replace />;
  }
  return children;
};

// Default Home Redirect based on role
const RoleHomeRedirect = () => {
  const { role } = useSelector((state) => state.user);
  const target = (role || '').toLowerCase() === 'doctor' ? '/tableau-de-bord' : '/agenda';
  return <Navigate to={target} replace />;
};

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/inscription"
        element={
          <PublicRoute>
            <Inscription />
          </PublicRoute>
        }
      />
      <Route
        path="/inscription/patient"
        element={
          <PublicRoute>
            <PatientRegistration />
          </PublicRoute>
        }
      />
      <Route path="/activate" element={<AccountActivation />} />

      {/* Protected Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<RoleHomeRedirect />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="annonces" element={<Announcements />} />
        <Route path="parametres" element={<Parameters />} />
        <Route
          path="tableau-de-bord"
          element={
            <DoctorRoute>
              <TableauDeBord />
            </DoctorRoute>
          }
        />
        <Route
          path="demandes-rdv"
          element={
            <DoctorRoute>
              <AppointmentRequests />
            </DoctorRoute>
          }
        />
      </Route>

      {/* Catch all route */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
