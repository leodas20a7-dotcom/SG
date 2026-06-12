import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

function GuardProfiles() {
  const [guards, setGuards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGuard, setSelectedGuard] = useState(null);
  const [activePreviewDoc, setActivePreviewDoc] = useState(null);

  async function fetchGuards() {
    setLoading(true);
    try {
      const { data } = await supabase.from("guards").select("*").order("name");
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
  const fullyVerified = guards.filter(g => g.doc_aadhaar && g.doc_security_licence).length;
  const pending = total - fullyVerified;

  return (
    <div className="mt-10">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">🛡️ Guard Profiles & Documents</h1>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl">👥</div>
          <div>
            <p className="text-sm text-gray-500 font-semibold">Total Guards</p>
            <p className="text-2xl font-bold text-gray-800">{total}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl">✅</div>
          <div>
            <p className="text-sm text-gray-500 font-semibold">Fully Verified</p>
            <p className="text-2xl font-bold text-emerald-600">{fullyVerified}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-amber-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xl">⏳</div>
          <div>
            <p className="text-sm text-gray-500 font-semibold">Pending Docs</p>
            <p className="text-2xl font-bold text-amber-600">{pending}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
          <h2 className="font-bold text-gray-800 text-lg">Staff Directory</h2>
          <button onClick={fetchGuards} className="text-sm text-blue-600 font-semibold hover:underline">Refresh</button>
        </div>
        
        {loading ? (
          <div className="p-10 text-center text-gray-400">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-white border-b border-gray-100">
                  <th className="p-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">Guard</th>
                  <th className="p-4 text-sm font-semibold text-gray-400 uppercase tracking-wider text-center">Aadhaar</th>
                  <th className="p-4 text-sm font-semibold text-gray-400 uppercase tracking-wider text-center">Sec. Licence</th>
                  <th className="p-4 text-sm font-semibold text-gray-400 uppercase tracking-wider text-center">Dr. Licence</th>
                  <th className="p-4 text-sm font-semibold text-gray-400 uppercase tracking-wider text-center">Certificates</th>
                  <th className="p-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {guards.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-gray-400">No guards found</td>
                  </tr>
                ) : guards.map(g => {
                  const hasAadhaar = !!g.doc_aadhaar;
                  const hasSec = !!g.doc_security_licence;
                  const isVerified = hasAadhaar && hasSec;
                  
                  return (
                    <tr 
                      key={g.id} 
                      onClick={() => setSelectedGuard(g)}
                      className="hover:bg-blue-50/50 transition cursor-pointer group"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                            {g.profile_picture ? (
                              <img src={g.profile_picture} alt={g.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-gray-400 text-lg">👤</span>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-gray-800 group-hover:text-blue-600 transition">{g.name}</p>
                            <p className="text-xs text-gray-400 font-mono">{g.phone || "No phone"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        {hasAadhaar ? <span className="text-emerald-500 bg-emerald-50 w-8 h-8 rounded-full inline-flex items-center justify-center">✅</span> : <span className="text-red-400 text-xs font-bold">Pending</span>}
                      </td>
                      <td className="p-4 text-center">
                        {hasSec ? <span className="text-emerald-500 bg-emerald-50 w-8 h-8 rounded-full inline-flex items-center justify-center">✅</span> : <span className="text-red-400 text-xs font-bold">Pending</span>}
                      </td>
                      <td className="p-4 text-center">
                        {g.doc_driving_licence ? <span className="text-emerald-500 bg-emerald-50 w-8 h-8 rounded-full inline-flex items-center justify-center">✅</span> : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="p-4 text-center">
                        {g.doc_certificates ? <span className="text-emerald-500 bg-emerald-50 w-8 h-8 rounded-full inline-flex items-center justify-center">✅</span> : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="p-4">
                        <span className={`px-3 py-1 text-xs font-bold rounded-full ${isVerified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
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
                  { key: "doc_aadhaar", label: "Aadhaar Card", req: true },
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
                        <button 
                          onClick={() => setActivePreviewDoc({ label: doc.label, url })}
                          className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-1.5 animate-pulse-subtle"
                        >
                          <span>👁️</span> View
                        </button>
                      ) : (
                        <span className="px-3 py-1.5 bg-gray-200 text-gray-400 rounded-lg text-xs font-bold">Missing</span>
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
