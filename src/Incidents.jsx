import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";

const INCIDENT_TYPES = ["Theft", "Fire", "Fight", "Suspicious Activity", "Emergency", "Visitor Issue"];
const STATUS_OPTIONS = ["Open", "Investigating", "Closed"];

function Incidents() {

  const [guards, setGuards] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [guardId, setGuardId] = useState("");
  const [incidentType, setIncidentType] = useState("");
  const [description, setDescription] = useState("");
  const [incidentStatus, setIncidentStatus] = useState("Open");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { showToast, ToastContainer } = useToast();

  async function fetchGuards() {
    try {
      const { data } = await supabase.from("guards").select("*");
      setGuards(data || []);
    } catch {
      showToast("Could not load guards list.", "error");
    }
  }

  async function fetchIncidents() {
    try {
      const { data } = await supabase
        .from("incidents")
        .select(`*, guards(name)`)
        .order("id", { ascending: false });
      setIncidents(data || []);
    } catch {
      showToast("Could not load incidents.", "error");
    }
  }

  function validate() {
    const errs = {};
    if (!guardId) errs.guardId = "Select a guard";
    if (!incidentType) errs.incidentType = "Select incident type";
    if (!description.trim()) errs.description = "Description is required";
    else if (description.trim().length < 10) errs.description = "Describe in at least 10 characters";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function addIncident() {
    if (!validate()) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("incidents").insert([
        {
          guard_id: guardId,
          incident_type: incidentType,
          description: description.trim(),
          incident_status: incidentStatus,
        },
      ]);

      if (error) {
        showToast("Error reporting incident. Please try again.", "error");
        return;
      }

      showToast("Incident reported successfully!", "success");
      setGuardId(""); setIncidentType(""); setDescription(""); setIncidentStatus("Open");
      fetchIncidents();
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchGuards();
    fetchIncidents();
  }, []);

  function clearError(field) {
    setErrors((prev) => ({ ...prev, [field]: "" }));
  }

  return (
    <>
      <ToastContainer />
      <div className="mt-10">
        <h1 className="text-2xl font-bold mb-5 text-gray-800">🚨 Incident Complaints</h1>

        {/* FORM */}
        <div className="glass-card rounded-2xl p-6 mb-8 ring-1 ring-red-200">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">🚨 Report New Incident</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Guard</label>
              <select
                value={guardId}
                onChange={(e) => { setGuardId(e.target.value); clearError("guardId"); }}
                className={`w-full h-12 border p-3 rounded-lg focus:outline-none focus:ring-2 transition bg-white ${errors.guardId ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-red-300"}`}
              >
                <option value="">Select Guard</option>
                {guards.map((guard) => (
                  <option key={guard.id} value={guard.id}>{guard.name}</option>
                ))}
              </select>
              {errors.guardId && <p className="text-red-500 text-sm mt-1">{errors.guardId}</p>}
            </div>

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
                placeholder="Describe the incident in detail..."
                value={description}
                onChange={(e) => { setDescription(e.target.value); clearError("description"); }}
                className={`w-full border p-3 rounded-lg focus:outline-none focus:ring-2 transition ${errors.description ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-red-300"}`}
                rows="4"
              />
              {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description}</p>}
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Status</label>
              <select
                value={incidentStatus}
                onChange={(e) => setIncidentStatus(e.target.value)}
                className="w-full h-12 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 bg-white"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
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

        {/* TABLE */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left p-4 text-gray-600 font-semibold">Guard</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Type</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Description</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Status</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {incidents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-400">
                      No incidents reported yet.
                    </td>
                  </tr>
                ) : (
                  incidents.map((incident) => (
                    <tr key={incident.id} className="border-b hover:bg-gray-50 transition">
                      <td className="p-4 font-medium">{incident.guards?.name}</td>
                      <td className="p-4">
                        <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700">
                          {incident.incident_type}
                        </span>
                      </td>
                      <td className="p-4 max-w-[250px] truncate">{incident.description}</td>
                      <td className="p-4">
                        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                          incident.incident_status === "Open" ? "bg-yellow-100 text-yellow-700" :
                          incident.incident_status === "Investigating" ? "bg-blue-100 text-blue-700" :
                          "bg-green-100 text-green-700"
                        }`}>
                          {incident.incident_status}
                        </span>
                      </td>
                      <td className="p-4 text-gray-500">{incident.incident_date}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

export default Incidents;
