import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";

const SHIFT_OPTIONS = ["Morning Shift", "Evening Shift", "Night Shift", "Full Day"];

const DEFAULT_TIMINGS = {
  "Morning Shift": { start: "06:00", end: "14:00" },
  "Evening Shift": { start: "14:00", end: "22:00" },
  "Night Shift": { start: "22:00", end: "06:00" },
  "Full Day": { start: "08:00", end: "20:00" },
};

function Shifts() {

  const [guards, setGuards] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [guardId, setGuardId] = useState("");
  const [shiftName, setShiftName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [shiftTimings, setShiftTimings] = useState(DEFAULT_TIMINGS);
  const { showToast, ToastContainer } = useToast();

  async function fetchGuards() {
    try {
      const { data } = await supabase.from("guards").select("*");
      setGuards(data || []);
    } catch {
      showToast("Could not load guards list.", "error");
    }
  }

  async function fetchShifts() {
    try {
      const { data } = await supabase
        .from("shifts")
        .select(`*, guards(name)`)
        .order("id", { ascending: false });
      setShifts(data || []);
    } catch {
      showToast("Could not load shifts.", "error");
    }
  }

  function validate() {
    const errs = {};
    if (!guardId) errs.guardId = "Select a guard";
    if (!shiftName) errs.shiftName = "Select a shift type";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function addShift() {
    if (!validate()) return;
    setLoading(true);
    try {
      const selectedGuard = guards.find(g => String(g.id) === String(guardId));
      const guardSite = selectedGuard?.site || "";

      const { error } = await supabase.from("shifts").insert([
        {
          guard_id: guardId,
          site: guardSite,
          shift_name: shiftName,
          start_time: startTime || null,
          end_time: endTime || null,
        },
      ]);

      if (error) {
        showToast("Error creating shift. Please try again.", "error");
        return;
      }

      // ── Update guard's site and duty_location_id ──
      if (selectedGuard) {
        let locId = null;
        if (guardSite) {
          let { data: loc } = await supabase.from("duty_locations").select("id").eq("place_name", guardSite).maybeSingle();
          if (!loc) {
            const { data: newLoc } = await supabase.from("duty_locations").insert({
              place_name: guardSite, latitude: 0, longitude: 0, radius_meters: 100
            }).select("id").single();
            loc = newLoc;
          }
          locId = loc?.id;
        }
        await supabase.from("guards").update({ site: guardSite, duty_location_id: locId }).eq("id", guardId);
      }

      // ── Auto-notify guard about their new shift ──
      const guardName = selectedGuard?.name || "Guard";
      const sTime = startTime || shiftTimings[shiftName]?.start || "—";
      const eTime = endTime   || shiftTimings[shiftName]?.end   || "—";
      await supabase.from("circulars").insert([{
        title: `New Shift Assigned – ${guardName}`,
        content: `⏰ Shift: ${shiftName}\n🕐 Time: ${sTime} → ${eTime}\n📍 Site: ${guardSite}\n\nPlease report on time.`,
      }]);

      showToast("Shift assigned & guard notified!", "success");
      setGuardId(""); setShiftName("");
      setStartTime(""); setEndTime("");
      fetchShifts();
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function fetchTimings() {
    try {
      const { data } = await supabase.from("shift_timings").select("*");
      if (data && data.length > 0) {
        const timings = {};
        data.forEach((row) => {
          timings[row.shift_name] = { start: row.start_time, end: row.end_time };
        });
        setShiftTimings((prev) => ({ ...prev, ...timings }));
      }
    } catch {
      showToast("Could not load shift timings.", "error");
    }
  }

  async function saveTimings() {
    try {
      for (const [shiftName, times] of Object.entries(shiftTimings)) {
        const { error } = await supabase.from("shift_timings").upsert(
          { shift_name: shiftName, start_time: times.start, end_time: times.end },
          { onConflict: "shift_name" }
        );
        if (error) {
          showToast("Error saving timings. Please try again.", "error");
          return;
        }
      }

      // ── Auto-notify ALL guards about updated timings ──
      const lines = Object.entries(shiftTimings)
        .map(([sn, t]) => `• ${sn}: ${t.start} → ${t.end}`)
        .join("\n");
      await supabase.from("circulars").insert([{
        title: "⏰ Shift Timings Updated",
        content: `The following shift timings have been updated effective immediately:\n\n${lines}\n\nPlease note the new timings for your upcoming shifts.`,
      }]);

      showToast("Shift timings saved & all guards notified!", "success");
      setShowSettings(false);
    } catch {
      showToast("Network error. Please try again.", "error");
    }
  }

  async function deleteShift(id, guardName) {
    try {
      const { error } = await supabase.from("shifts").delete().eq("id", id);
      if (error) { showToast("Could not delete shift.", "error"); return; }
      showToast(`Shift removed for ${guardName}.`, "success");
      fetchShifts();
    } catch {
      showToast("Network error.", "error");
    }
  }

  async function resetTimings() {
    try {
      for (const [shiftName, times] of Object.entries(DEFAULT_TIMINGS)) {
        await supabase.from("shift_timings").upsert(
          { shift_name: shiftName, start_time: times.start, end_time: times.end },
          { onConflict: "shift_name" }
        );
      }
      setShiftTimings(DEFAULT_TIMINGS);
      showToast("Timings reset to defaults!", "success");
      setShowSettings(false);
    } catch {
      showToast("Network error. Please try again.", "error");
    }
  }

  function handleShiftChange(value) {
    setShiftName(value);
    clearError("shiftName");
    const timing = shiftTimings[value];
    if (timing) {
      setStartTime(timing.start);
      setEndTime(timing.end);
    }
  }

  useEffect(() => {
    fetchGuards();
    fetchShifts();
    fetchTimings();
  }, []);

  function clearError(field) {
    setErrors((prev) => ({ ...prev, [field]: "" }));
  }

  return (
    <>
      <ToastContainer />
      <div className="mt-10">
        <div className="flex justify-between items-center mb-5">
          <h1 className="text-2xl font-bold text-gray-800">Shift Scheduling</h1>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-lg transition text-sm"
          >
            ⚙️ Settings
          </button>
        </div>

        {/* FORM */}
        <div className="glass-card rounded-2xl p-6 mb-8 ring-1 ring-purple-200">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">🗓️ Assign New Shift</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Guard</label>
              <select
                value={guardId}
                onChange={(e) => { setGuardId(e.target.value); clearError("guardId"); }}
                className={`w-full h-12 border p-3 rounded-lg focus:outline-none focus:ring-2 transition bg-white ${errors.guardId ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-purple-300"}`}
              >
                <option value="">Select Guard</option>
                {guards.map((guard) => (
                  <option key={guard.id} value={guard.id}>{guard.name} — {guard.site || "No site"}</option>
                ))}
              </select>
              {errors.guardId && <p className="text-red-500 text-sm mt-1">{errors.guardId}</p>}
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Shift Type</label>
              <select
                value={shiftName}
                onChange={(e) => handleShiftChange(e.target.value)}
                className={`w-full h-12 border p-3 rounded-lg focus:outline-none focus:ring-2 transition bg-white ${errors.shiftName ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-purple-300"}`}
              >
                <option value="">Select Shift</option>
                {SHIFT_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {errors.shiftName && <p className="text-red-500 text-sm mt-1">{errors.shiftName}</p>}
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full h-12 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full h-12 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
            </div>
          </div>

          <button
            onClick={addShift}
            disabled={loading}
            className={`mt-5 px-6 py-3 rounded-lg text-white font-semibold transition ${
              loading ? "bg-gray-400 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"
            }`}
          >
            {loading ? "Saving..." : "Assign Shift"}
          </button>
        </div>

        {/* TABLE */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left p-4 text-gray-600 font-semibold">Guard</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Shift</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Start</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">End</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shifts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-400">
                      No shifts scheduled yet.
                    </td>
                  </tr>
                ) : (
                  shifts.map((shift) => (
                    <tr key={shift.id} className="border-b hover:bg-gray-50 transition">
                      <td className="p-4 font-medium">{shift.guards?.name}</td>
                      <td className="p-4">
                        <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-700">
                          {shift.shift_name}
                        </span>
                      </td>
                      <td className="p-4">{shift.start_time || "—"}</td>
                      <td className="p-4">{shift.end_time || "—"}</td>
                      <td className="p-4">
                        <button
                          onClick={() => deleteShift(shift.id, shift.guards?.name)}
                          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl p-6 w-[500px] max-h-[90vh] overflow-y-auto shadow-xl border border-white/50">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold text-gray-800">⚙️ Shift Timing Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <p className="text-gray-500 text-sm mb-4">Configure default start and end times for each shift type.</p>

            {SHIFT_OPTIONS.map((shift) => (
              <div key={shift} className="mb-4 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-700 mb-2">{shift}</h3>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                    <input
                      type="time"
                      value={shiftTimings[shift]?.start || ""}
                      onChange={(e) => setShiftTimings((prev) => ({
                        ...prev,
                        [shift]: { ...prev[shift], start: e.target.value },
                      }))}
                      className="w-full h-12 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">End Time</label>
                    <input
                      type="time"
                      value={shiftTimings[shift]?.end || ""}
                      onChange={(e) => setShiftTimings((prev) => ({
                        ...prev,
                        [shift]: { ...prev[shift], end: e.target.value },
                      }))}
                      className="w-full h-12 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300"
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={resetTimings}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
              >
                Reset to Default
              </button>
              <button
                onClick={saveTimings}
                className="px-6 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition"
              >
                Save to Database
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Shifts;
