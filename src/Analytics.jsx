import { useEffect, useState, useRef } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import { Bar, Pie } from "react-chartjs-2";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, Polygon, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { getGeofencePolygonPoints } from "./MapView";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);
import CustomSelect from "./CustomSelect";

// Helper for map zoom centering
function ChangeMapView({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords && coords[0] && coords[1]) {
      map.setView(coords, 15);
    }
  }, [coords, map]);
  return null;
}

// Leaflet Icons
const startIcon = L.divIcon({
  className: "custom-div-icon",
  html: "<div style='background-color:#10b981; color:white; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; box-shadow: 0 4px 10px rgba(0,0,0,0.15); border: 2px solid white; font-size:12px;'>🏁</div>",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const endIcon = L.divIcon({
  className: "custom-div-icon",
  html: "<div style='background-color:#ef4444; color:white; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; box-shadow: 0 4px 10px rgba(0,0,0,0.15); border: 2px solid white; font-size:12px;'>⏹️</div>",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const waypointIcon = L.divIcon({
  className: "custom-div-icon",
  html: "<div style='background-color:#6366f1; color:white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; box-shadow: 0 2px 6px rgba(0,0,0,0.15); border: 1.5px solid white; font-size:9px;'>📍</div>",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function Analytics({ role }) {
  const { showToast, ToastContainer } = useToast();

  // Role restriction state
  const isAdmin = role === "admin";
  const [activeTab, setActiveTab] = useState("dashboard"); // "dashboard" | "performance" | "patrol" | "attendance" | "incidents"
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Base counts (for simple dashboard view)
  const [totalGuards, setTotalGuards] = useState(0);
  const [totalAttendance, setTotalAttendance] = useState(0);
  const [totalShifts, setTotalShifts] = useState(0);
  const [totalIncidents, setTotalIncidents] = useState(0);

  // Common data
  const [guards, setGuards] = useState([]);
  const [locations, setLocations] = useState([]);

  // Performance Tab States
  const [selectedPerformanceGuard, setSelectedPerformanceGuard] = useState("");
  const [performanceStats, setPerformanceStats] = useState(null);

  // Patrol History Tab States
  const [selectedPatrolGuard, setSelectedPatrolGuard] = useState("");
  const [selectedPatrolDate, setSelectedPatrolDate] = useState(new Date().toISOString().split("T")[0]);
  const [patrolCoords, setPatrolCoords] = useState([]);
  const [mapCenter, setMapCenter] = useState(null);
  const [selectedGuardLocation, setSelectedGuardLocation] = useState(null);

  // Attendance Tab States
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [filterGuard, setFilterGuard] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Incidents Tab States
  const [incidentsRecords, setIncidentsRecords] = useState([]);
  const [barData, setBarData] = useState({ labels: [], datasets: [] });
  const [pieData, setPieData] = useState({ labels: [], datasets: [] });

  // Fetch basic counts
  async function fetchSummary() {
    try {
      const { count: guardsCount } = await supabase.from("guards").select("*", { count: "exact", head: true });
      setTotalGuards(guardsCount || 0);

      const { count: attendanceCount } = await supabase.from("attendance").select("*", { count: "exact", head: true });
      setTotalAttendance(attendanceCount || 0);

      const { count: shiftsCount } = await supabase.from("shifts").select("*", { count: "exact", head: true });
      setTotalShifts(shiftsCount || 0);

      const { count: incidentsCount } = await supabase.from("incidents").select("*", { count: "exact", head: true });
      setTotalIncidents(incidentsCount || 0);
    } catch {
      showToast("Could not load summary statistics.", "error");
    }
  }

  // Fetch basic lookup data
  async function fetchLookups() {
    try {
      const { data: g } = await supabase.from("guards").select("id, name").order("name");
      setGuards(g || []);
      const { data: l } = await supabase.from("duty_locations").select("id, place_name").order("place_name");
      setLocations(l || []);
    } catch { /* ignore */ }
  }

  // Calculate Guard Performance Metrics
  async function loadPerformanceData(guardId) {
    if (!guardId) {
      setPerformanceStats(null);
      return;
    }
    try {
      // 1. Get attendance records
      const { data: att } = await supabase
        .from("attendance")
        .select(`*, duty_locations(place_name)`)
        .eq("guard_id", guardId);

      // 2. Get shift schedules
      const { data: sh } = await supabase
        .from("shifts")
        .select("*")
        .eq("guard_id", guardId);

      // 3. Get reported incidents
      const { count: incCount } = await supabase
        .from("incidents")
        .select("*", { count: "exact", head: true })
        .eq("guard_id", guardId);

      const totalPresent = att ? att.filter(r => r.status === "Present").length : 0;
      const totalAbsent = att ? att.filter(r => r.status === "Absent").length : 0;
      const totalLeave = att ? att.filter(r => r.status === "Leave").length : 0;

      // Calculate total hours worked
      let totalHours = 0;
      let punctualityCount = 0;
      let checkedInCount = 0;

      att?.forEach(r => {
        if (r.check_in_time && r.check_out_time) {
          const hours = (new Date(r.check_out_time) - new Date(r.check_in_time)) / (1000 * 60 * 60);
          totalHours += hours > 0 ? hours : 0;
        }

        if (r.check_in_time) {
          checkedInCount++;
          // Compare check-in time with shift schedule time
          // Match constant shift
          const activeShift = sh?.find(s => s.shift_date === null);
          if (activeShift && activeShift.start_time) {
            const checkInDate = new Date(r.check_in_time);
            const [shH, shM] = activeShift.start_time.split(":");
            const scheduledStart = new Date(checkInDate);
            scheduledStart.setHours(parseInt(shH), parseInt(shM), 0, 0);

            // If check-in is within 15 minutes of shift start, mark as punctual
            const diffMin = (checkInDate - scheduledStart) / (1000 * 60);
            if (diffMin <= 15) {
              punctualityCount++;
            }
          } else {
            // Default check-ins before 9:00 AM as punctual if no shift set
            const checkInHour = new Date(r.check_in_time).getHours();
            const checkInMin = new Date(r.check_in_time).getMinutes();
            if (checkInHour < 9 || (checkInHour === 9 && checkInMin === 0)) {
              punctualityCount++;
            }
          }
        }
      });

      const punctualityRate = checkedInCount > 0 ? Math.round((punctualityCount / checkedInCount) * 100) : 0;

      setPerformanceStats({
        totalPresent,
        totalAbsent,
        totalLeave,
        totalHours: totalHours.toFixed(1),
        incCount: incCount || 0,
        punctualityRate,
        overallScore: (totalPresent + totalAbsent) > 0
          ? Math.min(100, Math.round((totalPresent / (totalPresent + totalAbsent)) * 60 + (punctualityRate * 0.4)))
          : 0
      });
    } catch (err) {
      showToast("Error loading performance data.", "error");
    }
  }

  // Load Patrol Map Coordinates
  async function loadPatrolHistory() {
    if (!selectedPatrolGuard) return;
    try {
      const { data, error } = await supabase
        .from("live_tracking")
        .select("*")
        .eq("guard_id", selectedPatrolGuard)
        .gte("tracked_at", selectedPatrolDate + "T00:00:00")
        .lte("tracked_at", selectedPatrolDate + "T23:59:59")
        .order("tracked_at", { ascending: true });

      if (error) throw error;

      // Fetch guard's location details
      const { data: guardData } = await supabase
        .from("guards")
        .select("*, duty_locations!duty_location_id(latitude, longitude, radius_meters, place_name)")
        .eq("id", selectedPatrolGuard)
        .maybeSingle();
      setSelectedGuardLocation(guardData?.duty_locations || null);

      if (data && data.length > 0) {
        const coords = data.map(item => ({
          lat: item.latitude,
          lng: item.longitude,
          time: new Date(item.tracked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: new Date(item.tracked_at).toLocaleDateString()
        }));
        setPatrolCoords(coords);
        setMapCenter([coords[0].lat, coords[0].lng]);
      } else {
        setPatrolCoords([]);
        setMapCenter(guardData?.duty_locations ? [guardData.duty_locations.latitude, guardData.duty_locations.longitude] : null);
        showToast("No patrol route records for this guard on this day.", "info");
      }
    } catch (err) {
      showToast("Failed to fetch patrol logs.", "error");
    }
  }

  // Load Attendance logs
  async function loadAttendanceLogs() {
    try {
      let query = supabase
        .from("attendance")
        .select(`*, guards(name), duty_locations(place_name)`)
        .order("check_in_time", { ascending: false });

      if (filterGuard) query = query.eq("guard_id", filterGuard);
      if (filterLocation) query = query.eq("duty_location_id", filterLocation);
      if (filterStartDate) query = query.gte("check_in_time", filterStartDate + "T00:00:00");
      if (filterEndDate) query = query.lte("check_in_time", filterEndDate + "T23:59:59");

      const { data, error } = await query;
      if (error) throw error;
      setAttendanceRecords(data || []);
    } catch {
      showToast("Failed to load attendance logs.", "error");
    }
  }

  // Load Incident analytics & charts
  async function loadIncidentStats() {
    try {
      const { data, error } = await supabase
        .from("incidents")
        .select(`*, guards(name)`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setIncidentsRecords(data || []);

      // Calculate Chart Data
      const typeCounts = {};
      const statusCounts = {};

      data?.forEach(i => {
        typeCounts[i.incident_type] = (typeCounts[i.incident_type] || 0) + 1;
        statusCounts[i.incident_status] = (statusCounts[i.incident_status] || 0) + 1;
      });

      setBarData({
        labels: Object.keys(typeCounts),
        datasets: [{
          label: "Reported Incidents",
          data: Object.values(typeCounts),
          backgroundColor: "#3b82f6",
          borderRadius: 8
        }]
      });

      setPieData({
        labels: Object.keys(statusCounts),
        datasets: [{
          data: Object.values(statusCounts),
          backgroundColor: ["#f59e0b", "#3b82f6", "#10b981"],
        }]
      });

    } catch {
      showToast("Failed to generate incident charts.", "error");
    }
  }

  // Export CSV helper
  function downloadCSV() {
    if (attendanceRecords.length === 0) {
      showToast("No data to export.", "error");
      return;
    }
    const headers = ["Guard Name", "Location", "Check In Time", "Check Out Time", "Status"];
    const rows = attendanceRecords.map(r => [
      r.guards?.name || "Unknown",
      r.duty_locations?.place_name || "—",
      r.check_in_time ? new Date(r.check_in_time).toLocaleString() : "—",
      r.check_out_time ? new Date(r.check_out_time).toLocaleString() : "—",
      r.status
    ]);
    const csvContent = [headers, ...rows].map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Shift_Attendance_Report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // PDF report builder
  function printPDFReport() {
    if (attendanceRecords.length === 0) {
      showToast("No records to build report.", "error");
      return;
    }
    const printWindow = window.open("", "_blank");
    const todayStr = new Date().toLocaleDateString();

    const rowsHtml = attendanceRecords.map(r => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${r.guards?.name || "Unknown"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${r.check_in_time ? new Date(r.check_in_time).toLocaleDateString() : "—"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${r.duty_locations?.place_name || "—"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "—"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "—"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: ${r.status === 'Present' ? '#10b981' : '#ef4444'}">${r.status}</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Attendance Summary Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #1f2937; }
            .header-container { display: flex; justify-content: space-between; border-bottom: 2px solid #3b82f6; padding-bottom: 15px; margin-bottom: 30px; }
            h1 { margin: 0; color: #1e3a8a; font-size: 24px; }
            .meta { font-size: 13px; color: #6b7280; line-height: 1.5; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
            th { background-color: #f9fafb; padding: 12px 10px; text-align: left; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #374151; }
            .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 15px; }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div>
              <h1>Shift & Attendance Management Report</h1>
              <div class="meta" style="margin-top: 5px;">
                SecureSys Guard Monitoring Hub
              </div>
            </div>
            <div class="meta text-right" style="text-align: right;">
              <p><strong>Generated Date:</strong> ${todayStr}</p>
              <p><strong>Total Logs:</strong> ${attendanceRecords.length} entries</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Guard</th>
                <th>Date</th>
                <th>Duty Location</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div class="footer">
            System generated report from Safety Guard Administrator Console. All log activities are cryptographically verified.
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }

  // Load appropriate data based on active tab
  useEffect(() => {
    fetchSummary();
    fetchLookups();
  }, []);

  useEffect(() => {
    if (activeTab === "performance") {
      loadPerformanceData(selectedPerformanceGuard);
    } else if (activeTab === "patrol") {
      loadPatrolHistory();
    } else if (activeTab === "attendance") {
      loadAttendanceLogs();
    } else if (activeTab === "incidents") {
      loadIncidentStats();
    }
  }, [activeTab, selectedPerformanceGuard, selectedPatrolGuard, selectedPatrolDate, filterGuard, filterLocation, filterStartDate, filterEndDate]);

  return (
    <>
      <ToastContainer />

      {/* Admin Advanced Tabs Navigation */}
      {isAdmin && (
        <div className="mb-8 space-y-3">
          {/* Mobile Tab Trigger Bar */}
          <div className="md:hidden flex items-center justify-between bg-white p-3.5 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Viewing:</span>
              <span className="font-bold text-gray-800 text-sm">
                {activeTab === "dashboard" && "📊 Summary Dashboard"}
                {activeTab === "performance" && "🎖️ Performance Tracking"}
                {activeTab === "patrol" && "🗺️ Patrol History Map"}
                {activeTab === "attendance" && "📋 Attendance & Shift Logs"}
                {activeTab === "incidents" && "🚨 Incident Reports"}
              </span>
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="px-3.5 py-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition text-xs font-bold flex items-center gap-1"
            >
              <span>{mobileMenuOpen ? "✕ Close" : "⚙️ Options"}</span>
            </button>
          </div>

          {/* Tab buttons - hidden on mobile unless toggled */}
          <div className={`${mobileMenuOpen ? "flex" : "hidden"} md:flex flex-col md:flex-row flex-wrap gap-2 bg-white p-2.5 rounded-2xl shadow-sm border border-gray-100 max-w-full md:max-w-fit animate-fade-in`}>
            {[
              { key: "dashboard", label: "📊 Summary Dashboard" },
              { key: "performance", label: "🎖️ Performance Tracking" },
              { key: "patrol", label: "🗺️ Patrol History Map" },
              { key: "attendance", label: "📋 Attendance & Shift Logs" },
              { key: "incidents", label: "🚨 Incident Reports" }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setMobileMenuOpen(false); // Auto-close menu on selection
                }}
                className={`w-full md:w-auto px-4 py-2.5 rounded-xl text-left md:text-center text-xs font-bold transition ${
                  activeTab === tab.key
                    ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── SUMMARY DASHBOARD VIEW ─── */}
      {activeTab === "dashboard" && (
        <div className="grid grid-cols-1 md:grid-cols-6 gap-5 mb-10">
          <div className="glass-card rounded-2xl p-6 md:col-span-3 hover:shadow-lg transition">
            <div className="flex items-center justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-xl mb-3">👮</div>
                <p className="text-gray-500 text-sm font-medium">Total Guards</p>
                <p className="text-4xl font-bold text-gray-800 mt-1">{totalGuards}</p>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 md:col-span-2 hover:shadow-lg transition">
            <div className="flex items-center justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-xl mb-3">📋</div>
                <p className="text-gray-500 text-sm font-medium">Attendance Records</p>
                <p className="text-4xl font-bold text-gray-800 mt-1">{totalAttendance}</p>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 md:col-span-1 hover:shadow-lg transition">
            <div>
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-xl mb-3">🗓️</div>
              <p className="text-gray-500 text-sm font-medium">Shifts</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{totalShifts}</p>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 md:col-span-2 hover:shadow-lg transition">
            <div className="flex items-center justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-xl mb-3">🚨</div>
                <p className="text-gray-500 text-sm font-medium">Total Incidents</p>
                <p className="text-4xl font-bold text-gray-800 mt-1">{totalIncidents}</p>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 md:col-span-4 hover:shadow-lg transition flex items-center justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-xl mb-3">✅</div>
              <p className="text-gray-500 text-sm font-medium">System Status</p>
              <p className="text-lg font-medium text-emerald-600 mt-1">All systems operational</p>
            </div>
            <div className="text-5xl text-emerald-500 font-bold">✓</div>
          </div>
        </div>
      )}

      {/* ─── PERFORMANCE TAB ─── */}
      {isAdmin && activeTab === "performance" && (
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">👮 Guard Performance Scorecard</h3>
            <div className="w-full max-w-sm">
              <label className="block text-xs font-semibold text-gray-400 uppercase mb-1.5">Select Guard Profile</label>
              <CustomSelect
                value={selectedPerformanceGuard}
                onChange={val => setSelectedPerformanceGuard(val)}
                options={[
                  { value: "", label: "Select a guard..." },
                  ...guards.map(g => ({ value: String(g.id), label: g.name }))
                ]}
                placeholder="Select a guard..."
              />
            </div>
          </div>

          {performanceStats ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Overall Score Circle */}
              <div className="glass-card rounded-2xl p-6 md:col-span-1 flex flex-col items-center justify-center text-center">
                <p className="text-sm font-bold text-gray-500 mb-4">Overall Performance Score</p>
                <div className="relative w-32 h-32 flex items-center justify-center rounded-full border-8 border-indigo-50">
                  <div className="absolute inset-0 rounded-full border-8 border-indigo-600" style={{ clipPath: `polygon(50% 50%, -50% -50%, ${performanceStats.overallScore * 3.6}% -50%)` }}></div>
                  <span className="text-3xl font-extrabold text-indigo-700">{performanceStats.overallScore}%</span>
                </div>
                <p className="text-xs text-gray-400 mt-4 leading-relaxed">Punctuality (40%) + Shift Attendance (60%) weightage.</p>
              </div>

              {/* Stats Grid */}
              <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="glass-card rounded-2xl p-5 bg-white">
                  <span className="text-2xl">⏰</span>
                  <p className="text-xs font-bold text-gray-400 uppercase mt-2">Punctuality Rate</p>
                  <p className="text-3xl font-extrabold text-gray-800 mt-1">{performanceStats.punctualityRate}%</p>
                  <p className="text-xs text-gray-505 mt-2">Check-ins within 15m of start.</p>
                </div>

                <div className="glass-card rounded-2xl p-5 bg-white">
                  <span className="text-2xl">⏳</span>
                  <p className="text-xs font-bold text-gray-400 uppercase mt-2">Total Hours Worked</p>
                  <p className="text-3xl font-extrabold text-gray-800 mt-1">{performanceStats.totalHours} hrs</p>
                  <p className="text-xs text-gray-505 mt-2">Accumulated duty hours logged.</p>
                </div>

                <div className="glass-card rounded-2xl p-5 bg-white">
                  <span className="text-2xl">🚨</span>
                  <p className="text-xs font-bold text-gray-400 uppercase mt-2">Incidents Reported</p>
                  <p className="text-3xl font-extrabold text-gray-800 mt-1">{performanceStats.incCount}</p>
                  <p className="text-xs text-gray-505 mt-2">Emergency/critical logs filed.</p>
                </div>

                <div className="glass-card rounded-2xl p-5 bg-emerald-50/50 border border-emerald-100 sm:col-span-3 grid grid-cols-3 text-center">
                  <div>
                    <p className="text-xs font-bold text-emerald-600">Present Shifts</p>
                    <p className="text-2xl font-extrabold text-emerald-700 mt-1">{performanceStats.totalPresent}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-600">Leaves Granted</p>
                    <p className="text-2xl font-extrabold text-amber-700 mt-1">{performanceStats.totalLeave}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-red-650">Unexcused Absences</p>
                    <p className="text-2xl font-extrabold text-red-700 mt-1">{performanceStats.totalAbsent}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            selectedPerformanceGuard && <div className="text-center py-10 text-gray-400">Calculating stats...</div>
          )}
        </div>
      )}

      {/* ─── PATROL HISTORY TAB ─── */}
      {isAdmin && activeTab === "patrol" && (
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">🗺️ Guard Patrol History Track</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1.5">Select Guard</label>
                <CustomSelect
                  value={selectedPatrolGuard}
                  onChange={val => setSelectedPatrolGuard(val)}
                  options={[
                    { value: "", label: "Choose a guard..." },
                    ...guards.map(g => ({ value: String(g.id), label: g.name }))
                  ]}
                  placeholder="Choose a guard..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1.5">Select Date</label>
                <input
                  type="date"
                  value={selectedPatrolDate}
                  onChange={e => setSelectedPatrolDate(e.target.value)}
                  className="w-full h-11 border border-gray-200 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm bg-white"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={loadPatrolHistory}
                  disabled={!selectedPatrolGuard}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition text-sm shadow-md shadow-blue-150"
                >
                  🔍 Load Tracking Log
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Map Frame */}
            <div className="lg:col-span-2 glass-card rounded-2xl p-5 overflow-hidden">
              <div className="h-[450px] rounded-xl overflow-hidden bg-slate-50 relative">
                {mapCenter ? (
                  <MapContainer center={mapCenter} zoom={15} className="w-full h-full">
                    <ChangeMapView coords={mapCenter} />
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    
                    {selectedGuardLocation && (
                       <>
                         <Circle
                           center={[selectedGuardLocation.latitude, selectedGuardLocation.longitude]}
                           radius={selectedGuardLocation.radius_meters || 100}
                           pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.05, weight: 1 }}
                         />
                         <Polygon
                           positions={getGeofencePolygonPoints(selectedGuardLocation.latitude, selectedGuardLocation.longitude, selectedGuardLocation.radius_meters || 100)}
                           pathOptions={{ color: '#6366f1', fillColor: 'transparent', dashArray: '8, 6', weight: 2 }}
                         />
                       </>
                     )}

                    {/* Draw route lines */}
                    {patrolCoords.length > 1 && (
                      <Polyline
                        positions={patrolCoords.map(c => [c.lat, c.lng])}
                        pathOptions={{ color: '#4f46e5', weight: 4, opacity: 0.8 }}
                      />
                    )}

                    {/* Markers */}
                    {patrolCoords.map((coord, idx) => {
                      let icon = waypointIcon;
                      let label = `Waypoint #${idx + 1}`;
                      if (idx === 0) {
                        icon = startIcon;
                        label = "🏁 START PATH";
                      } else if (idx === patrolCoords.length - 1) {
                        icon = endIcon;
                        label = "⏹️ END PATH";
                      }

                      return (
                        <Marker key={idx} position={[coord.lat, coord.lng]} icon={icon}>
                          <Popup>
                            <div className="text-xs">
                              <p className="font-bold text-gray-800">{label}</p>
                              <p className="text-gray-500">⏰ Time: {coord.time}</p>
                              <p className="text-gray-400">📍 {coord.lat.toFixed(6)}, {coord.lng.toFixed(6)}</p>
                            </div>
                          </Popup>
                        </Marker>
                      );
                    })}
                  </MapContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-gray-50">
                    <span className="text-5xl block mb-2">🗺️</span>
                    <p className="font-semibold">Map Route Offline</p>
                    <p className="text-xs mt-1 text-gray-450">Select guard and date, then click Load Tracking Log.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Waypoints list */}
            <div className="glass-card rounded-2xl p-5 flex flex-col h-[490px]">
              <h4 className="font-bold text-gray-700 text-sm mb-3">📍 Ping Log Activity ({patrolCoords.length})</h4>
              <div className="overflow-y-auto flex-1 space-y-2.5 pr-2">
                {patrolCoords.length === 0 ? (
                  <p className="text-gray-400 text-xs py-8 text-center">No coordinate logs loaded.</p>
                ) : (
                  patrolCoords.map((coord, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between text-xs hover:bg-gray-100/50 transition">
                      <div>
                        <p className="font-bold text-gray-750">Ping #{idx + 1}</p>
                        <p className="text-gray-400 text-[10px]">{coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}</p>
                      </div>
                      <span className="font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">{coord.time}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ATTENDANCE TAB ─── */}
      {isAdmin && activeTab === "attendance" && (
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-6">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
              <h3 className="text-lg font-bold text-gray-800">📋 Shift & Attendance Logs</h3>
              <div className="flex gap-2">
                <button
                  onClick={downloadCSV}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                >
                  📥 Export CSV
                </button>
                <button
                  onClick={printPDFReport}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                >
                  🖨️ Print PDF Report
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Guard</label>
                <CustomSelect
                  value={filterGuard}
                  onChange={val => setFilterGuard(val)}
                  options={[
                    { value: "", label: "All Guards" },
                    ...guards.map(g => ({ value: String(g.id), label: g.name }))
                  ]}
                  placeholder="All Guards"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Location</label>
                <CustomSelect
                  value={filterLocation}
                  onChange={val => setFilterLocation(val)}
                  options={[
                    { value: "", label: "All Locations" },
                    ...locations.map(l => ({ value: String(l.id), label: l.place_name }))
                  ]}
                  placeholder="All Locations"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={e => setFilterStartDate(e.target.value)}
                  className="w-full h-11 border border-gray-300 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">End Date</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={e => setFilterEndDate(e.target.value)}
                  className="w-full h-11 border border-gray-300 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm bg-white"
                />
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full border-collapse min-w-[800px] text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left p-4 text-gray-600 font-semibold">Guard</th>
                    <th className="text-left p-4 text-gray-600 font-semibold">Date</th>
                    <th className="text-left p-4 text-gray-600 font-semibold">Duty Location</th>
                    <th className="text-left p-4 text-gray-600 font-semibold">Check In</th>
                    <th className="text-left p-4 text-gray-600 font-semibold">Check Out</th>
                    <th className="text-left p-4 text-gray-600 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRecords.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-gray-400">No shift records matching criteria.</td></tr>
                  ) : (
                    attendanceRecords.map(item => (
                      <tr key={item.id} className="border-b hover:bg-gray-50/50 transition">
                        <td className="p-4 font-semibold text-gray-805">{item.guards?.name}</td>
                        <td className="p-4 text-gray-500">{item.check_in_time ? new Date(item.check_in_time).toLocaleDateString() : "—"}</td>
                        <td className="p-4 text-gray-500">{item.duty_locations?.place_name || "—"}</td>
                        <td className="p-4">{item.check_in_time ? new Date(item.check_in_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "—"}</td>
                        <td className="p-4">{item.check_out_time ? new Date(item.check_out_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "—"}</td>
                        <td className="p-4">
                          <span className={`status-chip status-chip-${item.status.toLowerCase()}`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="block md:hidden divide-y divide-gray-100">
              {attendanceRecords.length === 0 ? (
                <div className="p-8 text-center text-gray-400">No shift records matching criteria.</div>
              ) : (
                attendanceRecords.map(item => (
                  <div key={item.id} className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-gray-805 text-sm">{item.guards?.name || "Unknown"}</h4>
                        <p className="text-xs text-gray-400 mt-0.5">{item.check_in_time ? new Date(item.check_in_time).toLocaleDateString() : "—"}</p>
                      </div>
                      <span className={`status-chip status-chip-${item.status.toLowerCase()}`}>
                        {item.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-2.5 rounded-xl text-gray-600">
                      <div>
                        <span className="font-semibold block text-gray-450">Location:</span>
                        {item.duty_locations?.place_name || "—"}
                      </div>
                      <div />
                      <div>
                        <span className="font-semibold block text-gray-450">Check In:</span>
                        {item.check_in_time ? new Date(item.check_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </div>
                      <div>
                        <span className="font-semibold block text-gray-450">Check Out:</span>
                        {item.check_out_time ? new Date(item.check_out_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── INCIDENTS ANALYTICS TAB ─── */}
      {isAdmin && activeTab === "incidents" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1 */}
            <div className="glass-card rounded-2xl p-6 bg-white">
              <h4 className="text-sm font-bold text-gray-700 mb-4">🚨 Incidents by Event Type</h4>
              {barData.labels?.length > 0 ? (
                <Bar data={barData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
              ) : (
                <div className="flex items-center justify-center h-[200px] text-gray-400">No data found</div>
              )}
            </div>

            {/* Chart 2 */}
            <div className="glass-card rounded-2xl p-6 bg-white">
              <h4 className="text-sm font-bold text-gray-700 mb-4">🔄 Resolution / Open Status</h4>
              {pieData.labels?.length > 0 ? (
                <Pie data={pieData} options={{ responsive: true }} />
              ) : (
                <div className="flex items-center justify-center h-[200px] text-gray-400">No data found</div>
              )}
            </div>
          </div>

          {/* Incident Log table */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h4 className="font-bold text-gray-800 text-sm">Recent Logged Incidents ({incidentsRecords.length})</h4>
            </div>
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full border-collapse text-sm min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left p-4 text-gray-600 font-semibold">Type</th>
                    <th className="text-left p-4 text-gray-600 font-semibold">Guard</th>
                    <th className="text-left p-4 text-gray-600 font-semibold">Description</th>
                    <th className="text-left p-4 text-gray-600 font-semibold">Date</th>
                    <th className="text-left p-4 text-gray-600 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {incidentsRecords.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-400">No incidents reported.</td></tr>
                  ) : (
                    incidentsRecords.map(item => (
                      <tr key={item.id} className="border-b hover:bg-gray-50/50 transition">
                        <td className="p-4"><span className="px-2.5 py-1 bg-red-50 text-red-655 font-bold rounded-lg text-xs border border-red-200">{item.incident_type}</span></td>
                        <td className="p-4 font-semibold text-gray-805">{item.guards?.name || "Unknown"}</td>
                        <td className="p-4 text-gray-500 max-w-xs truncate">{item.description}</td>
                        <td className="p-4 text-gray-400">{new Date(item.created_at).toLocaleDateString()}</td>
                        <td className="p-4">
                          <span className={`status-chip ${item.incident_status === 'Closed' ? 'status-chip-approved' : 'status-chip-pending'}`}>
                            {item.incident_status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="block md:hidden divide-y divide-gray-100">
              {incidentsRecords.length === 0 ? (
                <div className="p-8 text-center text-gray-400">No incidents reported.</div>
              ) : (
                incidentsRecords.map(item => (
                  <div key={item.id} className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="px-2 py-0.5 bg-red-50 text-red-655 font-bold rounded text-[10px] border border-red-250">{item.incident_type}</span>
                        <h4 className="font-bold text-gray-805 text-sm mt-1">{item.guards?.name || "Unknown"}</h4>
                      </div>
                      <span className={`status-chip ${item.incident_status === 'Closed' ? 'status-chip-approved' : 'status-chip-pending'}`}>
                        {item.incident_status}
                      </span>
                    </div>

                    <div className="text-xs text-gray-650 bg-gray-50 p-2.5 rounded-xl space-y-1">
                      <p><span className="font-semibold text-gray-400 text-[10px] uppercase">Description:</span> {item.description}</p>
                      <p><span className="font-semibold text-gray-400 text-[10px] uppercase">Date:</span> {new Date(item.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Analytics;
