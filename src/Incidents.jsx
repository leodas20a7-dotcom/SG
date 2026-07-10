import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import { addToQueue, getCached, setCached } from "./lib/offlineDb";
import LoadingOverlay from "./LoadingOverlay";
import CustomSelect from "./CustomSelect";
import { shortId } from "./lib/shortId";

const INCIDENT_TYPES = ["Theft", "Fire", "Fight", "Suspicious Activity", "Emergency", "Visitor Issue", "Others"];
const STATUS_OPTIONS = ["Open", "Investigating", "Closed"];

// Audio Player Component for Table View
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
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };
  return (
    <div className="flex items-center">
      <audio ref={audioRef} src={src} className="hidden" />
      <button onClick={togglePlay} className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold shadow-sm transition hover:bg-purple-200">
        {playing ? "⏹ Stop" : "▶ Play Audio"}
      </button>
    </div>
  );
}

function Incidents({ role, currentGuardId, companyId: adminCompanyId }) {

  const [incidents, setIncidents] = useState([]);
  const [incidentType, setIncidentType] = useState("");
  const [description, setDescription] = useState("");
  const [companyId, setCompanyId] = useState(adminCompanyId || null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [lightboxImg, setLightboxImg] = useState(null);
  const [isLightboxLoading, setIsLightboxLoading] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (lightboxImg) {
      setIsLightboxLoading(true);
      setImageError(false);
    } else {
      setIsLightboxLoading(false);
      setImageError(false);
    }
  }, [lightboxImg]);
  
  // Media states
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);

  const { showToast, ToastContainer } = useToast();


  async function fetchIncidents() {
    try {
      if (!navigator.onLine) {
        const cached = getCached(`incidents_${role}_${currentGuardId}`);
        if (cached) setIncidents(cached);
        return;
      }
      let query = supabase
        .from("incidents")
        .select(`*, guards(name)`)
        .order("id", { ascending: false })
        .limit(1500);

      if (role === "guard" && currentGuardId) {
        query = query.eq("guard_id", currentGuardId);
      } else if (["admin", "super_admin", "supervisor"].includes(role) && adminCompanyId) {
        query = query.eq("company_id", adminCompanyId);
      } else if (role === "platform_admin") {
        // Platform admin sees all, no filter needed
      }

      const { data } = await query;
      setIncidents(data || []);
      setCached(`incidents_${role}_${currentGuardId}`, data || []);
    } catch {
      const cached = getCached(`incidents_${role}_${currentGuardId}`);
      if (cached) setIncidents(cached);
      else showToast("Could not load incidents.", "error");
    }
  }

  useEffect(() => {
    fetchIncidents();
    // Fetch company_id for the guard
    if (currentGuardId) {
      supabase.from("guards").select("company_id").eq("id", currentGuardId).single()
        .then(({ data }) => { if (data) setCompanyId(data.company_id); });
    }
  }, [currentGuardId, role]);

  function validate() {
    const errs = {};
    if (role !== "guard" || !currentGuardId) errs.general = "You must be a guard to report an incident.";
    if (!incidentType) errs.incidentType = "Select incident type";
    if (!description.trim() && !audioBlob && !imageFile) errs.description = "Provide a description, photo, or voice note";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function addIncident() {
    if (!validate()) return;
    setLoading(true);
    try {
      if (!navigator.onLine) {
        await addToQueue("incident", {
          guardId: currentGuardId,
          incidentType,
          description: description.trim() || "Reported with media",
          imageFileBlob: imageFile || null,
          audioBlob: audioBlob || null,
          timestamp: new Date().toISOString()
        });

        const cached = getCached(`incidents_${role}_${currentGuardId}`) || [];
        const localPreviewUrl = imagePreview || null;
        const localAudioUrl = audioUrl || null;
        const newIncident = {
          id: "temp_inc_" + Date.now(),
          guard_id: currentGuardId,
          incident_type: incidentType,
          description: description.trim() || "Reported with media",
          image_url: localPreviewUrl,
          audio_url: localAudioUrl,
          incident_status: "Open",
          created_at: new Date().toISOString(),
          guards: { name: "You" }
        };
        const updatedIncidents = [newIncident, ...cached];
        setIncidents(updatedIncidents);
        setCached(`incidents_${role}_${currentGuardId}`, updatedIncidents);

        showToast("Incident report saved offline! Will sync when connected.", "success");
        setIncidentType(""); setDescription("");
        setImageFile(null); setImagePreview("");
        setAudioBlob(null); setAudioUrl("");
        setLoading(false);
        return;
      }

      let finalImageUrl = null;
      let finalAudioUrl = null;

      // Upload Image
      if (imageFile) {
        const imgName = `incident_${currentGuardId}_${Date.now()}_${imageFile.name}`;
        const { error: imgErr } = await supabase.storage.from("guard-photos").upload(imgName, imageFile);
        if (!imgErr) {
          const { data } = supabase.storage.from("guard-photos").getPublicUrl(imgName);
          finalImageUrl = data.publicUrl;
        }
      }

      // Upload Audio
      if (audioBlob) {
        const audName = `incident_voice_${currentGuardId}_${Date.now()}.webm`;
        const { error: audErr } = await supabase.storage.from("voice-requests").upload(audName, audioBlob, { contentType: "audio/webm" });
        if (!audErr) {
          const { data } = supabase.storage.from("voice-requests").getPublicUrl(audName);
          finalAudioUrl = data.publicUrl;
        }
      }

      let finalCompanyId = companyId;
      if (!finalCompanyId && currentGuardId) {
        const { data: g } = await supabase.from("guards").select("company_id").eq("id", currentGuardId).single();
        finalCompanyId = g?.company_id;
      }

      const { error } = await supabase.from("incidents").insert([
        {
          guard_id: currentGuardId,
          company_id: finalCompanyId,
          incident_type: incidentType,
          description: description.trim() || "Reported with media",
          image_url: finalImageUrl,
          audio_url: finalAudioUrl,
          incident_status: "Open",
        },
      ]);

      if (error) {
        console.error("Incident insert error:", JSON.stringify(error, null, 2));
        showToast(`Error reporting incident: ${error.message || error.code}`, "error");
        return;
      }

      // Generate notification for Admins
      const { error: notifErr } = await supabase.from("notifications").insert([{
        user_role: "super_admin",
        company_id: finalCompanyId,
        guard_id: currentGuardId,
        title: `🚨 New Incident: ${incidentType}`,
        message: description.trim() || "Reported with media",
        type: "error",
        is_read: false
      }]);
      if (notifErr) console.error("Notification insert error:", notifErr);

      showToast("Incident reported successfully!", "success");
      setIncidentType(""); setDescription("");
      setImageFile(null); setImagePreview("");
      setAudioBlob(null); setAudioUrl("");
      fetchIncidents();
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function enhanceDescriptionWithAI() {
    if (!description.trim()) {
      showToast("Please type some rough notes first to enhance.", "error");
      return;
    }
    setIsEnhancing(true);
    try {
      const response = await fetch("/api/sambanova/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${import.meta.env.VITE_SAMBANOVA_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "DeepSeek-V3.1",
          messages: [
            { role: "system", content: "You are a professional security incident report assistant. Check the grammar of the provided notes and rewrite them into a single, short, formal one-line statement. Only output the enhanced text without any formatting, markdown, or greetings." },
            { role: "user", content: `Rough notes: ${description}` }
          ],
          temperature: 0.1,
          top_p: 0.1
        })
      });
      if (!response.ok) throw new Error("API Request Failed");
      const data = await response.json();
      const enhancedText = data.choices[0].message.content;
      setDescription(enhancedText);
      showToast("Description enhanced by AI!", "success");
    } catch (err) {
      console.error("AI Enhance Error:", err);
      showToast("Failed to enhance: " + err.message, "error");
    } finally {
      setIsEnhancing(false);
    }
  }

  function downloadPdf(incident) {
    const guardName = incident.guards?.name || "Unknown Guard";
    const dateStr = new Date(incident.created_at).toLocaleString('en-AU', { dateStyle: 'full', timeStyle: 'short' });
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Incident Report - ${shortId(incident.id)}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
            body { 
              font-family: 'Inter', sans-serif; 
              padding: 40px; 
              color: #1f2937; 
              line-height: 1.6; 
              background-color: #fff;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 3px solid #2563eb;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .header-logo {
              font-size: 28px;
              font-weight: 700;
              color: #1e3a8a;
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .header-title {
              text-align: right;
            }
            .header-title h1 {
              margin: 0;
              font-size: 24px;
              color: #dc2626;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .header-title p {
              margin: 5px 0 0;
              font-size: 12px;
              color: #6b7280;
            }
            .grid-meta {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px;
              background: #f8fafc;
              padding: 20px;
              border-radius: 8px;
              border: 1px solid #e2e8f0;
              margin-bottom: 30px;
            }
            .meta-item {
              display: flex;
              flex-direction: column;
            }
            .meta-label {
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #64748b;
              font-weight: 600;
              margin-bottom: 4px;
            }
            .meta-value {
              font-size: 15px;
              font-weight: 600;
              color: #0f172a;
            }
            .section {
              margin-bottom: 30px;
            }
            .section-title {
              font-size: 18px;
              font-weight: 700;
              color: #1e293b;
              border-bottom: 2px solid #e2e8f0;
              padding-bottom: 8px;
              margin-bottom: 15px;
            }
            .content-box {
              background: #fff;
              padding: 20px;
              border-radius: 8px;
              border: 1px solid #cbd5e1;
              box-shadow: 0 1px 3px rgba(0,0,0,0.05);
              font-size: 15px;
              white-space: pre-wrap;
              color: #334155;
            }
            .evidence-img {
              max-width: 100%;
              max-height: 400px;
              border-radius: 8px;
              border: 2px solid #e2e8f0;
              display: block;
              margin: 0 auto;
            }
            .footer {
              margin-top: 50px;
              border-top: 1px solid #cbd5e1;
              padding-top: 20px;
              display: flex;
              justify-content: space-between;
              font-size: 12px;
              color: #94a3b8;
            }
            @media print {
              body { padding: 0; }
              .content-box { box-shadow: none; border: 1px solid #94a3b8; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-logo">
              🛡️ Security Command
            </div>
            <div class="header-title">
              <h1>Incident Report</h1>
              <p>CONFIDENTIAL DOCUMENT</p>
            </div>
          </div>

          <div class="grid-meta">
            <div class="meta-item">
              <span class="meta-label">Incident ID</span>
              <span class="meta-value">${shortId(incident.id)}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Date & Time</span>
              <span class="meta-value">${dateStr}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Reporting Officer</span>
              <span class="meta-value">${guardName}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Incident Classification</span>
              <span class="meta-value" style="color: #dc2626;">${incident.incident_type}</span>
            </div>
            <div class="meta-item" style="grid-column: span 2;">
              <span class="meta-label">Current Status</span>
              <span class="meta-value">${incident.incident_status}</span>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Official Statement / Details</div>
            <div class="content-box">${incident.description || "No official statement provided."}</div>
          </div>

          ${incident.image_url ? `
          <div class="section">
            <div class="section-title">Photographic Evidence</div>
            <div style="margin-top: 15px;">
              <img src="${incident.image_url}" alt="Incident Evidence" class="evidence-img" />
            </div>
          </div>` : ''}

          <div class="footer">
            <span>Generated by SG Platform</span>
            <span>Page 1 of 1</span>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }

  async function updateStatus(id, newStatus) {
    try {
      const { error } = await supabase.from("incidents").update({ incident_status: newStatus }).eq("id", id);
      if (error) throw error;
      showToast("Status updated!", "success");
      fetchIncidents();
    } catch {
      showToast("Failed to update status", "error");
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      const chunks = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = () => { 
        const blob = new Blob(chunks, { type: "audio/webm" }); 
        setAudioBlob(blob); setAudioUrl(URL.createObjectURL(blob)); 
      };
      rec.start(); setRecording(true);
    } catch { showToast("Microphone access denied.", "error"); }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      setRecording(false);
    }
  }

  function handleImageChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }



  function clearError(field) {
    setErrors((prev) => ({ ...prev, [field]: "" }));
  }

  return (
    <>
      <ToastContainer />
      {loading && <LoadingOverlay message="Submitting incident report..." />}
      <div className="mt-2">

        {/* GUARD REPORTING FORM */}
        {role === "guard" && !showHistory && (
          <div className="glass-card rounded-2xl p-5 md:p-8 mb-8 ring-1 ring-slate-200 shadow-sm bg-white md:bg-white/80">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-base font-bold text-slate-800 tracking-tight">Report New Incident</h2>
              <button 
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition"
              >
                🕒 History
              </button>
            </div>
            {errors.general && <p className="text-red-500 mb-4 bg-red-50 p-3 rounded-lg text-sm">{errors.general}</p>}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-655 uppercase tracking-wider mb-2">Incident Type</label>
                <CustomSelect
                  value={incidentType}
                  onChange={val => { setIncidentType(val); clearError("incidentType"); }}
                  options={[
                    { value: "", label: "Select Incident Type" },
                    ...INCIDENT_TYPES.map(t => ({ value: t, label: t }))
                  ]}
                  placeholder="Select Incident Type"
                  error={!!errors.incidentType}
                  heightClass="h-11"
                />
                {errors.incidentType && <p className="text-red-500 text-xs mt-1.5 font-semibold">⚠️ {errors.incidentType}</p>}
              </div>

              <div className="md:col-span-2">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-[11px] font-bold text-slate-655 uppercase tracking-wider mb-2">Description</label>
                  <button 
                    type="button" 
                    onClick={enhanceDescriptionWithAI} 
                    disabled={isEnhancing}
                    className="text-[10px] px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-full shadow-sm font-semibold transition disabled:opacity-50 flex items-center gap-1.5 active:scale-95"
                  >
                    <span>✨</span> {isEnhancing ? "Enhancing..." : "AI Enhance"}
                  </button>
                </div>
                <textarea
                  placeholder="Describe the incident in detail... (Optional if media is provided)"
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); clearError("description"); }}
                  className={`w-full border px-3 py-2 rounded-xl focus:outline-none focus:ring-4 transition text-xs bg-[#F4F6F9] hover:bg-slate-100/60 focus:bg-white ${
                    errors.description 
                      ? "border-red-400 focus:ring-red-500/10 focus:border-red-500" 
                      : "border-slate-200 focus:ring-blue-500/10 focus:border-blue-500"
                  }`}
                  rows="4"
                />
                {errors.description && <p className="text-red-500 text-xs mt-1.5 font-semibold">⚠️ {errors.description}</p>}
              </div>
            </div>

              {/* Media Uploads */}
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                {/* Image Upload */}
                <div className="bg-slate-50/50 border border-slate-150 rounded-2xl p-4">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">📸 Attach Photo</label>
                  <input type="file" accept="image/*" onChange={handleImageChange} className="text-xs w-full file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                  {imagePreview && <img src={imagePreview} alt="Preview" className="mt-3 w-full max-h-32 object-cover rounded-xl border border-gray-200" />}
                </div>

                {/* Voice Upload */}
                <div className="bg-slate-50/50 border border-slate-150 rounded-2xl p-4 text-center">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">🎙️ Record Voice Note</label>
                  <button
                    type="button"
                    onClick={recording ? stopRecording : startRecording}
                    className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center text-xl shadow-lg transition-all ${recording ? "bg-red-500 animate-pulse scale-110" : "bg-blue-600 hover:bg-blue-700 hover:scale-105 shadow-blue-150"}`}
                  >
                    {recording ? "⏹️" : "🎙️"}
                  </button>
                  <p className="text-[10px] text-gray-500 mt-2">{recording ? "Recording… tap to stop" : "Tap mic to record"}</p>
                  {audioUrl && (
                    <div className="mt-3 flex flex-col items-center gap-2">
                      <audio src={audioUrl} controls className="w-full h-8" />
                      <button type="button" onClick={() => { setAudioBlob(null); setAudioUrl(""); }} className="text-xs text-red-500 hover:underline">Remove audio</button>
                    </div>
                  )}
                </div>
              </div>

            <button
              onClick={addIncident}
              disabled={loading}
              className={`mt-8 w-full md:w-auto px-6 py-3 rounded-xl text-white font-bold text-sm transition shadow-md ${
                loading ? "bg-slate-300 cursor-not-allowed shadow-none" : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200"
              }`}
            >
              {loading ? "Reporting..." : "Report Incident"}
            </button>
          </div>
        )}

        {/* INCIDENT CARDS */}
        {(role !== "guard" || showHistory) && (
          <div>
            {role === "guard" && showHistory && (
              <div className="flex items-center gap-4 mb-5">
                <button
                  onClick={() => setShowHistory(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition shrink-0"
                >
                  ←
                </button>
                <div>
                  <h2 className="font-bold text-gray-800 text-base">Past Incidents</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Your reported incident history</p>
                </div>
              </div>
            )}

            {incidents.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">
                <div className="text-4xl mb-3">🗂️</div>
                <p className="font-medium text-gray-500">No incidents reported yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {incidents.map((incident) => {
                  const typeColor = {
                    "Fire": "bg-red-100 text-red-700",
                    "Theft": "bg-orange-100 text-orange-700",
                    "Fight": "bg-pink-100 text-pink-700",
                    "Suspicious Activity": "bg-yellow-100 text-yellow-700",
                    "Emergency": "bg-rose-100 text-rose-700",
                    "Visitor Issue": "bg-indigo-100 text-indigo-700",
                  }[incident.incident_type] || "bg-gray-100 text-gray-700";

                  const statusColor = {
                    "Open": "bg-amber-100 text-amber-700",
                    "Investigating": "bg-blue-100 text-blue-700",
                    "Closed": "bg-emerald-100 text-emerald-700",
                  }[incident.incident_status] || "bg-gray-100 text-gray-600";

                  return (
                    <div key={incident.id} className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow p-4 md:p-5 border border-gray-100">
                      {/* Top row: guard name + type chip + status chip + date */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        {role !== "guard" && (
                          <span className="font-semibold text-gray-800 text-sm">👮 {incident.guards?.name || "Unknown"}</span>
                        )}
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${typeColor}`}>
                          {incident.incident_type}
                        </span>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusColor}`}>
                          {incident.incident_status}
                        </span>
                        <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">
                          🕐 {new Date(incident.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-gray-300 ml-1">{shortId(incident.id)}</span>
                      </div>

                      {/* Description */}
                      {incident.description && (
                        <p className="text-sm text-gray-700 leading-relaxed mb-3">{incident.description}</p>
                      )}

                      {/* Media & Actions row */}
                      <div className="flex flex-wrap items-center gap-2 justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          {incident.audio_url && <AudioPlayer src={incident.audio_url} />}
                          {incident.image_url && (
                            <button
                              onClick={() => setLightboxImg(incident.image_url)}
                              className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold hover:bg-blue-100 transition inline-flex items-center gap-1"
                            >
                              🖼️ View Photo
                            </button>
                          )}
                        </div>

                        {role !== "guard" && (
                          <div className="flex items-center gap-2 ml-auto">
                            <CustomSelect
                              value={incident.incident_status}
                              onChange={val => updateStatus(incident.id, val)}
                              options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))}
                              placeholder="Select Status"
                              heightClass="h-8"
                              className="w-32"
                            />
                            <button
                              onClick={() => downloadPdf(incident)}
                              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition flex items-center gap-1"
                              title="Download PDF Report"
                            >
                              📄 PDF
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Image Lightbox Overlay */}
      {lightboxImg && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ background: "rgba(0,0,0,0.80)" }}
          onClick={() => setLightboxImg(null)}
        >
          <div
            className={`relative w-full flex flex-col items-center justify-center transition-all duration-300 ${imageError || isLightboxLoading ? "max-w-md" : "max-w-3xl"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightboxImg(null)}
              className="absolute -top-10 right-0 text-white text-3xl font-bold hover:text-gray-355 hover:scale-105 transition"
            >
              ✕
            </button>
            
            {isLightboxLoading && (
              <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl p-8 flex flex-col items-center justify-center shadow-2xl border border-gray-150/50 dark:border-slate-800/50 max-w-md w-full text-center">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-gray-800 dark:text-gray-200 font-bold text-sm tracking-wide">✨ Downloading incident photo...</p>
                <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">This might take a moment depending on connection speed.</p>
              </div>
            )}

            {imageError && (
              <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl p-8 flex flex-col items-center justify-center shadow-2xl border border-gray-150/50 dark:border-slate-800/50 max-w-md w-full text-center">
                <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4 text-2xl">⚠️</div>
                <p className="text-gray-800 dark:text-gray-200 font-bold text-sm tracking-wide">Photo Not Found</p>
                <p className="text-gray-555 dark:text-gray-400 text-xs mt-2 leading-relaxed">
                  The evidence image for this incident could not be loaded from Supabase storage. 
                  It may not have been fully uploaded during the database migration or was archived.
                </p>
              </div>
            )}

            <img
              src={lightboxImg}
              alt="Incident Evidence"
              onLoad={() => setIsLightboxLoading(false)}
              onError={() => { setIsLightboxLoading(false); setImageError(true); }}
              className={`w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl transition-all duration-300 ${isLightboxLoading || imageError ? "opacity-0 h-0 scale-95" : "opacity-100 scale-100"}`}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default Incidents;
