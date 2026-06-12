import { useEffect, useState, useRef } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";

const INCIDENT_TYPES = ["Theft", "Fire", "Fight", "Suspicious Activity", "Emergency", "Visitor Issue"];
const STATUS_OPTIONS = ["Open", "Investigating", "Closed"];

function Incidents({ role, guardId: currentGuardId }) {

  const [incidents, setIncidents] = useState([]);
  const [incidentType, setIncidentType] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  // Media states
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);

  const { showToast, ToastContainer } = useToast();

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

  async function fetchIncidents() {
    try {
      let query = supabase
        .from("incidents")
        .select(`*, guards(name)`)
        .order("id", { ascending: false });

      if (role === "guard" && currentGuardId) {
        query = query.eq("guard_id", currentGuardId);
      }

      const { data } = await query;
      setIncidents(data || []);
    } catch {
      showToast("Could not load incidents.", "error");
    }
  }

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

      const { error } = await supabase.from("incidents").insert([
        {
          guard_id: currentGuardId,
          incident_type: incidentType,
          description: description.trim() || "Reported with media",
          image_url: finalImageUrl,
          audio_url: finalAudioUrl,
          incident_status: "Open", // Always starts as Open
        },
      ]);

      if (error) {
        showToast("Error reporting incident. Please try again.", "error");
        return;
      }

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

  useEffect(() => {
    fetchIncidents();
  }, [role, currentGuardId]);

  function clearError(field) {
    setErrors((prev) => ({ ...prev, [field]: "" }));
  }

  return (
    <>
      <ToastContainer />
      <div className="mt-10">
        <h1 className="text-2xl font-bold mb-5 text-gray-800">🚨 Incident Complaints</h1>

        {/* GUARD REPORTING FORM */}
        {role === "guard" && !showHistory && (
          <div className="glass-card rounded-2xl p-6 mb-8 ring-1 ring-red-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-700">Report New Incident</h2>
              <button 
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition"
              >
                🕒 History
              </button>
            </div>
            {errors.general && <p className="text-red-500 mb-4 bg-red-50 p-3 rounded-lg text-sm">{errors.general}</p>}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Incident Type</label>
                <select
                  value={incidentType}
                  onChange={(e) => { setIncidentType(e.target.value); clearError("incidentType"); }}
                  className={`w-full h-12 border p-3 rounded-lg focus:outline-none focus:ring-2 transition bg-white ${errors.incidentType ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-red-300"}`}
                >
                  <option value="">Select Incident Type</option>
                  {INCIDENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {errors.incidentType && <p className="text-red-500 text-sm mt-1">{errors.incidentType}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm text-gray-500 mb-1">Description</label>
                <textarea
                  placeholder="Describe the incident in detail... (Optional if media is provided)"
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); clearError("description"); }}
                  className={`w-full border p-3 rounded-lg focus:outline-none focus:ring-2 transition ${errors.description ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-red-300"}`}
                  rows="3"
                />
                {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description}</p>}
              </div>

              {/* Media Uploads */}
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Image Upload */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">📸 Attach Photo</label>
                  <input type="file" accept="image/*" onChange={handleImageChange} className="text-sm w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                  {imagePreview && <img src={imagePreview} alt="Preview" className="mt-3 w-full max-h-32 object-cover rounded-lg border border-gray-200" />}
                </div>

                {/* Voice Upload */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">🎙️ Record Voice Note</label>
                  <button
                    type="button"
                    onClick={recording ? stopRecording : startRecording}
                    className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center text-2xl shadow-lg transition-all ${recording ? "bg-red-500 animate-pulse scale-110" : "bg-blue-600 hover:bg-blue-700 hover:scale-105"}`}
                  >
                    {recording ? "⏹️" : "🎙️"}
                  </button>
                  <p className="text-xs text-gray-500 mt-2">{recording ? "Recording… tap to stop" : "Tap mic to record"}</p>
                  {audioUrl && (
                    <div className="mt-3 flex flex-col items-center gap-2">
                      <audio src={audioUrl} controls className="w-full h-8" />
                      <button type="button" onClick={() => { setAudioBlob(null); setAudioUrl(""); }} className="text-xs text-red-500 hover:underline">Remove audio</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={addIncident}
              disabled={loading}
              className={`mt-5 px-6 py-3 rounded-lg text-white font-semibold transition ${
                loading ? "bg-gray-400 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {loading ? "Reporting..." : "Report Incident"}
            </button>
          </div>
        )}

        {/* TABLE */}
        {(role !== "guard" || showHistory) && (
          <div className="glass-card rounded-2xl overflow-hidden">
            {role === "guard" && showHistory && (
              <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-4 bg-gray-50/50">
                <button 
                  onClick={() => setShowHistory(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition shrink-0"
                >
                  ←
                </button>
                <div>
                  <h2 className="font-bold text-gray-800 text-lg">Past Incidents</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Your reported incident history</p>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b">
                  {role !== "guard" && <th className="text-left p-4 text-gray-600 font-semibold">Guard</th>}
                  <th className="text-left p-4 text-gray-600 font-semibold">Type</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Details</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Status</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {incidents.length === 0 ? (
                  <tr>
                    <td colSpan={role === "guard" ? 4 : 5} className="p-8 text-center text-gray-400">
                      No incidents reported yet.
                    </td>
                  </tr>
                ) : (
                  incidents.map((incident) => (
                    <tr key={incident.id} className="border-b hover:bg-gray-50 transition">
                      {role !== "guard" && <td className="p-4 font-medium">{incident.guards?.name}</td>}
                      <td className="p-4">
                        <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700">
                          {incident.incident_type}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="max-w-[250px]">
                          <p className="text-sm text-gray-800 break-words line-clamp-2" title={incident.description}>{incident.description}</p>
                          <div className="mt-2 flex items-center gap-2">
                            {incident.audio_url && <AudioPlayer src={incident.audio_url} />}
                            {incident.image_url && (
                              <a href={incident.image_url} target="_blank" rel="noopener noreferrer" className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold shadow-sm hover:bg-blue-100 transition inline-flex items-center gap-1">
                                📷 View Photo
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        {role === "guard" ? (
                          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                            incident.incident_status === "Open" ? "bg-yellow-100 text-yellow-700" :
                            incident.incident_status === "Investigating" ? "bg-blue-100 text-blue-700" :
                            "bg-green-100 text-green-700"
                          }`}>
                            {incident.incident_status}
                          </span>
                        ) : (
                          <select
                            value={incident.incident_status}
                            onChange={(e) => updateStatus(incident.id, e.target.value)}
                            className="text-sm border border-gray-200 rounded-lg p-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                          >
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="p-4 text-gray-500 text-sm">{new Date(incident.incident_date).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>
    </>
  );
}

export default Incidents;
