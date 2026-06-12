import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

import Login from "./Login";
import Dashboard from "./Dashboard";
import GuardDuty from "./GuardDuty";
import { ErrorBoundary } from "react-error-boundary";

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
  const [role, setRole] = useState("");
  const [guardId, setGuardId] = useState(null);
  const [guardName, setGuardName] = useState("");
  const [loading, setLoading] = useState(true);

  async function fetchRole(userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", userId)
      .single();
    if (profile) {
      setRole(profile.role);
      if (profile.role === "guard") {
        const { data: guard } = await supabase
          .from("guards")
          .select("id, name")
          .eq("auth_user_id", userId)
          .maybeSingle();
        if (guard) {
          setGuardId(guard.id);
          setGuardName(guard.name);
        }
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setLoading(true);
        fetchRole(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        setLoading(true);
        fetchRole(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0f9ff 100%)" }}>
        <div className="text-center animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-4xl shadow-lg shadow-blue-200">
            <span className="animate-bounce">🛡️</span>
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

  if (!session) return <Login setSession={setSession} />;

  if (role === "guard" && guardId) {
    return (
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <GuardDuty guardId={guardId} guardName={guardName} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Dashboard role={role} />
    </ErrorBoundary>
  );
}

export default App;
