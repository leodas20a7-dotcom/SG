import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import LoadingOverlay from "./LoadingOverlay";

function Circulars({ role, userGuardId }) {
  const [circulars, setCirculars] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { showToast, ToastContainer } = useToast();

  async function fetchCirculars() {
    try {
      let query = supabase
        .from("circulars")
        .select("*")
        .order("created_at", { ascending: false });

      // Non-admin users only see broadcast circulars (guard_id is null)
      // or circulars specifically targeted to them
      if (role !== "admin" && userGuardId) {
        query = query.or(`guard_id.is.null,guard_id.eq.${userGuardId}`);
      } else if (role !== "admin" && !userGuardId) {
        query = query.is("guard_id", null);
      }

      const { data } = await query;
      setCirculars(data || []);
    } catch {
      showToast("Could not load circulars.", "error");
    }
  }

  async function addCircular(e) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      showToast("Please fill in all fields.", "error");
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("circulars").insert([
        {
          title: title.trim(),
          content: content.trim(),
          created_by: user?.id,
        },
      ]);
      if (error) throw error;
      showToast("Circular announcement published!", "success");
      setTitle("");
      setContent("");
      fetchCirculars();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCirculars();
  }, []);

  const CircularsList = () => (
    <div className="space-y-3">
      {circulars.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <div className="text-5xl mb-3">📭</div>
          <p className="font-medium text-gray-500">No announcements posted yet.</p>
        </div>
      ) : (
        circulars.map((circ) => (
          <div key={circ.id} className="bg-white/80 rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition">
            <div className="flex justify-between items-start mb-2 gap-3">
              <h4 className="text-base font-bold text-gray-800">📌 {circ.title}</h4>
              <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                {new Date(circ.created_at).toLocaleDateString([], { dateStyle: "medium" })}
              </span>
            </div>
            <p className="text-gray-600 text-sm whitespace-pre-line leading-relaxed">{circ.content}</p>
          </div>
        ))
      )}
    </div>
  );

  return (
    <>
      <ToastContainer />
      {loading && <LoadingOverlay message="Publishing circular..." />}
      <div className="mt-2">

        {/* Admin Broadcast Form */}
        {role === "admin" && (
          <div className="glass-card rounded-2xl p-6 mb-8 ring-1 ring-blue-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-700">✏️ Broadcast New Circular</h3>
              <button
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition"
              >
                🕐 View History
              </button>
            </div>
            <form onSubmit={addCircular} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Title</label>
                <input
                  type="text"
                  placeholder="e.g. Mandatory Uniform Updates"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-12 border border-gray-300 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Message Content</label>
                <textarea
                  placeholder="Type announcement details here..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows="4"
                  className="w-full border border-gray-300 p-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition shadow-md"
              >
                {loading ? "Publishing..." : "Broadcast Circular"}
              </button>
            </form>
          </div>
        )}

        {/* Guards/Supervisors see the list directly */}
        {role !== "admin" && <CircularsList />}
      </div>

      {/* History Overlay Modal */}
      {showHistory && (
        <div
          className="fixed inset-0 z-[100] flex items-end md:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowHistory(false)}
        >
          <div
            className="relative w-full md:max-w-xl bg-gradient-to-br from-white to-blue-50 rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: "85vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-800">📋 Circular History</h3>
                <p className="text-xs text-gray-400 mt-0.5">{circulars.length} announcement{circulars.length !== 1 ? "s" : ""} published</p>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              <CircularsList />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Circulars;
