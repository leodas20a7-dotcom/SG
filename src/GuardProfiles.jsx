import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

function GuardProfiles({ companyId }) {
  const [guards, setGuards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGuard, setSelectedGuard] = useState(null);
  const [activePreviewDoc, setActivePreviewDoc] = useState(null);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");

  async function handleFileUpload(e, guardId, column) {
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

      setGuards(prev => prev.map(g => g.id === guardId ? { ...g, [column]: publicUrl } : g));
      setSelectedGuard(prev => ({ ...prev, [column]: publicUrl }));
    } catch (err) {
      setError("Upload failed: " + err.message);
    }
    setUploading("");
  }

  async function fetchGuards() {
    setLoading(true);
    try {
      let q = supabase.from("guards").select("*").order("name");
      if (companyId) q = q.eq("company_id", companyId);
      const { data } = await q;
      setGuards(data || []);
    } catch {
      // ignore
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchGuards();
  }, []);

  const total = guards.length;
  const fullyVerified = guards.filter(g => g.doc_security_licence).length;
  const pending = total - fullyVerified;

  return (
    <div className="mt-2">

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="glass-card !mb-0 p-5 flex items-center gap-4 border border-slate-100">
          <div className="w-11 h-11 rounded-xl bg-blue-50/60 text-blue-600 flex items-center justify-center text-lg border border-blue-100/50 shadow-sm">👥</div>
          <div>
            <p className="text-slate-450 text-[10px] font-bold uppercase tracking-wider">Total Guards</p>
            <p className="text-2xl font-extrabold text-slate-800 mt-0.5">{total}</p>
          </div>
        </div>
        <div className="glass-card !mb-0 p-5 flex items-center gap-4 border border-slate-100">
          <div className="w-11 h-11 rounded-xl bg-emerald-50/60 text-emerald-600 flex items-center justify-center text-lg border border-emerald-100/50 shadow-sm">✅</div>
          <div>
            <p className="text-slate-450 text-[10px] font-bold uppercase tracking-wider">Fully Verified</p>
            <p className="text-2xl font-extrabold text-emerald-600 mt-0.5">{fullyVerified}</p>
          </div>
        </div>
        <div className="glass-card !mb-0 p-5 flex items-center gap-4 border border-slate-100">
          <div className="w-11 h-11 rounded-xl bg-amber-50/60 text-amber-600 flex items-center justify-center text-lg border border-amber-100/50 shadow-sm">⏳</div>
          <div>
            <p className="text-slate-450 text-[10px] font-bold uppercase tracking-wider">Pending Docs</p>
            <p className="text-2xl font-extrabold text-amber-600 mt-0.5">{pending}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-gray-50/30">
          <h2 className="font-bold text-gray-805 text-base">Staff Directory</h2>
          <button onClick={fetchGuards} className="text-xs text-blue-600 font-bold hover:underline">Refresh</button>
        </div>
        
        {loading ? (
          <div className="p-10 text-center text-gray-400">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-white border-b border-gray-100">
                  <th className="p-4 text-[10px] font-bold text-slate-450 uppercase tracking-wider">Guard</th>
                  <th className="p-4 text-[10px] font-bold text-slate-450 uppercase tracking-wider text-center">Sec. Licence</th>
                  <th className="p-4 text-[10px] font-bold text-slate-450 uppercase tracking-wider text-center">Dr. Licence</th>
                  <th className="p-4 text-[10px] font-bold text-slate-450 uppercase tracking-wider text-center">Certificates</th>
                  <th className="p-4 text-[10px] font-bold text-slate-450 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {guards.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-gray-400">No guards found</td>
                  </tr>
                ) : guards.map(g => {
                  const hasSec = !!g.doc_security_licence;
                  const isVerified = hasSec;
                  
                  return (
                    <tr 
                      key={g.id} 
                      onClick={() => setSelectedGuard(g)}
                      className="hover:bg-blue-50/50 transition cursor-pointer group"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                            {g.profile_picture ? (
                              <img src={g.profile_picture} alt={g.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-gray-450 text-base">👤</span>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-800 group-hover:text-blue-600 transition">{g.name}</p>
                            <p className="text-[11px] text-gray-450 font-mono">{g.phone || "No phone"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        {hasSec ? <span className="text-emerald-500 bg-emerald-50 w-7 h-7 rounded-full inline-flex items-center justify-center text-xs">✅</span> : <span className="text-red-400 text-[11px] font-bold">Pending</span>}
                      </td>
                      <td className="p-4 text-center">
                        {g.doc_driving_licence ? <span className="text-emerald-500 bg-emerald-50 w-7 h-7 rounded-full inline-flex items-center justify-center text-xs">✅</span> : <span className="text-gray-300 text-[11px]">—</span>}
                      </td>
                      <td className="p-4 text-center">
                        {g.doc_certificates ? <span className="text-emerald-500 bg-emerald-50 w-7 h-7 rounded-full inline-flex items-center justify-center text-xs">✅</span> : <span className="text-gray-300 text-[11px]">—</span>}
                      </td>
                      <td className="p-4">
                        <span className={`status-chip ${isVerified ? "status-chip-approved" : "status-chip-pending"}`}>
                          {isVerified ? "Verified" : "Action Req."}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Guard Details Modal */}
      {selectedGuard && (
        <div className="fixed inset-0 z-[100] bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="font-bold text-gray-800 text-lg">Guard Details</h2>
              <button onClick={() => setSelectedGuard(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm text-gray-500 hover:bg-gray-50 transition">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>}
              
              <div className="flex flex-col sm:flex-row gap-6 mb-8 items-center sm:items-start">
                <div className="w-32 h-32 rounded-full bg-gray-100 border-4 border-white shadow-lg overflow-hidden flex items-center justify-center shrink-0">
                  {selectedGuard.profile_picture ? (
                    <img src={selectedGuard.profile_picture} alt={selectedGuard.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-gray-400 text-4xl">👤</span>
                  )}
                </div>
                <div className="text-center sm:text-left mt-2">
                  <h3 className="font-bold text-2xl text-gray-800 mb-1">{selectedGuard.name}</h3>
                  <p className="text-gray-500 font-medium mb-3">Security Officer</p>
                  <div className="inline-flex gap-2">
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold font-mono border border-gray-200">
                      📞 {selectedGuard.phone || "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              <h4 className="font-bold text-gray-800 mb-4 uppercase tracking-wider text-sm border-b border-gray-100 pb-2">Uploaded Documents</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: "doc_security_licence", label: "Security Licence", req: true },
                  { key: "doc_driving_licence", label: "Driving Licence", req: false },
                  { key: "doc_certificates", label: "Certificates", req: false }
                ].map(doc => {
                  const url = selectedGuard[doc.key];
                  return (
                    <div key={doc.key} className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{doc.label}</p>
                        <p className="text-xs text-gray-500">{doc.req ? "Required" : "Optional"}</p>
                      </div>
                      {url ? (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setActivePreviewDoc({ label: doc.label, url })}
                            className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-1.5 animate-pulse-subtle"
                          >
                            <span>👁️</span> View
                          </button>
                          <label className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer ${uploading === doc.key ? "bg-gray-200 text-gray-500" : "bg-gray-100 hover:bg-gray-200 text-gray-700"}`}>
                            {uploading === doc.key ? "..." : "Replace"}
                            <input type="file" className="hidden" accept=".pdf,image/*" disabled={uploading === doc.key} onChange={(e) => handleFileUpload(e, selectedGuard.id, doc.key)} />
                          </label>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1.5 bg-gray-200 text-gray-400 rounded-lg text-xs font-bold">Missing</span>
                          <label className={`px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer ${uploading === doc.key ? "bg-gray-200 text-gray-500" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>
                            {uploading === doc.key ? "Uploading..." : "Upload"}
                            <input type="file" className="hidden" accept=".pdf,image/*" disabled={uploading === doc.key} onChange={(e) => handleFileUpload(e, selectedGuard.id, doc.key)} />
                          </label>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

            </div>
          </div>
        </div>
      )}
      {/* Document Preview Overlay */}
      {activePreviewDoc && (
        <div className="fixed inset-0 z-[200] bg-gray-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                <span>📄</span> {activePreviewDoc.label}
              </h3>
              <button 
                onClick={() => setActivePreviewDoc(null)} 
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm text-gray-500 hover:bg-gray-100 transition"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex items-center justify-center bg-gray-50 flex-1 min-h-[350px]">
              {activePreviewDoc.url.toLowerCase().endsWith(".pdf") || activePreviewDoc.url.toLowerCase().includes(".pdf") ? (
                <iframe 
                  src={activePreviewDoc.url} 
                  title={activePreviewDoc.label}
                  className="w-full h-[60vh] border border-gray-200 rounded-2xl bg-white shadow-sm"
                />
              ) : (
                <img 
                  src={activePreviewDoc.url} 
                  alt={activePreviewDoc.label} 
                  className="max-w-full max-h-[60vh] object-contain rounded-2xl shadow-md border-4 border-white"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.style.display = 'none';
                    const parent = e.target.parentNode;
                    const errorContainer = document.createElement('div');
                    errorContainer.className = 'text-center p-8 text-gray-400';
                    errorContainer.innerHTML = `
                      <p class="mb-4">Unable to display this file format directly.</p>
                      <a href="${activePreviewDoc.url}" target="_blank" rel="noopener noreferrer" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition shadow-md inline-block">Open in New Tab</a>
                    `;
                    parent.appendChild(errorContainer);
                  }}
                />
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/50">
              <span className="text-xs text-gray-400 truncate max-w-[70%] font-mono">{activePreviewDoc.url}</span>
              <a 
                href={activePreviewDoc.url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5"
              >
                <span>🌐</span> Open in New Tab
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GuardProfiles;
