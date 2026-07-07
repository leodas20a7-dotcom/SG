import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import Camera from "./Camera";
import { calcDistance, getLocation, uploadPhoto, calculateAttendanceStatus } from "./lib/geoUtils";
import LoadingOverlay from "./LoadingOverlay";
import CustomSelect from "./CustomSelect";
import ConfirmModal from "./ConfirmModal";

function Attendance({ role, userGuardId, hideHistory, companyId }) {
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
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;



  // Confirm Modal state
  const [confirmConfig, setConfirmConfig] = useState(null);
  const [highlightedRecordId, setHighlightedRecordId] = useState(null);

  const [editingRecord, setEditingRecord] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    guard_id: "",
    duty_location_id: "",
    check_in_time: "",
    check_out_time: "",
    status: "Present"
  });

  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const [calendarGuardId, setCalendarGuardId] = useState("");
  const [isCalendarFlipped, setIsCalendarFlipped] = useState(false);

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
      r.check_in_time ? (r.status?.toUpperCase() === 'LEAVE' ? "—" : new Date(r.check_in_time).toLocaleTimeString()) : r.check_in || "—",
      r.check_out_time ? (r.status?.toUpperCase() === 'LEAVE' ? "—" : new Date(r.check_out_time).toLocaleTimeString()) : r.check_out || "—",
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
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${r.check_in_time ? (r.status?.toUpperCase() === 'LEAVE' ? "—" : new Date(r.check_in_time).toLocaleTimeString()) : r.check_in || "—"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${r.check_out_time ? (r.status?.toUpperCase() === 'LEAVE' ? "—" : new Date(r.check_out_time).toLocaleTimeString()) : r.check_out || "—"}</td>
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
      let q = supabase.from("guards").select("*");
      if (companyId) q = q.eq("company_id", companyId);
      const { data } = await q;
      setGuards(data || []);
    } catch { showToast("Could not load guards list.", "error"); }
  }

  async function fetchAttendance() {
    try {
      let q = supabase.from("attendance").select(`*, guards(name), duty_locations(place_name)`).order("id", { ascending: false });
      if (companyId) q = q.eq("company_id", companyId);
      const { data } = await q;
      setRecords(data || []);
      
      let sq = supabase.from("shifts").select("*");
      if (companyId) sq = sq.eq("company_id", companyId);
      const { data: shiftsData } = await sq;
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
      let q = supabase.from("duty_locations").select("*");
      if (companyId) q = q.eq("company_id", companyId);
      const { data } = await q;
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

  function openEditModal(record = null) {
    if (record) {
      setEditingRecord(record);
      setEditFormData({
        guard_id: record.guard_id || "",
        duty_location_id: record.duty_location_id || "",
        check_in_time: record.check_in_time ? record.check_in_time.slice(0, 16) : "",
        check_out_time: record.check_out_time ? record.check_out_time.slice(0, 16) : "",
        status: record.status || "Present"
      });
    } else {
      setEditingRecord({ id: "new" });
      setEditFormData({
        guard_id: "",
        duty_location_id: "",
        check_in_time: "",
        check_out_time: "",
        status: "Present"
      });
    }
    setShowEditModal(true);
  }

  async function handleSaveEdit() {
    try {
      const payload = {
        guard_id: editFormData.guard_id || null,
        duty_location_id: editFormData.duty_location_id || null,
        check_in_time: editFormData.check_in_time ? new Date(editFormData.check_in_time).toISOString() : null,
        check_out_time: editFormData.check_out_time ? new Date(editFormData.check_out_time).toISOString() : null,
        status: editFormData.status
      };
      
      if (companyId) payload.company_id = companyId;

      if (editingRecord && editingRecord.id !== "new") {
        const { error } = await supabase.from("attendance").update(payload).eq("id", editingRecord.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("attendance").insert([payload]);
        if (error) throw error;
      }
      showToast("Attendance record saved successfully.", "success");
      setShowEditModal(false);
      setEditingRecord(null);
      fetchAttendance();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function startEdit(record) {
    openEditModal(record);
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

  // Auto-open edit modal if redirected from another page (e.g. approving a request)
  useEffect(() => {
    if (records.length > 0) {
      const editGuardId = sessionStorage.getItem("open_edit_modal_for_guard");
      const editDate = sessionStorage.getItem("open_edit_modal_for_date");
      
      console.log("Auto-open check:", { editGuardId, editDate, recordsLength: records.length });
      
      if (editGuardId && editDate) {
        const record = records.find(r => 
          String(r.guard_id) === String(editGuardId) && 
          (r.date === editDate || (r.check_in_time && r.check_in_time.startsWith(editDate)))
        );
        console.log("Found record to edit:", record);
        
        if (record) {
          setHighlightedRecordId(record.id);
          const recordIndex = filteredRecords.findIndex(r => r.id === record.id);
          if (recordIndex !== -1) {
            const page = Math.floor(recordIndex / itemsPerPage) + 1;
            setCurrentPage(page);
          }
          sessionStorage.removeItem("open_edit_modal_for_guard");
          sessionStorage.removeItem("open_edit_modal_for_date");
          
          // Remove highlight after 5 seconds
          setTimeout(() => setHighlightedRecordId(null), 5000);
        } else {
          // If the admin approved a request but there is no attendance record for that date yet,
          // open the manual entry modal pre-filled with the guard and date
          setNewEntryData({
            guard_id: editGuardId,
            date: editDate,
            duty_location_id: "",
            check_in_time: "",
            check_out_time: "",
            status: "Present"
          });
          setShowManualEntry(true);
          sessionStorage.removeItem("open_edit_modal_for_guard");
          sessionStorage.removeItem("open_edit_modal_for_date");
        }
      }
    }
  }, [records]);

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

      {showCalendarModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 perspective" style={{ perspective: '1200px' }}>
          <div 
            className={`relative max-w-sm w-full h-[580px] transition-transform duration-700 animate-scale-in`} 
            style={{ transformStyle: 'preserve-3d', transform: isCalendarFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
          >
            {/* FRONT FACE: Calendar */}
            <div 
              className="absolute inset-0 bg-white rounded-3xl p-6 shadow-2xl border border-gray-150 overflow-hidden flex flex-col"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-800">📅 Guard Calendar</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => setIsCalendarFlipped(true)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition" title="View Performance">
                    📊
                  </button>
                  <button onClick={() => setShowCalendarModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
                </div>
              </div>
              
              <div className="mb-4">
                <CustomSelect
                  value={calendarGuardId}
                  onChange={val => setCalendarGuardId(val)}
                  options={guards.map(g => ({ value: String(g.id), label: g.name }))}
                  placeholder="Select Guard"
                  heightClass="h-10"
                  searchable={true}
                />
              </div>
              
              <div className="flex justify-between items-center mb-4">
                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="p-2 bg-gray-50 rounded-xl text-gray-600 hover:bg-gray-100 font-bold transition">⬅️</button>
                <h4 className="font-bold text-gray-700">{calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</h4>
                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="p-2 bg-gray-50 rounded-xl text-gray-600 hover:bg-gray-100 font-bold transition">➡️</button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {['S','M','T','W','T','F','S'].map((d, i) => <div key={i} className="text-xs font-bold text-gray-400">{d}</div>)}
              </div>
            
            <div className="grid grid-cols-7 gap-1">
              {(() => {
                const year = calendarMonth.getFullYear();
                const month = calendarMonth.getMonth();
                const firstDay = new Date(year, month, 1).getDay();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const days = Array(firstDay).fill(null);
                for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
                
                return days.map((d, i) => {
                  if (!d) return <div key={`empty-${i}`} className="h-9"></div>;
                  
                  const localDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
                  const dateStr = localDate.toISOString().split("T")[0];
                  
                  const record = records.find(r => 
                    String(r.guard_id) === String(calendarGuardId) && 
                    ((r.check_in_time && r.check_in_time.startsWith(dateStr)) || (r.date && r.date.startsWith(dateStr)))
                  );
                  
                  let bgClass = "bg-gray-50 text-gray-600 hover:bg-gray-100";
                  if (record) {
                    if (record.status === "Present" || record.status === "On Duty") bgClass = "bg-green-100 text-green-700 font-bold shadow-sm ring-1 ring-green-200";
                    else if (record.status === "Leave" || record.status === "Half Day") bgClass = "bg-yellow-100 text-yellow-700 font-bold shadow-sm ring-1 ring-yellow-200";
                    else if (record.status === "Absent") bgClass = "bg-red-100 text-red-700 font-bold shadow-sm ring-1 ring-red-200";
                  }

                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedCalendarDate(record || { dummy: true, dateStr })}
                      className={`h-9 rounded-xl flex items-center justify-center text-sm transition ${bgClass} ${selectedCalendarDate?.id === record?.id && record ? "ring-2 ring-indigo-500" : ""}`}
                    >
                      {d.getDate()}
                    </button>
                  );
                });
              })()}
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-100">
              {selectedCalendarDate ? (() => {
                const dateKey = selectedCalendarDate.dateStr || (selectedCalendarDate.check_in_time ? selectedCalendarDate.check_in_time.split("T")[0] : selectedCalendarDate.date);
                const sel = typeof selectedCalendarDate === 'object' && !selectedCalendarDate.dummy ? selectedCalendarDate : records.find(r => String(r.guard_id) === String(calendarGuardId) && (r.check_in_time?.startsWith(dateKey) || r.date === dateKey));
                if (!sel) return <p className="text-sm text-gray-500 italic">No records for {dateKey}</p>;
                return (
                  <div className="bg-gray-50 p-3 rounded-2xl">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="font-bold text-gray-800">{dateKey}</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setShowCalendarModal(false); startEdit(sel); }} className="text-gray-400 hover:text-blue-600 transition text-sm" title="Edit Record">
                          ✏️
                        </button>
                        <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full ${sel.status === 'Present' || sel.status === 'On Duty' ? 'bg-green-200 text-green-800' : sel.status === 'Leave' || sel.status === 'Half Day' ? 'bg-yellow-200 text-yellow-800' : 'bg-red-200 text-red-800'}`}>
                          {sel.status}
                        </span>
                      </div>
                    </div>
                    {sel.status !== "Leave" ? (
                      <div className="space-y-1">
                        <p className="text-xs text-gray-600"><span className="font-semibold w-16 inline-block">Check In:</span> {sel.check_in_time ? new Date(sel.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                        <p className="text-xs text-gray-600"><span className="font-semibold w-16 inline-block">Check Out:</span> {sel.check_out_time ? new Date(sel.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 italic">Time records not applicable</p>
                    )}
                  </div>
                );
              })() : (
                <p className="text-sm text-gray-400 text-center italic py-2">Select a date to view details</p>
              )}
            </div>
            
            <div className="mt-4 flex gap-4 justify-center">
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500"></span><span className="text-[10px] text-gray-500">Present</span></div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400"></span><span className="text-[10px] text-gray-500">Leave</span></div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span><span className="text-[10px] text-gray-500">Absent</span></div>
            </div>
          </div>

          {/* BACK FACE: Stats Scorecard */}
          <div 
            className="absolute inset-0 bg-white rounded-3xl p-6 shadow-2xl border border-gray-150 flex flex-col"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div className="flex justify-between items-center mb-6 pb-3 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">📊 Monthly Performance</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsCalendarFlipped(false)} className="p-1.5 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition" title="Back to Calendar">
                  ↩️
                </button>
              </div>
            </div>

            {(() => {
              const selectedMonthRecords = records.filter(r => {
                if (String(r.guard_id) !== String(calendarGuardId)) return false;
                const recDate = new Date(r.check_in_time || r.date);
                return recDate.getFullYear() === calendarMonth.getFullYear() && recDate.getMonth() === calendarMonth.getMonth();
              });
              
              const presentCount = selectedMonthRecords.filter(r => r.status === "Present" || r.status === "On Duty").length;
              const leaveCount = selectedMonthRecords.filter(r => r.status === "Leave" || r.status === "Half Day").length;
              const absentCount = selectedMonthRecords.filter(r => r.status === "Absent").length;

              return (
                <div className="space-y-4">
                  <div className="text-center mb-6">
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                      {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {guards.find(g => String(g.id) === String(calendarGuardId))?.name || "Unknown"}
                    </p>
                  </div>

                  <div className="bg-green-50/50 border border-green-100 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                      <p className="text-xs font-bold text-green-700 uppercase tracking-widest mb-1">Present Shifts</p>
                      <p className="text-[10px] text-green-600/70">Working days / On Duty</p>
                    </div>
                    <span className="text-3xl font-black text-green-600">{presentCount}</span>
                  </div>

                  <div className="bg-yellow-50/50 border border-yellow-100 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                      <p className="text-xs font-bold text-yellow-700 uppercase tracking-widest mb-1">Leaves Granted</p>
                      <p className="text-[10px] text-yellow-600/70">Approved leaves & half days</p>
                    </div>
                    <span className="text-3xl font-black text-yellow-600">{leaveCount}</span>
                  </div>

                  <div className="bg-red-50/50 border border-red-100 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                      <p className="text-xs font-bold text-red-700 uppercase tracking-widest mb-1">Unexcused Absences</p>
                      <p className="text-[10px] text-red-600/70">Missed shifts without leave</p>
                    </div>
                    <span className="text-3xl font-black text-red-600">{absentCount}</span>
                  </div>
                </div>
              );
            })()}

            <div className="mt-auto">
              <button 
                onClick={() => setIsCalendarFlipped(false)}
                className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl font-bold transition flex items-center justify-center gap-2"
              >
                ↩️ View Calendar
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-[150] bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6">
            <h3 className="font-bold text-lg mb-4">{editingRecord?.id === "new" ? "Add Manual Record" : "Edit Record"}</h3>
            
            <label className="block text-xs font-semibold text-gray-500 mb-1">Guard</label>
            <CustomSelect
              value={editFormData.guard_id}
              onChange={val => setEditFormData({ ...editFormData, guard_id: val })}
              options={guards.map(g => ({ value: String(g.id), label: g.name }))}
              placeholder="Select Guard"
              heightClass="h-11"
              searchable={true}
            />
            
            <label className="block text-xs font-semibold text-gray-500 mt-3 mb-1">Location</label>
            <CustomSelect
              value={editFormData.duty_location_id}
              onChange={val => setEditFormData({ ...editFormData, duty_location_id: val })}
              options={locations.map(l => ({ value: String(l.id), label: l.place_name }))}
              placeholder="Select Location"
              heightClass="h-11"
              searchable={true}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Check In Time</label>
                <input type="datetime-local" value={editFormData.check_in_time} onChange={(e) => setEditFormData({ ...editFormData, check_in_time: e.target.value })} className="w-full h-11 border border-gray-300 px-3 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Check Out Time</label>
                <input type="datetime-local" value={editFormData.check_out_time} onChange={(e) => setEditFormData({ ...editFormData, check_out_time: e.target.value })} className="w-full h-11 border border-gray-300 px-3 rounded-xl text-sm" />
              </div>
            </div>

            <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
            <CustomSelect
              value={editFormData.status}
              onChange={val => setEditFormData({ ...editFormData, status: val })}
              options={[
                { value: "Present", label: "Present" },
                { value: "Absent", label: "Absent" },
                { value: "Leave", label: "Leave" },
                { value: "Half Day", label: "Half Day" }
              ]}
              placeholder="Select Status"
              heightClass="h-11"
            />

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowEditModal(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 font-bold text-sm hover:bg-gray-200 transition">Cancel</button>
              <button onClick={handleSaveEdit} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition">Save Record</button>
            </div>
          </div>
        </div>
      )}

        {!hideHistory && (
          <div className="space-y-4 mt-6">
            <div className="glass-card rounded-2xl overflow-visible shadow-sm ring-1 ring-gray-200 bg-white relative z-30">
              <div className="px-6 py-5 border-b border-gray-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-gray-50/30 rounded-t-2xl">
                <div>
                  <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">📋 Attendance History</h3>
                  <p className="text-sm text-gray-500 mt-1">Manage and view all guard attendance records</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto relative z-20">
                  {["admin", "super_admin"].includes(role) && (
                    <>
                      <button onClick={() => openEditModal()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-sm whitespace-nowrap">
                        ➕ Add Manual Entry
                      </button>
                      <button onClick={() => {
                        setCalendarGuardId(filterGuard || (guards.length > 0 ? guards[0].id.toString() : ""));
                        setCalendarMonth(new Date());
                        setSelectedCalendarDate(null);
                        setShowCalendarModal(true);
                      }} className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-sm whitespace-nowrap">
                        📅 Calendar
                      </button>
                    </>
                  )}
                  <button onClick={() => setShowFiltersModal(true)} className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-sm whitespace-nowrap">
                    🔍 Filter
                  </button>
                  <div className="relative">
                    <button onClick={() => setShowDownloadMenu(!showDownloadMenu)} className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-sm whitespace-nowrap">
                      ⬇️ Download ▾
                    </button>
                    {showDownloadMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowDownloadMenu(false)}></div>
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
                          <button onClick={() => { setShowDownloadMenu(false); downloadReportCSV(); }} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition">
                            <span className="text-blue-600">📄</span> Export CSV
                          </button>
                          <button onClick={() => { setShowDownloadMenu(false); printReport(); }} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition">
                            <span className="text-purple-600">🖨️</span> Print Report
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
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
                        searchable={true}
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
                        searchable={true}
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
                      {role !== "guard" && <th className="text-center p-4 text-gray-600 font-semibold w-24">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRecords.length === 0 ? (
                      <tr><td colSpan={role === "admin" ? 8 : 7} className="p-8 text-center text-gray-400">No attendance records matching the filters.</td></tr>
                    ) : paginatedRecords.map((item) => (
                      <tr key={item.id} className={`border-b hover:bg-gray-50 transition ${highlightedRecordId === item.id ? "bg-amber-50/70 ring-2 ring-amber-300 ring-inset" : ""}`}>
                        <td className="p-4 font-medium">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
                              {item.guards?.name?.charAt(0).toUpperCase()}
                            </div>
                            <span className="truncate max-w-[120px]" title={item.guards?.name}>{item.guards?.name}</span>
                          </div>
                        </td>
                        <td className="p-4 text-gray-500">{item.check_in_time?.split("T")[0] || item.date}</td>
                        <td className="p-4 text-gray-500 text-sm">{item.duty_locations?.place_name || "—"}</td>
                        <td className="p-4">
                          {(() => {
                            if (item.status === "Leave") return "—";
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
                        <td className="p-4">{item.status === "Leave" ? "—" : (item.check_out_time ? new Date(item.check_out_time).toLocaleTimeString() : item.check_out || "—")}</td>
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
                        {role !== "guard" && (
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => openEditModal(item)}
                                className="text-orange-500 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 p-2 rounded-full transition"
                                title="Edit Record"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => deleteAttendanceRecord(item.id)}
                                className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-full transition"
                                title="Delete Record"
                              >
                                🗑️
                              </button>
                            </div>
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
                    <div key={item.id} className={`p-4 space-y-3 ${highlightedRecordId === item.id ? "bg-amber-50/70 ring-2 ring-amber-300 ring-inset" : ""}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold shrink-0">
                            {item.guards?.name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-805 text-sm">{item.guards?.name || "Unknown"}</h4>
                            <p className="text-xs text-gray-400 mt-0.5">{item.check_in_time?.split("T")[0] || item.date}</p>
                          </div>
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
                            if (item.status === "Leave") return "—";
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
                          {item.status === "Leave" ? "—" : (item.check_out_time ? new Date(item.check_out_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : item.check_out || "—")}
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

                      {role !== "guard" && (
                        <div className="flex justify-end gap-2 pt-2 border-t border-gray-50 mt-1">
                          <button
                            onClick={() => openEditModal(item)}
                            className="text-orange-500 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 p-2 rounded-full transition"
                            title="Edit Record"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => deleteAttendanceRecord(item.id)}
                            className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-full transition"
                            title="Delete Record"
                          >
                            🗑️
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
