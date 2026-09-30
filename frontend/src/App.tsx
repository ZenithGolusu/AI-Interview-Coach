import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

// Layout
import Layout from '@/components/layout/Layout';
import ErrorBoundary from '@/components/common/ErrorBoundary';

// Pages
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Documents from '@/pages/Documents';
import InterviewSetup from '@/pages/InterviewSetup';
import PreInterviewCheck from '@/pages/PreInterviewCheck';
import LiveInterview from '@/pages/LiveInterview';
import Dashboard from '@/pages/Dashboard';
import Report from '@/pages/Report';
import History from '@/pages/History';

// Protected Route Wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Root Redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Protected Routes inside Layout */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/setup" element={<InterviewSetup />} />
            <Route path="/interview-check/:id" element={<PreInterviewCheck />} />
            <Route path="/interview/:id" element={<LiveInterview />} />
            <Route path="/report/:id" element={<Report />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/history" element={<History />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
