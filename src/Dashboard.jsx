import React, { useState, useEffect, useRef, Suspense } from "react";
import { supabase } from "./lib/supabase";
import Sidebar, { ALL_NAV } from "./Sidebar";
import { useToast } from "./Toast";
import Notifications from "./Notifications";
import { useLanguage } from "./LanguageContext";
import ErrorBoundary from "./ErrorBoundary";
import DarkModeToggle from "./DarkModeToggle";
import ConfirmModal from "./ConfirmModal";

// Lazy-loaded subcomponents for improved performance and initial page load speed
const StaffRegistry = React.lazy(() => import("./StaffRegistry"));
const GuardProfiles = React.lazy(() => import("./GuardProfiles"));
const LiveOps = React.lazy(() => import("./LiveOps"));
const Incidents = React.lazy(() => import("./Incidents"));
const Circulars = React.lazy(() => import("./Circulars"));
const CorrectionRequests = React.lazy(() => import("./CorrectionRequests"));
const SystemAccess = React.lazy(() => import("./SystemAccess"));
const Analytics = React.lazy(() => import("./Analytics"));
const Charts = React.lazy(() => import("./Charts"));
const Settings = React.lazy(() => import("./Settings"));
const Billing = React.lazy(() => import("./Billing"));
const Shifts = React.lazy(() => import("./Shifts"));
const PlatformAdminDashboard = React.lazy(() => import("./PlatformAdminDashboard"));
const TenantManagement = React.lazy(() => import("./TenantManagement"));
const GlobalBroadcasts = React.lazy(() => import("./GlobalBroadcasts"));
const PlatformSettings = React.lazy(() => import("./PlatformSettings"));


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

function Dashboard({ role, userGuardId, companyId, allowedPages, page, onNavigate }) {

  const { t, locale, setLocale } = useLanguage();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Ensure user has permission for the current page, redirect if not
  useEffect(() => {
    const navItem = ALL_NAV.find(n => n.key === page);
    let isAllowed = true;
    
    // Check if page exists and user has role permission
    if (!navItem) {
      isAllowed = false;
    } else if (!navItem.roles.includes(role)) {
      isAllowed = false;
    } 
    // Check specific allowedPages restriction (for sub-admins)
    else if (allowedPages && allowedPages.length > 0 && !allowedPages.includes(page)) {
      isAllowed = false;
    }

    if (!isAllowed) {
      let fallback = "dashboard";
      if (allowedPages && allowedPages.length > 0) {
        fallback = allowedPages[0];
      } else {
        const firstAllowedNav = ALL_NAV.find(n => n.roles.includes(role));
        if (firstAllowedNav) fallback = firstAllowedNav.key;
      }
      onNavigate(fallback);
    }
  }, [page, role, allowedPages, onNavigate]);

  // Sync page state to URL hash
  useEffect(() => {
    if (typeof window !== "undefined") {
      const currentHash = window.location.hash.replace('#', '');
      if (currentHash !== page && page !== "login" && page !== "signup") {
        window.history.pushState(null, '', `#${page}`);
      }
    }
  }, [page]);

  // Listen to browser Back/Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash) {
        onNavigate(hash);
      } else {
        onNavigate(
          allowedPages && allowedPages.length > 0 && !allowedPages.includes("dashboard")
            ? allowedPages[0]
            : "dashboard"
        );
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [allowedPages, onNavigate]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sosAlert, setSosAlert] = useState(null);
  const { showToast, ToastContainer } = useToast();
  const [tourStep, setTourStep] = useState(null);
  const [tourMuted, setTourMuted] = useState(false);
  const [highlightRect, setHighlightRect] = useState(null);
  const [tourSpeed, setTourSpeed] = useState(1.0);
  const [selectedVoiceName, setSelectedVoiceName] = useState("");
  const [voices, setVoices] = useState([]);
  const [showTourSettings, setShowTourSettings] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [globalBroadcast, setGlobalBroadcast] = useState(null);

  useEffect(() => {
    async function fetchCompanyName() {
      if (!companyId) return;
      try {
        const { data } = await supabase.from('companies').select('name').eq('id', companyId).single();
        if (data) setCompanyName(data.name);
      } catch (err) {
        console.error(err);
      }
    }
    fetchCompanyName();

    async function fetchBroadcast() {
      try {
        const { data } = await supabase.from('global_broadcasts').select('*').eq('active', true).order('created_at', { ascending: false }).limit(1);
        if (data && data.length > 0) {
          const broadcast = data[0];
          const dismissedId = localStorage.getItem('sg_dismissed_broadcast');
          if (dismissedId !== broadcast.id) {
            setGlobalBroadcast(broadcast);
          } else {
            setGlobalBroadcast(null);
          }
        } else {
          setGlobalBroadcast(null);
        }
      } catch (err) {
        console.error("Error fetching broadcast", err);
      }
    }
    fetchBroadcast();

    // Setup realtime subscription for broadcasts so it appears instantly for active users
    const broadcastSubscription = supabase.channel('public:global_broadcasts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'global_broadcasts' }, payload => {
        fetchBroadcast();
      }).subscribe();

    return () => {
      supabase.removeChannel(broadcastSubscription);
    };
  }, [companyId]);

  useEffect(() => {
    if (typeof window !== "undefined" && 'speechSynthesis' in window) {
      const loadVoices = () => {
        let list = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith("en"));
        
        const isMale = (voice) => {
          const name = voice.name.toLowerCase();
          return name.includes("male") || 
                 name.includes("david") || 
                 name.includes("mark") || 
                 name.includes("george") || 
                 name.includes("guy") ||
                 name.includes("james") ||
                 name.includes("john") ||
                 name.includes("daniel") ||
                 name.includes("en-us-standard-b") ||
                 name.includes("en-us-standard-c") ||
                 name.includes("en-us-standard-d") ||
                 name.includes("en-us-wavenet-b") ||
                 name.includes("en-us-wavenet-d");
        };
        
        list.sort((a, b) => {
          const aMale = isMale(a);
          const bMale = isMale(b);
          if (aMale && !bMale) return -1;
          if (!aMale && bMale) return 1;
          return 0;
        });

        setVoices(list);
        if (list.length > 0 && !selectedVoiceName) {
          setSelectedVoiceName(list[0].name);
        }
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Background Cleanup: Auto-delete old attendance photos
  useEffect(() => {
    async function cleanupOldPhotos() {
      try {
        // Fetch all files from the guard-photos bucket
        const { data: files, error } = await supabase.storage.from("guard-photos").list("", { limit: 1000 });
        if (error || !files || files.length === 0) return;

        // Threshold: 30 days (30 * 24 * 60 * 60 * 1000 ms)
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const filesToRemove = [];

        files.forEach(file => {
          // skip internal placeholders
          if (file.name === ".emptyFolderPlaceholder") return;
          
          const createdTime = new Date(file.created_at).getTime();
          if (createdTime < thirtyDaysAgo) {
            filesToRemove.push(file.name);
          }
        });

        if (filesToRemove.length > 0) {
          const { error: removeErr } = await supabase.storage.from("guard-photos").remove(filesToRemove);
          if (removeErr) {
            console.error("Storage removal error:", removeErr);
            if (typeof window !== "undefined") {
              window.alert("Storage deletion failed. Error: " + removeErr.message + " (This might be a missing DELETE policy in Supabase Storage)");
            }
          } else {
            console.log(`Cleaned up ${filesToRemove.length} old photos directly from the storage bucket.`);
          }
        }
      } catch (err) {
        console.error("Failed to cleanup old photos:", err);
      }
    }

    // Run cleanup once on dashboard load, and then every 24 hours
    cleanupOldPhotos();
    const intervalId = setInterval(cleanupOldPhotos, 24 * 60 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  const tourSteps = [
    {
      title: "Welcome to SecureSys",
      page: "dashboard",
      text: "Welcome to the SecureSys Admin Dashboard. This is your central command center where you can manage security operations."
    },
    {
      title: "Real-time Analytics",
      page: "dashboard",
      selector: ".tour-analytics-target",
      text: "Here, the dashboard shows you visual metrics of active guards, present staff, leaves, and outstanding incident alerts."
    },
    {
      title: "Navigation Sidebar",
      page: "dashboard",
      selector: ".tour-sidebar-target",
      text: "Use this navigation sidebar to jump between tracking, staff management, rosters, incidents, and circulars."
    },
    {
      title: "Live Operations & Tracking Map",
      page: "live-ops",
      tourView: "map",
      selector: ".tour-liveops-target",
      text: "Under Live Operations, you can monitor active guards in the field. Live GPS coordinates are uploaded automatically and displayed on the interactive map."
    },
    {
      title: "Attendance Logging & Verification",
      page: "live-ops",
      tourView: "checkin",
      selector: ".tour-liveops-target",
      text: "You can also switch to the Attendance panel to view real-time check-in and check-out logs, view captured photos, or print reports."
    },
    {
      title: "Staff Registry - Guard Profiles",
      page: "staff-registry",
      tourTab: "guards",
      selector: ".tour-staff-target",
      text: "In the Staff Registry, you manage guard profiles and credentials so they can log in."
    },
    {
      title: "Staff Registry - Geofenced Locations",
      page: "staff-registry",
      tourTab: "locations",
      selector: ".tour-staff-target",
      text: "Under the Shift Locations tab, you can set site boundaries, coordinates, and geofence radius limits."
    },
    {
      title: "Roster & Shift Planning",
      page: "shifts",
      selector: ".tour-shifts-target",
      text: "The Shifts section allows you to schedule guard assignments, plan rosters, and track coverage across multiple locations."
    },
    {
      title: "System Access Control",
      page: "system-users",
      selector: ".tour-access-target",
      text: "System Access lets you manage sub-admin accounts, set up their credentials, and control their specific dashboard permissions."
    },
    {
      title: "Incident Reports",
      page: "incidents",
      selector: ".tour-incidents-target",
      text: "The Incidents panel collects field logs from guards, complete with photo evidence, description, and recorded audio reports."
    },
    {
      title: "Broadcast Announcements",
      page: "circulars",
      selector: ".tour-circulars-target",
      text: "Under Circulars, you can write messages that pop up immediately on every active guard's mobile screen."
    },
    {
      title: "Leave & Request Management",
      page: "correction-requests",
      selector: ".tour-requests-target",
      text: "In the Requests tab, you can quickly review, approve, or reject time-off requests submitted by your staff."
    },
    {
      title: "Billing & Subscriptions",
      page: "billing",
      selector: ".tour-billing-target",
      text: "The Billing page provides a secure interface to update credit cards, purchase additional guard seats, and check your next invoice date."
    },
    {
      title: "System Settings",
      page: "settings",
      selector: ".tour-settings-target",
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
      onNavigate(currentStep.page);
    }

    // Speech Synthesis
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      if (!tourMuted) {
        // Wait briefly for page to transition before speaking
        setTimeout(() => {
          const utterance = new SpeechSynthesisUtterance(currentStep.text);
          utterance.lang = "en-US";
          utterance.rate = tourSpeed;
          if (selectedVoiceName) {
            const v = voices.find(voice => voice.name === selectedVoiceName);
            if (v) utterance.voice = v;
          }
          window.speechSynthesis.speak(utterance);
        }, 180);
      }
    }
  }, [tourStep, tourMuted, tourSpeed, selectedVoiceName, voices]);

  useEffect(() => {
    if (tourStep === null || !tourSteps[tourStep]) {
      setHighlightRect(null);
      return;
    }

    const updateHighlight = () => {
      const currentStep = tourSteps[tourStep];
      if (!currentStep.selector) {
        setHighlightRect(null);
        return;
      }
      const el = document.querySelector(currentStep.selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        setHighlightRect({
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height
        });
        // Scroll the element into view smoothly if not fully visible
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setHighlightRect(null);
      }
    };

    // Wait slightly for page rendering to complete
    const timer = setTimeout(updateHighlight, 350);

    window.addEventListener("scroll", updateHighlight);
    window.addEventListener("resize", updateHighlight);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", updateHighlight);
      window.removeEventListener("resize", updateHighlight);
    };
  }, [tourStep, page]);

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

  // Auto-cleanup old attendance photos for admins
  useEffect(() => {
    if (!role || (role !== "admin" && role !== "super_admin" && role !== "platform_admin")) return;

    const cleanupOldPhotos = async () => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const isoString = thirtyDaysAgo.toISOString();

        // 1. Fetch old attendance records with photos
        const { data: oldRecords, error: fetchErr } = await supabase
          .from("attendance")
          .select("id, check_in_photo, check_out_photo")
          .lt("check_in_time", isoString)
          .or("check_in_photo.not.is.null,check_out_photo.not.is.null")
          .limit(100);

        if (fetchErr) throw fetchErr;
        if (!oldRecords || oldRecords.length === 0) {
          sessionStorage.setItem("sg_photos_cleaned", "true");
          return;
        }

        const filesToDelete = [];
        const recordIds = [];

        oldRecords.forEach(rec => {
          recordIds.push(rec.id);
          if (rec.check_in_photo) {
            const parts = rec.check_in_photo.split('/');
            filesToDelete.push(parts[parts.length - 1]);
          }
          if (rec.check_out_photo) {
            const parts = rec.check_out_photo.split('/');
            filesToDelete.push(parts[parts.length - 1]);
          }
        });

        if (filesToDelete.length > 0) {
          const { error: delErr } = await supabase.storage.from("guard-photos").remove(filesToDelete);
          if (delErr) console.warn("Background photo cleanup storage error:", delErr);
        }

        if (recordIds.length > 0) {
          const { error: updateErr } = await supabase
            .from("attendance")
            .update({ check_in_photo: null, check_out_photo: null })
            .in("id", recordIds);
          if (updateErr) console.warn("Background photo cleanup DB error:", updateErr);
        }

        sessionStorage.setItem("sg_photos_cleaned", "true");
        console.log(`Auto-cleaned ${filesToDelete.length} old photos in the background.`);
      } catch (err) {
        console.warn("Failed background photo cleanup:", err);
      }
    };

    cleanupOldPhotos();
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

  function handleLogout() {
    setShowLogoutConfirm(true);
  }

  async function confirmLogout() {
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
      <div className="flex h-screen overflow-hidden bg-slate-50/30 relative">
        {/* Ambient decorative glowing blobs */}
        <div className="glowing-orb-1" />
        <div className="glowing-orb-2" />

        <Sidebar role={role} page={page} onNavigate={onNavigate} onLogout={handleLogout} isOpen={sidebarOpen} onOpen={() => setSidebarOpen(true)} onClose={() => setSidebarOpen(false)} allowedPages={allowedPages} />

        {showLogoutConfirm && (
          <ConfirmModal
            message="Are you sure you want to log out?"
            onConfirm={confirmLogout}
            onCancel={() => setShowLogoutConfirm(false)}
          />
        )}

        <div className="flex-1 p-4 md:p-8 overflow-y-auto h-full relative z-10">
          
          {/* Global Broadcast Banner */}
          {globalBroadcast && (
            <div className={`mb-6 rounded-2xl p-4 shadow-sm border animate-fade-in flex items-start gap-4 ${
              globalBroadcast.type === 'critical' ? 'bg-red-600 border-red-700 text-white' :
              globalBroadcast.type === 'warning' ? 'bg-amber-100 border-amber-300 text-amber-900' :
              'bg-blue-600 border-blue-700 text-white'
            }`}>
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl shrink-0">
                {globalBroadcast.type === 'critical' ? '🚨' : globalBroadcast.type === 'warning' ? '⚠️' : '📢'}
              </div>
              <div className="flex-1 pt-0.5">
                <h3 className="font-bold text-sm uppercase tracking-wider opacity-90 mb-1">
                  Global Announcement
                </h3>
                <p className="font-medium text-sm md:text-base leading-relaxed">
                  {globalBroadcast.message}
                </p>
              </div>
              <button 
                onClick={() => {
                  if (globalBroadcast) {
                    localStorage.setItem('sg_dismissed_broadcast', globalBroadcast.id);
                  }
                  setGlobalBroadcast(null);
                }}
                className="opacity-60 hover:opacity-100 transition p-1 rounded hover:bg-black/10"
              >
                ✕
              </button>
            </div>
          )}

          {/* Top Bar Header with Premium Glassmorphism */}
          <div className="glass-header rounded-2xl p-4 md:p-5 mb-8 relative z-40 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
            <div className="flex justify-between items-center gap-2 md:gap-3">
              <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                {/* Mobile hamburger - inside the card, aligned with title */}
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100/80 text-slate-650 hover:bg-blue-50 hover:text-blue-600 transition-all duration-200 shrink-0 hover:scale-105 active:scale-95"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <div className="min-w-0">
                  <h1 
                    className="text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight capitalize leading-tight truncate cursor-pointer"
                    title={t(page)}
                  >
                    {t(page)}
                  </h1>
                  <p 
                    className="text-[11px] md:text-sm text-slate-450 mt-0.5 font-medium truncate cursor-pointer"
                    title={`${companyName ? companyName + " • " : ""}${t("logged_in_as")}: ${role || "user"}`}
                  >
                    {companyName && <span className="font-bold text-slate-600">{companyName} • </span>}
                    {t("logged_in_as")}: <span className="font-semibold capitalize text-indigo-650">{role || "user"}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center shrink-0 gap-1.5 sm:gap-2.5 md:gap-3">
                <DarkModeToggle />
                <LanguageDropdown locale={locale} setLocale={setLocale} />
                <Notifications role={role} companyId={companyId} onNavigate={onNavigate} />
                <button
                  onClick={handleLogout}
                  className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-xl bg-red-50/80 text-red-600 hover:bg-red-500 hover:text-white transition-all duration-300 shadow-sm hover:scale-105 active:scale-95 hover:shadow-md hover:shadow-red-200"
                  title={t("logout")}
                >
                  <span className="text-base md:text-lg">🚪</span>
                </button>
              </div>
            </div>
          </div>

          <ErrorBoundary key={page}>
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center py-20 text-slate-500 font-semibold gap-3 animate-fade-in">
                <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <span>Loading panel...</span>
              </div>
            }>
              {page === "dashboard" && (
                <div className="tour-analytics-target w-full animate-fade-in">
                  {role === "platform_admin" ? (
                    <PlatformAdminDashboard />
                  ) : (
                    <>
                      <Analytics role={role} onNavigate={onNavigate} companyId={companyId} />
                      {role !== "admin" && <Charts companyId={companyId} />}
                    </>
                  )}
                </div>
              )}
              {page === "tenant-management" && role === "platform_admin" && (
                <TenantManagement />
              )}
              {page === "global-broadcasts" && role === "platform_admin" && (
                <GlobalBroadcasts />
              )}
              {page === "live-ops" && (
                <div className="tour-liveops-target w-full">
                  <LiveOps role={role} companyId={companyId} tourView={tourStep !== null && tourSteps[tourStep]?.page === "live-ops" ? tourSteps[tourStep]?.tourView : null} />
                </div>
              )}
              {page === "staff-registry" && (role === "admin" || role === "super_admin") && (
                <div className="tour-staff-target w-full">
                  <StaffRegistry 
                    tourTab={tourStep !== null && tourSteps[tourStep]?.page === "staff-registry" ? tourSteps[tourStep]?.tourTab : null} 
                    onNavigate={onNavigate}
                    companyId={companyId}
                  />
                </div>
              )}
              {page === "guard-profiles" && (role === "admin" || role === "supervisor" || role === "super_admin") && <GuardProfiles companyId={companyId} />}
              {page === "shifts" && (role === "admin" || role === "supervisor" || role === "super_admin") && <div className="tour-shifts-target w-full"><Shifts companyId={companyId} onNavigate={onNavigate} /></div>}
              {page === "system-users" && (role === "admin" || role === "super_admin") && <div className="tour-access-target w-full"><SystemAccess companyId={companyId} /></div>}
              {page === "incidents" && <div className="tour-incidents-target w-full"><Incidents role={role} companyId={companyId} currentGuardId={userGuardId} /></div>}
              {page === "circulars" && <div className="tour-circulars-target w-full"><Circulars role={role} userGuardId={userGuardId} companyId={companyId} /></div>}
              {page === "correction-requests" && <div className="tour-requests-target w-full"><CorrectionRequests role={role} companyId={companyId} guardId={userGuardId} onNavigate={onNavigate} /></div>}
              {page === "billing" && (role === "admin" || role === "super_admin") && <div className="tour-billing-target w-full"><Billing companyId={companyId} /></div>}
              {page === "settings" && (role === "admin" || role === "super_admin") && <Settings onStartTour={() => setTourStep(0)} />}
              {page === "settings" && role === "platform_admin" && <PlatformSettings />}
            </Suspense>
          </ErrorBoundary>
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
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:bottom-6 md:right-6 z-[100001] max-w-none md:max-w-sm w-auto md:w-full bg-slate-900 text-white p-4 md:p-5 rounded-2xl shadow-2xl border border-indigo-500 animate-fade-in">
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-full">
              System Tour — Step {tourStep + 1} of {tourSteps.length}
            </span>
            <div className="flex gap-2.5 items-center">
              <button 
                onClick={() => setShowTourSettings(!showTourSettings)} 
                className="text-xs text-slate-400 hover:text-white transition"
                title="Voice Settings"
              >
                ⚙️
              </button>
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
          {showTourSettings && (
            <div className="bg-slate-800/80 border border-slate-700/50 p-3 rounded-xl mb-3 space-y-2 text-[11px] text-slate-300">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-200">Voice Speed: {tourSpeed}x</span>
                <input 
                  type="range" 
                  min="0.5" 
                  max="2" 
                  step="0.1" 
                  value={tourSpeed} 
                  onChange={e => setTourSpeed(parseFloat(e.target.value))}
                  className="w-24 accent-indigo-500 h-1 rounded-lg"
                />
              </div>
              {voices.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-slate-200">Narrator Voice:</span>
                  <select 
                    value={selectedVoiceName} 
                    onChange={e => setSelectedVoiceName(e.target.value)}
                    className="w-full bg-white border border-slate-350 text-slate-900 rounded p-1.5 text-[10px] outline-none font-medium"
                  >
                    {voices.map(v => (
                      <option key={v.name} value={v.name} className="text-slate-900 bg-white">{v.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
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
      {highlightRect && (
        <>
          {/* Dark Backdrop Spotlight */}
          <div 
            className="fixed pointer-events-none z-[100000] rounded-xl transition-all duration-300 border-2 border-indigo-500 shadow-[0_0_0_9999px_rgba(15,23,42,0.6)]"
            style={{
              top: `${highlightRect.top - window.scrollY}px`,
              left: `${highlightRect.left - window.scrollX}px`,
              width: `${highlightRect.width}px`,
              height: `${highlightRect.height}px`
            }}
          />
          {/* Pulsing Visual Anchor Pointer */}
          <div 
            className="fixed pointer-events-none z-[100001] w-4 h-4 bg-indigo-500 rounded-full transition-all duration-300"
            style={{
              top: `${highlightRect.top - window.scrollY - 8}px`,
              left: `${highlightRect.left - window.scrollX + highlightRect.width - 8}px`
            }}
          >
            <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75 animate-ping" />
          </div>
        </>
      )}

      {tourStep !== null && tourSteps[tourStep] && (
        <div className="fixed top-4 md:top-auto md:bottom-28 left-1/2 transform -translate-x-1/2 z-[100002] bg-slate-950/90 border border-indigo-500/30 text-white py-3 px-5 rounded-2xl shadow-xl flex items-center gap-2 max-w-xl w-11/12 text-center select-none backdrop-blur-md pointer-events-none animate-fade-in">
          <span className="animate-pulse text-indigo-400 shrink-0">🎙️</span>
          <span className="text-[11px] md:text-xs font-semibold tracking-wide flex-1 text-slate-200">{tourSteps[tourStep].text}</span>
        </div>
      )}
    </>
  );
}

export default Dashboard;
