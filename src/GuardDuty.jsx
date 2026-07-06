import React, { useEffect, useState, useRef, Suspense } from "react";
import { supabase } from "./lib/supabase";
import Camera from "./Camera";
import { calcDistance, getLocation, uploadPhoto, calculateAttendanceStatus } from "./lib/geoUtils";
import Notifications from "./Notifications";
import DarkModeToggle from "./DarkModeToggle";

const Incidents = React.lazy(() => import("./Incidents"));
import { addToQueue, getQueue, removeFromQueue, setCached, getCached } from "./lib/offlineDb";
import { useToast } from "./Toast";
import { useLanguage } from "./LanguageContext";
import LoadingOverlay from "./LoadingOverlay";
import { formatLocalTime, formatLocalDate } from "./lib/timeUtils";
import { FaMapMarkerAlt, FaClipboardList, FaBell, FaBullhorn, FaPause, FaCamera, FaSatelliteDish, FaCheckCircle, FaCalendarDay, FaUser, FaSignOutAlt, FaPlay, FaCircle, FaExclamationTriangle } from "react-icons/fa";

/* ─── helpers ─────────────────────────────────────── */
function fmt(iso) {
  return formatLocalTime(iso);
}
function fmtDate(iso) {
  return formatLocalDate(iso);
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

/* ─── Language Dropdown ───────────────────────────── */
function LanguageDropdown({ locale, setLocale, isMobile = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const languages = [
    { code: "en", label: "English" },
    { code: "zh", label: "中文" },
    { code: "ar", label: "العربية" },
    { code: "vi", label: "Tiếng Việt" },
    { code: "pa", label: "ਪੰਜਾਬੀ" },
    { code: "hi", label: "हिंदी" },
    { code: "el", label: "Ελληνικά" },
    { code: "it", label: "Italiano" },
    { code: "tl", label: "Tagalog" },
    { code: "es", label: "Español" },
    { code: "ta", label: "தமிழ்" },
  ];

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative flex items-center" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-center font-bold shadow-sm transition shrink-0 ${
          isMobile
            ? "w-8 h-8 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs"
            : "w-10 h-10 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 text-sm"
        }`}
        title="Change Language"
      >
        {locale.toUpperCase() === 'EN' ? 'EN' : locale.toUpperCase()}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-36 bg-white rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] border border-gray-100 overflow-y-auto max-h-48 z-50 py-1 origin-top-right">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setLocale(lang.code);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                locale === lang.code
                  ? "bg-blue-50 text-blue-700 font-bold border-l-2 border-blue-600"
                  : "text-gray-700 hover:bg-gray-50 font-medium border-l-2 border-transparent"
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { key: "duty", label: "Shift Control", mobileLabel: "Shift", icon: <FaMapMarkerAlt />, desc: "Check In / Out" },
  { key: "history", label: "Attendance", mobileLabel: "History", icon: <FaClipboardList />, desc: "Your History" },
  { key: "incidents", label: "Incidents", mobileLabel: "Issues", icon: <FaBell />, desc: "Report Incidents" },
  { key: "circulars", label: "Circulars", mobileLabel: "News", icon: <FaBullhorn />, desc: "Announcements" },
];/* ─── Circular feed (read-only) ─── */
function CircularFeed({ guardId, guardName, companyId }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!navigator.onLine) {
      const cached = getCached("circulars");
      if (cached) setItems(cached);
      return;
    }
    let query = supabase.from("circulars").select("*").order("created_at", { ascending: false });
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    if (guardId) {
      query = query.or(`is_broadcast.eq.true,guard_id.eq.${guardId}`);
    } else {
      query = query.eq("is_broadcast", true);
    }
    query
      .then(({ data }) => {
        const finalData = data || [];
        setItems(finalData);
        setCached("circulars", finalData);
      })
      .catch(() => {
        const cached = getCached("circulars");
        if (cached) setItems(cached);
      });
  }, [guardId, guardName]);

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-gray-300 bg-white md:glass-card rounded-3xl md:py-24 border border-gray-100 md:border-slate-200/80 shadow-sm">
          <span className="text-5xl mb-4">📢</span>
          <p className="font-medium text-gray-400 md:text-gray-500">No announcements yet</p>
        </div>
      ) : (
        items.map(c => (
          <div key={c.id} className="bg-white rounded-2xl p-5 md:p-8 md:glass-card shadow-sm border border-blue-50 md:border-slate-200/80 hover:shadow-md transition">
            <div className="flex justify-between items-start mb-2 md:mb-4">
              <p className="font-bold text-gray-800 md:text-base">📌 {c.title}</p>
              <span className="text-xs md:text-sm text-gray-400 whitespace-nowrap ml-3 bg-gray-50 md:bg-white/50 px-2 md:px-3 py-1 md:py-1.5 rounded-lg border border-transparent md:border-slate-200">
                {new Date(c.created_at).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>
            <p className="text-gray-600 text-sm md:text-base leading-relaxed whitespace-pre-line">{c.content}</p>
          </div>
        ))
      )}
    </div>
  );
}

/* ─── My past requests ─── */
function MyRequests({ guardId }) {
  const [reqs, setReqs] = useState([]);
  useEffect(() => {
    if (!guardId) return;
    if (!navigator.onLine) {
      const cached = getCached(`my_requests_${guardId}`);
      if (cached) setReqs(cached);
      return;
    }
    supabase.from("attendance_requests").select("*").eq("guard_id", guardId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setReqs(data || []);
        setCached(`my_requests_${guardId}`, data || []);
      })
      .catch(() => {
        const cached = getCached(`my_requests_${guardId}`);
        if (cached) setReqs(cached);
      });
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
function GuardProfilePanel({ guardId, onClose, onSosPanic, sendingSos }) {
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

    if (file.size > 5 * 1024 * 1024) {
      setError("File is too large. Maximum allowed size is 5MB.");
      e.target.value = ""; // Reset input
      return;
    }

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
          <div className="flex flex-col items-center relative">
            {/* SOS panic button at top right of the profile box area */}
            <button
              type="button"
              onClick={onSosPanic}
              disabled={sendingSos}
              className={`absolute top-0 right-0 w-11 h-11 rounded-full flex items-center justify-center text-xl shadow-md border transition-all active:scale-95 ${
                sendingSos
                  ? "bg-gray-150 border-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-red-50 hover:bg-red-105 border-red-100 text-red-650"
              }`}
              title="Trigger SOS Panic Alert"
            >
              {sendingSos ? "🚨" : "🆘"}
            </button>
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
function GuardDuty({ guardId, guardName, companyId }) {
  const appLogo = "/logo.png";
  const { t, locale, setLocale } = useLanguage();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace('#', '');
      if (hash && TABS.some(tab => tab.key === hash)) return hash;
    }
    return "duty";
  });

  // Sync activeTab state to URL hash
  useEffect(() => {
    if (typeof window !== "undefined") {
      const currentHash = window.location.hash.replace('#', '');
      if (currentHash !== activeTab) {
        window.history.pushState(null, '', `#${activeTab}`);
      }
    }
  }, [activeTab]);

  // Listen to browser Back/Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && TABS.some(tab => tab.key === hash)) {
        setActiveTab(hash);
      } else {
        setActiveTab("duty");
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  const [showRequestHistory, setShowRequestHistory] = useState(false);
  const [dutyLocation, setDutyLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sendingSos, setSendingSos] = useState(false);
  const [showSosConfirm, setShowSosConfirm] = useState(false);
  const [dutyCompletePopup, setDutyCompletePopup] = useState(null);
  const [checkInSuccessPopup, setCheckInSuccessPopup] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [isOnLeaveToday, setIsOnLeaveToday] = useState(false);
  const [showLeaveHistory, setShowLeaveHistory] = useState(false);
  const [leaveHistory, setLeaveHistory] = useState([]);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const { showToast, ToastContainer } = useToast();

  function handleSosPanic() {
    setShowSosConfirm(true);
  }

  async function executeSosPanic() {
    setShowSosConfirm(false);
    setSendingSos(true);
    try {
      let lat = null;
      let lng = null;
      let locMsg = "Unknown GPS location (disabled/denied)";
      
      try {
        const pos = await getLocation();
        lat = pos.lat;
        lng = pos.lng;
        locMsg = `Latitude: ${pos.lat.toFixed(6)}, Longitude: ${pos.lng.toFixed(6)}`;
      } catch (err) {
        console.warn("Could not get GPS for SOS", err);
      }

      const assignedLoc = dutyLocation?.place_name || "No assigned site";
      const detailedMessage = `GUARD IN EMERGENCY! Name: ${guardName}. Assigned Site: ${assignedLoc}. Current GPS coordinates: ${locMsg}.`;

      // Fetch company_id
      const { data: guardRecord } = await supabase.from("guards").select("company_id").eq("id", guardId).single();
      const compId = guardRecord?.company_id;

      // Insert notification for Admin
      const { error: insErr } = await supabase.from("notifications").insert([{
        user_role: "super_admin",
        guard_id: guardId,
        company_id: compId,
        title: "🚨 SOS PANIC ALERT",
        message: detailedMessage,
        type: "error",
        is_read: false
      }]);

      if (insErr) throw insErr;
      
      showToast("SOS Alert sent! Emergency services and administrators have been notified.", "success");
    } catch (err) {
      showToast("Failed to send SOS alert: " + err.message, "error");
    } finally {
      setSendingSos(false);
    }
  }

  const [gpsStatus, setGpsStatus] = useState(null);
  const [historyLimit, setHistoryLimit] = useState(10);
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
  const [showReportModal, setShowReportModal] = useState(false);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);

  const [isOnTempDuty, setIsOnTempDuty] = useState(false);
  const [primaryLocation, setPrimaryLocation] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeShift, setActiveShift] = useState(null);

  async function syncOfflineData() {
    if (!navigator.onLine) return;
    try {
      const queue = await getQueue();
      if (queue.length === 0) return;

      setIsSyncing(true);
      setStatus("🔄 Syncing offline records...", "info");

      const tempIdMap = {};

      for (const item of queue) {
        try {
          if (item.type === "checkin") {
            const { tempId, guardId, dutyLocationId, photoData, lat, lng, timestamp } = item.data;
            // Upload photo
            const photoUrl = await uploadPhoto(guardId, photoData, supabase);
            // Insert attendance
            const { data, error: err } = await supabase.from("attendance").insert([{
              guard_id: guardId,
              duty_location_id: dutyLocationId,
              check_in_time: timestamp,
              status: "Present",
              check_in_photo: photoUrl,
              check_in_lat: lat,
              check_in_long: lng,
            }]).select();
            if (err) throw err;
            
            const realId = data[0].id;
            if (tempId) {
              tempIdMap[tempId] = realId;
            }
            startLiveTracking(realId);
          } else if (item.type === "checkout") {
            const { attendanceId, photoData, lat, lng, timestamp } = item.data;
            
            let targetId = attendanceId;
            if (typeof targetId === "string" && targetId.startsWith("temp_") && tempIdMap[targetId]) {
              targetId = tempIdMap[targetId];
            }
            
            // Upload photo
            const photoUrl = await uploadPhoto(guardId, photoData, supabase);

            // Fetch check-in time
            const { data: attData } = await supabase.from("attendance").select("check_in_time").eq("id", targetId).single();
            const checkInTime = attData?.check_in_time;
            const checkInDate = checkInTime?.split("T")[0] || new Date(timestamp).toISOString().split("T")[0];

            // Fetch active shift
            const { data: guardShifts } = await supabase.from("shifts").select("*").eq("guard_id", guardId);
            const jsDay = new Date(checkInDate).getDay();
            const checkInDow = jsDay === 0 ? 6 : jsDay - 1;
            const dateOverride = (guardShifts || []).find(s => s.shift_date === checkInDate);
            const weeklyShiftObj = (guardShifts || []).find(s =>
              s.shift_date === null && s.day_of_week !== null && s.day_of_week !== undefined && s.day_of_week === checkInDow
            );
            const activeShiftObj = dateOverride || weeklyShiftObj || null;

            const calculatedStatus = calculateAttendanceStatus(checkInTime, timestamp, activeShiftObj);

            // Update attendance
            const { error: err } = await supabase.from("attendance").update({
              check_out_time: timestamp,
              check_out_photo: photoUrl,
              check_out_lat: lat,
              check_out_long: lng,
              status: calculatedStatus
            }).eq("id", targetId);
            if (err) throw err;
          } else if (item.type === "issue") {
            const { guardId, requestType, message, audioBlob, timestamp } = item.data;
            let audioUploadUrl = null;
            if (audioBlob) {
              let finalAudioBlob = audioBlob;
              if (audioBlob instanceof ArrayBuffer) {
                finalAudioBlob = new Blob([audioBlob], { type: "audio/webm" });
              }
              const fileName = `voice_${guardId}_${Date.now()}.webm`;
              const { error: upErr } = await supabase.storage.from("voice-requests").upload(fileName, finalAudioBlob, { contentType: "audio/webm" });
              if (!upErr) {
                const { data } = supabase.storage.from("voice-requests").getPublicUrl(fileName);
                audioUploadUrl = data.publicUrl;
              } else throw upErr;
            }
            const { error: insErr } = await supabase.from("attendance_requests").insert([{
              company_id: companyId,
              guard_id: guardId,
              request_type: requestType,
              message: message,
              audio_url: audioUploadUrl,
              status: "Pending",
              created_at: timestamp,
              start_date: item.data.start_date || null,
              end_date: item.data.end_date || null
            }]);
            if (insErr) throw insErr;
          } else if (item.type === "incident") {
            const { guardId, incidentType, description, imageFileBlob, audioBlob, timestamp } = item.data;
            let finalImageUrl = null;
            let finalAudioUrl = null;

            if (imageFileBlob) {
              let finalImageBlob = imageFileBlob;
              if (imageFileBlob instanceof ArrayBuffer) {
                finalImageBlob = new Blob([imageFileBlob], { type: "image/jpeg" });
              }
              const imgName = `incident_${guardId}_${Date.now()}.jpg`;
              const { error: imgErr } = await supabase.storage.from("guard-photos").upload(imgName, finalImageBlob);
              if (!imgErr) {
                const { data } = supabase.storage.from("guard-photos").getPublicUrl(imgName);
                finalImageUrl = data.publicUrl;
              } else throw imgErr;
            }

            if (audioBlob) {
              let finalAudioBlob = audioBlob;
              if (audioBlob instanceof ArrayBuffer) {
                finalAudioBlob = new Blob([audioBlob], { type: "audio/webm" });
              }
              const audName = `incident_voice_${guardId}_${Date.now()}.webm`;
              const { error: audErr } = await supabase.storage.from("voice-requests").upload(audName, finalAudioBlob, { contentType: "audio/webm" });
              if (!audErr) {
                const { data } = supabase.storage.from("voice-requests").getPublicUrl(audName);
                finalAudioUrl = data.publicUrl;
              } else throw audErr;
            }

            const { error } = await supabase.from("incidents").insert([
              {
                guard_id: guardId,
                incident_type: incidentType,
                description: description,
                image_url: finalImageUrl,
                audio_url: finalAudioUrl,
                incident_status: "Open",
                created_at: timestamp
              },
            ]);
            if (error) throw error;

            // Generate notification for Admins
            const { data: guardRecord } = await supabase.from("guards").select("company_id").eq("id", guardId).single();
            await supabase.from("notifications").insert([{
              user_role: "super_admin",
              company_id: guardRecord?.company_id,
              guard_id: guardId,
              title: `🚨 New Incident: ${incidentType}`,
              message: description || "Reported with media",
              type: "error",
              is_read: false,
              created_at: timestamp
            }]);
          }

          // Successfully synced, remove from local queue
          await removeFromQueue(item.id);
        } catch (itemErr) {
          console.error("Failed to sync queue item:", item, itemErr);
        }
      }

      setStatus("✅ Offline records synchronized successfully!", "success");
      setTimeout(() => setGpsStatus(null), 3500);
      fetchTodayStatus();
      fetchAttendanceHistory();
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  }

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      syncOfflineData();
    };
    const handleOffline = () => {
      setIsOffline(true);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    syncOfflineData();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  async function fetchAssignedLocation() {
    try {
      if (!navigator.onLine) {
        const cached = getCached(`assigned_location_${guardId}`);
        if (cached) {
          setDutyLocation(cached.dutyLocation);
          setActiveShift(cached.activeShift || null);
        }
        return;
      }
      // Query active shift — use day-of-week based weekly schedule
      const { data: shiftsData } = await supabase
        .from("shifts")
        .select("*")
        .eq("guard_id", guardId);

      const today = new Date().toISOString().split("T")[0];
      const jsDay = new Date().getDay(); 
      const todayDow = jsDay === 0 ? 6 : jsDay - 1; 

      const dateOverride = (shiftsData || []).find(s => s.shift_date === today);
      const weeklyShift = (shiftsData || []).find(s =>
        s.shift_date === null &&
        s.day_of_week !== null &&
        s.day_of_week !== undefined &&
        s.day_of_week === todayDow
      );
      const shift = dateOverride || weeklyShift || null;
      setActiveShift(shift);

      // If shift has a specific duty location assigned, fetch its details
      if (shift && shift.duty_location_id) {
        const { data: shiftLoc } = await supabase
          .from("duty_locations")
          .select("*")
          .eq("id", shift.duty_location_id)
          .single();
        if (shiftLoc) {
          setDutyLocation(shiftLoc);
        } else {
          setDutyLocation(null);
        }
      } else {
        setDutyLocation(null);
      }

      setCached(`assigned_location_${guardId}`, {
        dutyLocation: shift && shift.duty_location_id ? dutyLocation : null, // Will be updated by state but cache might be one cycle behind if we use state here. Wait, we should just cache the fetched loc.
        activeShift: shift
      });
    } catch {
      const cached = getCached(`assigned_location_${guardId}`);
      if (cached) {
        setDutyLocation(cached.dutyLocation);
        setActiveShift(cached.activeShift || null);
      }
    }
  }

  async function fetchAttendanceHistory() {
    try {
      if (!navigator.onLine) {
        const cached = getCached(`attendance_history_${guardId}`);
        if (cached) setAttendanceHistory(cached);
        return;
      }
      const { data } = await supabase.from("attendance").select("*, duty_locations(place_name)").eq("guard_id", guardId).order("check_in_time", { ascending: false }).limit(historyLimit);
      setAttendanceHistory(data || []);
      setCached(`attendance_history_${guardId}`, data || []);
    } catch {
      const cached = getCached(`attendance_history_${guardId}`);
      if (cached) setAttendanceHistory(cached);
    }
  }
  async function fetchTodayStatus() {
    if (!guardId) return;
    try {
      if (!navigator.onLine) {
        const cached = getCached(`today_status_${guardId}`);
        if (cached) {
          setTodayRecord(cached.todayRecord);
          setIsOnDuty(cached.isOnDuty);
          setCurrentAttendanceId(cached.currentAttendanceId);
          setOnDutySince(cached.onDutySince);
        }
        return;
      }
      // 1. Search for active check-in (check_out_time is null) started within the last 16 hours
      // This prevents forgotten shifts from continuing forever and handles night shifts crossing midnight.
      const sixteenHoursAgo = new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString();
      let { data } = await supabase
        .from("attendance")
        .select("*, duty_locations(place_name)")
        .eq("guard_id", guardId)
        .is("check_out_time", null)
        .gte("check_in_time", sixteenHoursAgo)
        .order("check_in_time", { ascending: false })
        .limit(1);

      // 2. If no active check-in, search for the latest completed check-in within the same rolling 16-hour window
      if (!data || data.length === 0) {
        const { data: recentRecords } = await supabase
          .from("attendance")
          .select("*, duty_locations(place_name)")
          .eq("guard_id", guardId)
          .gte("check_in_time", sixteenHoursAgo)
          .order("check_in_time", { ascending: false })
          .limit(1);
        data = recentRecords;
      }
      
      let rec = null;
      let active = false;
      let attId = null;
      let since = null;

      if (data && data.length > 0) {
        rec = data[0];
        setTodayRecord(rec);
        if (rec.check_in_time && !rec.check_out_time) {
          active = true;
          attId = rec.id;
          since = rec.check_in_time;
        }
      } else {
        setTodayRecord(null);
      }

      setIsOnDuty(active);
      setCurrentAttendanceId(attId);
      setOnDutySince(since);

      setCached(`today_status_${guardId}`, {
        todayRecord: rec,
        isOnDuty: active,
        currentAttendanceId: attId,
        onDutySince: since
      });
    } catch {
      const cached = getCached(`today_status_${guardId}`);
      if (cached) {
        setTodayRecord(cached.todayRecord);
        setIsOnDuty(cached.isOnDuty);
        setCurrentAttendanceId(cached.currentAttendanceId);
        setOnDutySince(cached.onDutySince);
      }
    }
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

  async function fetchLeaveStatus() {
    if (!guardId) return;
    try {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("attendance_requests")
        .select("id")
        .eq("guard_id", guardId)
        .eq("request_type", "leave")
        .eq("status", "Approved")
        .lte("start_date", today)
        .gte("end_date", today);
      
      if (error) throw error;
      setIsOnLeaveToday(data && data.length > 0);
    } catch (err) {
      console.error("Error fetching leave status:", err);
    }
  }

  async function fetchLeaveHistory() {
    if (!guardId) return;
    try {
      const { data, error } = await supabase
        .from("attendance_requests")
        .select("*")
        .eq("guard_id", guardId)
        .eq("request_type", "leave")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setLeaveHistory(data || []);
    } catch (err) {
      console.error("Error fetching leave history:", err);
    }
  }

  const handleNavigate = (tab) => {
    if (tab === "leave-history") {
      setActiveTab("history");
      setLeaveStart(new Date().toISOString().split("T")[0]);
      setLeaveEnd(new Date().toISOString().split("T")[0]);
      setLeaveReason("");
      setShowLeaveHistory(true);
      fetchLeaveHistory();
      setShowLeaveModal(true);
    } else if (tab === "correction-history") {
      setActiveTab("history");
      setShowRequestHistory(true);
      setShowReportModal(true);
    } else {
      setActiveTab(tab);
    }
  };

  useEffect(() => { fetchAssignedLocation(); fetchTodayStatus(); fetchLeaveStatus(); }, [guardId]);
  useEffect(() => { fetchAttendanceHistory(); }, [guardId, historyLimit]);
  useEffect(() => { if (!isOnDuty) return; const id = setInterval(fetchTodayStatus, 15000); return () => clearInterval(id); }, [isOnDuty]);

  // Restart auto-ping if guard refreshes the page while on duty
  useEffect(() => {
    if (isOnDuty && currentAttendanceId) {
      if (!trackingRef.current) {
        startLiveTracking(currentAttendanceId);
      }
    } else {
      stopLiveTracking();
    }
  }, [isOnDuty, currentAttendanceId]);



  async function sendLiveLocation(attId) {
    try {
      const p = await getLocation();
      const { error } = await supabase.from("live_tracking").insert([{ guard_id: guardId, attendance_id: attId, latitude: p.lat, longitude: p.lng, company_id: companyId }]);
      if (error) throw error;
      return p;
    } catch (err) { 
      console.error("Auto Ping Exception:", err);
      return null; 
    }
  }
  function startLiveTracking(attId) { sendLiveLocation(attId); trackingRef.current = setInterval(() => sendLiveLocation(attId), 300000); }
  function stopLiveTracking() { if (trackingRef.current) { clearInterval(trackingRef.current); trackingRef.current = null; } }

  function setStatus(msg, type = "info") { setGpsStatus(msg); setGpsType(type); }

  async function handleCheckIn() {
    if (todayRecord && todayRecord.check_out_time) {
      setDutyCompletePopup(todayRecord.check_out_time);
      setTimeout(() => setDutyCompletePopup(null), 3000);
      return;
    }
    if (!dutyLocation) { setError("No duty location assigned. Contact admin."); return; }
    setError(""); setLoading(true);
    try {
      setStatus("📍 Getting your location...", "info");
      const loc = await getLocation();
      const dist = Math.round(calcDistance(loc.lat, loc.lng, dutyLocation.latitude, dutyLocation.longitude));
      const isWithinRange = dist <= dutyLocation.radius_meters || (loc.accuracy && dist <= loc.accuracy) || import.meta.env.DEV;
      if (!isWithinRange) {
        setStatus(`⚠️ You are ${dist}m away (accuracy +/-${Math.round(loc.accuracy || 0)}m). Move within ${dutyLocation.radius_meters}m of ${dutyLocation.place_name}.`, "warn");
        setLoading(false); return;
      }
      setStatus("✅ Location verified! Capture selfie to check in.", "success");
      setLoading(false);
      setCameraMode("checkin"); setShowCamera(true);
    } catch (err) { setError(err.message); setLoading(false); setGpsStatus(null); }
  }

  async function onCameraCapture(dataUrl) {
    if (!dataUrl) { setError("Camera not available. Grant camera permission and try again."); setLoading(false); return; }
    setLoading(true);
    try {
      setStatus("📸 Uploading check-in photo...", "info");
      if (!navigator.onLine) {
        const tempId = "temp_" + Date.now();
        const now = new Date().toISOString(); // Placeholder for offline UX
        const pos = await getLocation();
        
        await addToQueue("checkin", {
          tempId,
          guardId,
          dutyLocationId: dutyLocation?.id,
          photoData: dataUrl,
          lat: pos.lat,
          lng: pos.lng,
          timestamp: now
        });

        setIsOnDuty(true);
        setCurrentAttendanceId(tempId);
        setOnDutySince(now);

        const localRecord = {
          check_in_time: now,
          status: "Present",
          check_in_photo: dataUrl,
          check_in_lat: pos.lat,
          check_in_long: pos.lng
        };
        setTodayRecord(localRecord);

        setCached(`today_status_${guardId}`, {
          todayRecord: localRecord,
          isOnDuty: true,
          currentAttendanceId: tempId,
          onDutySince: now
        });

        setCheckInSuccessPopup(true);
        setTimeout(() => setCheckInSuccessPopup(false), 3000);
        setLoading(false);
        return;
      }

      const photoUrl = await uploadPhoto(guardId, dataUrl, supabase);
      const pos = await getLocation();
      const { data, error: err } = await supabase.rpc("mark_checkin", {
        p_guard_id: guardId,
        p_duty_location_id: dutyLocation?.id,
        p_check_in_lat: pos.lat,
        p_check_in_long: pos.lng,
        p_check_in_photo: photoUrl
      });
      if (err) { 
        console.error("Attendance insert error:", JSON.stringify(err, null, 2));
        setError(`Error marking attendance: ${err.message || err.code || JSON.stringify(err)}`);
        setLoading(false); return;
      }
      const serverNow = data[0].check_in_time;
      setIsOnDuty(true); setCurrentAttendanceId(data[0].id); setOnDutySince(serverNow);
      startLiveTracking(data[0].id);
      await fetchTodayStatus();
      await fetchAttendanceHistory();
      setCheckInSuccessPopup(true);
      setTimeout(() => setCheckInSuccessPopup(false), 3000);
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
        const isWithinRange = dist <= dutyLocation.radius_meters || (pos.accuracy && dist <= pos.accuracy) || import.meta.env.DEV;
        if (!isWithinRange) { setStatus(`⚠️ You are ${dist}m away (accuracy +/-${Math.round(pos.accuracy || 0)}m). Move within ${dutyLocation.radius_meters}m of ${dutyLocation.place_name}.`, "warn"); setLoading(false); return; }
      }
      setStatus("✅ Location ok! Capture selfie to check out.", "success");
      setLoading(false);
      setCameraMode("checkout"); setShowCamera(true);
    } catch (err) { setError(err.message); setLoading(false); }
  }

  async function onCheckoutCapture(dataUrl) {
    if (!dataUrl) { setError("Camera not available. Grant camera permission and try again."); setLoading(false); return; }
    setLoading(true);
    try {
      // Offline fallback timestamp (will be overwritten by server on sync)
      const now = new Date().toISOString();
      let calculatedStatus = calculateAttendanceStatus(todayRecord?.check_in_time, now, activeShift);

      if (!navigator.onLine) {
        const pos = await getLocation();

        await addToQueue("checkout", {
          attendanceId: currentAttendanceId,
          photoData: dataUrl,
          lat: pos.lat,
          lng: pos.lng,
          timestamp: now
        });

        stopLiveTracking();
        setIsOnDuty(false);
        setCurrentAttendanceId(null);
        setOnDutySince(null);

        const localRecord = {
          ...todayRecord,
          check_out_time: now,
          check_out_photo: dataUrl,
          check_out_lat: pos.lat,
          check_out_long: pos.lng,
          status: calculatedStatus
        };
        setTodayRecord(localRecord);

        setCached(`today_status_${guardId}`, {
          todayRecord: localRecord,
          isOnDuty: false,
          currentAttendanceId: null,
          onDutySince: null
        });

        // Also add to history list cache
        const history = getCached(`attendance_history_${guardId}`) || [];
        const newHistoryItem = {
          id: "temp_hist_" + Date.now(),
          check_in_time: todayRecord?.check_in_time || now,
          check_out_time: now,
          status: calculatedStatus,
          duty_locations: { place_name: dutyLocation?.place_name || "Assigned Location" }
        };
        const updatedHistory = [newHistoryItem, ...history.filter(h => h.id !== currentAttendanceId)];
        setAttendanceHistory(updatedHistory);
        setCached(`attendance_history_${guardId}`, updatedHistory);

        setStatus("💾 Check-out saved offline! Will sync when connected.", "success");
        setTimeout(() => setGpsStatus(null), 3000);
        setLoading(false);
        return;
      }

      setStatus("📸 Uploading checkout photo...", "info");
      const photoUrl = await uploadPhoto(guardId, dataUrl, supabase);
      const pos = await getLocation();
      const { data, error: err } = await supabase.rpc("mark_checkout", {
        p_attendance_id: currentAttendanceId,
        p_check_out_lat: pos.lat,
        p_check_out_long: pos.lng,
        p_check_out_photo: photoUrl
      });
      if (err) { setError("Error checking out."); setLoading(false); return; }
      
      const serverNow = data[0].check_out_time;
      calculatedStatus = calculateAttendanceStatus(todayRecord?.check_in_time, serverNow, activeShift);
      if (calculatedStatus !== "Present" && calculatedStatus !== data[0].status) {
         await supabase.from("attendance").update({ status: calculatedStatus }).eq("id", currentAttendanceId);
      }

      stopLiveTracking();
      setIsOnDuty(false); setCurrentAttendanceId(null); setOnDutySince(null);
      setStatus("✅ Checked out! Stay safe.", "success");
      await fetchTodayStatus();
      await fetchAttendanceHistory();
      setDutyCompletePopup(serverNow);
      setTimeout(() => setDutyCompletePopup(null), 3000);
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
    } else setStatus("❌ Failed to save location.", "warn");
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
      const timePart = new Date().toISOString().split("T")[1];
      const customTimestamp = `${issueDate}T${timePart}`;

      if (!navigator.onLine) {
        await addToQueue("issue", {
          guardId,
          requestType: audioBlob ? "voice" : "text",
          message: reqMessage.trim() || "Voice note submitted",
          audioBlob: audioBlob || null,
          timestamp: customTimestamp
        });

        // Add locally to request history list cache so it shows in history panel immediately
        const cachedRequests = getCached(`my_requests_${guardId}`) || [];
        const newRequestItem = {
          id: "temp_req_" + Date.now(),
          request_type: audioBlob ? "voice" : "text",
          message: reqMessage.trim() || "Voice note submitted",
          audio_url: audioUrl || null,
          status: "Pending",
          created_at: customTimestamp
        };
        const updatedRequests = [newRequestItem, ...cachedRequests];
        setCached(`my_requests_${guardId}`, updatedRequests);

        setStatus("💾 Request saved offline! Will sync when connected.", "success");
        setReqMessage(""); setAudioBlob(null); setAudioUrl("");
        setShowReportModal(false);
        setTimeout(() => setGpsStatus(null), 3000);
        setSubmitting(false);
        return;
      }

      let audioUploadUrl = null;
      if (audioBlob) {
        const fileName = `voice_${guardId}_${Date.now()}.webm`;
        const { error: upErr } = await supabase.storage.from("voice-requests").upload(fileName, audioBlob, { contentType: "audio/webm" });
        if (!upErr) { const { data } = supabase.storage.from("voice-requests").getPublicUrl(fileName); audioUploadUrl = data.publicUrl; }
      }
      const { error: insErr } = await supabase.from("attendance_requests").insert([{
        company_id: companyId,
        guard_id: guardId, request_type: audioBlob ? "voice" : "text",
        message: reqMessage.trim() || "Voice note submitted", audio_url: audioUploadUrl, status: "Pending",
        created_at: customTimestamp
      }]);
      if (insErr) throw insErr;
      setStatus("✅ Request sent to admin.", "success");
      setReqMessage(""); setAudioBlob(null); setAudioUrl("");
      setShowReportModal(false);
      setTimeout(() => setGpsStatus(null), 3000);
    } catch (err) { setError(err.message); }
    setSubmitting(false);
  }

  async function submitLeaveRequest(e) {
    e.preventDefault();
    if (!leaveReason.trim()) { setError("Please provide a reason for leave."); return; }
    setSubmitting(true); setError("");
    try {
      const now = new Date().toISOString();
      const formattedMessage = `Reason: ${leaveReason.trim()}`;

      if (!navigator.onLine) {
        await addToQueue("issue", {
          guardId,
          requestType: "leave",
          message: formattedMessage,
          audioBlob: null,
          timestamp: now,
          start_date: leaveStart,
          end_date: leaveEnd
        });

        const cachedRequests = getCached(`my_requests_${guardId}`) || [];
        const newRequestItem = {
          id: "temp_req_" + Date.now(),
          request_type: "leave",
          message: formattedMessage,
          audio_url: null,
          status: "Pending",
          created_at: now,
          start_date: leaveStart,
          end_date: leaveEnd
        };
        const updatedRequests = [newRequestItem, ...cachedRequests];
        setCached(`my_requests_${guardId}`, updatedRequests);

        setStatus("💾 Leave request saved offline! Will sync when connected.", "success");
        setShowLeaveModal(false);
        setTimeout(() => setGpsStatus(null), 3000);
        setSubmitting(false);
        return;
      }

      const { error: insErr } = await supabase.from("attendance_requests").insert([{
        company_id: companyId,
        guard_id: guardId,
        request_type: "leave",
        message: formattedMessage,
        audio_url: null,
        status: "Pending",
        created_at: now,
        start_date: leaveStart,
        end_date: leaveEnd
      }]);
      if (insErr) throw insErr;
      
      setStatus("✅ Leave request submitted successfully.", "success");
      setShowLeaveModal(false);
      fetchLeaveStatus();
      setTimeout(() => setGpsStatus(null), 3000);
    } catch (err) { setError(err.message); }
    setSubmitting(false);
  }

  async function handleLogout() { stopLiveTracking(); await supabase.auth.signOut(); window.location.reload(); }

  const statusColour = gpsType === "success" ? "bg-blue-50 border-blue-200 text-blue-700"
    : gpsType === "warn" ? "bg-amber-50 border-amber-200 text-amber-700"
      : "bg-blue-50 border-blue-200 text-blue-700";

  const isActuallyOnLeave = isOnLeaveToday || (todayRecord && todayRecord.status?.toLowerCase() === "leave");

  /* ─── Duty Control panel (shared between mobile & desktop) ─── */
  const dutyPanel = (
    <div className="space-y-4">
      {isActuallyOnLeave && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-2xl text-sm font-medium flex items-center gap-3">
          <FaCalendarDay className="text-3xl" />
          <div>
            <p className="font-bold">On Approved Leave Today</p>
            <p className="text-xs opacity-80">Check-in is disabled during your approved leave days.</p>
          </div>
        </div>
      )}

      {/* Primary status card */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden md:glass-card md:border-slate-200/80">
        <div className={`px-6 py-5 md:py-8 md:px-8 ${isOnDuty ? "bg-gradient-to-r from-blue-600 to-blue-700" : "bg-gradient-to-r from-slate-700 to-slate-800 md:from-slate-800 md:to-slate-900"}`}>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">{t("status")}</p>
              <p className="text-white font-bold text-lg flex items-center">
                {isOnDuty ? <><span className="inline-block mr-2"><FaCircle className="text-[10px] text-green-400" /></span>{t("on_active_duty")}</> : 
                 (todayRecord && todayRecord.status?.toLowerCase() === "leave") ? <><span className="inline-block mr-2 text-amber-400"><FaCalendarDay className="text-lg"/></span>On Leave</> :
                 todayRecord ? <><span className="inline-block mr-2"><FaCheckCircle className="text-lg text-green-400"/></span>{t("duty_complete")}</> : 
                 <><span className="bg-blue-500 w-6 h-6 rounded flex items-center justify-center mr-2"><FaPause className="text-white text-[10px]" /></span>{t("off_duty")}</>}
              </p>
            </div>
            {isOnDuty && elapsedTime && (
              <div className="text-right">
                <p className="text-white/60 text-xs mb-1">{t("time_on_duty")}</p>
                <p className="text-white font-mono font-bold text-xl">{elapsedTime}</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-4 md:space-y-6">
          {dutyLocation ? (
            <div className={`flex gap-4 rounded-2xl p-4 md:p-6 bg-gray-50 md:bg-white/50 border border-transparent md:border-slate-200`}>
              <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shrink-0 text-xl bg-blue-100`}>
                <FaMapMarkerAlt className="text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-800">{dutyLocation.place_name}</p>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{t("allowed_radius")}: {dutyLocation.radius_meters}m</p>
                {isOnDuty && gpsDistance !== null && (
                  <div className={`flex items-center gap-1.5 mt-1.5 text-xs font-semibold ${gpsDistance > dutyLocation.radius_meters ? "text-red-600" : "text-blue-600"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${gpsDistance > dutyLocation.radius_meters ? "bg-red-500" : "bg-blue-500"}`} />
                    {gpsDistance > dutyLocation.radius_meters ? t("outside_zone") : t("inside_zone")} — {gpsDistance}m from center
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
            onClick={isActuallyOnLeave ? null : (isOnDuty ? handleCheckOut : handleCheckIn)}
            disabled={loading || (!dutyLocation && !isOnDuty) || isActuallyOnLeave}
            className={`w-full h-12 md:h-10 rounded-xl md:rounded-lg text-white font-bold text-sm transition-all shadow-sm active:scale-[0.98] ${loading ? "bg-gray-300 cursor-not-allowed" :
              isActuallyOnLeave ? "bg-amber-500 hover:bg-amber-600 shadow-amber-200 cursor-not-allowed" :
              isOnDuty ? "bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shadow-orange-200" :
                "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
              }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t("submitting")}
              </span>
            ) : isActuallyOnLeave ? <><FaCalendarDay className="mr-2 inline-block"/>{t("on_approved_leave", "On Approved Leave")}</> : isOnDuty ? <><FaCamera className="mr-2 inline-block"/>{t("end_duty")}</> : <><FaMapMarkerAlt className="mr-2 inline-block"/>{t("start_duty")}</>}
          </button>
        </div>
      </div>

      {isOnDuty && (
        <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-blue-100 p-4 md:p-6 flex items-center justify-between md:glass-card md:border-blue-200/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg"><FaSatelliteDish /></div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <p className="text-sm font-bold text-gray-800">{t("live_tracking_active")}</p>
              </div>
              <p className="text-xs text-gray-400">{t("auto_pings")}</p>
            </div>
          </div>
          <button onClick={forceLocationPush} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 rounded-xl font-semibold transition shadow-sm">
            {t("ping_now")}
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-gray-100 p-5 md:p-8 md:glass-card md:border-slate-200/80">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 md:mb-5">{t("guard_details")}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 text-sm">
          <div>
            <p className="text-gray-400 text-xs mb-0.5">{t("name")}</p>
            <p className="font-semibold text-gray-800">{guardName || "—"}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-0.5">{t("today_location")}</p>
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-gray-800">{dutyLocation?.place_name || "Not assigned"}</p>
              {isOnTempDuty && <span className="text-xs bg-amber-100 text-amber-600 px-1.5 rounded-full font-bold">TEMP</span>}
            </div>
          </div>
          <div className="col-span-2">
            <p className="text-gray-400 text-xs mb-0.5">{t("today")}</p>
            <p className="font-semibold text-gray-800">{new Date().toLocaleDateString(locale === "en" ? "en-AU" : locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const historyPanel = (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden md:glass-card md:border-slate-200/80">
      <div className="px-6 py-4 md:py-6 md:px-8 border-b border-gray-50 md:border-slate-200/50 flex justify-between items-center bg-gray-50/30">
        <div>
          <h2 className="font-bold text-gray-800 text-lg">{t("attendance_history")}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{attendanceHistory.length} {t("records_found")}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setIssueDate(new Date().toISOString().split("T")[0]);
              setShowReportModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition"
          >
            <span className="hidden sm:inline">{t("report_issue")}</span>
            <span className="sm:hidden">Report</span>
          </button>
          <button
            onClick={() => {
              setLeaveStart(new Date().toISOString().split("T")[0]);
              setLeaveEnd(new Date().toISOString().split("T")[0]);
              setLeaveReason("");
              setShowLeaveHistory(false);
              fetchLeaveHistory();
              setShowLeaveModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl text-xs font-bold transition"
          >
            <span className="hidden sm:inline">Request Leave</span>
            <span className="sm:hidden">Leave</span>
          </button>
          <button
            onClick={() => {
              setCalendarMonth(new Date());
              setSelectedCalendarDate(null);
              setShowCalendarModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-bold transition"
          >
            <span className="hidden sm:inline">Full Calendar</span>
            <span className="sm:hidden">📅</span>
          </button>
        </div>
      </div>
      <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
        {attendanceHistory.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-300">
            <span className="text-5xl mb-3">📋</span>
            <p className="font-medium text-gray-400">{t("no_attendance")}</p>
          </div>
        ) : (
          <>
            {attendanceHistory.map(item => {
          const loc = item.duty_locations?.place_name;
          return (
            <div key={item.id} className="px-6 py-4 md:py-5 md:px-8 flex justify-between items-center hover:bg-gray-50/50 transition">
              <div>
                <p className="font-semibold text-gray-800 md:text-base">{fmtDate(item.check_in_time)}</p>
                {loc && <p className="text-xs text-blue-600 mt-0.5">📍 {loc}</p>}
                <p className="text-xs text-gray-400 mt-1">In: {fmt(item.check_in_time)} &nbsp;·&nbsp; Out: {fmt(item.check_out_time)}</p>
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
                      statusClass = "bg-blue-100 text-blue-700";
                    } else {
                      displayStatus = "Missed Checkout";
                      statusClass = "bg-amber-100 text-amber-700";
                    }
                  } else {
                    displayStatus = "Present";
                    statusClass = "bg-green-100 text-green-700";
                  }
                } else if (item.status === "Absent") {
                  statusClass = "bg-red-100 text-red-700";
                } else if (item.status === "Half Day") {
                  statusClass = "bg-amber-100 text-amber-700";
                } else {
                  statusClass = "bg-yellow-100 text-yellow-700";
                }
                return (
                  <span className={`text-xs px-3 py-1 rounded-full font-bold shrink-0 ml-3 uppercase tracking-wider ${statusClass}`}>
                    {displayStatus}
                  </span>
                );
              })()}
            </div>
          );
        })}
            {attendanceHistory.length >= historyLimit && (
              <div className="p-4 flex justify-center border-t border-gray-50">
                <button
                  onClick={() => setHistoryLimit(prev => prev + 10)}
                  className="px-5 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-full font-bold text-xs transition"
                >
                  Load More Records
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  const content = {
    duty: dutyPanel,
    history: historyPanel,
    incidents: (
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 font-semibold gap-3 bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <span className="text-xs">Loading Incidents...</span>
        </div>
      }>
        <Incidents role="guard" currentGuardId={guardId} companyId={companyId} />
      </Suspense>
    ),
    circulars: (
      <div className="space-y-4 md:space-y-6">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 md:glass-card md:p-8 md:border-slate-200/80">
          <h2 className="font-bold text-gray-800 text-lg">{t("official_announcements")}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{t("circulars_desc")}</p>
        </div>
        <CircularFeed guardId={guardId} guardName={guardName} companyId={companyId} />
      </div>
    ),
  };

  /* ══ RENDER ══════════════════════════════════════════════ */


  return (
    <>
      <ToastContainer />
      {loading && <LoadingOverlay message={gpsStatus || "Processing your request..."} />}
      {dutyCompletePopup && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-150 text-center animate-scale-in">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 animate-bounce">
              ✅
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Duty Completed Today</h3>
            <p className="text-sm text-gray-500">
              You checked out at <strong className="text-gray-700">{fmt(dutyCompletePopup)}</strong>.
            </p>
          </div>
        </div>
      )}
      {checkInSuccessPopup && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-150 text-center animate-scale-in">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 animate-bounce">
              🟢
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Check-in Successful!</h3>
            <p className="text-sm text-gray-500">
              Your duty has started. Live tracking is active.
            </p>
          </div>
        </div>
      )}
      {showCamera && (
        <Camera
          onCapture={cameraMode === "checkin" ? onCameraCapture : onCheckoutCapture}
          onClose={() => { setShowCamera(false); setCameraMode(null); setLoading(false); setGpsStatus(null); }}
        />
      )}

      {showProfile && (
        <GuardProfilePanel
          guardId={guardId}
          onClose={() => setShowProfile(false)}
          onSosPanic={handleSosPanic}
          sendingSos={sendingSos}
        />
      )}

      {showCalendarModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-150 animate-scale-in">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">📅 Attendance Calendar</h3>
              <button onClick={() => setShowCalendarModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
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
                  if (!d) return <div key={`empty-${i}`} className="h-10"></div>;
                  
                  // Adjust timezone offset to get the exact local date string
                  const localDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
                  const dateStr = localDate.toISOString().split("T")[0];
                  
                  const record = attendanceHistory.find(r => (r.check_in_time && r.check_in_time.startsWith(dateStr)) || (r.date && r.date.startsWith(dateStr)));
                  
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
                      className={`h-10 rounded-xl flex items-center justify-center text-sm transition ${bgClass} ${selectedCalendarDate?.id === record?.id && record ? "ring-2 ring-indigo-500" : ""}`}
                    >
                      {d.getDate()}
                    </button>
                  );
                });
              })()}
            </div>

            {/* Selected Date Details */}
            <div className="mt-4 p-3 bg-gray-50 rounded-xl border border-gray-100 min-h-[80px]">
              {selectedCalendarDate ? (
                selectedCalendarDate.dummy ? (
                  <p className="text-sm text-gray-500 text-center mt-2">No attendance record for {selectedCalendarDate.dateStr}</p>
                ) : (
                  <div className="text-sm">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-gray-700">{selectedCalendarDate.check_in_time?.split("T")[0] || selectedCalendarDate.date}</span>
                      <span className={`font-bold uppercase text-[10px] px-2 py-0.5 rounded shadow-sm ${selectedCalendarDate.status === "Present" || selectedCalendarDate.status === "On Duty" ? "bg-green-100 text-green-700" : selectedCalendarDate.status === "Leave" || selectedCalendarDate.status === "Half Day" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>{selectedCalendarDate.status}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-2 space-y-1">
                      {selectedCalendarDate.status === "Leave" || selectedCalendarDate.status === "Absent" ? (
                        <p className="italic">Time records not applicable</p>
                      ) : (
                        <>
                          <p>Check In: <span className="font-semibold text-gray-700">{selectedCalendarDate.check_in_time ? new Date(selectedCalendarDate.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}</span></p>
                          <p>Check Out: <span className="font-semibold text-gray-700">{selectedCalendarDate.check_out_time ? new Date(selectedCalendarDate.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}</span></p>
                        </>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <p className="text-sm text-gray-400 text-center mt-2">Click a date to view details</p>
              )}
            </div>
            
            <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-1 text-[10px] text-gray-500"><div className="w-2 h-2 rounded-full bg-green-400"></div> Present</div>
              <div className="flex items-center gap-1 text-[10px] text-gray-500"><div className="w-2 h-2 rounded-full bg-yellow-400"></div> Leave</div>
              <div className="flex items-center gap-1 text-[10px] text-gray-500"><div className="w-2 h-2 rounded-full bg-red-400"></div> Absent</div>
            </div>
          </div>
        </div>
      )}

      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-150 dark:border-slate-800 animate-scale-in">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 dark:border-slate-800">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                {showLeaveHistory ? <><FaClipboardList className="text-gray-500 dark:text-slate-400" /> Leave History</> : <><FaCalendarDay className="text-amber-500" /> Request Leave</>}
              </h3>
              <div className="flex items-center gap-3">
                {!showLeaveHistory ? (
                  <button
                    type="button"
                    onClick={() => {
                      fetchLeaveHistory();
                      setShowLeaveHistory(true);
                    }}
                    className="text-xs bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-250/50 dark:border-slate-700 px-2.5 py-1.5 rounded-lg font-bold hover:bg-gray-105 dark:hover:bg-slate-700 transition"
                  >
                    🕒 History
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowLeaveHistory(false)}
                    className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-250/50 dark:border-amber-900/50 px-2.5 py-1.5 rounded-lg font-bold hover:bg-amber-101 dark:hover:bg-amber-900/50 transition"
                  >
                    ⬅️ Form
                  </button>
                )}
                <button onClick={() => setShowLeaveModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white text-2xl leading-none">&times;</button>
              </div>
            </div>
            
            {showLeaveHistory ? (
              <div className="space-y-3">
                <div className="max-h-[50vh] overflow-y-auto pr-1 space-y-3">
                  {leaveHistory.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">No leave requests found.</p>
                  ) : (
                    leaveHistory.map((item) => (
                      <div key={item.id} className="bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 p-3 rounded-2xl space-y-1.5 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-amber-800">
                            📅 {item.start_date} to {item.end_date}
                          </span>
                          <span className={`status-chip text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            item.status === "Approved" ? "bg-green-100 text-green-700 border-green-200" :
                            item.status === "Rejected" ? "bg-red-100 text-red-700 border-red-200" :
                            "bg-amber-100 text-amber-700 border-amber-200"
                          }`}>
                            {item.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">
                          {item.message || "No reason provided."}
                        </p>
                        <p className="text-[10px] text-gray-400 text-right">
                          Requested: {new Date(item.created_at).toLocaleDateString([], { day: "numeric", month: "short" })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex justify-end pt-3 border-t border-gray-100 dark:border-slate-800 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowLeaveModal(false)}
                    className="px-6 py-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-705 dark:text-slate-300 rounded-xl transition text-sm font-bold"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submitLeaveRequest} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={leaveStart}
                      onChange={(e) => {
                        setLeaveStart(e.target.value);
                        setLeaveEnd(e.target.value);
                      }}
                      required
                      className="w-full h-10 border border-gray-200 p-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-350 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">End Date</label>
                    <input
                      type="date"
                      value={leaveEnd}
                      min={leaveStart}
                      onChange={(e) => setLeaveEnd(e.target.value)}
                      required
                      className="w-full h-10 border border-gray-200 p-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-350 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Reason for Leave</label>
                  <textarea
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    placeholder="Enter reason..."
                    required
                    rows={3}
                    className="w-full border border-gray-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-355 bg-white resize-none"
                  />
                </div>

                {error && <p className="text-red-500 text-xs">{error}</p>}

                <div className="flex gap-2 justify-end pt-3 border-t border-gray-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowLeaveModal(false)}
                    className="px-4 py-2 border border-gray-300 dark:border-slate-700 text-gray-600 dark:text-slate-300 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition text-sm font-bold shadow-md shadow-amber-200"
                  >
                    {submitting ? "Sending..." : "Submit Request"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ╔════════════════════════════════╗
          ║  MOBILE LAYOUT (< md)          ║
          ╚════════════════════════════════╝ */}
      <div className="md:hidden flex flex-col min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        {/* Mobile sticky header */}
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-white/60 dark:border-slate-800/60 shadow-sm safe-top">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button 
                onClick={() => setShowProfile(true)}
                className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-sm shadow-sm hover:bg-blue-100 transition shrink-0"
                title="Profile & Documents"
              >
                <FaUser />
              </button>
              <div>
                <p className="font-bold text-gray-800 text-sm">{guardName || "Guard"}</p>
                {isOnDuty && elapsedTime && (
                  <p className="text-xs font-mono text-blue-600 font-bold">{elapsedTime}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DarkModeToggle />
              {/* 🌐 Language Selector */}
              <LanguageDropdown locale={locale} setLocale={setLocale} isMobile={true} />
              {isOnDuty && (
                <span className="flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-semibold">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" /> Live
                </span>
              )}
              <Notifications role="guard" guardId={guardId} guardName={guardName} onNavigate={handleNavigate} />
              <button
                onClick={handleLogout}
                className="w-8 h-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center text-sm shadow-sm hover:bg-red-100 transition shrink-0"
                title={t("logout")}
              >
                <FaSignOutAlt />
              </button>
            </div>
          </div>
        </header>

        {/* Mobile content */}
        <main className="flex-1 overflow-y-auto pb-24">
          <div className="px-4 py-4 space-y-3">
            {isOffline && (
              <div className="bg-amber-500 text-white px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center justify-between shadow-md shadow-amber-100 animate-pulse">
                <span>⚠️ Working Offline Mode — Actions will sync automatically when online.</span>
                <span className="bg-white/20 px-2 py-0.5 rounded-full">Offline</span>
              </div>
            )}
            {isSyncing && (
              <div className="bg-blue-600 text-white px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center justify-between shadow-md shadow-blue-100">
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Synchronizing pending records to database...
                </span>
              </div>
            )}
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
                  {t(tab.key)}
                </span>
              </button>
            ))}
          </div>
        </nav>
      </div>

      {/* ╔════════════════════════════════════════╗
          ║  DESKTOP / TABLET LAYOUT (≥ md)        ║
          ╚════════════════════════════════════════╝ */}
      <div className="hidden md:flex min-h-screen bg-slate-50">

        {/* Desktop LEFT SIDEBAR */}
        <aside className="w-72 shrink-0 flex flex-col bg-slate-900 border-r border-slate-800 shadow-xl">
          {/* Brand / guard identity */}
          <div className="px-6 py-8 text-center border-b border-slate-800">
            <div className="w-20 h-20 mx-auto mb-4 relative flex items-center justify-center">
              <img src={appLogo} alt="SecureSys Logo" className="w-full h-full object-cover rounded-3xl shadow-xl bg-white p-1" />
            </div>
            <h1 className="font-bold text-white text-base">{guardName || "Guard"}</h1>
            <p className="text-xs text-slate-400 mt-0.5">Security Officer</p>
            {isOnDuty && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-blue-400 font-mono font-bold text-sm">{elapsedTime}</span>
              </div>
            )}
          </div>



          {/* Sidebar navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-all ${activeTab === tab.key
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }`}
              >
                <span className="text-xl">{tab.icon}</span>
                <div>
                  <p className={`font-semibold text-sm ${activeTab === tab.key ? "text-white" : "text-slate-300"}`}>{t(tab.key)}</p>
                  <p className={`text-[10px] mt-0.5 ${activeTab === tab.key ? "text-blue-200" : "text-slate-500"}`}>{t(tab.key + "_desc")}</p>
                </div>
              </button>
            ))}
          </nav>

        </aside>

        {/* Desktop MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Desktop top bar */}
          <header className="bg-white border-b border-gray-100 shadow-sm px-8 py-3.5 flex items-center justify-between shrink-0 relative z-50">
            <div>
              <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                <span className="text-blue-600 flex-shrink-0">{TABS.find(tab => tab.key === activeTab)?.icon}</span> {t(activeTab)}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">{t(activeTab + "_desc")}</p>
            </div>
            <div className="flex items-center gap-3">
              {isOnDuty && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-4 py-2 rounded-xl">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  <span className="text-blue-700 font-mono font-bold text-sm">{elapsedTime}</span>
                  <span className="text-blue-600 text-xs">{t("on_active_duty")}</span>
                </div>
              )}
              <button 
                onClick={() => setShowProfile(true)}
                className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm shadow-sm hover:bg-blue-100 transition"
                title="Profile & Documents"
              >
                👤
              </button>
              <Notifications role="guard" guardId={guardId} guardName={guardName} onNavigate={handleNavigate} />
              <div className="text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-xl hidden lg:block">
                {new Date().toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
              </div>
              {/* 🌐 Language Selector */}
              <DarkModeToggle />
              <LanguageDropdown locale={locale} setLocale={setLocale} isMobile={false} />
              <button
                onClick={handleLogout}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition shadow-sm shrink-0"
                title={t("logout")}
              >
                <span className="text-lg">🚪</span>
              </button>
            </div>
          </header>

          {/* Desktop scrollable content */}
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-8 space-y-4">
              {isOffline && (
                <div className="bg-amber-500 text-white px-5 py-3.5 rounded-2xl text-sm font-bold flex items-center justify-between shadow-md shadow-amber-100 animate-pulse">
                  <span>⚠️ You are currently offline. Changes are saved locally and will auto-sync once internet is restored.</span>
                  <span className="bg-white/20 px-3 py-1 rounded-full text-xs">Offline Active</span>
                </div>
              )}
              {isSyncing && (
                <div className="bg-blue-600 text-white px-5 py-3.5 rounded-2xl text-sm font-bold flex items-center justify-between shadow-md shadow-blue-100">
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Synchronizing offline records to Supabase...
                  </span>
                </div>
              )}
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

      {/* SOS Confirm Modal */}
      {showSosConfirm && (
        <div className="fixed inset-0 z-[200] bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 text-center animate-slide-up">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-3xl mx-auto mb-4 animate-pulse">🚨</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Trigger SOS Alert?</h3>
            <p className="text-gray-500 mb-6 text-sm">This will instantly alert the administration with your live GPS location. Use only in emergencies.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowSosConfirm(false)}
                className="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button 
                onClick={executeSosPanic}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200 transition"
              >
                Yes, Trigger SOS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-[100] bg-gray-900/50 backdrop-blur-sm flex items-end md:items-center justify-center md:p-4">
          <div className="bg-white w-full max-w-md h-[90vh] md:h-auto md:max-h-[90vh] md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col animate-slide-up">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 md:rounded-t-3xl rounded-t-3xl">
              <div>
                <h2 className="font-bold text-gray-800 text-lg">
                  {showRequestHistory ? t("past_requests") : t("report_issue")}
                </h2>
                {!showRequestHistory && <p className="text-xs text-gray-400 mt-0.5">Missed check-in or GPS error? Let admin know.</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowRequestHistory(!showRequestHistory)}
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition"
                >
                  {showRequestHistory ? "📝 Form" : "🕒 History"}
                </button>
                <button
                  onClick={() => {
                    setShowReportModal(false);
                    setShowRequestHistory(false);
                    setReqMessage("");
                    setAudioBlob(null);
                    setAudioUrl("");
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm text-gray-500 hover:bg-gray-50 transition border border-gray-100"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {showRequestHistory ? (
                <MyRequests guardId={guardId} />
              ) : (
                <form onSubmit={submitRequest} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-2 block uppercase tracking-wide">Select Date</label>
                    <input
                      type="date"
                      value={issueDate}
                      onChange={e => setIssueDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-2 block uppercase tracking-wide">{t("describe_problem")}</label>
                    <textarea
                      rows="4"
                      placeholder="e.g. GPS failed during checkout at 6 PM..."
                      value={reqMessage}
                      onChange={e => setReqMessage(e.target.value)}
                      className="w-full border border-gray-200 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                    />
                  </div>

                  <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-2xl p-5 text-center space-y-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{t("or_record_voice")}</p>
                    <button
                      type="button"
                      onClick={recording ? stopRecording : startRecording}
                      className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center text-3xl shadow-lg transition-all ${recording ? "bg-red-500 animate-pulse scale-110" : "bg-blue-600 hover:bg-blue-700 hover:scale-105"}`}
                    >
                      {recording ? "⏹️" : "🎙️"}
                    </button>
                    <p className="text-xs text-gray-400">{recording ? t("recording") : t("tap_to_record")}</p>
                    {audioUrl && (
                      <div className="flex flex-col items-center gap-2">
                        <audio src={audioUrl} controls className="w-full max-w-sm" />
                        <button type="button" onClick={() => { setAudioBlob(null); setAudioUrl(""); }} className="text-xs text-red-500 hover:underline">{t("remove_recording")}</button>
                      </div>
                    )}
                  </div>

                  <button type="submit" disabled={submitting}
                    className="w-full h-13 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition shadow-md shadow-blue-100">
                    {submitting ? t("submitting") : "📤  " + t("submit_request")}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default GuardDuty;
