import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import LoadingOverlay from "./LoadingOverlay";
import ConfirmModal from "./ConfirmModal";

const SHIFT_OPTIONS = ["Morning Shift", "Evening Shift", "Night Shift", "Full Day"];
const DEFAULT_TIMINGS = {
  "Morning Shift": { start: "06:00", end: "14:00" },
  "Evening Shift": { start: "14:00", end: "22:00" },
  "Night Shift": { start: "22:00", end: "06:00" },
  "Full Day": { start: "08:00", end: "20:00" },
};

function Settings({ onStartTour }) {
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [confirmConfig, setConfirmConfig] = useState(null);
  const { showToast, ToastContainer } = useToast();
  const [shiftTimings, setShiftTimings] = useState(DEFAULT_TIMINGS);
  const [activeDetailsModal, setActiveDetailsModal] = useState(null);

  async function fetchTimings() {
    try {
      const { data } = await supabase.from("shift_timings").select("*");
      if (data && data.length > 0) {
        const timings = {};
        data.forEach((row) => {
          timings[row.shift_name] = { start: row.start_time?.substring(0, 5), end: row.end_time?.substring(0, 5) };
        });
        setShiftTimings((prev) => ({ ...prev, ...timings }));
      }
    } catch {
      showToast("Could not load shift timings.", "error");
    }
  }

  async function saveTimings() {
    setLoading(true);
    setLoadingMsg("Saving shift timings...");
    try {
      for (const [shiftName, times] of Object.entries(shiftTimings)) {
        const { error } = await supabase.from("shift_timings").upsert(
          { shift_name: shiftName, start_time: times.start, end_time: times.end },
          { onConflict: "shift_name" }
        );
        if (error) {
          showToast("Error saving timings. Please try again.", "error");
          setLoading(false);
          return;
        }
      }
      showToast("Shift timings saved successfully!", "success");
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }

  async function resetTimings() {
    setLoading(true);
    setLoadingMsg("Resetting timings...");
    try {
      for (const [shiftName, times] of Object.entries(DEFAULT_TIMINGS)) {
        await supabase.from("shift_timings").upsert(
          { shift_name: shiftName, start_time: times.start, end_time: times.end },
          { onConflict: "shift_name" }
        );
      }
      setShiftTimings(DEFAULT_TIMINGS);
      showToast("Timings reset to defaults!", "success");
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }

  useEffect(() => {
    fetchTimings();
  }, []);

  async function executeClearAllGuardsPhotos() {
    setLoading(true);
    setLoadingMsg("Deleting all guard photos...");
    try {
      const { data: files, error: listErr } = await supabase.storage.from("guard-photos").list("", { limit: 1000 });
      if (listErr) throw listErr;

      const fileNames = (files || []).map(f => f.name).filter(name => name !== ".emptyFolderPlaceholder");
      if (fileNames.length > 0) {
        const { error: delErr } = await supabase.storage.from("guard-photos").remove(fileNames);
        if (delErr) throw delErr;
      }

      const { error: dbErr } = await supabase
        .from("attendance")
        .update({ check_in_photo: null, check_out_photo: null })
        .or("check_in_photo.not.is.null,check_out_photo.not.is.null");

      if (dbErr) throw dbErr;

      showToast(`Successfully deleted ${fileNames.length} selfie photos from storage and database.`, "success");
    } catch (err) {
      showToast("Clear photos failed: " + err.message, "error");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }

  function clearAllGuardsPhotos() {
    setConfirmConfig({
      message: "Are you sure you want to permanently delete ALL guard check-in/out selfie photos from Supabase Storage and database? This action is irreversible.",
      onConfirm: executeClearAllGuardsPhotos
    });
  }

  async function executeClearAllVoiceNotes() {
    setLoading(true);
    setLoadingMsg("Deleting all voice notes...");
    try {
      const { data: files, error: listErr } = await supabase.storage.from("voice-requests").list("", { limit: 1000 });
      if (listErr) throw listErr;

      const fileNames = (files || []).map(f => f.name).filter(name => name !== ".emptyFolderPlaceholder");
      if (fileNames.length > 0) {
        const { error: delErr } = await supabase.storage.from("voice-requests").remove(fileNames);
        if (delErr) throw delErr;
      }

      const { error: dbErr } = await supabase
        .from("attendance_requests")
        .update({ audio_url: null })
        .not("audio_url", "is", null);

      if (dbErr) throw dbErr;

      showToast(`Successfully deleted ${fileNames.length} voice notes from storage and database.`, "success");
    } catch (err) {
      showToast("Clear voice notes failed: " + err.message, "error");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }

  function clearAllVoiceNotes() {
    setConfirmConfig({
      message: "Are you sure you want to permanently delete ALL guard voice notes from Supabase Storage and database? This action is irreversible.",
      onConfirm: executeClearAllVoiceNotes
    });
  }

  async function executeClearIncidents() {
    setLoading(true);
    setLoadingMsg("Clearing incident reports...");
    try {
      const { error } = await supabase.from("incidents").delete().not("id", "is", null);
      if (error) throw error;
      showToast("Successfully cleared all incident reports from the database.", "success");
    } catch (err) {
      showToast("Clear incidents failed: " + err.message, "error");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }

  function clearIncidents() {
    setConfirmConfig({
      message: "Are you sure you want to permanently delete ALL incident reports from the database? This action is irreversible.",
      onConfirm: executeClearIncidents
    });
  }

  async function executeFullSystemReset() {
    setLoading(true);
    setLoadingMsg("Resetting system database...");
    try {
      const { error: rpcErr } = await supabase.rpc("clear_non_admin_auth_users");
      if (rpcErr) {
        console.warn("Auth cleanup RPC failed:", rpcErr);
      }

      const tables = [
        "live_tracking",
        "attendance",
        "attendance_requests",
        "incidents",
        "shifts",
        "shift_timings",
        "circulars",
        "notifications",
        "guards",
        "duty_locations"
      ];

      for (const table of tables) {
        const { error } = await supabase.from(table).delete().not("id", "is", null);
        if (error) {
          console.warn(`Non-critical or handled error deleting from ${table}:`, error);
        }
      }

      const { error: profileErr } = await supabase
        .from("profiles")
        .delete()
        .neq("role", "admin");
      
      if (profileErr) throw profileErr;

      showToast("System database reset successfully. All data cleared except admin profiles.", "success");
    } catch (err) {
      showToast("Database reset failed: " + err.message, "error");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }

  function fullSystemReset() {
    setConfirmConfig({
      message: "WARNING: This will permanently delete ALL guards, attendance records, shifts, circulars, incidents, duty locations, and non-admin profiles. Admin profiles will be kept. Do you want to proceed?",
      onConfirm: executeFullSystemReset
    });
  }

  return (
    <>
      <ToastContainer />
      {loading && <LoadingOverlay message={loadingMsg || "Processing request..."} />}
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

      {/* Details Popup Overlay Modal */}
      {activeDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-slate-100/80 relative animate-scale-in">
            <button 
              onClick={() => setActiveDetailsModal(null)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition font-bold text-lg"
            >
              ✕
            </button>

            {activeDetailsModal === 'photos' && (
              <div>
                <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-3xl mb-5 shadow-inner">📸</div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">Clear Guards Photos Details</h3>
                <div className="space-y-3.5 text-xs text-slate-600 font-medium leading-relaxed">
                  <p>
                    This cleanup operation targets temporary storage space occupied by guard verification selfies uploaded during daily check-ins and check-outs.
                  </p>
                  <div className="bg-[#F8F5FF] border border-purple-100 p-4 rounded-xl space-y-2">
                    <p className="font-bold text-purple-900 uppercase tracking-wider text-[10px]">Database Impact:</p>
                    <p>Updates the <code>check_in_photo</code> and <code>check_out_photo</code> fields to <code>NULL</code> in the <strong>attendance</strong> table.</p>
                    <p className="font-bold text-purple-900 uppercase tracking-wider text-[10px] pt-1">Storage Impact:</p>
                    <p>Permanently deletes all image files inside the <code>guard-photos</code> bucket in Supabase storage.</p>
                  </div>
                  <p className="text-[11px] text-amber-600 font-semibold bg-amber-50/50 p-3 rounded-lg border border-amber-100">
                    ℹ️ <strong>What is preserved:</strong> The attendance logs themselves (date, time, status, locations) are kept in the database.
                  </p>
                  <p className="text-[11px] text-red-500 font-bold bg-red-50/50 p-3 rounded-lg border border-red-100">
                    ⚠️ <strong>Warning:</strong> This action is completely irreversible. Once photos are deleted from storage, they cannot be recovered.
                  </p>
                </div>
                <div className="flex gap-3 justify-end mt-6">
                  <button 
                    onClick={() => setActiveDetailsModal(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition active:scale-95"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      clearAllGuardsPhotos();
                      setActiveDetailsModal(null);
                    }}
                    className="btn-danger-premium px-5 py-2.5 text-xs font-bold rounded-xl transition active:scale-95 cursor-pointer"
                  >
                    Clear All Photos
                  </button>
                </div>
              </div>
            )}

            {activeDetailsModal === 'voices' && (
              <div>
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-3xl mb-5 shadow-inner">🎤</div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">Clear Voice Notes Details</h3>
                <div className="space-y-3.5 text-xs text-slate-600 font-medium leading-relaxed">
                  <p>
                    This cleanup operation targets audio voice recording notes uploaded by guards when making attendance correction or leave requests.
                  </p>
                  <div className="bg-[#F6FAFF] border border-blue-100 p-4 rounded-xl space-y-2">
                    <p className="font-bold text-blue-900 uppercase tracking-wider text-[10px]">Database Impact:</p>
                    <p>Updates the <code>audio_url</code> field to <code>NULL</code> in the <strong>attendance_requests</strong> table.</p>
                    <p className="font-bold text-blue-900 uppercase tracking-wider text-[10px] pt-1">Storage Impact:</p>
                    <p>Permanently deletes all recording files (<code>.webm</code>) inside the <code>voice-requests</code> bucket in Supabase storage.</p>
                  </div>
                  <p className="text-[11px] text-amber-600 font-semibold bg-amber-50/50 p-3 rounded-lg border border-amber-100">
                    ℹ️ <strong>What is preserved:</strong> The request text transcripts, timestamps, guard names, and approval status are kept in the database.
                  </p>
                  <p className="text-[11px] text-red-500 font-bold bg-red-50/50 p-3 rounded-lg border border-red-100">
                    ⚠️ <strong>Warning:</strong> This action is completely irreversible. Once audio voice notes are deleted, they cannot be recovered.
                  </p>
                </div>
                <div className="flex gap-3 justify-end mt-6">
                  <button 
                    onClick={() => setActiveDetailsModal(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition active:scale-95"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      clearAllVoiceNotes();
                      setActiveDetailsModal(null);
                    }}
                    className="btn-danger-premium px-5 py-2.5 text-xs font-bold rounded-xl transition active:scale-95 cursor-pointer"
                  >
                    Clear All Voice Notes
                  </button>
                </div>
              </div>
            )}

            {activeDetailsModal === 'incidents' && (
              <div>
                <div className="w-14 h-14 rounded-2xl bg-[#FFF5F5] text-red-600 flex items-center justify-center text-3xl mb-5 shadow-inner border border-red-100">🚨</div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">Clear Incident Reports Details</h3>
                <div className="space-y-3.5 text-xs text-slate-600 font-medium leading-relaxed">
                  <p>
                    This cleanup operation removes historical incident reports filed by guards in the field.
                  </p>
                  <div className="bg-[#FFF5F5] border border-red-100 p-4 rounded-xl space-y-2">
                    <p className="font-bold text-red-900 uppercase tracking-wider text-[10px]">Database Impact:</p>
                    <p>Deletes all rows and records from the <strong>incidents</strong> table.</p>
                  </div>
                  <p className="text-[11px] text-amber-600 font-semibold bg-amber-50/50 p-3 rounded-lg border border-amber-100">
                    ℹ️ <strong>What is preserved:</strong> Guard registry records, duty locations, and attendance histories are not affected.
                  </p>
                  <p className="text-[11px] text-red-500 font-bold bg-red-50/50 p-3 rounded-lg border border-red-100">
                    ⚠️ <strong>Warning:</strong> This action is completely irreversible. All reported incident data, logs, and descriptions will be deleted.
                  </p>
                </div>
                <div className="flex gap-3 justify-end mt-6">
                  <button 
                    onClick={() => setActiveDetailsModal(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition active:scale-95"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      clearIncidents();
                      setActiveDetailsModal(null);
                    }}
                    className="btn-danger-premium px-5 py-2.5 text-xs font-bold rounded-xl transition active:scale-95 cursor-pointer"
                  >
                    Clear All Incidents
                  </button>
                </div>
              </div>
            )}

            {activeDetailsModal === 'tour' && (
              <div>
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-3xl mb-5 shadow-inner">📖</div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">System Interactive Tour Details</h3>
                <div className="space-y-3.5 text-xs text-slate-600 font-medium leading-relaxed">
                  <p>
                    Starts a guided, automated audio tour designed to walk administrators through the capabilities of SecureSys.
                  </p>
                  <div className="bg-emerald-50/20 border border-emerald-100 p-4 rounded-xl space-y-2 text-emerald-900">
                    <p className="font-bold uppercase tracking-wider text-[10px]">What the Tour Covers:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Overview of the main Admin Dashboard</li>
                      <li>Live Tracking Map and Guard GPS monitoring</li>
                      <li>Staff Registry management and Guard presets</li>
                      <li>Roster planning and shift settings</li>
                      <li>Incident logging and audio reports</li>
                    </ul>
                  </div>
                  <p>
                    The tour features <strong>text-to-speech guidance</strong> (English) and auto-highlights corresponding dashboard widgets as you proceed.
                  </p>
                </div>
                <div className="flex gap-3 justify-end mt-6">
                  <button 
                    onClick={() => setActiveDetailsModal(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition active:scale-95"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      onStartTour();
                      setActiveDetailsModal(null);
                    }}
                    className="btn-primary-premium px-5 py-2.5 text-xs font-bold rounded-xl transition active:scale-95 cursor-pointer"
                  >
                    Start Guided Tour
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-8 w-full">
        {/* System Cleanup Settings Section - Soft Purple Tint */}
        <div className="glass-card p-6 bg-[#F8F5FF] border border-purple-100 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
          <h2 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
            <span>⚙️</span>
            <span>System Cleanup Settings</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mb-6">Manage system storage limits and clean up old data from Supabase Storage and the database.</p>

          {/* 4 Operations Row Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Card 1: Clear Guards Photos */}
            <div className="bg-white rounded-2xl p-5 border border-slate-100 flex flex-col justify-between shadow-sm hover:scale-[1.02] hover:shadow-md transition-all duration-300">
              <div>
                <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl mb-4 shadow-inner">📸</div>
                <h3 className="font-bold text-slate-800 text-sm mb-1 uppercase tracking-wider">Clear Guard Photos</h3>
                <p className="text-[11px] text-slate-450 font-medium mb-4 leading-relaxed line-clamp-3">
                  Delete all guard check-in/out selfie files from storage and clear their database links.
                </p>
              </div>
              <button
                onClick={() => setActiveDetailsModal('photos')}
                className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-750 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer text-center"
              >
                More Details
              </button>
            </div>

            {/* Card 2: Clear Voice Notes */}
            <div className="bg-white rounded-2xl p-5 border border-slate-100 flex flex-col justify-between shadow-sm hover:scale-[1.02] hover:shadow-md transition-all duration-300">
              <div>
                <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-650 flex items-center justify-center text-xl mb-4 shadow-inner">🎤</div>
                <h3 className="font-bold text-slate-800 text-sm mb-1 uppercase tracking-wider">Clear Voice Notes</h3>
                <p className="text-[11px] text-slate-450 font-medium mb-4 leading-relaxed line-clamp-3">
                  Remove audio voice recordings from Supabase storage and reset request links.
                </p>
              </div>
              <button
                onClick={() => setActiveDetailsModal('voices')}
                className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-750 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer text-center"
              >
                More Details
              </button>
            </div>

            {/* Card 3: Clear Incident Reports */}
            <div className="bg-white rounded-2xl p-5 border border-slate-100 flex flex-col justify-between shadow-sm hover:scale-[1.02] hover:shadow-md transition-all duration-300">
              <div>
                <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl mb-4 shadow-inner border border-rose-100">🚨</div>
                <h3 className="font-bold text-slate-800 text-sm mb-1 uppercase tracking-wider">Clear Incidents</h3>
                <p className="text-[11px] text-slate-450 font-medium mb-4 leading-relaxed line-clamp-3">
                  Permanently deletes all reported incidents and database logs.
                </p>
              </div>
              <button
                onClick={() => setActiveDetailsModal('incidents')}
                className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-750 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer text-center"
              >
                More Details
              </button>
            </div>

            {/* Card 4: Guided Tour */}
            <div className="bg-white rounded-2xl p-5 border border-slate-100 flex flex-col justify-between shadow-sm hover:scale-[1.02] hover:shadow-md transition-all duration-300">
              <div>
                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl mb-4 shadow-inner">📖</div>
                <h3 className="font-bold text-slate-800 text-sm mb-1 uppercase tracking-wider">Guided Tour</h3>
                <p className="text-[11px] text-slate-450 font-medium mb-4 leading-relaxed line-clamp-3">
                  Launch the automated system walkthrough with audio voiceover guidance.
                </p>
              </div>
              <button
                onClick={() => setActiveDetailsModal('tour')}
                className="w-full py-2 bg-[#e6fcf5] hover:bg-[#cbf7ea] text-emerald-800 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer text-center"
              >
                More Details
              </button>
            </div>

          </div>
        </div>

        {/* Shift Timings Card - Soft Blue Tint */}
        <div className="glass-card p-6 bg-[#F6FAFF] border border-blue-100 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
          <h2 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
            <span>⏰</span>
            <span>Constant Shift Timings Settings</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mb-6">Configure the default start and end times for scheduled shift presets. These are used as autofill values when registering or editing guards.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SHIFT_OPTIONS.map((shift) => (
              <div key={shift} className="p-4 bg-white rounded-2xl border border-slate-100/80 shadow-sm hover:scale-[1.01] hover:shadow-md transition-all duration-300">
                <h3 className="font-bold text-slate-700 mb-2.5 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span className="text-indigo-500">⏱️</span>
                  <span>{shift}</span>
                </h3>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-[10px] text-slate-400 mb-1 font-bold uppercase tracking-wider">Start Time</label>
                    <input
                      type="time"
                      value={shiftTimings[shift]?.start || ""}
                      onChange={(e) => setShiftTimings((prev) => ({
                        ...prev,
                        [shift]: { ...prev[shift], start: e.target.value },
                      }))}
                      className="w-full h-9 border border-gray-200 px-3 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 bg-[#F4F6F9] hover:bg-slate-100/60 focus:bg-white text-xs transition"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-slate-400 mb-1 font-bold uppercase tracking-wider">End Time</label>
                    <input
                      type="time"
                      value={shiftTimings[shift]?.end || ""}
                      onChange={(e) => setShiftTimings((prev) => ({
                        ...prev,
                        [shift]: { ...prev[shift], end: e.target.value },
                      }))}
                      className="w-full h-9 border border-gray-200 px-3 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 bg-[#F4F6F9] hover:bg-slate-100/60 focus:bg-white text-xs transition"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-slate-150">
            <button
              onClick={resetTimings}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-650 hover:bg-slate-50 transition text-xs font-bold active:scale-95 bg-white cursor-pointer"
            >
              Reset to Defaults
            </button>
            <button
              onClick={saveTimings}
              className="btn-primary-premium px-5 py-2.5 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer"
            >
              Save Shift Timings
            </button>
          </div>
        </div>

        {/* Danger Zone Section - Soft Red Tint */}
        <div className="glass-card p-6 bg-[#FFF5F5] border border-red-100 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
          <h2 className="text-base font-bold text-red-700 mb-2 flex items-center gap-2 uppercase tracking-wider text-sm">
            <span>⚠️</span>
            <span>Danger Zone</span>
          </h2>
          
          {/* GitHub-style White Card + Red Left Border */}
          <div className="bg-white rounded-2xl border border-red-150 border-l-[6px] border-l-[#EF4444] p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-1.5 flex-1">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Full System Database Reset</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Permanently deletes all data across all tables (guards, attendance, circulars, incidents, shifts, tracking, etc.) from the database. <strong>Administrative login profiles (admins) will not be deleted</strong>, ensuring you don't lose system access.
              </p>
            </div>
            <button
              onClick={fullSystemReset}
              className="btn-danger-premium px-6 py-3 rounded-xl text-xs font-bold transition shrink-0 active:scale-95 cursor-pointer text-center"
            >
              Reset System Database
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default Settings;
