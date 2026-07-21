import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { Spinner } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import SelectCompany from './pages/SelectCompany.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Companies from './pages/Companies.jsx';
import CompanyDetail from './pages/CompanyDetail.jsx';
import Vehicles from './pages/Vehicles.jsx';
import VehicleDetail from './pages/VehicleDetail.jsx';
import Workers from './pages/Workers.jsx';
import Invoices from './pages/Invoices.jsx';
import InvoiceManager from './pages/InvoiceManager.jsx';
import Payments from './pages/Payments.jsx';
import Recurring from './pages/Recurring.jsx';
import DailyIncome from './pages/DailyIncome.jsx';
import Calendar from './pages/Calendar.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const { user, activeTenant, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!user) return <Login />;
  if (!activeTenant) return <SelectCompany />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/companies/:id" element={<CompanyDetail />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/vehicles/:id" element={<VehicleDetail />} />
        <Route path="/workers" element={<Workers />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoice-manager" element={<InvoiceManager />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/daily-income" element={<DailyIncome />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
