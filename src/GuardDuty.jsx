import { useEffect, useState, useRef } from "react";
import { supabase } from "./lib/supabase";
import Camera from "./Camera";
import { calcDistance, getLocation, uploadPhoto, calculateAttendanceStatus } from "./lib/geoUtils";
import Notifications from "./Notifications";
import Incidents from "./Incidents";
import { addToQueue, getQueue, removeFromQueue, setCached, getCached } from "./lib/offlineDb";
import { useToast } from "./Toast";
import { useLanguage } from "./LanguageContext";
import LoadingOverlay from "./LoadingOverlay";

/* ─── helpers ─────────────────────────────────────── */
function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
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
  { key: "duty", label: "Duty Control", icon: "📍", desc: "Check In / Out" },
  { key: "history", label: "Attendance", icon: "📋", desc: "Your History" },
  { key: "incidents", label: "Incidents", icon: "🚨", desc: "Report Incidents" },
  { key: "circulars", label: "Circulars", icon: "📢", desc: "Announcements" },
];/* ─── Circular feed (read-only) ─── */
function CircularFeed({ guardId, guardName }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!navigator.onLine) {
      const cached = getCached("circulars");
      if (cached) setItems(cached);
      return;
    }
    let query = supabase.from("circulars").select("*").order("created_at", { ascending: false });
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
        <div className="flex flex-col items-center py-16 text-gray-300">
          <span className="text-5xl mb-3">📢</span>
          <p className="font-medium text-gray-400">No announcements yet</p>
        </div>
      ) : (
        items.map(c => (
          <div key={c.id} className="bg-white rounded-2xl p-5 shadow-sm border border-blue-50 hover:shadow-md transition">
            <div className="flex justify-between items-start mb-2">
              <p className="font-bold text-gray-800">📌 {c.title}</p>
              <span className="text-xs text-gray-400 whitespace-nowrap ml-3 bg-gray-50 px-2 py-1 rounded-lg">
                {new Date(c.created_at).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>
            <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{c.content}</p>
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
function GuardDuty({ guardId, guardName }) {
  const appLogo = "/logo.png";
  const { t, locale, setLocale } = useLanguage();
  const [activeTab, setActiveTab] = useState("duty");
  const [showRequestHistory, setShowRequestHistory] = useState(false);
  const [dutyLocation, setDutyLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sendingSos, setSendingSos] = useState(false);
  const [showSosConfirm, setShowSosConfirm] = useState(false);
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

      // Insert notification for Admin
      const { error: insErr } = await supabase.from("notifications").insert([{
        user_role: "admin",
        guard_id: guardId,
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
            const tempShift = (guardShifts || []).find(s => s.shift_date === checkInDate);
            const constantShift = (guardShifts || []).find(s => s.shift_date === null);
            const activeShiftObj = tempShift || constantShift || null;

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
              guard_id: guardId,
              request_type: requestType,
              message: message,
              audio_url: audioUploadUrl,
              status: "Pending",
              created_at: timestamp
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
          setIsOnTempDuty(cached.isOnTempDuty);
          setPrimaryLocation(cached.primaryLocation);
          setActiveShift(cached.activeShift || null);
        }
        return;
      }

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

      let finalLoc = primary;
      let finalIsTemp = false;

      if (hasTemp) {
        // Use temp location for GPS checks and attendance
        finalLoc = data.temp_duty_location;
        finalIsTemp = true;
      }
      setDutyLocation(finalLoc);
      setIsOnTempDuty(finalIsTemp);

      // Query active shift
      const { data: shiftsData } = await supabase
        .from("shifts")
        .select("*")
        .eq("guard_id", guardId);

      const tempShift = (shiftsData || []).find(s => s.shift_date === today);
      const constantShift = (shiftsData || []).find(s => s.shift_date === null);
      const shift = tempShift || constantShift || null;
      setActiveShift(shift);

      setCached(`assigned_location_${guardId}`, {
        dutyLocation: finalLoc,
        isOnTempDuty: finalIsTemp,
        primaryLocation: primary,
        activeShift: shift
      });
    } catch {
      const cached = getCached(`assigned_location_${guardId}`);
      if (cached) {
        setDutyLocation(cached.dutyLocation);
        setIsOnTempDuty(cached.isOnTempDuty);
        setPrimaryLocation(cached.primaryLocation);
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
      const { data } = await supabase.from("attendance").select("*, duty_locations(place_name)").eq("guard_id", guardId).order("check_in_time", { ascending: false });
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
      // 1. First, search for any active check-in (where check_out_time is null)
      let { data } = await supabase
        .from("attendance")
        .select("*, duty_locations(place_name)")
        .eq("guard_id", guardId)
        .is("check_out_time", null)
        .order("check_in_time", { ascending: false })
        .limit(1);

      // 2. If no active check-in, search for the latest check-in that was started today
      if (!data || data.length === 0) {
        const today = new Date().toISOString().split("T")[0];
        const { data: todayRecords } = await supabase
          .from("attendance")
          .select("*, duty_locations(place_name)")
          .eq("guard_id", guardId)
          .gte("check_in_time", today)
          .lte("check_in_time", today + "T23:59:59")
          .order("check_in_time", { ascending: false })
          .limit(1);
        data = todayRecords;
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
      const isWithinRange = dist <= dutyLocation.radius_meters || (loc.accuracy && dist <= loc.accuracy);
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
    setShowCamera(false);
    if (!dataUrl) { setError("Camera not available. Grant camera permission and try again."); setLoading(false); return; }
    setLoading(true);
    try {
      if (!navigator.onLine) {
        const tempId = "temp_" + Date.now();
        const now = new Date().toISOString();
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

        setStatus("💾 Check-in saved offline! Will sync when connected.", "success");
        setTimeout(() => setGpsStatus(null), 3000);
        setLoading(false);
        return;
      }

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
      await fetchTodayStatus();
      await fetchAttendanceHistory();
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
        const isWithinRange = dist <= dutyLocation.radius_meters || (pos.accuracy && dist <= pos.accuracy);
        if (!isWithinRange) { setStatus(`⚠️ You are ${dist}m away (accuracy +/-${Math.round(pos.accuracy || 0)}m). Move within ${dutyLocation.radius_meters}m of ${dutyLocation.place_name}.`, "warn"); setLoading(false); return; }
      }
      setStatus("✅ Location ok! Capture selfie to check out.", "success");
      setLoading(false);
      setCameraMode("checkout"); setShowCamera(true);
    } catch (err) { setError(err.message); setLoading(false); }
  }

  async function onCheckoutCapture(dataUrl) {
    setShowCamera(false);
    if (!dataUrl) { setError("Camera not available. Grant camera permission and try again."); setLoading(false); return; }
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const calculatedStatus = calculateAttendanceStatus(todayRecord?.check_in_time, now, activeShift);

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
      const { error: err } = await supabase.from("attendance").update({
        check_out_time: now,
        check_out_photo: photoUrl,
        check_out_lat: pos.lat,
        check_out_long: pos.lng,
        status: calculatedStatus
      }).eq("id", currentAttendanceId);
      if (err) { setError("Error checking out."); setLoading(false); return; }
      stopLiveTracking();
      setIsOnDuty(false); setCurrentAttendanceId(null); setOnDutySince(null);
      setStatus("✅ Checked out! Stay safe.", "success");
      await fetchTodayStatus();
      await fetchAttendanceHistory();
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
              <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">{t("status")}</p>
              <p className="text-white font-bold text-xl">{isOnDuty ? "🟢 " + t("on_active_duty") : todayRecord ? "✅ " + t("duty_complete") : "⏸️ " + t("off_duty")}</p>
            </div>
            {isOnDuty && elapsedTime && (
              <div className="text-right">
                <p className="text-white/60 text-xs mb-1">{t("time_on_duty")}</p>
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
                <p className="text-xs text-gray-500 mt-0.5">{t("allowed_radius")}: {dutyLocation.radius_meters}m</p>
                {isOnTempDuty && primaryLocation && (
                  <p className="text-xs text-amber-600 mt-1">Primary: {primaryLocation.place_name} (resumes after temp period)</p>
                )}
                {isOnDuty && gpsDistance !== null && (
                  <div className={`flex items-center gap-1.5 mt-1.5 text-xs font-semibold ${gpsDistance > dutyLocation.radius_meters ? "text-red-600" : "text-emerald-600"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${gpsDistance > dutyLocation.radius_meters ? "bg-red-500" : "bg-emerald-500"}`} />
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
            onClick={isOnDuty ? handleCheckOut : handleCheckIn}
            disabled={loading || (!dutyLocation && !isOnDuty) || (todayRecord && todayRecord.check_out_time)}
            className={`w-full h-14 rounded-2xl text-white font-bold text-base transition-all shadow-md active:scale-[0.98] ${loading ? "bg-gray-300 cursor-not-allowed" :
              isOnDuty ? "bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shadow-orange-200" :
                (todayRecord && todayRecord.check_out_time) ? "bg-gray-400 cursor-not-allowed" :
                "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-emerald-200"
              }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t("submitting")}
              </span>
            ) : isOnDuty ? "📸  " + t("end_duty") : (todayRecord && todayRecord.check_out_time) ? "✅  " + t("duty_complete") : "📍  " + t("start_duty")}
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
                <p className="text-sm font-bold text-gray-800">{t("live_tracking_active")}</p>
              </div>
              <p className="text-xs text-gray-400">{t("auto_pings")}</p>
            </div>
          </div>
          <button onClick={forceLocationPush} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4 py-2 rounded-xl font-semibold transition shadow-sm">
            {t("ping_now")}
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{t("guard_details")}</p>
        <div className="grid grid-cols-2 gap-4 text-sm">
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
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-50 flex justify-between items-center">
        <div>
          <h2 className="font-bold text-gray-800 text-lg">{t("attendance_history")}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{attendanceHistory.length} {t("records_found")}</p>
        </div>
        <button
          onClick={() => {
            setIssueDate(new Date().toISOString().split("T")[0]);
            setShowReportModal(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition"
        >
          💬 {t("report_issue")}
        </button>
      </div>
      <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
        {attendanceHistory.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-300">
            <span className="text-5xl mb-3">📋</span>
            <p className="font-medium text-gray-400">{t("no_attendance")}</p>
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
      </div>
    </div>
  );

  const content = {
    duty: dutyPanel,
    history: historyPanel,
    incidents: <Incidents role="guard" guardId={guardId} />,
    circulars: (
      <div className="space-y-4">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-bold text-gray-800 text-lg">{t("official_announcements")}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{t("circulars_desc")}</p>
        </div>
        <CircularFeed guardId={guardId} guardName={guardName} />
      </div>
    ),
  };

  /* ══ RENDER ══════════════════════════════════════════════ */
  return (
    <>
      <ToastContainer />
      {loading && <LoadingOverlay message={gpsStatus || "Processing your request..."} />}
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

      {/* ╔════════════════════════════════╗
          ║  MOBILE LAYOUT (< md)          ║
          ╚════════════════════════════════╝ */}
      <div className="md:hidden flex flex-col min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        {/* Mobile sticky header */}
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-white/60 shadow-sm safe-top">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center bg-white shadow-sm shrink-0">
                <img src={appLogo} alt="SecureSys Logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="font-bold text-gray-800 text-sm">{guardName || "Guard"}</p>
                {isOnDuty && elapsedTime && (
                  <p className="text-xs font-mono text-emerald-600 font-bold">{elapsedTime}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* 🌐 Language Selector */}
              <LanguageDropdown locale={locale} setLocale={setLocale} isMobile={true} />
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
              <Notifications role="guard" guardId={guardId} guardName={guardName} onNavigate={setActiveTab} />
              <button
                onClick={handleLogout}
                className="w-8 h-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center text-sm shadow-sm hover:bg-red-100 transition shrink-0"
                title={t("logout")}
              >
                🚪
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
      <div className="hidden md:flex min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">

        {/* Desktop LEFT SIDEBAR */}
        <aside className="w-72 shrink-0 flex flex-col bg-white border-r border-gray-100 shadow-sm">
          {/* Brand / guard identity */}
          <div className="px-6 py-8 text-center border-b border-gray-50">
            <div className="w-20 h-20 mx-auto mb-4 relative flex items-center justify-center">
              <img src={appLogo} alt="SecureSys Logo" className="w-full h-full object-cover rounded-3xl shadow-xl" />
              <button 
                onClick={() => setShowProfile(true)}
                className="absolute -bottom-1 -right-1 w-8 h-8 bg-white text-blue-600 rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition border border-gray-100 z-10 font-bold"
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
                  <p className="font-semibold text-sm">{t(tab.key)}</p>
                  <p className={`text-xs ${activeTab === tab.key ? "text-blue-200" : "text-gray-400"}`}>{t(tab.key + "_desc")}</p>
                </div>
              </button>
            ))}
          </nav>

        </aside>

        {/* Desktop MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Desktop top bar */}
          <header className="bg-white border-b border-gray-100 shadow-sm px-8 py-4 flex items-center justify-between shrink-0 relative z-50">
            <div>
              <h2 className="font-bold text-gray-800 text-xl">
                {TABS.find(tab => tab.key === activeTab)?.icon} {t(activeTab)}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">{t(activeTab + "_desc")}</p>
            </div>
            <div className="flex items-center gap-3">
              {isOnDuty && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-emerald-700 font-mono font-bold text-sm">{elapsedTime}</span>
                  <span className="text-emerald-600 text-xs">{t("on_active_duty")}</span>
                </div>
              )}
              <Notifications role="guard" guardId={guardId} guardName={guardName} onNavigate={setActiveTab} />
              <div className="text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-xl hidden lg:block">
                {new Date().toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
              </div>
              {/* 🌐 Language Selector */}
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
