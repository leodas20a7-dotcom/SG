import { useEffect, useState, useRef } from "react";
import { supabase } from "./lib/supabase";
import Camera from "./Camera";
import { calcDistance, getLocation, uploadPhoto } from "./lib/geoUtils";
import Notifications from "./Notifications";
import Incidents from "./Incidents";

/* ─── helpers ─────────────────────────────────────── */
function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

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
    <div className="flex items-center mt-2">
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

const TABS = [
  { key: "duty", label: "Duty Control", icon: "📍", desc: "Check In / Out" },
  { key: "history", label: "Attendance", icon: "📋", desc: "Your History" },
  { key: "requests", label: "Issues", icon: "💬", desc: "Report Problem" },
  { key: "incidents", label: "Incidents", icon: "🚨", desc: "Report Incidents" },
  { key: "circulars", label: "Circulars", icon: "📢", desc: "Announcements" },
];

/* ─── Circular feed (read-only) ─── */
function CircularFeed() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    supabase.from("circulars").select("*").order("created_at", { ascending: false })
      .then(({ data }) => setItems(data || []));
  }, []);
  return (
    <div className="space-y-3">
      {items.length === 0
        ? (
          <div className="flex flex-col items-center py-16 text-gray-300">
            <span className="text-5xl mb-3">📢</span>
            <p className="font-medium text-gray-400">No announcements yet</p>
          </div>
        )
        : items.map(c => (
          <div key={c.id} className="bg-white rounded-2xl p-5 shadow-sm border border-blue-50 hover:shadow-md transition">
            <div className="flex justify-between items-start mb-2">
              <p className="font-bold text-gray-800">📌 {c.title}</p>
              <span className="text-xs text-gray-400 whitespace-nowrap ml-3 bg-gray-50 px-2 py-1 rounded-lg">
                {new Date(c.created_at).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>
            <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{c.content}</p>
          </div>
        ))}
    </div>
  );
}

/* ─── My past requests ─── */
function MyRequests({ guardId }) {
  const [reqs, setReqs] = useState([]);
  useEffect(() => {
    if (!guardId) return;
    supabase.from("attendance_requests").select("*").eq("guard_id", guardId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setReqs(data || []));
  }, [guardId]);
  if (reqs.length === 0) return (
    <div className="flex flex-col items-center py-12 text-gray-300">
      <span className="text-4xl mb-3">🕒</span>
      <p className="font-medium text-gray-400">No past requests found</p>
    </div>
  );
  return (
    <div className="space-y-3">
      {reqs.map(r => (
        <div key={r.id} className="bg-white rounded-2xl p-4 border border-gray-100 flex justify-between items-start shadow-sm">
          <div className="flex-1 min-w-0 mr-3">
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold inline-block mb-1 ${r.request_type === "voice" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
              {r.request_type === "voice" ? "🎤 Voice" : "📝 Text"}
            </span>
            <p className="text-sm text-gray-700 truncate">{r.message || "Voice note"}</p>
            {r.audio_url && <AudioPlayer src={r.audio_url} />}
          </div>
          <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold ${r.status === "Pending" ? "bg-amber-100 text-amber-700" : r.status === "Approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            {r.status}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Guard Profile & Documents ─── */
function GuardProfilePanel({ guardId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");

  async function loadProfile() {
    try {
      const { data } = await supabase.from("guards").select("*").eq("id", guardId).single();
      setProfile(data);
    } catch {
      setError("Failed to load profile");
    }
  }

  useEffect(() => { loadProfile(); }, [guardId]);

  async function handleFileUpload(e, column) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(column);
    setError("");
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${guardId}_${column}_${Date.now()}.${fileExt}`;
      const { error: upErr } = await supabase.storage.from("guard-documents").upload(fileName, file);
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from("guard-documents").getPublicUrl(fileName);
      
      const { error: dbErr } = await supabase.from("guards").update({ [column]: publicUrl }).eq("id", guardId);
      if (dbErr) throw dbErr;

      loadProfile(); // refresh
    } catch (err) {
      setError("Upload failed: " + err.message);
    }
    setUploading("");
  }

  if (!profile) return <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center">Loading...</div>;

  const DOCS = [
    { key: "doc_aadhaar", label: "Aadhaar Card", req: true },
    { key: "doc_security_licence", label: "Security Licence", req: true },
    { key: "doc_driving_licence", label: "Driving Licence", req: false },
    { key: "doc_certificates", label: "Other Certificates", req: false },
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-gray-900/50 backdrop-blur-sm flex items-end md:items-center justify-center md:p-4">
      <div className="bg-white w-full max-w-md h-[90vh] md:h-auto md:max-h-[90vh] md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col animate-slide-up">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 md:rounded-t-3xl rounded-t-3xl">
          <h2 className="font-bold text-gray-800 text-lg">My Profile</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm text-gray-500 hover:bg-gray-50 transition">✕</button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>}
          
          {/* Profile Picture */}
          <div className="flex flex-col items-center">
            <div className="relative w-24 h-24 rounded-full border-4 border-white shadow-lg bg-gray-100 overflow-hidden mb-3">
              {profile.profile_picture ? (
                <img src={profile.profile_picture} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl">👤</div>
              )}
              {uploading === "profile_picture" && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}
            </div>
            <h3 className="font-bold text-xl text-gray-800">{profile.name}</h3>
            <p className="text-gray-500 text-sm mb-4">Security Officer</p>
            <label className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold shadow-sm cursor-pointer hover:bg-blue-100 transition">
              {profile.profile_picture ? "Change Photo" : "Upload Photo"}
              <input type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(e, "profile_picture")} disabled={uploading !== ""} />
            </label>
          </div>

          <hr className="border-gray-100" />

          {/* Documents */}
          <div>
            <h3 className="font-bold text-gray-800 mb-3 text-sm uppercase tracking-wider">Required Documents</h3>
            <div className="space-y-3">
              {DOCS.map(doc => {
                const hasDoc = !!profile[doc.key];
                return (
                  <div key={doc.key} className="flex items-center justify-between p-4 rounded-2xl border border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hasDoc ? "bg-green-100 text-green-600" : "bg-red-100 text-red-500"}`}>
                        {hasDoc ? "✅" : "📄"}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{doc.label}</p>
                        <p className="text-xs text-gray-500">{hasDoc ? "Uploaded" : doc.req ? "Required" : "Optional"}</p>
                      </div>
                    </div>
                    {hasDoc ? (
                      <a href={profile[doc.key]} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-bold transition">View</a>
                    ) : (
                      <label className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow-sm">
                        {uploading === doc.key ? "..." : "Upload"}
                        <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleFileUpload(e, doc.key)} disabled={uploading !== ""} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
function GuardDuty({ guardId, guardName }) {
  const [activeTab, setActiveTab] = useState("duty");
  const [showRequestHistory, setShowRequestHistory] = useState(false);
  const [dutyLocation, setDutyLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState(null);
  const [gpsType, setGpsType] = useState("info");
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState(null);
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [currentAttendanceId, setCurrentAttendanceId] = useState(null);
  const [todayRecord, setTodayRecord] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [gpsDistance, setGpsDistance] = useState(null);
  const [onDutySince, setOnDutySince] = useState(null);
  const [elapsedTime, setElapsedTime] = useState("");
  const trackingRef = useRef(null);
  const elapsedRef = useRef(null);
  const [error, setError] = useState("");

  const [reqMessage, setReqMessage] = useState("");
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const mediaRecorderRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);

  const [showProfile, setShowProfile] = useState(false);

  const [isOnTempDuty, setIsOnTempDuty] = useState(false);
  const [primaryLocation, setPrimaryLocation] = useState(null);

  async function fetchAssignedLocation() {
    try {
      const { data } = await supabase
        .from("guards")
        .select(`
          duty_location_id,
          duty_locations!duty_location_id(*),
          temp_location_id,
          temp_location_from,
          temp_location_to,
          temp_duty_location:temp_location_id(*)
        `)
        .eq("id", guardId)
        .single();

      if (!data) return;

      // Store primary location always
      const primary = data.duty_locations || null;
      setPrimaryLocation(primary);

      // Check if today is within the temp override window
      const today = new Date().toISOString().split("T")[0];
      const hasTemp =
        data.temp_location_id &&
        data.temp_location_from &&
        data.temp_location_to &&
        today >= data.temp_location_from &&
        today <= data.temp_location_to;

      if (hasTemp) {
        // Use temp location for GPS checks and attendance
        setDutyLocation(data.temp_duty_location);
        setIsOnTempDuty(true);
      } else {
        setDutyLocation(primary);
        setIsOnTempDuty(false);
      }
    } catch { /* ignore */ }
  }
  async function fetchAttendanceHistory() {
    try {
      const { data } = await supabase.from("attendance").select("*, duty_locations(place_name)").eq("guard_id", guardId).order("check_in_time", { ascending: false });
      setAttendanceHistory(data || []);
    } catch { /* ignore */ }
  }
  async function fetchTodayStatus() {
    if (!guardId) return;
    try {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase.from("attendance").select("*, duty_locations(place_name)").eq("guard_id", guardId).gte("check_in_time", today).lte("check_in_time", today + "T23:59:59").order("check_in_time", { ascending: false }).limit(1);
      if (data && data.length > 0) {
        const rec = data[0];
        setTodayRecord(rec);
        if (rec.check_in_photo && !rec.check_out_photo) {
          setIsOnDuty(true); setCurrentAttendanceId(rec.id); setOnDutySince(rec.check_in_time);
        } else {
          setIsOnDuty(false); setCurrentAttendanceId(null); setOnDutySince(null);
        }
      } else {
        setTodayRecord(null); setIsOnDuty(false);
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (isOnDuty && onDutySince) {
      const tick = () => {
        const s = Math.floor((new Date() - new Date(onDutySince)) / 1000);
        if (s < 0) return;
        setElapsedTime(`${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
      };
      tick();
      elapsedRef.current = setInterval(tick, 1000);
      return () => clearInterval(elapsedRef.current);
    } else setElapsedTime("");
  }, [isOnDuty, onDutySince]);

  useEffect(() => {
    if (!isOnDuty || !dutyLocation) { setGpsDistance(null); return; }
    const check = async () => {
      try {
        const p = await getLocation();
        setGpsDistance(Math.round(calcDistance(p.lat, p.lng, dutyLocation.latitude, dutyLocation.longitude)));
      } catch { /* ignore */ }
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [isOnDuty, dutyLocation]);

  useEffect(() => { fetchAssignedLocation(); fetchTodayStatus(); fetchAttendanceHistory(); }, [guardId]);
  useEffect(() => { if (!isOnDuty) return; const id = setInterval(fetchTodayStatus, 15000); return () => clearInterval(id); }, [isOnDuty]);

  async function sendLiveLocation(attId) {
    try {
      const p = await getLocation();
      await supabase.from("live_tracking").insert([{ guard_id: guardId, attendance_id: attId, latitude: p.lat, longitude: p.lng }]);
      return p;
    } catch { return null; }
  }
  function startLiveTracking(attId) { sendLiveLocation(attId); trackingRef.current = setInterval(() => sendLiveLocation(attId), 300000); }
  function stopLiveTracking() { if (trackingRef.current) { clearInterval(trackingRef.current); trackingRef.current = null; } }

  function setStatus(msg, type = "info") { setGpsStatus(msg); setGpsType(type); }

  async function handleCheckIn() {
    if (!dutyLocation) { setError("No duty location assigned. Contact admin."); return; }
    setError(""); setLoading(true);
    try {
      setStatus("📍 Getting your location...", "info");
      const loc = await getLocation();
      const dist = Math.round(calcDistance(loc.lat, loc.lng, dutyLocation.latitude, dutyLocation.longitude));
      if (dist > dutyLocation.radius_meters) {
        setStatus(`⚠️ You are ${dist}m away. Move within ${dutyLocation.radius_meters}m of ${dutyLocation.place_name}.`, "warn");
        setLoading(false); return;
      }
      setStatus("✅ Location verified! Capture selfie to check in.", "success");
      setCameraMode("checkin"); setShowCamera(true);
    } catch (err) { setError(err.message); setLoading(false); setGpsStatus(null); }
  }

  async function onCameraCapture(dataUrl) {
    setShowCamera(false);
    if (!dataUrl) { setError("Camera not available. Grant camera permission and try again."); setLoading(false); return; }
    setLoading(true);
    try {
      setStatus("📸 Uploading photo...", "info");
      const photoUrl = await uploadPhoto(guardId, dataUrl, supabase);
      const now = new Date().toISOString();
      const pos = await getLocation();
      const { data, error: err } = await supabase.from("attendance").insert([{
        guard_id: guardId, duty_location_id: dutyLocation?.id,
        check_in_time: now, status: "Present",
        check_in_photo: photoUrl, check_in_lat: pos.lat, check_in_long: pos.lng,
      }]).select();
      if (err) { setError("Error marking attendance."); setLoading(false); return; }
      setIsOnDuty(true); setCurrentAttendanceId(data[0].id); setOnDutySince(now);
      setStatus("✅ Check-in successful! Tracking started.", "success");
      startLiveTracking(data[0].id);
      fetchTodayStatus(); fetchAttendanceHistory();
      setTimeout(() => setGpsStatus(null), 3000);
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  async function handleCheckOut() {
    setError(""); setLoading(true);
    try {
      setStatus("📍 Verifying check-out location...", "info");
      const pos = await getLocation();
      if (dutyLocation) {
        const dist = Math.round(calcDistance(pos.lat, pos.lng, dutyLocation.latitude, dutyLocation.longitude));
        if (dist > dutyLocation.radius_meters) { setStatus(`⚠️ ${dist}m from duty zone. Move inside to check out.`, "warn"); setLoading(false); return; }
      }
      setStatus("✅ Location ok! Capture selfie to check out.", "success");
      setCameraMode("checkout"); setShowCamera(true);
    } catch (err) { setError(err.message); setLoading(false); }
  }

  async function onCheckoutCapture(dataUrl) {
    setShowCamera(false);
    if (!dataUrl) { setError("Camera not available. Grant camera permission and try again."); setLoading(false); return; }
    setLoading(true);
    try {
      setStatus("📸 Uploading checkout photo...", "info");
      const photoUrl = await uploadPhoto(guardId, dataUrl, supabase);
      const pos = await getLocation();
      const now = new Date().toISOString();
      const { error: err } = await supabase.from("attendance").update({
        check_out_time: now, check_out_photo: photoUrl, check_out_lat: pos.lat, check_out_long: pos.lng,
      }).eq("id", currentAttendanceId);
      if (err) { setError("Error checking out."); setLoading(false); return; }
      stopLiveTracking();
      setIsOnDuty(false); setCurrentAttendanceId(null); setOnDutySince(null);
      setStatus("✅ Checked out! Stay safe.", "success");
      fetchTodayStatus(); fetchAttendanceHistory();
      setTimeout(() => setGpsStatus(null), 3000);
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  async function forceLocationPush() {
    if (!currentAttendanceId) return;
    setStatus("🛰️ Sending location...", "info");
    const pos = await sendLiveLocation(currentAttendanceId);
    if (pos) {
      setStatus("✅ Location sent!", "success");
      if (dutyLocation) setGpsDistance(Math.round(calcDistance(pos.lat, pos.lng, dutyLocation.latitude, dutyLocation.longitude)));
    } else setStatus("❌ Could not get GPS.", "warn");
    setTimeout(() => setGpsStatus(null), 3000);
  }

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      const chunks = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = () => { const blob = new Blob(chunks, { type: "audio/webm" }); setAudioBlob(blob); setAudioUrl(URL.createObjectURL(blob)); };
      rec.start(); setRecording(true);
    } catch { setError("Microphone access denied."); }
  }
  function stopRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      setRecording(false);
    }
  }

  async function submitRequest(e) {
    e.preventDefault();
    if (!reqMessage.trim() && !audioBlob) { setError("Add a message or record a voice note."); return; }
    setSubmitting(true); setError("");
    try {
      let audioUploadUrl = null;
      if (audioBlob) {
        const fileName = `voice_${guardId}_${Date.now()}.webm`;
        const { error: upErr } = await supabase.storage.from("voice-requests").upload(fileName, audioBlob, { contentType: "audio/webm" });
        if (!upErr) { const { data } = supabase.storage.from("voice-requests").getPublicUrl(fileName); audioUploadUrl = data.publicUrl; }
      }
      const { error: insErr } = await supabase.from("attendance_requests").insert([{
        guard_id: guardId, request_type: audioBlob ? "voice" : "text",
        message: reqMessage.trim() || "Voice note submitted", audio_url: audioUploadUrl, status: "Pending",
      }]);
      if (insErr) throw insErr;
      setStatus("✅ Request sent to admin.", "success");
      setReqMessage(""); setAudioBlob(null); setAudioUrl("");
      setTimeout(() => setGpsStatus(null), 3000);
    } catch (err) { setError(err.message); }
    setSubmitting(false);
  }

  async function handleLogout() { stopLiveTracking(); await supabase.auth.signOut(); window.location.reload(); }

  const statusColour = gpsType === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700"
    : gpsType === "warn" ? "bg-amber-50 border-amber-200 text-amber-700"
      : "bg-blue-50 border-blue-200 text-blue-700";

  /* ─── Duty Control panel (shared between mobile & desktop) ─── */
  const dutyPanel = (
    <div className="space-y-4">
      {todayRecord && !isOnDuty && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-2xl text-sm font-medium flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-bold">Duty completed today</p>
            <p className="text-xs opacity-80">Checked out at {fmt(todayRecord.check_out_time)}</p>
          </div>
        </div>
      )}

      {/* Primary status card */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className={`px-6 py-5 ${isOnDuty ? "bg-gradient-to-r from-emerald-500 to-teal-500" : "bg-gradient-to-r from-slate-700 to-slate-800"}`}>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">Status</p>
              <p className="text-white font-bold text-xl">{isOnDuty ? "🟢 On Active Duty" : todayRecord ? "✅ Duty Complete" : "⏸️ Off Duty"}</p>
            </div>
            {isOnDuty && elapsedTime && (
              <div className="text-right">
                <p className="text-white/60 text-xs mb-1">Time on duty</p>
                <p className="text-white font-mono font-bold text-xl">{elapsedTime}</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 space-y-4">
          {dutyLocation ? (
            <div className={`flex gap-4 rounded-2xl p-4 ${isOnTempDuty ? "bg-amber-50 border border-amber-200" : "bg-gray-50"}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isOnTempDuty ? "bg-amber-100" : "bg-blue-100"}`}>
                {isOnTempDuty ? "⏱️" : "📍"}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-800">{dutyLocation.place_name}</p>
                  {isOnTempDuty && (
                    <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold">TEMP</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Allowed radius: {dutyLocation.radius_meters}m</p>
                {isOnTempDuty && primaryLocation && (
                  <p className="text-xs text-amber-600 mt-1">Primary: {primaryLocation.place_name} (resumes after temp period)</p>
                )}
                {isOnDuty && gpsDistance !== null && (
                  <div className={`flex items-center gap-1.5 mt-1.5 text-xs font-semibold ${gpsDistance > dutyLocation.radius_meters ? "text-red-600" : "text-emerald-600"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${gpsDistance > dutyLocation.radius_meters ? "bg-red-500" : "bg-emerald-500"}`} />
                    {gpsDistance > dutyLocation.radius_meters ? "Outside zone" : "Inside zone"} — {gpsDistance}m from center
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-100 text-amber-700 rounded-xl p-4 text-sm font-medium">
              ⚠️ No duty location assigned. Contact admin.
            </div>
          )}

          <button
            onClick={isOnDuty ? handleCheckOut : handleCheckIn}
            disabled={loading || (!dutyLocation && !isOnDuty)}
            className={`w-full h-14 rounded-2xl text-white font-bold text-base transition-all shadow-md active:scale-[0.98] ${loading ? "bg-gray-300 cursor-not-allowed" :
              isOnDuty ? "bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shadow-orange-200" :
                "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-emerald-200"
              }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </span>
            ) : isOnDuty ? "📸  END DUTY" : "📍  START DUTY"}
          </button>
        </div>
      </div>

      {isOnDuty && (
        <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">🛰️</div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-sm font-bold text-gray-800">Live Tracking Active</p>
              </div>
              <p className="text-xs text-gray-400">Auto-pings every 5 minutes</p>
            </div>
          </div>
          <button onClick={forceLocationPush} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4 py-2 rounded-xl font-semibold transition shadow-sm">
            Ping Now
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Guard Details</p>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-400 text-xs mb-0.5">Name</p>
            <p className="font-semibold text-gray-800">{guardName || "—"}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-0.5">Today's Location</p>
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-gray-800">{dutyLocation?.place_name || "Not assigned"}</p>
              {isOnTempDuty && <span className="text-xs bg-amber-100 text-amber-600 px-1.5 rounded-full font-bold">TEMP</span>}
            </div>
          </div>
          <div className="col-span-2">
            <p className="text-gray-400 text-xs mb-0.5">Today</p>
            <p className="font-semibold text-gray-800">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const historyPanel = (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-50">
        <h2 className="font-bold text-gray-800 text-lg">Attendance History</h2>
        <p className="text-xs text-gray-400 mt-0.5">{attendanceHistory.length} records found</p>
      </div>
      <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
        {attendanceHistory.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-300">
            <span className="text-5xl mb-3">📋</span>
            <p className="font-medium text-gray-400">No attendance records yet</p>
          </div>
        ) : attendanceHistory.map(item => {
          const loc = item.duty_locations?.place_name;
          return (
            <div key={item.id} className="px-6 py-4 flex justify-between items-center hover:bg-gray-50/50 transition">
              <div>
                <p className="font-semibold text-gray-800">{fmtDate(item.check_in_time)}</p>
                {loc && <p className="text-xs text-blue-600 mt-0.5">📍 {loc}</p>}
                <p className="text-xs text-gray-400 mt-0.5">In: {fmt(item.check_in_time)} &nbsp;·&nbsp; Out: {fmt(item.check_out_time)}</p>
              </div>
              <span className={`text-xs px-3 py-1 rounded-full font-bold shrink-0 ml-3 ${item.status === "Present" ? "bg-green-100 text-green-700" :
                item.status === "Absent" ? "bg-red-100 text-red-700" :
                  "bg-yellow-100 text-yellow-700"
                }`}>
                {item.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const requestPanel = showRequestHistory ? (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-4 bg-gray-50/50">
        <button 
          onClick={() => setShowRequestHistory(false)}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition shrink-0"
        >
          ←
        </button>
        <div>
          <h2 className="font-bold text-gray-800 text-lg">Past Requests</h2>
          <p className="text-xs text-gray-400 mt-0.5">Your submitted issue history</p>
        </div>
      </div>
      <div className="p-6">
        <MyRequests guardId={guardId} />
      </div>
    </div>
  ) : (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex justify-between items-center">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">Report an Issue</h2>
            <p className="text-xs text-gray-400 mt-0.5">Missed check-in or GPS error? Let admin know.</p>
          </div>
          <button 
            onClick={() => setShowRequestHistory(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition"
          >
            🕒 History
          </button>
        </div>
        <div className="p-6">
          <form onSubmit={submitRequest} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 mb-2 block uppercase tracking-wide">Describe the problem</label>
              <textarea
                rows="4"
                placeholder="e.g. GPS failed during checkout at 6 PM..."
                value={reqMessage}
                onChange={e => setReqMessage(e.target.value)}
                className="w-full border border-gray-200 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              />
            </div>

            <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-2xl p-5 text-center space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Or record a voice note</p>
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center text-3xl shadow-lg transition-all ${recording ? "bg-red-500 animate-pulse scale-110" : "bg-blue-600 hover:bg-blue-700 hover:scale-105"
                  }`}
              >
                {recording ? "⏹️" : "🎙️"}
              </button>
              <p className="text-xs text-gray-400">{recording ? "Recording… tap to stop" : "Tap mic to record"}</p>
              {audioUrl && (
                <div className="flex flex-col items-center gap-2">
                  <audio src={audioUrl} controls className="w-full max-w-sm" />
                  <button type="button" onClick={() => { setAudioBlob(null); setAudioUrl(""); }} className="text-xs text-red-500 hover:underline">Remove recording</button>
                </div>
              )}
            </div>

            <button type="submit" disabled={submitting}
              className="w-full h-13 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition shadow-md shadow-blue-100">
              {submitting ? "Submitting…" : "📤  Submit Request to Admin"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  const content = {
    duty: dutyPanel,
    history: historyPanel,
    requests: requestPanel,
    incidents: <div className="-mt-10"><Incidents role="guard" guardId={guardId} /></div>,
    circulars: (
      <div className="space-y-4">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-bold text-gray-800 text-lg">Official Announcements</h2>
          <p className="text-xs text-gray-400 mt-0.5">Broadcasts from your administration</p>
        </div>
        <CircularFeed />
      </div>
    ),
  };

  /* ══ RENDER ══════════════════════════════════════════════ */
  return (
    <>
      {showCamera && (
        <Camera
          onCapture={cameraMode === "checkin" ? onCameraCapture : onCheckoutCapture}
          onClose={() => { setShowCamera(false); setCameraMode(null); }}
        />
      )}

      {showProfile && <GuardProfilePanel guardId={guardId} onClose={() => setShowProfile(false)} />}

      {/* ╔════════════════════════════════╗
          ║  MOBILE LAYOUT (< md)          ║
          ╚════════════════════════════════╝ */}
      <div className="md:hidden flex flex-col min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        {/* Mobile sticky header */}
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-white/60 shadow-sm safe-top">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-base shadow-md">🛡️</div>
              <div>
                <p className="font-bold text-gray-800 text-sm">{guardName || "Guard"}</p>
                {isOnDuty && elapsedTime && (
                  <p className="text-xs font-mono text-emerald-600 font-bold">{elapsedTime}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowProfile(true)}
                className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-sm shadow-sm hover:bg-blue-100 transition"
                title="Profile & Documents"
              >
                👤
              </button>
              {isOnDuty && (
                <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-full font-semibold">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Live
                </span>
              )}
              <Notifications role="guard" guardId={guardId} onNavigate={setActiveTab} />
              <button onClick={handleLogout} className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold">Logout</button>
            </div>
          </div>
        </header>

        {/* Mobile content */}
        <main className="flex-1 overflow-y-auto pb-24">
          <div className="px-4 py-4 space-y-3">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm font-medium">{error}</div>}
            {gpsStatus && <div className={`border px-4 py-3 rounded-2xl text-sm font-medium ${statusColour}`}>{gpsStatus}</div>}
            {content[activeTab]}
          </div>
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-[0_-4px_24px_rgba(0,0,0,0.07)] safe-bottom">
          <div className="flex">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-all relative ${activeTab === tab.key ? "text-blue-600" : "text-gray-400"
                  }`}
              >
                {activeTab === tab.key && (
                  <span className="absolute top-0 inset-x-3 h-0.5 bg-blue-600 rounded-b-full" />
                )}
                <span className={`text-xl transition-transform duration-150 ${activeTab === tab.key ? "scale-110" : ""}`}>
                  {tab.icon}
                </span>
                <span className={`text-[10px] font-bold leading-tight ${activeTab === tab.key ? "text-blue-600" : "text-gray-400"}`}>
                  {tab.label}
                </span>
              </button>
            ))}
          </div>
        </nav>
      </div>

      {/* ╔════════════════════════════════════════╗
          ║  DESKTOP / TABLET LAYOUT (≥ md)        ║
          ╚════════════════════════════════════════╝ */}
      <div className="hidden md:flex min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">

        {/* Desktop LEFT SIDEBAR */}
        <aside className="w-72 shrink-0 flex flex-col bg-white border-r border-gray-100 shadow-sm">
          {/* Brand / guard identity */}
          <div className="px-6 py-8 text-center border-b border-gray-50">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-4xl shadow-xl mb-4 relative">
              🛡️
              <button 
                onClick={() => setShowProfile(true)}
                className="absolute -bottom-2 -right-2 w-8 h-8 bg-white text-blue-600 rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition border border-gray-100"
                title="Profile & Documents"
              >
                👤
              </button>
            </div>
            <h1 className="font-bold text-gray-800 text-xl">{guardName || "Guard"}</h1>
            <p className="text-sm text-gray-400 mt-0.5">Security Officer</p>
            {isOnDuty && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-600 font-mono font-bold text-sm">{elapsedTime}</span>
              </div>
            )}
          </div>

          {/* Today's status pill */}
          <div className="px-5 py-4 border-b border-gray-50">
            <div className={`rounded-2xl px-4 py-3 ${isOnDuty ? "bg-emerald-50" : "bg-gray-50"}`}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Today's Status</p>
              <p className={`font-bold text-sm ${isOnDuty ? "text-emerald-600" : "text-gray-600"}`}>
                {isOnDuty ? "🟢 On Active Duty" : todayRecord ? "✅ Duty Completed" : "⏸️ Not Started"}
              </p>
              {dutyLocation && (
                <p className="text-xs text-gray-400 mt-1">📍 {dutyLocation.place_name}</p>
              )}
            </div>
          </div>

          {/* Sidebar navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-all ${activeTab === tab.key
                  ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                  }`}
              >
                <span className="text-xl">{tab.icon}</span>
                <div>
                  <p className="font-semibold text-sm">{tab.label}</p>
                  <p className={`text-xs ${activeTab === tab.key ? "text-blue-200" : "text-gray-400"}`}>{tab.desc}</p>
                </div>
              </button>
            ))}
          </nav>

          {/* Logout */}
          <div className="px-5 py-5 border-t border-gray-100">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-semibold text-sm transition"
            >
              🚪 Sign Out
            </button>
          </div>
        </aside>

        {/* Desktop MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Desktop top bar */}
          <header className="bg-white border-b border-gray-100 shadow-sm px-8 py-4 flex items-center justify-between shrink-0 relative z-50">
            <div>
              <h2 className="font-bold text-gray-800 text-xl">
                {TABS.find(t => t.key === activeTab)?.icon} {TABS.find(t => t.key === activeTab)?.label}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">{TABS.find(t => t.key === activeTab)?.desc}</p>
            </div>
            <div className="flex items-center gap-3">
              {isOnDuty && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-emerald-700 font-mono font-bold text-sm">{elapsedTime}</span>
                  <span className="text-emerald-600 text-xs">on duty</span>
                </div>
              )}
              <Notifications role="guard" guardId={guardId} onNavigate={setActiveTab} />
              <div className="text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-xl">
                {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
              </div>
            </div>
          </header>

          {/* Desktop scrollable content */}
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-8 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-3.5 rounded-2xl text-sm font-medium">
                  {error}
                </div>
              )}
              {gpsStatus && (
                <div className={`border px-5 py-3.5 rounded-2xl text-sm font-medium ${statusColour}`}>
                  {gpsStatus}
                </div>
              )}
              {content[activeTab]}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

export default GuardDuty;
