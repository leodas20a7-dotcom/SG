import { useEffect, useState, useRef } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import Camera from "./Camera";
import { calcDistance, getLocation, uploadPhoto } from "./lib/geoUtils";

function Attendance({ role, userGuardId }) {
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
  const { showToast, ToastContainer } = useToast();

  const isAbsent = status === "Absent";

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
      {showCamera && <Camera onCapture={onCameraCapture} onClose={() => { setShowCamera(false); setCameraMode(null); }} />}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setPreviewPhoto(null)}>
          <div className="relative max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreviewPhoto(null)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center text-gray-600 hover:text-gray-900 text-lg z-10">&times;</button>
            <img src={previewPhoto} alt="Attendance photo" className="w-full rounded-2xl shadow-2xl" />
          </div>
        </div>
      )}
      <div className="mt-10">
        <h1 className="text-2xl font-bold mb-5 text-gray-800">Attendance Management</h1>

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
                {records.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-400">No attendance records yet.</td></tr>
                ) : records.map((item) => (
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
                              statusClass = "bg-blue-100 text-blue-700 font-bold";
                            } else {
                              displayStatus = "Missed Checkout";
                              statusClass = "bg-amber-100 text-amber-700 font-bold";
                            }
                          } else {
                            displayStatus = "Present";
                            statusClass = "bg-green-100 text-green-700 font-bold";
                          }
                        } else if (item.status === "Absent") {
                          statusClass = "bg-red-100 text-red-700 font-bold";
                        } else {
                          statusClass = "bg-yellow-100 text-yellow-700 font-bold";
                        }
                        return (
                          <span className={`inline-block px-3 py-1 rounded-full text-xs uppercase tracking-wider ${statusClass}`}>
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
    </>
  );
}

export default Attendance;
