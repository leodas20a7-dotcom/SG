import { useEffect, useState, useRef } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import Camera from "./Camera";
import { calcDistance, getLocation, uploadPhoto } from "./lib/geoUtils";
import LoadingOverlay from "./LoadingOverlay";

function Attendance({ role, userGuardId, hideHistory }) {
  const [guards, setGuards] = useState([]);
  const [records, setRecords] = useState([]);
  const [locations, setLocations] = useState([]);
  const [guardId, setGuardId] = useState("");
  const [dutyLocationId, setDutyLocationId] = useState("");
  const [status, setStatus] = useState("Present");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState(null);
  const [checkInCoords, setCheckInCoords] = useState(null);
  const [currentAttendanceId, setCurrentAttendanceId] = useState(null);
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [gpsStatus, setGpsStatus] = useState(null);
  const trackingRef = useRef(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [filterGuard, setFilterGuard] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const { showToast, ToastContainer } = useToast();

  const isAbsent = status === "Absent";

  const filteredRecords = records.filter(item => {
    const matchesGuard = filterGuard ? String(item.guard_id) === String(filterGuard) : true;
    const matchesLocation = filterLocation ? String(item.duty_location_id) === String(filterLocation) : true;
    const matchesStatus = filterStatus ? item.status === filterStatus : true;
    const recordDate = item.check_in_time?.split("T")[0] || item.date || "";
    const matchesStartDate = filterStartDate ? recordDate >= filterStartDate : true;
    const matchesEndDate = filterEndDate ? recordDate <= filterEndDate : true;
    return matchesGuard && matchesLocation && matchesStatus && matchesStartDate && matchesEndDate;
  });

  function downloadReportCSV() {
    if (filteredRecords.length === 0) {
      showToast("No records to export.", "error");
      return;
    }
    const headers = ["Guard", "Date", "Location", "Check In", "Check Out", "Status"];
    const rows = filteredRecords.map(r => [
      r.guards?.name || "Unknown",
      r.check_in_time?.split("T")[0] || r.date || "—",
      r.duty_locations?.place_name || "—",
      r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : r.check_in || "—",
      r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString() : r.check_out || "—",
      r.status
    ]);
    const csvContent = [headers, ...rows].map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Attendance_Report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function printReport() {
    if (filteredRecords.length === 0) {
      showToast("No records to print.", "error");
      return;
    }
    const printWindow = window.open("", "_blank");
    const todayStr = new Date().toLocaleDateString();
    
    const rowsHtml = filteredRecords.map(r => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${r.guards?.name || "Unknown"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${r.check_in_time?.split("T")[0] || r.date || "—"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${r.duty_locations?.place_name || "—"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : r.check_in || "—"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString() : r.check_out || "—"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">${r.status}</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Attendance Report - ${todayStr}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; color: #333; }
            h1 { color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; }
            .meta { margin-bottom: 20px; font-size: 14px; color: #555; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background-color: #f3f4f6; padding: 10px; text-align: left; border-bottom: 2px solid #ddd; }
          </style>
        </head>
        <body>
          <h1>Attendance Management Report</h1>
          <div class="meta">
            <p><strong>Date Generated:</strong> ${todayStr}</p>
            <p><strong>Total Records:</strong> ${filteredRecords.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Guard</th>
                <th>Date</th>
                <th>Location</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  }

  async function fetchGuards() {
    try {
      const { data } = await supabase.from("guards").select("*");
      setGuards(data || []);
    } catch { showToast("Could not load guards list.", "error"); }
  }

  async function fetchAttendance() {
    try {
      const { data } = await supabase.from("attendance").select(`*, guards(name), duty_locations(place_name)`).order("id", { ascending: false });
      setRecords(data || []);
    } catch { showToast("Could not load attendance records.", "error"); }
  }

  async function fetchLocations() {
    try {
      const { data } = await supabase.from("duty_locations").select("*");
      setLocations(data || []);
    } catch { /* table may not exist yet */ }
  }

  function getGuardCurrentAttendance(records, gId) {
    const today = new Date().toISOString().split("T")[0];
    // Fix today condition: check_in_time ISO timestamp starts with date string
    return records.find((r) => r.guard_id === gId && r.check_in_time?.startsWith(today) && r.check_in_photo && !r.check_out_photo);
  }

  useEffect(() => {
    fetchGuards();
    fetchAttendance();
    fetchLocations();
  }, []);

  useEffect(() => {
    if (records.length > 0 && guardId) {
      const active = getGuardCurrentAttendance(records, guardId);
      if (active) {
        setIsOnDuty(true);
        setCurrentAttendanceId(active.id);
      } else {
        setIsOnDuty(false);
        setCurrentAttendanceId(null);
      }
    } else {
      setIsOnDuty(false);
      setCurrentAttendanceId(null);
    }
  }, [records, guardId]);

  function clearError(field) { setErrors((p) => ({ ...p, [field]: "" })); }

  function validate() {
    const errs = {};
    if (!guardId) errs.guardId = "Please select a guard";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function startLiveTracking(attId) {
    const sendLocation = async () => {
      try {
        const pos = await getLocation();
        await supabase.from("live_tracking").insert([{
          guard_id: guardId,
          attendance_id: attId,
          latitude: pos.lat,
          longitude: pos.lng,
        }]);
      } catch { /* silently continue */ }
    };
    await sendLocation();
    trackingRef.current = setInterval(sendLocation, 300000);
  }

  function stopLiveTracking() {
    if (trackingRef.current) { clearInterval(trackingRef.current); trackingRef.current = null; }
  }

  async function handleCheckIn() {
    if (!validate()) return;
    if (!dutyLocationId) { showToast("Please select a duty location.", "error"); return; }
    setLoading(true);
    setGpsStatus("Getting GPS location...");
    try {
      const loc = await getLocation();
      const dutyLoc = locations.find((l) => l.id === dutyLocationId);
      if (!dutyLoc) { showToast("Duty location not found.", "error"); setLoading(false); setGpsStatus(null); return; }
      const dist = calcDistance(loc.lat, loc.lng, dutyLoc.latitude, dutyLoc.longitude);
      if (dist > dutyLoc.radius_meters) {
        setGpsStatus(`You are ${Math.round(dist)}m away (max ${dutyLoc.radius_meters}m allowed). Move inside the duty area.`);
        setLoading(false);
        return;
      }
      setGpsStatus("Location verified! Capturing selfie...");
      setCheckInCoords(loc);
      setCameraMode("checkin");
      setLoading(false);
      setShowCamera(true);
    } catch (err) {
      showToast(err.message, "error");
      setLoading(false);
      setGpsStatus(null);
    }
  }

  async function onCameraCapture(dataUrl) {
    if (cameraMode === "checkin") {
      setLoading(true);
      setGpsStatus("Uploading photo...");
      try {
        const photoUrl = await uploadPhoto(guardId, dataUrl, supabase);
        const now = new Date().toISOString();
        const { data, error } = await supabase.from("attendance").insert([{
          guard_id: guardId,
          duty_location_id: dutyLocationId,
          check_in_time: now,
          status: "Present",
          check_in_photo: photoUrl,
          check_in_lat: checkInCoords.lat,
          check_in_long: checkInCoords.lng,
        }]).select();
        if (error) { showToast("Error marking attendance.", "error"); setLoading(false); setGpsStatus(null); return; }
        setCurrentAttendanceId(data[0].id);
        setIsOnDuty(true);
        showToast("Check-in successful! Selfie captured.", "success");
        startLiveTracking(data[0].id);
        setGuardId(""); setDutyLocationId(""); setCheckInCoords(null);
        fetchAttendance();
      } catch (err) { showToast(err.message, "error"); }
      setLoading(false);
      setGpsStatus(null);
    } else if (cameraMode === "checkout") {
      setLoading(true);
      setGpsStatus("Uploading checkout photo...");
      try {
        const photoUrl = await uploadPhoto(guardId, dataUrl, supabase);
        const pos = await getLocation();
        const now = new Date().toISOString();
        const { error } = await supabase.from("attendance").update({
          check_out_time: now,
          check_out_photo: photoUrl,
          check_out_lat: pos.lat,
          check_out_long: pos.lng,
        }).eq("id", currentAttendanceId);
        if (error) { showToast("Error checking out.", "error"); setLoading(false); setGpsStatus(null); return; }
        stopLiveTracking();
        setIsOnDuty(false);
        setCurrentAttendanceId(null);
        showToast("Check-out successful! Stay safe.", "success");
        fetchAttendance();
      } catch (err) { showToast(err.message, "error"); }
      setLoading(false);
      setGpsStatus(null);
    }
    setShowCamera(false);
  }

  async function handleCheckOut() {
    setLoading(true);
    setGpsStatus("Verifying location for check-out...");
    try {
      const pos = await getLocation();
      const att = records.find((r) => r.id === currentAttendanceId);
      if (!att) { showToast("Attendance record not found.", "error"); setLoading(false); setGpsStatus(null); return; }
      if (att.duty_location_id) {
        const { data: dutyLoc } = await supabase.from("duty_locations").select("*").eq("id", att.duty_location_id).single();
        if (dutyLoc) {
          const dist = calcDistance(pos.lat, pos.lng, dutyLoc.latitude, dutyLoc.longitude);
          if (dist > dutyLoc.radius_meters) {
            setGpsStatus(`You are ${Math.round(dist)}m outside. Move inside to check out.`);
            setLoading(false);
            return;
          }
        }
      }
      setGpsStatus("Location verified! Capture selfie to checkout.");
      setCameraMode("checkout");
      setLoading(false);
      setShowCamera(true);
    } catch (err) {
      showToast(err.message, "error");
      setLoading(false);
      setGpsStatus(null);
    }
  }

  function handleStatusChange(value) {
    setStatus(value);
  }

  async function markManualAttendance() {
    if (!validate()) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("attendance").insert([
        { guard_id: guardId, check_in_time: isAbsent ? null : new Date().toISOString(), check_out_time: null, status, duty_location_id: dutyLocationId || null },
      ]);
      if (error) { showToast("Error marking attendance.", "error"); return; }
      showToast("Attendance marked!", "success");
      setGuardId(""); setDutyLocationId(""); setStatus("Present");
      fetchAttendance();
    } catch { showToast("Network error.", "error"); }
    finally { setLoading(false); }
  }

  return (
    <>
      <ToastContainer />
      {loading && <LoadingOverlay message={gpsStatus || "Processing attendance..."} />}
      {showCamera && <Camera onCapture={onCameraCapture} onClose={() => { setShowCamera(false); setCameraMode(null); setLoading(false); setGpsStatus(null); }} />}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setPreviewPhoto(null)}>
          <div className="relative max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreviewPhoto(null)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center text-gray-600 hover:text-gray-900 text-lg z-10">&times;</button>
            <img src={previewPhoto} alt="Attendance photo" className="w-full rounded-2xl shadow-2xl" />
          </div>
        </div>
      )}
      <div className="mt-2">

        <div className="glass-card rounded-2xl p-6 mb-8 ring-1 ring-indigo-200">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">
            {isOnDuty ? "🟢 On Duty — Check Out" : "📋 Check In"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Guard</label>
              <select value={guardId} onChange={(e) => { setGuardId(e.target.value); clearError("guardId"); }}
                className={`w-full h-12 border p-3 rounded-lg focus:outline-none focus:ring-2 transition bg-white ${errors.guardId ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-indigo-300"}`}>
                <option value="">Select Guard</option>
                {guards.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
              </select>
              {errors.guardId && <p className="text-red-500 text-sm mt-1">{errors.guardId}</p>}
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Duty Location</label>
              <select value={dutyLocationId} onChange={(e) => setDutyLocationId(e.target.value)}
                className="w-full h-12 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                <option value="">Select Location</option>
                {locations.map((l) => (<option key={l.id} value={l.id}>{l.place_name} ({l.radius_meters}m)</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Status</label>
              <select value={status} onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full h-12 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                <option value="Present">Present</option>
                <option value="Absent">Absent</option>
                <option value="Leave">Leave</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              {isOnDuty ? (
                <button onClick={handleCheckOut} disabled={loading}
                  className={`w-full h-12 rounded-lg text-white font-semibold transition ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-orange-600 hover:bg-orange-700"}`}>
                  {loading ? "Processing..." : "📸 End Duty"}
                </button>
              ) : (
                <button onClick={handleCheckIn} disabled={loading || isAbsent}
                  className={`w-full h-12 rounded-lg text-white font-semibold transition ${loading || isAbsent ? "bg-gray-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"}`}>
                  {loading ? "Processing..." : "📍 Start Duty"}
                </button>
              )}
            </div>
          </div>
          {gpsStatus && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${gpsStatus.includes("m away") || gpsStatus.includes("outside") ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>
              {gpsStatus}
            </div>
          )}
          <div className="mt-3">
            <button onClick={markManualAttendance} disabled={loading || isOnDuty}
              className="text-sm text-gray-500 hover:text-gray-700 underline">Manual entry (no GPS)</button>
          </div>
        </div>

        {!hideHistory && (
          <div className="space-y-4 mt-6">
            {/* Filters and Actions Bar */}
            <div className="flex justify-between items-center bg-transparent mb-0">
              <h3 className="text-lg font-bold text-gray-800">📋 Attendance History</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowFiltersModal(true)}
                  className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap"
                >
                  🔍 Filter Option
                </button>
                <button
                  onClick={downloadReportCSV}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap"
                >
                  📥 Export CSV
                </button>
                <button
                  onClick={printReport}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap"
                >
                  🖨️ Print Report
                </button>
              </div>
            </div>

            {/* Filter Overlay Popup Modal */}
            {showFiltersModal && (
              <div className="fixed inset-0 z-[150] bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                  {/* Modal Header */}
                  <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                      <h3 className="font-bold text-gray-800 text-base">🔍 Filter Records</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Filter history records by criteria</p>
                    </div>
                    <button onClick={() => setShowFiltersModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm text-gray-500 hover:bg-gray-50 transition border border-gray-100">✕</button>
                  </div>
                  {/* Modal Body */}
                  <div className="p-6 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Guard</label>
                      <select
                        value={filterGuard}
                        onChange={(e) => setFilterGuard(e.target.value)}
                        className="w-full h-11 border border-gray-300 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 text-sm bg-white"
                      >
                        <option value="">All Guards</option>
                        {guards.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Location</label>
                      <select
                        value={filterLocation}
                        onChange={(e) => setFilterLocation(e.target.value)}
                        className="w-full h-11 border border-gray-300 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 text-sm bg-white"
                      >
                        <option value="">All Locations</option>
                        {locations.map((l) => (<option key={l.id} value={l.id}>{l.place_name}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="w-full h-11 border border-gray-300 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 text-sm bg-white"
                      >
                        <option value="">All Statuses</option>
                        <option value="Present">Present</option>
                        <option value="Absent">Absent</option>
                        <option value="Leave">Leave</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={filterStartDate}
                          onChange={(e) => setFilterStartDate(e.target.value)}
                          className="w-full h-11 border border-gray-300 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 text-sm bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">End Date</label>
                        <input
                          type="date"
                          value={filterEndDate}
                          onChange={(e) => setFilterEndDate(e.target.value)}
                          className="w-full h-11 border border-gray-300 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 text-sm bg-white"
                        />
                      </div>
                    </div>
                  </div>
                  {/* Modal Footer */}
                  <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50/50 justify-end">
                    <button
                      onClick={() => {
                        setFilterGuard("");
                        setFilterLocation("");
                        setFilterStatus("");
                        setFilterStartDate("");
                        setFilterEndDate("");
                        setShowFiltersModal(false);
                      }}
                      className="px-4 py-2 border border-gray-200 text-gray-500 rounded-xl text-xs font-bold hover:bg-gray-100 transition"
                    >
                      Clear All
                    </button>
                    <button
                      onClick={() => setShowFiltersModal(false)}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-md"
                    >
                      Apply Filters
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Table Card */}
            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left p-4 text-gray-600 font-semibold">Guard</th>
                      <th className="text-left p-4 text-gray-600 font-semibold">Date</th>
                      <th className="text-left p-4 text-gray-600 font-semibold">Location</th>
                      <th className="text-left p-4 text-gray-600 font-semibold">Check In</th>
                      <th className="text-left p-4 text-gray-600 font-semibold">Check Out</th>
                      <th className="text-left p-4 text-gray-600 font-semibold">Status</th>
                      <th className="text-left p-4 text-gray-600 font-semibold">Photo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-gray-400">No attendance records matching the filters.</td></tr>
                    ) : filteredRecords.map((item) => (
                      <tr key={item.id} className="border-b hover:bg-gray-50 transition">
                        <td className="p-4 font-medium">{item.guards?.name}</td>
                        <td className="p-4 text-gray-500">{item.check_in_time?.split("T")[0] || item.date}</td>
                        <td className="p-4 text-gray-500 text-sm">{item.duty_locations?.place_name || "—"}</td>
                        <td className="p-4">{item.check_in_time ? new Date(item.check_in_time).toLocaleTimeString() : item.check_in || "—"}</td>
                        <td className="p-4">{item.check_out_time ? new Date(item.check_out_time).toLocaleTimeString() : item.check_out || "—"}</td>
                        <td className="p-4">
                          {(() => {
                            let displayStatus = item.status;
                            let statusClass = "bg-gray-100 text-gray-700";
                            if (item.status === "Present") {
                              if (item.check_in_time && !item.check_out_time) {
                                const checkInDate = new Date(item.check_in_time).toDateString();
                                const todayDate = new Date().toDateString();
                                if (checkInDate === todayDate) {
                                  displayStatus = "On Duty";
                                  statusClass = "status-chip-on-duty";
                                } else {
                                  displayStatus = "Missed Checkout";
                                  statusClass = "status-chip-missed-checkout";
                                }
                              } else {
                                displayStatus = "Present";
                                statusClass = "status-chip-present";
                              }
                            } else if (item.status === "Absent") {
                              statusClass = "status-chip-absent";
                            } else {
                              statusClass = "status-chip-leave";
                            }
                            return (
                              <span className={`status-chip ${statusClass}`}>
                                {displayStatus}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="p-4">
                          <div className="flex gap-1">
                            {item.check_in_photo ? (
                              <button onClick={() => setPreviewPhoto(item.check_in_photo)} className="text-blue-500 hover:underline text-sm">📸 In</button>
                            ) : null}
                            {item.check_out_photo ? (
                              <button onClick={() => setPreviewPhoto(item.check_out_photo)} className="text-blue-500 hover:underline text-sm ml-2">📸 Out</button>
                            ) : null}
                            {!item.check_in_photo && !item.check_out_photo ? "—" : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default Attendance;
