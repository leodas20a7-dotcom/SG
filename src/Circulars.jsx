import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import LoadingOverlay from "./LoadingOverlay";
import ConfirmModal from "./ConfirmModal";

function Circulars({ role, userGuardId }) {
  const [circulars, setCirculars] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { showToast, ToastContainer } = useToast();

  // Filters & Pagination state
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Confirm Modal state
  const [confirmConfig, setConfirmConfig] = useState(null);

  async function fetchCirculars() {
    try {
      let query = supabase
        .from("circulars")
        .select("*")
        .order("created_at", { ascending: false });

      // Non-admin users: show broadcast circulars OR circulars targeted to them
      if (role !== "admin") {
        if (userGuardId) {
          query = query.or(`is_broadcast.eq.true,guard_id.eq.${userGuardId}`);
        } else {
          query = query.eq("is_broadcast", true);
        }
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
          is_broadcast: true,
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

  async function executeDeleteCircular(id) {
    setLoading(true);
    try {
      const { error } = await supabase.from("circulars").delete().eq("id", id);
      if (error) throw error;
      showToast("Circular deleted successfully.", "success");
      fetchCirculars();
    } catch (err) {
      showToast("Failed to delete circular: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function deleteCircular(id) {
    setConfirmConfig({
      message: "Are you sure you want to delete this circular?",
      onConfirm: () => executeDeleteCircular(id)
    });
  }

  useEffect(() => {
    fetchCirculars();
  }, [role, userGuardId]);

  // Reset pagination on search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const filteredCirculars = circulars.filter(circ => {
    const q = searchQuery.toLowerCase();
    return (circ.title || "").toLowerCase().includes(q) || (circ.content || "").toLowerCase().includes(q);
  });

  const totalPages = Math.ceil(filteredCirculars.length / itemsPerPage);
  const paginatedCirculars = filteredCirculars.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const CircularsList = () => (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          placeholder="🔍 Search announcements..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-11 border border-gray-250 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm bg-white"
        />
      </div>

      {paginatedCirculars.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <div className="text-5xl mb-3">📭</div>
          <p className="font-medium text-gray-500">No announcements found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedCirculars.map((circ) => (
            <div key={circ.id} className="bg-white/80 rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition">
              <div className="flex justify-between items-start mb-2 gap-3">
                <h4 className="text-base font-bold text-gray-800">📌 {circ.title}</h4>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-405 whitespace-nowrap shrink-0">
                    {new Date(circ.created_at).toLocaleDateString([], { dateStyle: "medium" })}
                  </span>
                  {role === "admin" && (
                    <button
                      onClick={() => deleteCircular(circ.id)}
                      className="text-red-500 hover:text-red-700 font-semibold text-xs bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition"
                      title="Delete Circular"
                    >
                      🗑️ Delete
                    </button>
                  )}
                </div>
              </div>
              <p className="text-gray-600 text-sm whitespace-pre-line leading-relaxed">{circ.content}</p>
            </div>
          ))}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center pt-2">
              <span className="text-xs text-gray-500">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold bg-white text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                >
                  ◀ Prev
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold bg-white text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Next ▶
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <ToastContainer />
      {loading && <LoadingOverlay message="Processing..." />}
      {confirmConfig && (
        <ConfirmModal
          message={confirmConfig.message}
          onConfirm={() => {
            confirmConfig.onConfirm();
            setConfirmConfig(null);
          }}
          onCancel={() => setConfirmConfig(null)}
        />
      )}

      <div className="mt-2">

        {/* Admin Broadcast Form */}
        {role === "admin" && (
          <div className="glass-card rounded-2xl p-6 mb-8 ring-1 ring-blue-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-700">✏️ Broadcast New Circular</h3>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setCurrentPage(1);
                  setShowHistory(true);
                }}
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
                <p className="text-xs text-gray-400 mt-0.5">{filteredCirculars.length} announcement{filteredCirculars.length !== 1 ? "s" : ""} found</p>
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
