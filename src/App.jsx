import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

import Login from "./Login";
import Signup from "./Signup";
import Dashboard from "./Dashboard";
import { setCompanyTimezone } from "./lib/timeUtils";
import GuardDuty from "./GuardDuty";
import { ErrorBoundary } from "react-error-boundary";

import { App as CapacitorApp } from '@capacitor/app';

function ErrorFallback({ error }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
      <div className="bg-white p-6 rounded-2xl shadow-xl max-w-lg w-full">
        <h2 className="text-xl font-bold text-red-600 mb-4">Something went wrong</h2>
        <pre className="text-sm bg-red-100 p-4 rounded-xl text-red-800 overflow-x-auto whitespace-pre-wrap">
          {error.message}
        </pre>
        <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg">Reload Page</button>
      </div>
    </div>
  );
}

function App() {

  const [session, setSession] = useState(null);
  const [currentView, setCurrentView] = useState("login");
  const [history, setHistory] = useState([]);

  const openPage = (nextPage) => {
    setHistory(prev => [...prev, currentView]);
    setCurrentView(nextPage);
  };

  useEffect(() => {
    const handleBackButton = () => {
      setHistory(prev => {
        if (prev.length > 0) {
          const previous = prev[prev.length - 1];
          setCurrentView(previous);
          return prev.slice(0, -1);
        } else {
          CapacitorApp.exitApp();
          return prev;
        }
      });
    };

    let listener;
    CapacitorApp.addListener("backButton", handleBackButton).then(l => {
      listener = l;
    }).catch(err => {
      console.warn("Capacitor App plugin not available", err);
    });

    return () => {
      if (listener) {
        listener.remove();
      }
    };
  }, []);

  const [role, setRole] = useState("");
  const [allowedPages, setAllowedPages] = useState(null);
  const [guardId, setGuardId] = useState(null);
  const [guardName, setGuardName] = useState("");
  const [companyId, setCompanyId] = useState(null);
  const [loading, setLoading] = useState(true);

  const [permissionsGranted, setPermissionsGranted] = useState(
    () => localStorage.getItem("sg_permissions_skipped") === "true" || localStorage.getItem("sg_permissions_granted") === "true"
  );
  const [permissionError, setPermissionError] = useState("");
  const [requestingPerms, setRequestingPerms] = useState(false);

  async function checkPermissions() {
    if (localStorage.getItem("sg_permissions_skipped") === "true" || localStorage.getItem("sg_permissions_granted") === "true") {
      setPermissionsGranted(true);
      return;
    }
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const geoStatus = await navigator.permissions.query({ name: "geolocation" });
        let camStatusState = "prompt";
        try {
          const camStatus = await navigator.permissions.query({ name: "camera" });
          camStatusState = camStatus.state;
        } catch {
          // Ignore if browser doesn't support camera querying
        }
        
        if (geoStatus.state !== "granted" || camStatusState !== "granted") {
          setPermissionsGranted(false);
        } else {
          setPermissionsGranted(true);
        }
      } else {
        // Fallback for Safari/other browsers: check manually on click
        setPermissionsGranted(false);
      }
    } catch {
      setPermissionsGranted(false);
    }
  }

  async function requestPermissions() {
    setRequestingPerms(true);
    setPermissionError("");
    try {
      // 1. Request GPS
      try {
        await new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            resolve(); // Skip if no geolocation API
            return;
          }
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 });
        });
      } catch (gpsErr) {
        console.warn("GPS request failed or not available", gpsErr);
        // We will proceed anyway to let the app load
      }

      // 2. Request Camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
      } catch (camErr) {
        console.warn("Camera request failed or not available", camErr);
      }

      setPermissionsGranted(true);
      localStorage.setItem("sg_permissions_granted", "true");
      localStorage.removeItem("sg_permissions_skipped");
    } catch (err) {
      console.error("Permission request failed", err);
      setPermissionError(
        "Permissions request failed. Please check your browser address bar settings to allow Camera and Location (GPS) access for Safety Guard."
      );
    } finally {
      setRequestingPerms(false);
    }
  }

  const [profileError, setProfileError] = useState(false);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);

  async function fetchRole(userId) {
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (profile) {
        setRole(profile.role);
        setAllowedPages(profile.allowed_pages || null);
        setCompanyId(profile.company_id);
        
        // Check company subscription and timezone
        if (profile.company_id) {
           const { data: comp } = await supabase.from("companies").select("current_period_end, timezone").eq("id", profile.company_id).single();
           if (comp?.timezone) {
               setCompanyTimezone(comp.timezone);
           }
           if (comp?.current_period_end) {
              const expireDate = new Date(comp.current_period_end);
              if (new Date() > expireDate) {
                 setSubscriptionExpired(true);
              }
           }
        }

        if (profile.role === "guard") {
          const { data: guardsList, error: guardErr } = await supabase
            .from("guards")
            .select("id, name, auth_user_id, company_id")
            .eq("auth_user_id", userId)
            .limit(1);
          
          const guard = guardsList && guardsList.length > 0 ? guardsList[0] : null;

          if (guard) {
            setGuardId(guard.id);
            setGuardName(guard.name);
          } else {
            // Auto-heal: If the guard row is missing (e.g. race condition during signup), recreate it.
            const { data: newGuard, error: insErr } = await supabase.from("guards").insert([{
              company_id: profile.company_id,
              name: profile.name || (session?.user?.email ? session.user.email.split('@')[0] : "Guard"),
              email: session?.user?.email || `temp-${Date.now()}@example.com`,
              auth_user_id: userId
            }]).select();
            
            if (newGuard && newGuard.length > 0) {
              setGuardId(newGuard[0].id);
              setGuardName(newGuard[0].name);
            } else {
              alert(`CRITICAL ERROR AUTO-HEALING GUARD:
UserId: ${userId}
Error: ${JSON.stringify(insErr)}
Profile: ${JSON.stringify(profile)}`);
            }
          }
        } else {
            // Initialize Dashboard View
            let startPage = "dashboard";
            if (typeof window !== "undefined") {
              const hash = window.location.hash.replace('#', '');
              const validPages = ["dashboard", "tenant-management", "global-broadcasts", "live-ops", "staff-registry", "guard-profiles", "shifts", "system-users", "incidents", "circulars", "correction-requests", "billing", "settings"];
              
              if (hash && validPages.includes(hash)) {
                startPage = hash;
              } else if (window.location.search.includes("checkout=")) {
                startPage = "billing";
              } else if (profile.allowed_pages && profile.allowed_pages.length > 0 && !profile.allowed_pages.includes("dashboard")) {
                startPage = profile.allowed_pages[0];
              }
            }
            setCurrentView(startPage);
            setHistory([]);
        }
      } else {
        console.error("Profile not found for user", userId, error);
        setProfileError(true);
      }
    } catch (err) {
      alert("App.jsx crash inside fetchRole: " + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setLoading(true);
        fetchRole(session.user.id);
        checkPermissions();
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (sessionStorage.getItem("ignore_auth_change") === "true") {
        return;
      }
      setSession(session);
      if (session?.user) {
        setLoading(true);
        fetchRole(session.user.id);
        checkPermissions();
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const appLogo = "/logo.png";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0f9ff 100%)" }}>
        <div className="text-center animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl overflow-hidden shadow-lg shadow-blue-200 flex items-center justify-center bg-white">
            <img src={appLogo} alt="SecureSys Logo" className="w-full h-full object-cover animate-bounce" />
          </div>
          <div className="flex items-center justify-center gap-1.5 mb-3">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <p className="text-gray-500 font-medium">Preparing your dashboard...</p>
        </div>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
            ⚠️
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">Profile Setup Incomplete</h2>
          <p className="text-gray-600 mb-6 text-sm">
            Your user account was created, but your profile and company were not automatically set up. 
            This usually happens if the database triggers were not applied.
          </p>
          <div className="space-y-3">
            <button 
              onClick={async () => {
                await supabase.auth.signOut();
                setProfileError(false);
                setSession(null);
                openPage("login");
              }} 
              className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition"
            >
              Sign Out & Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (subscriptionExpired && role === "guard") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border-t-4 border-red-500">
          <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
            🛑
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">Subscription Expired</h2>
          <p className="text-gray-600 mb-6 text-sm">
            Your company's SecureSys subscription has expired. Please contact your administrator to renew the license.
          </p>
          <div className="space-y-3">
            <button 
              onClick={async () => {
                await supabase.auth.signOut();
                setSubscriptionExpired(false);
                setSession(null);
                openPage("login");
              }} 
              className="w-full px-4 py-3 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl font-bold transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    if (currentView === "signup") {
      return <Signup setSession={setSession} onNavigateToLogin={() => openPage("login")} />;
    }
    return <Login setSession={setSession} onNavigateToSignup={() => openPage("signup")} />;
  }

  if (!permissionsGranted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-indigo-100 text-center animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center bg-white">
            <img src={appLogo} alt="SecureSys Logo" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">Permissions Required</h2>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">
            Safety Guard requires access to your <strong>GPS Location</strong> and <strong>Camera</strong> to verify secure check-ins and attendance updates.
          </p>

          <div className="space-y-4 mb-8 text-left">
            <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-gray-50 border border-gray-100">
              <span className="text-2xl mt-0.5">📍</span>
              <div>
                <p className="font-bold text-gray-800 text-sm">GPS Location Access</p>
                <p className="text-xs text-gray-500">Required to confirm you are within the assigned duty location area.</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-gray-50 border border-gray-100">
              <span className="text-2xl mt-0.5">📸</span>
              <div>
                <p className="font-bold text-gray-800 text-sm">Camera & Photo Upload</p>
                <p className="text-xs text-gray-500">Required to upload check-in / check-out verification selfies.</p>
              </div>
            </div>
          </div>

          {permissionError && (
            <div className="bg-red-50 text-red-700 text-xs p-3.5 rounded-2xl border border-red-150 mb-6 text-left leading-relaxed">
              ⚠️ {permissionError}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              onClick={requestPermissions}
              disabled={requestingPerms}
              className={`w-full py-3.5 rounded-xl font-bold text-sm text-white shadow-lg transition flex items-center justify-center gap-2 ${
                requestingPerms 
                  ? "bg-indigo-400 cursor-not-allowed" 
                  : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-150"
              }`}
            >
              {requestingPerms ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Requesting Access...</span>
                </>
              ) : (
                "Grant Permissions"
              )}
            </button>
            <button
              onClick={() => {
                localStorage.setItem("sg_permissions_skipped", "true");
                setPermissionsGranted(true);
              }}
              className="w-full py-3 rounded-xl font-bold text-xs text-gray-400 hover:text-gray-650 transition"
            >
              Skip & Continue Anyway
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (role === "guard" && guardId) {
    return (
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <GuardDuty guardId={guardId} guardName={guardName} companyId={companyId} />
      </ErrorBoundary>
    );
  }


  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Dashboard role={role} userGuardId={guardId} companyId={companyId} allowedPages={allowedPages} page={currentView} onNavigate={openPage} />
    </ErrorBoundary>
  );
}

export default App;
