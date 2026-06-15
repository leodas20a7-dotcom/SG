import { useState, useEffect, useRef } from "react";
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
import { useLanguage } from "./LanguageContext";

/* ─── Language Dropdown ───────────────────────────── */
function LanguageDropdown({ locale, setLocale }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const languages = [
    { code: "en", label: "English" },
    { code: "hi", label: "हिंदी" },
    { code: "ta", label: "தமிழ்" },
    { code: "te", label: "తెలుగు" },
    { code: "kn", label: "ಕನ್ನಡ" },
  ];

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative flex items-center" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 transition shadow-sm shrink-0 font-bold text-xs md:text-sm"
        title="Change Language"
      >
        {locale.toUpperCase() === 'EN' ? 'EN' : locale.toUpperCase()}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-36 bg-white rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] border border-gray-100 overflow-hidden z-50 py-1 origin-top-right">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setLocale(lang.code);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                locale === lang.code
                  ? "bg-blue-50 text-blue-700 font-bold border-l-2 border-blue-600"
                  : "text-gray-700 hover:bg-gray-50 font-medium border-l-2 border-transparent"
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Dashboard({ role, userGuardId }) {

  const { t, locale, setLocale } = useLanguage();
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sosAlert, setSosAlert] = useState(null);
  const { showToast, ToastContainer } = useToast();

  useEffect(() => {
    if (!role) return;
    const currentRole = role.toLowerCase();
    if (currentRole !== "admin" && currentRole !== "supervisor") return;

    // Fetch active (unacknowledged) SOS alerts from the notifications table
    const fetchActiveSos = async () => {
      try {
        const { data } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_role", currentRole)
          .eq("is_read", false)
          .like("title", "%SOS%")
          .order("created_at", { ascending: false })
          .limit(1);

        if (data && data.length > 0) {
          setSosAlert(data[0]);
        }
      } catch (err) {
        console.error("Error fetching active SOS:", err);
      }
    };
    fetchActiveSos();

    const uniqueId = Math.random().toString(36).substring(7);
    const channel = supabase
      .channel(`admin-sos-alerts-${uniqueId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const newNotif = payload.new;
          if (
            (newNotif.user_role === "admin" || newNotif.user_role === "supervisor") &&
            newNotif.title?.includes("SOS") &&
            !newNotif.is_read
          ) {
            setSosAlert(newNotif);
          }
        }
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [role]);

  async function acknowledgeSos() {
    if (!sosAlert) return;
    try {
      // Persist acknowledgment status by marking is_read as true
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", sosAlert.id);
    } catch (err) {
      console.error("Failed to update SOS status in DB:", err);
    } finally {
      setSosAlert(null);
    }
  }

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
      <div className="flex h-screen overflow-hidden bg-slate-50/50">
        <Sidebar role={role} page={page} onNavigate={setPage} onLogout={handleLogout} isOpen={sidebarOpen} onOpen={() => setSidebarOpen(true)} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 p-4 md:p-8 overflow-y-auto h-full">
          <div className="glass-card rounded-2xl p-4 md:p-6 mb-8 relative z-50">
            <div className="flex justify-between items-center gap-3">
              <div className="flex items-center gap-3">
                {/* Mobile hamburger - inside the card, aligned with title */}
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition shrink-0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <div>
                  <h1 className="text-xl md:text-3xl font-bold text-gray-800 capitalize leading-tight">{t(page)}</h1>
                  <p className="text-xs md:text-base text-gray-500 mt-0.5">
                    {t("logged_in_as")}: <span className="font-medium capitalize text-blue-600">{role || "user"}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center shrink-0 gap-2 md:gap-3">
                <LanguageDropdown locale={locale} setLocale={setLocale} />
                <Notifications role={role} onNavigate={setPage} />
                <button
                  onClick={handleLogout}
                  className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-red-50 text-red-650 hover:bg-red-100 transition shadow-sm"
                  title={t("logout")}
                >
                  <span className="text-base md:text-lg">🚪</span>
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
          {page === "circulars" && <Circulars role={role} userGuardId={userGuardId} />}
          {page === "correction-requests" && <CorrectionRequests role={role} />}
        </div>
      </div>

      {sosAlert && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-md border-4 border-red-500 shadow-2xl text-center relative overflow-hidden animate-bounce-short">
            <div className="absolute inset-0 bg-red-50/20 animate-pulse pointer-events-none" />
            
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-red-100 flex items-center justify-center text-4xl shadow-md text-red-650 animate-bounce">
              🚨
            </div>
            
            <h2 className="text-xl md:text-2xl font-bold text-red-650 mb-3 tracking-wide uppercase">{t("sos_panic_alert")}</h2>
            
            <div className="bg-red-50/70 border border-red-100 rounded-2xl p-5 mb-6 text-left space-y-3 leading-relaxed">
              <p className="text-gray-700 text-sm font-semibold">{sosAlert.message}</p>
              <p className="text-[11px] text-red-500 font-bold uppercase tracking-wider">
                {t("received")}: {new Date(sosAlert.created_at || Date.now()).toLocaleTimeString()}
              </p>
            </div>

            <button
              type="button"
              onClick={acknowledgeSos}
              className="w-full py-3.5 bg-red-600 hover:bg-red-750 text-white font-bold rounded-xl transition text-sm shadow-lg shadow-red-200"
            >
              {t("acknowledge_alert")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default Dashboard;
