import { useEffect, useState, useRef } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import ConfirmModal from "./ConfirmModal";

function AudioPlayer({ src }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleEnded = () => setPlaying(false);
    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
  }, []);

  const togglePlay = () => {
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <div className="flex items-center">
      <audio ref={audioRef} src={src} className="hidden" />
      <button 
        onClick={togglePlay}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition shadow-sm ${
          playing 
            ? "bg-purple-500 text-white shadow-purple-200" 
            : "bg-white border border-gray-200 text-gray-700 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-600"
        }`}
      >
        <span className="text-sm">{playing ? "⏸️" : "▶️"}</span>
        {playing ? "Playing..." : "Play Audio"}
      </button>
    </div>
  );
}

function CorrectionRequests({ role, guardId }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { showToast, ToastContainer } = useToast();

  async function fetchRequests() {
    try {
      let query = supabase
        .from("attendance_requests")
        .select("*, guards(name)");

      if (role === "guard" && guardId) {
        query = query.eq("guard_id", guardId);
      }

      const { data } = await query.order("created_at", { ascending: false });
      setRequests(data || []);
    } catch {
      showToast("Could not load requests.", "error");
    }
  }

  async function handleStatus(id, newStatus) {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("attendance_requests")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
      showToast(`Request ${newStatus.toLowerCase()} successfully.`, "success");
      fetchRequests();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function clearHistory() {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("attendance_requests")
        .delete()
        .neq("status", "Pending");
      if (error) throw error;
      showToast("Resolved request history cleared successfully.", "success");
      fetchRequests();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
      setShowClearConfirm(false);
    }
  }

  useEffect(() => {
    fetchRequests();
  }, [guardId, role]);

  return (
    <>
      <ToastContainer />
      <div className="mt-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">
            {role === "admin" ? "📥 Attendance Correction Requests" : "📋 Your Requests"}
          </h2>
          {role === "admin" && (
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={loading}
              className="bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md hover:shadow-lg active:scale-95 shrink-0"
            >
              <span>🗑️</span> Clear History
            </button>
          )}
        </div>

        <div className="glass-card rounded-2xl overflow-hidden ring-1 ring-amber-200">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b">
                  {role === "admin" && <th className="text-left p-4 text-gray-600 font-semibold">Guard</th>}
                  <th className="text-left p-4 text-gray-600 font-semibold">Type</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Details / Note</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Voice Request</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Status</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Submitted</th>
                  {role === "admin" && <th className="text-left p-4 text-gray-600 font-semibold">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={role === "admin" ? 7 : 5} className="p-8 text-center text-gray-400">
                      No correction requests found.
                    </td>
                  </tr>
                ) : (
                  requests.map((req) => (
                    <tr key={req.id} className="border-b hover:bg-gray-50 transition">
                      {role === "admin" && <td className="p-4 font-medium">{req.guards?.name}</td>}
                      <td className="p-4">
                        <span className={`px-2 py-1 text-xs rounded-md font-semibold capitalize ${
                          req.request_type === "voice" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {req.request_type === "voice" ? "🎤 Voice" : "📝 Text"}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-700 max-w-xs truncate">{req.message || "—"}</td>
                      <td className="p-4">
                        {req.audio_url ? (
                          <AudioPlayer src={req.audio_url} />
                        ) : (
                          <span className="text-gray-400 text-xs">No recording</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          req.status === "Pending" ? "bg-amber-100 text-amber-700" :
                          req.status === "Approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-gray-500">
                        {new Date(req.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      {role === "admin" && (
                        <td className="p-4">
                          {req.status === "Pending" ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleStatus(req.id, "Approved")}
                                disabled={loading}
                                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleStatus(req.id, "Rejected")}
                                disabled={loading}
                                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs font-semibold">Closed</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {showClearConfirm && (
        <ConfirmModal
          message="Are you sure you want to clear all approved and rejected request history?"
          onConfirm={clearHistory}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </>
  );
}

export default CorrectionRequests;
