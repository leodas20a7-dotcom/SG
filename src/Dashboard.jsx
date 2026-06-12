import { useState } from "react";
import { supabase } from "./lib/supabase";
import Sidebar from "./Sidebar";
import StaffRegistry from "./StaffRegistry";
import GuardProfiles from "./GuardProfiles";
import LiveOps from "./LiveOps";
import Incidents from "./Incidents";
import Circulars from "./Circulars";
import CorrectionRequests from "./CorrectionRequests";
import SystemAccess from "./SystemAccess";
import Analytics from "./Analytics";
import Charts from "./Charts";
import { useToast } from "./Toast";
import Notifications from "./Notifications";

function Dashboard({ role }) {

  const [page, setPage] = useState("dashboard");
  const { showToast, ToastContainer } = useToast();

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
      window.location.reload();
    } catch {
      showToast("Error signing out. Please try again.", "error");
    }
  }

  return (
    <>
      <ToastContainer />
      <div className="flex min-h-screen pb-16 md:pb-0">
        <Sidebar role={role} page={page} onNavigate={setPage} onLogout={handleLogout} />

        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="glass-card rounded-2xl p-6 mb-8 relative z-50">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-800 capitalize">{page.replace("-", " ")}</h1>
                <p className="text-gray-500 mt-1">
                  Logged in as: <span className="font-medium capitalize text-blue-600">{role || "user"}</span>
                </p>
              </div>
              <div className="flex items-center gap-4 self-start md:self-auto">
                <Notifications role={role} onNavigate={setPage} />
                <button
                  onClick={handleLogout}
                  className="bg-red-500 hover:bg-red-600 text-white px-5 py-3 rounded-xl text-sm font-medium transition flex items-center gap-2 shadow-md"
                >
                  <span>🚪</span> Logout
                </button>
              </div>
            </div>
          </div>

          {page === "dashboard" && (
            <>
              <Analytics />
              <Charts />
            </>
          )}
          {page === "live-ops" && <LiveOps role={role} />}
          {page === "staff-registry" && role === "admin" && <StaffRegistry />}
          {page === "guard-profiles" && (role === "admin" || role === "supervisor") && <GuardProfiles />}
          {page === "system-users" && role === "admin" && <SystemAccess />}
          {page === "incidents" && <Incidents role={role} />}
          {page === "circulars" && <Circulars role={role} />}
          {page === "correction-requests" && <CorrectionRequests role={role} />}
        </div>
      </div>
    </>
  );
}

export default Dashboard;
