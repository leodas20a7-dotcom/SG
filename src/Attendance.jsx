import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import Camera from "./Camera";
import { calcDistance, getLocation, uploadPhoto, calculateAttendanceStatus } from "./lib/geoUtils";
import LoadingOverlay from "./LoadingOverlay";
import CustomSelect from "./CustomSelect";
import ConfirmModal from "./ConfirmModal";

function Attendance({ role, userGuardId, hideHistory }) {
  const [guards, setGuards] = useState([]);
  const [records, setRecords] = useState([]);
  const [locations, setLocations] = useState([]);
  const [shifts, setShifts] = useState([]);
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

  // Filters state
  const [filterGuard, setFilterGuard] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [showFiltersModal, setShowFiltersModal] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;



  // Confirm Modal state
  const [confirmConfig, setConfirmConfig] = useState(null);

  const { showToast, ToastContainer } = useToast();

  const isAbsent = status === "Absent";

  const filteredRecords = useMemo(() => {
    return records.filter(item => {
      const matchesGuard = filterGuard ? String(item.guard_id) === String(filterGuard) : true;
      const matchesLocation = filterLocation ? String(item.duty_location_id) === String(filterLocation) : true;
      const matchesStatus = filterStatus ? item.status === filterStatus : true;
      const recordDate = item.check_in_time?.split("T")[0] || item.date || "";
      const matchesStartDate = filterStartDate ? recordDate >= filterStartDate : true;
      const matchesEndDate = filterEndDate ? recordDate <= filterEndDate : true;
      return matchesGuard && matchesLocation && matchesStatus && matchesStartDate && matchesEndDate;
    });
  }, [records, filterGuard, filterLocation, filterStatus, filterStartDate, filterEndDate]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterGuard, filterLocation, filterStatus, filterStartDate, filterEndDate]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredRecords.length / itemsPerPage);
  }, [filteredRecords.length]);

  const paginatedRecords = useMemo(() => {
    return filteredRecords.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [filteredRecords, currentPage]);

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
      const { data: shiftsData } = await supabase.from("shifts").select("*");
      setShifts(shiftsData || []);
    } catch { showToast("Could not load attendance records.", "error"); }
  }

  const getLateMinutes = (item) => {
    if (!item.check_in_time) return 0;
    const checkInTime = new Date(item.check_in_time);
    const checkInDate = item.check_in_time.split("T")[0];
    const guardShifts = shifts.filter(s => String(s.guard_id) === String(item.guard_id));
    const tempShift = guardShifts.find(s => s.shift_date === checkInDate);
    const constantShift = guardShifts.find(s => s.shift_date === null);
    const activeShift = tempShift || constantShift;
    
    if (activeShift && activeShift.start_time) {
      const formatTime = (t) => t.length === 5 ? `${t}:00` : t;
      const schedStartStr = `${checkInDate}T${formatTime(activeShift.start_time)}`;
      const schedStart = new Date(schedStartStr);
      const diffMs = checkInTime.getTime() - schedStart.getTime();
      if (diffMs > 0) {
        return Math.floor(diffMs / (60 * 1000));
      }
    }
    return 0;
  };

  const formatLateMessage = (totalMinutes) => {
    if (totalMinutes < 60) {
      return `${totalMinutes} minute${totalMinutes > 1 ? "s" : ""} late`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const hourText = `${hours} hour${hours > 1 ? "s" : ""}`;
    const minText = mins > 0 ? ` ${mins} minute${mins > 1 ? "s" : ""}` : "";
    return `${hourText}${minText} late`;
  };

  async function fetchLocations() {
    try {
      const { data } = await supabase.from("duty_locations").select("*");
      setLocations(data || []);
    } catch { /* table may not exist yet */ }
  }

  function getGuardCurrentAttendance(records, gId) {
    return records.find((r) => String(r.guard_id) === String(gId) && !r.check_out_time);
  }

  function hasGuardCheckedOutToday(records, gId) {
    if (!gId) return false;
    const today = new Date().toISOString().split("T")[0];
    return records.some((r) => String(r.guard_id) === String(gId) && (r.check_in_time?.startsWith(today) || r.check_out_time?.startsWith(today)) && r.check_out_time);
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

  // Restart auto-ping if tracking should be active but isn't
  useEffect(() => {
    if (isOnDuty && currentAttendanceId) {
      if (!trackingRef.current) {
        startLiveTracking(currentAttendanceId);
      }
    } else {
      stopLiveTracking();
    }
  }, [isOnDuty, currentAttendanceId, guards]);

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
        const currentGuard = guards.find(g => String(g.id) === String(guardId));
        const companyId = currentGuard?.company_id;
        if (!companyId) return;

        const pos = await getLocation();
        const { error } = await supabase.from("live_tracking").insert([{
          guard_id: guardId,
          attendance_id: attId,
          latitude: pos.lat,
          longitude: pos.lng,
          company_id: companyId
        }]);
        if (error) throw error;
      } catch (err) { 
        console.error("Attendance Live Tracking Error:", err);
      }
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
      const isWithinRange = dist <= dutyLoc.radius_meters || (loc.accuracy && dist <= loc.accuracy);
      if (!isWithinRange) {
        setGpsStatus(`You are ${Math.round(dist)}m away (accuracy +/-${Math.round(loc.accuracy || 0)}m, max ${dutyLoc.radius_meters}m allowed). Move inside the duty area.`);
        setLoading(false);
        return;
      }
      setCheckInCoords(loc);
      setCameraMode("checkin");
      setLoading(false);
      setGpsStatus(null);
      setShowCamera(true);
    } catch (err) {
      showToast(err.message, "error");
      setLoading(false);
      setGpsStatus(null);
    }
  }

  async function deleteFileFromStorage(publicUrl) {
    if (!publicUrl) return;
    try {
      const parts = publicUrl.split("/guard-photos/");
      if (parts.length > 1) {
        let fileName = parts[1];
        // Strip query parameters and hash components (e.g. ?t=... or #...)
        fileName = fileName.split("?")[0].split("#")[0];
        const { error } = await supabase.storage.from("guard-photos").remove([fileName]);
        if (error) {
          console.error("Storage delete error for file:", fileName, error);
          showToast(`Storage error: Could not delete "${fileName}". Ensure your Supabase Storage bucket policy allows DELETE operations.`, "warning");
        }
      }
    } catch (err) {
      console.error("Failed to delete storage file:", err);
    }
  }

  async function executeDeleteAttendanceRecord(id) {
    const record = records.find(r => r.id === id);
    if (!record) return;

    setLoading(true);
    try {
      // 1. Delete storage files
      if (record.check_in_photo) await deleteFileFromStorage(record.check_in_photo);
      if (record.check_out_photo) await deleteFileFromStorage(record.check_out_photo);

      // 2. Delete associated live tracking entries
      await supabase.from("live_tracking").delete().eq("attendance_id", id);

      // 3. Delete database record
      const { error } = await supabase.from("attendance").delete().eq("id", id);
      if (error) throw error;

      showToast("Attendance record and associated photos deleted.", "success");
      fetchAttendance();
    } catch (err) {
      showToast("Failed to delete record: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function deleteAttendanceRecord(id) {
    setConfirmConfig({
      message: "Are you sure you want to delete this attendance record and its selfie images?",
      onConfirm: () => executeDeleteAttendanceRecord(id)
    });
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

        // Calculate status based on guard's scheduled shift on the date of check-in
        const checkInRecord = records.find(r => r.id === currentAttendanceId);
        const checkInTime = checkInRecord?.check_in_time;
        const checkInDate = checkInTime?.split("T")[0] || now.split("T")[0];

        // Fetch guard shifts
        const { data: guardShifts } = await supabase.from("shifts").select("*").eq("guard_id", guardId);
        const tempShift = (guardShifts || []).find(s => s.shift_date === checkInDate);
        const constantShift = (guardShifts || []).find(s => s.shift_date === null);
        const activeShift = tempShift || constantShift || null;

        const calculatedStatus = calculateAttendanceStatus(checkInTime, now, activeShift);

        const { error } = await supabase.from("attendance").update({
          check_out_time: now,
          check_out_photo: photoUrl,
          check_out_lat: pos.lat,
          check_out_long: pos.lng,
          status: calculatedStatus,
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
          const isWithinRange = dist <= dutyLoc.radius_meters || (pos.accuracy && dist <= pos.accuracy);
          if (!isWithinRange) {
            setGpsStatus(`You are ${Math.round(dist)}m outside (accuracy +/-${Math.round(pos.accuracy || 0)}m). Move inside to check out.`);
            setLoading(false);
            return;
          }
        }
      }
      setCameraMode("checkout");
      setLoading(false);
      setGpsStatus(null);
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60" onClick={() => setPreviewPhoto(null)}>
          <div className="relative max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreviewPhoto(null)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center text-gray-600 hover:text-gray-900 text-lg z-10">&times;</button>
            <img src={previewPhoto} alt="Attendance photo" className="w-full rounded-2xl shadow-2xl" />
          </div>
        </div>
      )}
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

        <div className="glass-card rounded-2xl p-6 mb-8 ring-1 ring-indigo-200 relative z-50">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">
            {isOnDuty ? "🟢 On Duty — Check Out" : "📋 Check In"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Guard</label>
              <CustomSelect
                value={guardId}
                onChange={val => { setGuardId(val); clearError("guardId"); }}
                options={[
                  { value: "", label: "Select Guard" },
                  ...guards.map(g => ({ value: String(g.id), label: g.name }))
                ]}
                placeholder="Select Guard"
                error={!!errors.guardId}
                heightClass="h-12"
              />
              {errors.guardId && <p className="text-red-500 text-sm mt-1">{errors.guardId}</p>}
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Duty Location</label>
              <CustomSelect
                value={dutyLocationId}
                onChange={val => setDutyLocationId(val)}
                options={[
                  { value: "", label: "Select Location" },
                  ...locations.map(l => ({ value: String(l.id), label: `${l.place_name} (${l.radius_meters}m)` }))
                ]}
                placeholder="Select Location"
                heightClass="h-12"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Status</label>
              <CustomSelect
                value={status}
                onChange={val => handleStatusChange(val)}
                options={[
                  { value: "Present", label: "Present" },
                  { value: "Absent", label: "Absent" },
                  { value: "Leave", label: "Leave" }
                ]}
                placeholder="Select Status"
                heightClass="h-12"
              />
            </div>
            <div className="flex items-end gap-2">
              {isOnDuty ? (
                <button onClick={handleCheckOut} disabled={loading}
                  className={`w-full h-12 rounded-lg text-white font-semibold transition ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-orange-600 hover:bg-orange-700"}`}>
                  {loading ? "Processing..." : "📸 End Duty"}
                </button>
              ) : hasGuardCheckedOutToday(records, guardId) ? (
                <button disabled
                  className="w-full h-12 rounded-lg text-white font-semibold bg-gray-400 cursor-not-allowed transition">
                  ✅ Duty Completed
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
        </div>

        {!hideHistory && (
          <div className="space-y-4 mt-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-transparent mb-4">
              <h3 className="text-lg font-bold text-gray-800">📋 Attendance History</h3>
              <div className="flex flex-wrap gap-3 w-full md:w-auto">
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
                <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-slide-up">
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
                      <CustomSelect
                        value={filterGuard}
                        onChange={val => setFilterGuard(val)}
                        options={[
                          { value: "", label: "All Guards" },
                          ...guards.map(g => ({ value: String(g.id), label: g.name }))
                        ]}
                        placeholder="All Guards"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Location</label>
                      <CustomSelect
                        value={filterLocation}
                        onChange={val => setFilterLocation(val)}
                        options={[
                          { value: "", label: "All Locations" },
                          ...locations.map(l => ({ value: String(l.id), label: l.place_name }))
                        ]}
                        placeholder="All Locations"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                      <CustomSelect
                        value={filterStatus}
                        onChange={val => setFilterStatus(val)}
                        options={[
                          { value: "", label: "All Statuses" },
                          { value: "Present", label: "Present" },
                          { value: "Absent", label: "Absent" },
                          { value: "Leave", label: "Leave" }
                        ]}
                        placeholder="All Statuses"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={filterStartDate}
                          onChange={(e) => setFilterStartDate(e.target.value)}
                          className="w-full h-11 border border-gray-350 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 text-sm bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">End Date</label>
                        <input
                          type="date"
                          value={filterEndDate}
                          onChange={(e) => setFilterEndDate(e.target.value)}
                          className="w-full h-11 border border-gray-350 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 text-sm bg-white"
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
            <div className="glass-card rounded-2xl overflow-hidden shadow-sm ring-1 ring-gray-100">
              <div className="overflow-x-auto hidden md:block">
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
                      {role === "admin" && <th className="text-center p-4 text-gray-600 font-semibold w-24">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRecords.length === 0 ? (
                      <tr><td colSpan={role === "admin" ? 8 : 7} className="p-8 text-center text-gray-400">No attendance records matching the filters.</td></tr>
                    ) : paginatedRecords.map((item) => (
                      <tr key={item.id} className="border-b hover:bg-gray-50 transition">
                        <td className="p-4 font-medium">{item.guards?.name}</td>
                        <td className="p-4 text-gray-500">{item.check_in_time?.split("T")[0] || item.date}</td>
                        <td className="p-4 text-gray-500 text-sm">{item.duty_locations?.place_name || "—"}</td>
                        <td className="p-4">
                          {(() => {
                            const timeStr = item.check_in_time ? new Date(item.check_in_time).toLocaleTimeString() : item.check_in || "—";
                            if (role !== "guard") {
                              const lateMins = getLateMinutes(item);
                              if (lateMins > 0) {
                                return (
                                  <span 
                                    className="text-red-650"
                                    title={formatLateMessage(lateMins)}
                                  >
                                    {timeStr}
                                  </span>
                                );
                              }
                            }
                            return timeStr;
                          })()}
                        </td>
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
                            } else if (item.status === "Half Day") {
                              statusClass = "status-chip-half-day";
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
                              <button onClick={() => setPreviewPhoto(item.check_in_photo)} className="text-blue-500 hover:underline text-sm font-semibold">📸 In</button>
                            ) : null}
                            {item.check_out_photo ? (
                              <button onClick={() => setPreviewPhoto(item.check_out_photo)} className="text-blue-500 hover:underline text-sm font-semibold ml-2">📸 Out</button>
                            ) : null}
                            {!item.check_in_photo && !item.check_out_photo ? "—" : null}
                          </div>
                        </td>
                        {role === "admin" && (
                          <td className="p-4 text-center">
                            <button
                              onClick={() => deleteAttendanceRecord(item.id)}
                              className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1.5 rounded-xl text-xs font-bold transition"
                              title="Delete Record"
                            >
                              🗑️ Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile View */}
              <div className="block md:hidden divide-y divide-gray-100">
                {paginatedRecords.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">No attendance records matching the filters.</div>
                ) : (
                  paginatedRecords.map((item) => (
                    <div key={item.id} className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-gray-805 text-sm">{item.guards?.name || "Unknown"}</h4>
                          <p className="text-xs text-gray-400 mt-0.5">{item.check_in_time?.split("T")[0] || item.date}</p>
                        </div>
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
                          } else if (item.status === "Half Day") {
                            statusClass = "status-chip-half-day";
                          } else {
                            statusClass = "status-chip-leave";
                          }
                          return (
                            <span className={`status-chip ${statusClass}`}>
                              {displayStatus}
                            </span>
                          );
                        })()}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-2.5 rounded-xl text-gray-600">
                        <div>
                          <span className="font-semibold block text-gray-450">Location:</span>
                          {item.duty_locations?.place_name || "—"}
                        </div>
                        <div>
                          <span className="font-semibold block text-gray-450">Check In:</span>
                          {(() => {
                            const timeStr = item.check_in_time ? new Date(item.check_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : item.check_in || "—";
                            if (role !== "guard") {
                              const lateMins = getLateMinutes(item);
                              if (lateMins > 0) {
                                return (
                                  <span 
                                    className="text-red-650"
                                    title={formatLateMessage(lateMins)}
                                  >
                                    {timeStr}
                                  </span>
                                );
                              }
                            }
                            return timeStr;
                          })()}
                        </div>
                        <div>
                          <span className="font-semibold block text-gray-450">Check Out:</span>
                          {item.check_out_time ? new Date(item.check_out_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : item.check_out || "—"}
                        </div>
                        <div>
                          <span className="font-semibold block text-gray-450">Photos:</span>
                          <div className="flex gap-2.5 mt-0.5">
                            {item.check_in_photo ? (
                              <button onClick={() => setPreviewPhoto(item.check_in_photo)} className="text-blue-600 hover:underline text-[10px] font-bold">📸 In</button>
                            ) : null}
                            {item.check_out_photo ? (
                              <button onClick={() => setPreviewPhoto(item.check_out_photo)} className="text-blue-600 hover:underline text-[10px] font-bold">📸 Out</button>
                            ) : null}
                            {!item.check_in_photo && !item.check_out_photo ? "None" : null}
                          </div>
                        </div>
                      </div>

                      {role === "admin" && (
                        <div className="flex justify-end pt-1">
                          <button
                            onClick={() => deleteAttendanceRecord(item.id)}
                            className="bg-red-50 text-red-650 hover:bg-red-100 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                          >
                            🗑️ Delete Record
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="px-6 py-4 bg-gray-50 border-t flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredRecords.length)} of {filteredRecords.length} records
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
          </div>
        )}
      </div>
    </>
  );
}

export default Attendance;
