import { useEffect, useState, useRef } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import ConfirmModal from "./ConfirmModal";
import LoadingOverlay from "./LoadingOverlay";
import { FaCalendarDay } from "react-icons/fa";

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

function CorrectionRequests({ role, companyId, guardId, onNavigate }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [leaveApprovalConfig, setLeaveApprovalConfig] = useState(null);
  const { showToast, ToastContainer } = useToast();

  async function fetchRequests() {
    try {
      let query = supabase
        .from("attendance_requests")
        .select("*, guards(name)");

      if (role === "guard" && guardId) {
        query = query.eq("guard_id", guardId);
      } else if (companyId) {
        query = query.eq("company_id", companyId);
      }

      const { data } = await query.order("created_at", { ascending: false }).limit(1500);
      setRequests(data || []);
    } catch {
      showToast("Could not load requests.", "error");
    }
  }

  async function handleStatus(id, newStatus, generateLeaveRecords = false) {
    setLoading(true);
    try {
      const { data: reqData } = await supabase
        .from("attendance_requests")
        .select("guard_id, request_type, message, start_date, end_date")
        .eq("id", id)
        .single();

      if (newStatus === "Approved" && reqData?.request_type === "leave" && !generateLeaveRecords) {
        // Just checking if we need to show the modal first
        setLeaveApprovalConfig({
          id,
          guard_id: reqData.guard_id,
          start_date: reqData.start_date,
          end_date: reqData.end_date,
          guard_name: requests.find(r => r.id === id)?.guards?.name || "the guard"
        });
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from("attendance_requests")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;

      if (reqData && reqData.guard_id) {
        let title = "Request Update";
        let message = `Your request has been ${newStatus.toLowerCase()}.`;
        if (reqData.request_type === "leave") {
          title = `Leave Request ${newStatus}`;
          message = `Your leave request from ${reqData.start_date} to ${reqData.end_date} has been ${newStatus.toLowerCase()} by the administrator.`;
        } else {
          title = `📝 Correction Request ${newStatus}`;
          message = `Your attendance correction request has been ${newStatus.toLowerCase()} by the administrator.`;
        }

        await supabase.from("notifications").insert([{
          title,
          message,
          guard_id: reqData.guard_id,
          is_broadcast: false,
          type: newStatus === "Approved" ? "success" : "error",
          user_role: "guard"
        }]);

        if (newStatus === "Approved" && reqData.request_type === "leave" && generateLeaveRecords && companyId) {
          const start = new Date(reqData.start_date);
          const end = new Date(reqData.end_date);
          
          // 1. Delete overlapping records
          const { data: existingRecords } = await supabase
            .from("attendance")
            .select("id, check_in_time, date")
            .eq("guard_id", reqData.guard_id);
            
          if (existingRecords) {
            const idsToDelete = existingRecords.filter(r => {
              const recordDateStr = (r.check_in_time ? r.check_in_time.split("T")[0] : r.date);
              if (!recordDateStr) return false;
              const recordDate = new Date(recordDateStr);
              recordDate.setHours(0,0,0,0);
              const compStart = new Date(start); compStart.setHours(0,0,0,0);
              const compEnd = new Date(end); compEnd.setHours(0,0,0,0);
              return recordDate >= compStart && recordDate <= compEnd;
            }).map(r => r.id);
            
            if (idsToDelete.length > 0) {
              await supabase.from("attendance").delete().in("id", idsToDelete);
            }
          }

          // 2. Insert new Leave records
          const inserts = [];
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            inserts.push({
              company_id: companyId,
              guard_id: reqData.guard_id,
              check_in_time: d.toISOString(),
              check_out_time: d.toISOString(),
              status: "Leave"
            });
          }
          if (inserts.length > 0) {
            await supabase.from("attendance").insert(inserts);
          }
        }
      }

      showToast(`Request ${newStatus.toLowerCase()} successfully.`, "success");
      setLeaveApprovalConfig(null);
      fetchRequests();
      
      if (newStatus === "Approved" && typeof onNavigate === "function") {
        sessionStorage.setItem("liveops_view", "checkin");
        if (reqData?.request_type !== "leave") {
          sessionStorage.setItem("open_edit_modal_for_guard", reqData.guard_id);
        }
        onNavigate("live-ops");
      }
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
      {loading && <LoadingOverlay message="Processing request..." />}
      <div className="mt-2">
        {["admin", "super_admin"].includes(role) && (
          <div className="flex justify-end mb-6">
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={loading}
              className="bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md hover:shadow-lg active:scale-95 shrink-0"
            >
              <span>🗑️</span> Clear History
            </button>
          </div>
        )}

        <div className="glass-card rounded-2xl overflow-hidden ring-1 ring-amber-200">
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b">
                  {["admin", "super_admin"].includes(role) && <th className="text-left p-4 text-slate-450 font-bold text-[10px] uppercase tracking-wider">Guard</th>}
                  <th className="text-left p-4 text-slate-450 font-bold text-[10px] uppercase tracking-wider">Type</th>
                  <th className="text-left p-4 text-slate-450 font-bold text-[10px] uppercase tracking-wider">Details / Note</th>
                  <th className="text-left p-4 text-slate-450 font-bold text-[10px] uppercase tracking-wider">Voice Request</th>
                  <th className="text-left p-4 text-slate-450 font-bold text-[10px] uppercase tracking-wider">Status</th>
                  <th className="text-left p-4 text-slate-450 font-bold text-[10px] uppercase tracking-wider">Submitted</th>
                  {["admin", "super_admin"].includes(role) && <th className="text-left p-4 text-slate-450 font-bold text-[10px] uppercase tracking-wider">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={["admin", "super_admin"].includes(role) ? 7 : 5} className="p-8 text-center text-gray-400">
                      No correction requests found.
                    </td>
                  </tr>
                ) : (
                  requests.map((req) => (
                    <tr key={req.id} className="border-b hover:bg-gray-50 transition">
                      {["admin", "super_admin"].includes(role) && <td className="p-4 font-medium">{req.guards?.name}</td>}
                      <td className="p-4">
                        <span className={`px-2 py-1 text-xs rounded-md font-semibold capitalize ${
                          req.request_type === "leave" ? "bg-amber-100 text-amber-700" :
                          req.request_type === "voice" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {req.request_type === "leave" ? <span className="flex items-center gap-1.5 justify-center"><FaCalendarDay /> Leave</span> :
                           req.request_type === "voice" ? "🎤 Voice" : "📝 Text"}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-700 max-w-xs">
                        {req.request_type === "leave" ? (
                          <div>
                            <p className="font-semibold text-amber-800">
                              📅 {req.start_date} to {req.end_date}
                            </p>
                            <p className="text-xs text-gray-550 mt-0.5">{req.message || "No reason"}</p>
                          </div>
                        ) : (
                          req.message || "—"
                        )}
                      </td>
                      <td className="p-4">
                        {req.audio_url ? (
                          <AudioPlayer src={req.audio_url} />
                        ) : (
                          <span className="text-gray-400 text-xs">No recording</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`status-chip status-chip-${req.status.toLowerCase()}`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-gray-500">
                        {new Date(req.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      {["admin", "super_admin"].includes(role) && (
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

          {/* Mobile View */}
          <div className="block md:hidden divide-y divide-gray-100">
            {requests.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No correction requests found.</div>
            ) : (
              requests.map((req) => (
                <div key={req.id} className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      {["admin", "super_admin"].includes(role) && <h4 className="font-bold text-gray-805 text-sm">{req.guards?.name || "Unknown Guard"}</h4>}
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(req.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    <span className={`status-chip status-chip-${req.status.toLowerCase()}`}>
                      {req.status}
                    </span>
                  </div>

                  <div className="text-xs text-gray-700 bg-gray-50 p-3 rounded-xl space-y-2">
                    <div>
                      <span className="font-semibold block text-gray-400 text-[10px] uppercase">Type:</span>
                      <span className={`inline-block px-2 py-0.5 text-[10px] rounded font-semibold capitalize ${
                        req.request_type === "leave" ? "bg-amber-100 text-amber-700" :
                        req.request_type === "voice" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                      }`}>
                        {req.request_type === "leave" ? <span className="flex items-center gap-1.5"><FaCalendarDay /> Leave Request</span> :
                         req.request_type === "voice" ? "🎤 Voice Request" : "📝 Text Request"}
                      </span>
                    </div>

                    <div>
                      <span className="font-semibold block text-gray-400 text-[10px] uppercase">Note / Details:</span>
                      {req.request_type === "leave" ? (
                        <div className="space-y-1">
                          <p className="font-semibold text-amber-800">
                            📅 {req.start_date} to {req.end_date}
                          </p>
                          <p className="text-xs text-gray-600">{req.message || "No reason"}</p>
                        </div>
                      ) : (
                        <p className="text-xs">{req.message || "—"}</p>
                      )}
                    </div>

                    <div>
                      <span className="font-semibold block text-gray-400 text-[10px] uppercase">Voice Recording:</span>
                      <div className="mt-1">
                        {req.audio_url ? (
                          <AudioPlayer src={req.audio_url} />
                        ) : (
                          <span className="text-gray-400 text-xs">No recording</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {["admin", "super_admin"].includes(role) && req.status === "Pending" && (
                    <div className="flex gap-2 justify-end pt-1">
                      <button
                        onClick={() => handleStatus(req.id, "Rejected")}
                        disabled={loading}
                        className="bg-red-50 text-red-650 hover:bg-red-100 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleStatus(req.id, "Approved")}
                        disabled={loading}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-sm"
                      >
                        Approve
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      {leaveApprovalConfig && (
        <div className="fixed inset-0 z-[150] bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 text-center">
            <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 shadow-inner">
              <FaCalendarDay />
            </div>
            <h3 className="font-bold text-lg text-gray-800 mb-2">Generate Leave Records?</h3>
            <p className="text-sm text-gray-500 mb-6 px-2">
              Do you want to automatically generate official attendance records marked as <span className="font-bold text-gray-700">"Leave"</span> for <span className="font-bold text-gray-700">{leaveApprovalConfig.guard_name}</span> from <span className="font-bold text-gray-700">{leaveApprovalConfig.start_date}</span> to <span className="font-bold text-gray-700">{leaveApprovalConfig.end_date}</span>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  const id = leaveApprovalConfig.id;
                  setLeaveApprovalConfig(null);
                  handleStatus(id, "Approved", false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 font-bold text-sm hover:bg-gray-200 transition text-gray-700"
              >
                No, Just Approve
              </button>
              <button
                onClick={() => {
                  const id = leaveApprovalConfig.id;
                  setLeaveApprovalConfig(null);
                  handleStatus(id, "Approved", true);
                }}
                className="flex-1 py-2.5 rounded-xl bg-yellow-500 text-white font-bold text-sm hover:bg-yellow-600 transition shadow-md shadow-yellow-200"
              >
                Yes, Generate
              </button>
            </div>
          </div>
        </div>
      )}

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
