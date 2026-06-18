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
import Settings from "./Settings";

/* ─── Language Dropdown ───────────────────────────── */
function LanguageDropdown({ locale, setLocale }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const languages = [
    { code: "en", label: "English" },
    { code: "zh", label: "中文" },
    { code: "ar", label: "العربية" },
    { code: "vi", label: "Tiếng Việt" },
    { code: "pa", label: "ਪੰਜਾਬੀ" },
    { code: "hi", label: "हिंदी" },
    { code: "el", label: "Ελληνικά" },
    { code: "it", label: "Italiano" },
    { code: "tl", label: "Tagalog" },
    { code: "es", label: "Español" },
    { code: "ta", label: "தமிழ்" },
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
        <div className="absolute top-full right-0 mt-2 w-36 bg-white rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] border border-gray-100 overflow-y-auto max-h-48 z-50 py-1 origin-top-right">
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
  const [tourStep, setTourStep] = useState(null);
  const [tourMuted, setTourMuted] = useState(false);

  const tourSteps = [
    {
      title: "Welcome to SecureSys",
      page: "dashboard",
      text: "Welcome to the SecureSys Admin Dashboard. This is your central command center where you can manage security operations."
    },
    {
      title: "Real-time Analytics",
      page: "dashboard",
      text: "Here, the dashboard shows you visual metrics of active guards, present staff, leaves, and outstanding incident alerts."
    },
    {
      title: "Navigation Sidebar",
      page: "dashboard",
      text: "Use this navigation sidebar to jump between tracking, staff management, rosters, incidents, and circulars."
    },
    {
      title: "Live Operations & Tracking",
      page: "live-ops",
      text: "Under Live Operations, you can monitor active guards in the field. Live GPS coordinates are uploaded automatically and displayed on the interactive map."
    },
    {
      title: "Staff Registry & Locations",
      page: "staff-registry",
      text: "In the Staff Registry, you manage guard profiles, create logins, and define geofenced duty locations with strict radius limits."
    },
    {
      title: "Incident Reports",
      page: "incidents",
      text: "The Incidents panel collects field logs from guards, complete with photo evidence, description, and recorded audio reports."
    },
    {
      title: "Broadcast Announcements",
      page: "circulars",
      text: "Under Circulars, you can write messages that pop up immediately on every active guard's mobile screen."
    },
    {
      title: "System Settings",
      page: "settings",
      text: "Finally, in Settings, you can clear temporary storage photos, delete voice notes, or reset the system database while keeping your admin credentials secure."
    }
  ];

  useEffect(() => {
    if (tourStep === null || !tourSteps[tourStep]) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      return;
    }

    const currentStep = tourSteps[tourStep];
    
    // Auto navigation to matching page
    if (page !== currentStep.page) {
      setPage(currentStep.page);
    }

    // Speech Synthesis
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      if (!tourMuted) {
        // Wait briefly for page to transition before speaking
        setTimeout(() => {
          const utterance = new SpeechSynthesisUtterance(currentStep.text);
          utterance.lang = "en-US";
          window.speechSynthesis.speak(utterance);
        }, 150);
      }
    }
  }, [tourStep, tourMuted]);

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
              <Analytics role={role} />
              {role !== "admin" && <Charts />}
            </>
          )}
          {page === "live-ops" && <LiveOps role={role} />}
          {page === "staff-registry" && role === "admin" && <StaffRegistry />}
          {page === "guard-profiles" && (role === "admin" || role === "supervisor") && <GuardProfiles />}
          {page === "system-users" && role === "admin" && <SystemAccess />}
          {page === "incidents" && <Incidents role={role} />}
          {page === "circulars" && <Circulars role={role} userGuardId={userGuardId} />}
          {page === "correction-requests" && <CorrectionRequests role={role} />}
          {page === "settings" && role === "admin" && <Settings onStartTour={() => setTourStep(0)} />}
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

      {tourStep !== null && tourSteps[tourStep] && (
        <div className="fixed bottom-6 right-6 z-[100001] max-w-sm w-full bg-slate-900 text-white p-5 rounded-2xl shadow-2xl border border-indigo-500 animate-fade-in">
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-full">
              System Tour — Step {tourStep + 1} of {tourSteps.length}
            </span>
            <div className="flex gap-2">
              <button 
                onClick={() => setTourMuted(!tourMuted)} 
                className="text-xs text-slate-400 hover:text-white transition"
                title={tourMuted ? "Unmute Tour" : "Mute Tour"}
              >
                {tourMuted ? "🔇" : "🔊"}
              </button>
              <button 
                onClick={() => setTourStep(null)} 
                className="text-xs text-slate-400 hover:text-white transition font-bold"
              >
                ✕
              </button>
            </div>
          </div>
          <h4 className="font-bold text-base mb-1">{tourSteps[tourStep].title}</h4>
          <p className="text-xs text-slate-300 leading-relaxed mb-4">{tourSteps[tourStep].text}</p>
          <div className="flex justify-between gap-2">
            <button 
              disabled={tourStep === 0} 
              onClick={() => setTourStep(p => Math.max(p - 1, 0))}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold hover:bg-slate-800 disabled:opacity-40"
            >
              ◀ Prev
            </button>
            <div className="flex gap-2">
              <button 
                onClick={() => setTourStep(null)} 
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white"
              >
                Skip Tour
              </button>
              {tourStep < tourSteps.length - 1 ? (
                <button 
                  onClick={() => setTourStep(p => p + 1)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition"
                >
                  Next ▶
                </button>
              ) : (
                <button 
                  onClick={() => {
                    setTourStep(null);
                    showToast("Tour completed! You are ready to go.", "success");
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition"
                >
                  Finish 🎉
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>         >
              {t("acknowledge_alert")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default Dashboard;
