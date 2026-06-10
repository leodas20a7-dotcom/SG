import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";

function CorrectionRequests({ role, guardId }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    fetchRequests();
  }, [guardId, role]);

  return (
    <>
      <ToastContainer />
      <div className="mt-6">
        <h2 className="text-xl font-bold mb-4 text-gray-800">
          {role === "admin" ? "📥 Attendance Correction Requests" : "📋 Your Requests"}
        </h2>

        <div className="glass-card rounded-2xl overflow-hidden ring-1 ring-amber-200">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
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
                          <audio src={req.audio_url} controls className="h-8 max-w-[180px]" />
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
    </>
  );
}

export default CorrectionRequests;
