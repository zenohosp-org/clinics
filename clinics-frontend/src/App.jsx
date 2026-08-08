import { createBrowserRouter, RouterProvider, createRoutesFromElements, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { ReferenceDataProvider } from "@/context/ReferenceDataContext";
import { FeatureFlagsProvider } from "@/context/FeatureFlagsContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/layout/Layout";
import FocusLayout from "@/components/layout/FocusLayout";
import { lazy, Suspense } from "react";
import Login from "@/pages/Login";
import Unauthorized from "@/pages/Unauthorized";
import SsoCallback from "@/pages/SsoCallback";
import Dashboard from "@/pages/Dashboard";
import DoctorsList from "@/pages/admin/DoctorsList";
import DoctorDetails from "@/pages/admin/DoctorDetails";
import StaffsList from "@/pages/admin/StaffsList";
import Specializations from "@/pages/admin/Specializations";
import Services from "@/pages/admin/Services";
import Patients from "@/pages/patients/Patients";
import PatientDetails from "@/pages/patients/PatientDetails";
import Rooms from "@/pages/rooms/Rooms";
import RoomLogsPage from "@/pages/rooms/RoomLogsPage";
import OPDBilling from "./pages/billing/OPDBilling";
import IPDBilling from "./pages/billing/IPDBilling";
import AmbulanceBilling from "./pages/billing/AmbulanceBilling";
import AppointmentsDashboard from "@/pages/appointments/AppointmentsDashboard";
import ConsultationViewPage from "@/pages/appointments/ConsultationViewPage";
import PrintConsultation from "@/pages/print/PrintConsultation";
import PrintDischargeSummary from "@/pages/print/PrintDischargeSummary";
import Departments from "@/pages/admin/Departments";
import Designations from "@/pages/admin/Designations";
import Admissions from "@/pages/admin/Admissions";
import InfrastructureMapping from "@/pages/ipd/InfrastructureMapping"
import Settings from "@/pages/settings/Settings"
import GeneralSettings from "@/pages/settings/GeneralSettings"
import PatientServices from "@/pages/settings/PatientServices"
import GstRates from "@/pages/settings/GstRates"
import AmbulanceBook from "@/pages/ambulance/AmbulanceBook"
import AmbulanceStatus from "@/pages/ambulance/AmbulanceStatus";
import PackageManager from "@/pages/checkups/PackageManager";
import CheckupBookings from "@/pages/checkups/CheckupBookings";
import CheckupBookingDetail from "@/pages/checkups/CheckupBookingDetail";
import BloodBankStock from "@/pages/blood-bank/BloodBankStock";
import BloodDonors from "@/pages/blood-bank/BloodDonors";
import BiomedicalWasteLog from "@/pages/biomedical-waste/BiomedicalWasteLog";
import BiomedicalWasteHandovers from "@/pages/biomedical-waste/BiomedicalWasteHandovers";
import LabQueue from "@/pages/labs/LabQueue";
import CollectionQueue from "@/pages/labs/CollectionQueue";
import LabReports from "@/pages/labs/LabReports";
import RadiologyQueue from "@/pages/labs/RadiologyQueue";
import DayBook from "@/pages/finance/DayBook";
import Expenses from "@/pages/finance/Expenses";
import Receivables from "@/pages/finance/Receivables";
import TaxReports from "@/pages/finance/TaxReports";
import UiGallery from "@/pages/dev/UiGallery";
import UserProfile from "@/pages/UserProfile";
import GlobalLoader from "@/components/ui/GlobalLoader";

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<Login />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="/sso/callback" element={<SsoCallback />} />
      {import.meta.env.DEV && <Route path="/dev/ui-gallery" element={<UiGallery />} />}
      
      <Route element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin", "doctor", "staff"]}><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        
        {/* Patients */}
        <Route path="patients" element={<Patients />} />
        <Route path="patients/:id" element={<PatientDetails />} />
        
        {/* Settings */}
        <Route path="settings" element={<Navigate to="/settings/general" replace />} />
        <Route path="settings/general" element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin"]}><GeneralSettings /></ProtectedRoute>} />
        <Route path="settings/infrastructure" element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin"]}><Settings /></ProtectedRoute>} />
        <Route path="settings/patient-services" element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin"]}><PatientServices /></ProtectedRoute>} />
        <Route path="settings/gst-rates" element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin"]}><GstRates /></ProtectedRoute>} />
        <Route path="ipd/infrastructure" element={<Navigate to="/settings/infrastructure" replace />} />
        
        {/* Ambulance */}
        <Route path="ambulance" element={<Navigate to="/ambulance/book" replace />} />
        <Route path="ambulance/book" element={<AmbulanceBook />} />
        <Route path="ambulance/status" element={<AmbulanceStatus />} />
        
        {/* Health Checkups */}
        <Route path="checkups/packages" element={<PackageManager />} />
        <Route path="checkups/bookings" element={<CheckupBookings />} />
        <Route path="checkups/bookings/:id" element={<CheckupBookingDetail />} />

        {/* Blood Bank */}
        <Route path="blood-bank" element={<Navigate to="/blood-bank/stock" replace />} />
        <Route path="blood-bank/stock" element={<BloodBankStock />} />
        <Route path="blood-bank/donors" element={<BloodDonors />} />

        {/* Biomedical Waste */}
        <Route path="biomedical-waste" element={<Navigate to="/biomedical-waste/log" replace />} />
        <Route path="biomedical-waste/log" element={<BiomedicalWasteLog />} />
        <Route path="biomedical-waste/handovers" element={<BiomedicalWasteHandovers />} />

        {/* Rooms */}
        <Route path="rooms" element={<Navigate to="/rooms/allocation" replace />} />
        <Route path="rooms/allocation" element={<Rooms />} />
        <Route path="rooms/logs" element={<RoomLogsPage />} />
        
        {/* Billing */}
        <Route path="billing" element={<Navigate to="/billing/opd" replace />} />
        <Route path="billing/opd" element={<OPDBilling />} />
        <Route path="billing/ipd" element={<IPDBilling />} />
        <Route path="billing/ambulance" element={<AmbulanceBilling />} />
        
        {/* Labs — the clinic's own bench, backed by the labs service */}
        <Route path="labs" element={<Navigate to="/labs/queue" replace />} />
        <Route path="labs/queue" element={<LabQueue />} />
        <Route path="labs/collection" element={<CollectionQueue />} />
        <Route path="labs/reports" element={<LabReports />} />
        <Route path="labs/radiology" element={<RadiologyQueue />} />

        {/* Finance — money in, money out, and what's owed.
            Receivables is readable by any clinical user (they chase dues at the
            desk); the rest is admin-only, matching how billing is gated. */}
        <Route path="finance" element={<Navigate to="/finance/day-book" replace />} />
        <Route path="finance/day-book" element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin"]}><DayBook /></ProtectedRoute>} />
        <Route path="finance/expenses" element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin"]}><Expenses /></ProtectedRoute>} />
        <Route path="finance/receivables" element={<Receivables />} />
        <Route path="finance/gst" element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin"]}><TaxReports /></ProtectedRoute>} />

        {/* Appointments */}
        <Route path="appointments" element={<AppointmentsDashboard />} />
        
        {/* Doctors */}
        <Route path="doctors" element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin"]}><DoctorsList /></ProtectedRoute>} />
        <Route path="doctors/:id" element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin", "doctor"]}><DoctorDetails /></ProtectedRoute>} />
        
        {/* Staffs / HR */}
        <Route path="staffs" element={<Navigate to="/staffs/directory" replace />} />
        <Route path="staffs/directory" element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin"]}><StaffsList /></ProtectedRoute>} />
        <Route path="staffs/departments" element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin"]}><Departments /></ProtectedRoute>} />
        <Route path="staffs/designations" element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin"]}><Designations /></ProtectedRoute>} />
        
        {/* Admissions */}
        <Route path="admissions" element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin", "doctor", "staff"]}><Admissions /></ProtectedRoute>} />
        
        {/* Admin Metadata */}
        <Route path="specializations" element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin"]}><Specializations /></ProtectedRoute>} />
        <Route path="services" element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin"]}><Services /></ProtectedRoute>} />
        
        {/* User Profile */}
        <Route path="profile" element={<UserProfile />} />
      </Route>

      {/* Focus-mode routes */}
      <Route element={<ProtectedRoute allowedRoles={["super_admin", "hospital_admin", "doctor", "staff"]}><FocusLayout /></ProtectedRoute>}>
        <Route path="consultation-view" element={<ConsultationViewPage />} />
      </Route>

      {/* Print routes */}
      <Route
        path="/print/appointment/:appointmentId"
        element={
          <ProtectedRoute allowedRoles={["super_admin", "hospital_admin", "doctor", "staff"]}>
            <PrintConsultation />
          </ProtectedRoute>
        }
      />
      <Route
        path="/print/admission/:admissionId/discharge-summary"
        element={
          <ProtectedRoute allowedRoles={["super_admin", "hospital_admin", "doctor", "staff"]}>
            <PrintDischargeSummary />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </>
  )
);

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <FeatureFlagsProvider>
          <NotificationProvider>
            <ReferenceDataProvider>
              <Suspense fallback={<GlobalLoader />}>
                <RouterProvider router={router} />
              </Suspense>
            </ReferenceDataProvider>
          </NotificationProvider>
        </FeatureFlagsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export { App as default };
