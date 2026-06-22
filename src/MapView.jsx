import { useEffect, useState, useRef } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const guardIcon = L.divIcon({
  className: "custom-div-icon",
  html: "<div style='background-color:#10b981; color:white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; box-shadow: 0 4px 10px rgba(0,0,0,0.15); border: 2px solid white;'>🛡️</div>",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const locationIcon = L.divIcon({
  className: "custom-div-icon",
  html: "<div style='background-color:#3b82f6; color:white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; box-shadow: 0 4px 10px rgba(0,0,0,0.15); border: 2px solid white;'>📍</div>",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function ChangeMapView({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords && coords[0] && coords[1]) {
      map.setView(coords, 16);
    }
  }, [coords, map]);
  return null;
}

// Generate an N-sided regular polygon representing the geofence perimeter
export function getGeofencePolygonPoints(centerLat, centerLng, radiusMeters) {
  if (!centerLat || !centerLng) return [];
  const points = [];
  const numSides = 8; // Octagonal advanced boundary shape
  const latRadian = (centerLat * Math.PI) / 180;
  const deltaLat = radiusMeters / 111320;
  const deltaLng = radiusMeters / (111320 * Math.cos(latRadian));

  for (let i = 0; i < numSides; i++) {
    const angle = (i * 2 * Math.PI) / numSides;
    const lat = centerLat + deltaLat * Math.sin(angle);
    const lng = centerLng + deltaLng * Math.cos(angle);
    points.push([lat, lng]);
  }
  return points;
}

function MapView() {
  const [guardsOnDuty, setGuardsOnDuty] = useState([]);
  const [dutyLocations, setDutyLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useState(true);
  const [selectedCoords, setSelectedCoords] = useState(null);
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [showIncidentDensity, setShowIncidentDensity] = useState(false);
  const [patrolTrailPoints, setPatrolTrailPoints] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [sidebarTab, setSidebarTab] = useState("guards");
  const intervalRef = useRef(null);
  const { showToast, ToastContainer } = useToast();

  async function fetchLiveData() {
    try {
      const today = new Date().toISOString().split("T")[0];
      
      // Query active tracking records. We join with guards and attendance.
      const { data: tracking } = await supabase
        .from("live_tracking")
        .select("*, guards(name), attendance!inner(id, check_in_time, check_out_time, duty_locations(place_name))")
        .is("attendance.check_out_time", null) // Only active duties
        .gte("attendance.check_in_time", today) // Started today
        .order("tracked_at", { ascending: false });

      if (tracking && tracking.length > 0) {
        const latest = {};
        tracking.forEach((t) => {
          const gid = t.guard_id;
          if (!latest[gid]) {
            const locName = t.attendance?.duty_locations?.place_name;
            latest[gid] = {
              lat: t.latitude,
              lng: t.longitude,
              time: t.tracked_at,
              guardName: t.guards?.name || "Unknown",
              locationName: locName || null
            };
          }
        });
        setGuardsOnDuty(Object.keys(latest).map((id) => ({ id, ...latest[id] })));
      } else {
        setGuardsOnDuty([]);
      }

      // Fetch all today's coordinate pings for the patrol trail heatmap
      const { data: trailPoints } = await supabase
        .from("live_tracking")
        .select("latitude, longitude")
        .gte("tracked_at", today + "T00:00:00");
      setPatrolTrailPoints(trailPoints || []);

      // Fetch incidents with guard's assigned location coordinates for plotting incident density
      const { data: inc } = await supabase
        .from("incidents")
        .select("*, guards(name, duty_location_id, duty_locations:duty_locations!duty_location_id(latitude, longitude, place_name))")
        .order("created_at", { ascending: false });
      setIncidents(inc || []);

    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function fetchDutyLocations() {
    try {
      const { data } = await supabase.from("duty_locations").select("*");
      setDutyLocations(data || []);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchLiveData();
    fetchDutyLocations();
    intervalRef.current = setInterval(fetchLiveData, 10000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const allLocations = dutyLocations.map((loc) => ({
    lat: loc.latitude,
    lng: loc.longitude,
    name: loc.place_name,
    radius: loc.radius_meters,
    type: "location",
  }));

  const allGuards = guardsOnDuty.map((g) => ({
    lat: g.lat,
    lng: g.lng,
    name: g.guardName,
    time: g.time,
    type: "guard",
  }));

  const pins = [...allLocations, ...allGuards];
  const centerLat = pins.length > 0 ? pins[0].lat : -33.8688;
  const centerLng = pins.length > 0 ? pins[0].lng : 151.2093;

  return (
    <>
      <ToastContainer />
      <div className="mt-2 space-y-6">
        <div className="glass-card rounded-3xl p-6 border border-slate-200/80 shadow-[0_15px_30px_-10px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
            <div>
              <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                <span>🗺️ Live Map & Operations</span>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              </h2>
              <p className="text-xs text-slate-450 mt-1">Monitor guards on duty and coordinate site coverage in real-time.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setHeatmapMode(!heatmapMode)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 shadow-sm ${
                  heatmapMode ? "bg-orange-600 text-white hover:bg-orange-700 shadow-orange-100" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                🔥 {heatmapMode ? "Hide Heatmap" : "Patrol Heatmap"}
              </button>
              <button
                onClick={() => setShowIncidentDensity(!showIncidentDensity)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 shadow-sm ${
                  showIncidentDensity ? "bg-red-600 text-white hover:bg-red-700 shadow-red-100" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                🚨 {showIncidentDensity ? "Hide Incidents" : "Incident Density"}
              </button>
              <button
                onClick={() => setShowMap(!showMap)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                  showMap ? "bg-red-50 text-red-650 hover:bg-red-100" : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100"
                }`}
              >
                {showMap ? "Hide Map" : "Show Map"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Map View Panel: 8/12 width */}
            <div className="lg:col-span-8 flex flex-col h-full">
              {showMap ? (
                loading ? (
                  <div className="text-center py-20 text-gray-400 flex flex-col justify-center items-center gap-3 bg-gray-50 rounded-2xl h-full min-h-[350px]">
                    <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <span className="text-xs font-semibold">Loading map coordinates...</span>
                  </div>
                ) : (
                  <div className="flex flex-col h-full">
                    <div className="bg-gray-100 rounded-2xl overflow-hidden border border-slate-150 shadow-sm flex-1 min-h-[400px] lg:min-h-[460px] relative">
                      <MapContainer center={[centerLat, centerLng]} zoom={14} className="w-full h-full z-10">
                        <ChangeMapView coords={selectedCoords || [centerLat, centerLng]} />
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        
                        {/* Duty Locations boundary rendering */}
                        {dutyLocations.map((loc) => {
                          const polyPoints = getGeofencePolygonPoints(loc.latitude, loc.longitude, loc.radius_meters || 100);
                          return (
                            <div key={`loc-group-${loc.id}`}>
                              <Marker position={[loc.latitude, loc.longitude]} icon={locationIcon}>
                                <Popup>
                                  <div className="text-sm">
                                    <p className="font-semibold text-gray-800">{loc.place_name}</p>
                                    <p className="text-gray-500">📍 {loc.latitude}, {loc.longitude}</p>
                                    <p className="text-gray-500">📏 {loc.radius_meters}m radius</p>
                                  </div>
                                </Popup>
                              </Marker>
                              <Circle
                                center={[loc.latitude, loc.longitude]}
                                radius={loc.radius_meters || 100}
                                pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.08, weight: 1 }}
                              />
                              <Polygon
                                positions={polyPoints}
                                pathOptions={{
                                  color: '#6366f1',
                                  fillColor: 'transparent',
                                  dashArray: '8, 6',
                                  weight: 2
                                }}
                              />
                            </div>
                          );
                        })}

                        {/* Patrol Heatmap */}
                        {heatmapMode && patrolTrailPoints.map((pt, idx) => (
                          <Circle
                            key={`heat-point-${idx}`}
                            center={[pt.latitude, pt.longitude]}
                            radius={25}
                            pathOptions={{
                              color: '#f97316',
                              fillColor: '#ef4444',
                              fillOpacity: 0.15,
                              weight: 0
                            }}
                          />
                        ))}

                        {/* Incident Hotspots */}
                        {showIncidentDensity && incidents.map((inc) => {
                          const lat = inc.latitude || inc.guards?.duty_locations?.latitude;
                          const lng = inc.longitude || inc.guards?.duty_locations?.longitude;
                          if (!lat || !lng) return null;
                          return (
                            <Marker
                              key={`inc-density-${inc.id}`}
                              position={[lat, lng]}
                              icon={L.divIcon({
                                className: "custom-div-icon",
                                html: `<div class="animate-pulse" style="background-color:#ef4444; color:white; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; box-shadow: 0 4px 12px rgba(239,68,68,0.5); border: 2.5px solid white; font-size:12px;">🚨</div>`,
                                iconSize: [30, 30],
                                iconAnchor: [15, 15],
                              })}
                            >
                              <Popup>
                                <div className="text-xs space-y-1">
                                  <p className="font-bold text-red-650 uppercase tracking-wide">🚨 {inc.incident_type}</p>
                                  <p className="text-gray-700 leading-relaxed">{inc.description}</p>
                                  <p className="text-gray-400 font-semibold">Guard: {inc.guards?.name || "Unknown"}</p>
                                  <p className="text-gray-400">Date: {new Date(inc.created_at).toLocaleDateString()}</p>
                                </div>
                              </Popup>
                            </Marker>
                          );
                        })}

                        {/* Guard Pins */}
                        {guardsOnDuty.map((guard) => (
                          <Marker key={`guard-${guard.id}`} position={[guard.lat, guard.lng]} icon={guardIcon}>
                            <Popup>
                              <div className="text-sm">
                                <p className="font-semibold text-gray-800">🛡️ {guard.guardName}</p>
                                {guard.locationName && <p className="text-gray-605">📍 {guard.locationName}</p>}
                                <p className="text-gray-500">{guard.lat.toFixed(6)}, {guard.lng.toFixed(6)}</p>
                                <p className="text-gray-500">🕐 {new Date(guard.time).toLocaleTimeString()}</p>
                              </div>
                            </Popup>
                          </Marker>
                        ))}
                      </MapContainer>
                    </div>

                    {/* Map Legend */}
                    <div className="flex flex-wrap gap-4 mt-4 text-[10px] font-semibold text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-500 inline-block" /> Core Safety Zones</span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 border-2 border-dashed border-indigo-500 inline-block" /> Octagonal Perimeter</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block animate-pulse" /> Active Guards ({guardsOnDuty.length})</span>
                      {heatmapMode && (
                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-100 border border-orange-500 inline-block" /> Heatmap</span>
                      )}
                      {showIncidentDensity && (
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block animate-ping" /> Hotspots</span>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <div className="text-center py-20 text-gray-400 bg-gray-50 rounded-2xl flex flex-col justify-center items-center gap-2 h-full border border-dashed border-slate-200 min-h-[350px]">
                  <span className="text-3xl block mb-2">🗺️</span>
                  <p className="font-semibold text-slate-700 text-sm">Map is currently hidden</p>
                  <p className="text-xs text-slate-455">Click "Show Map" in the top header toolbar to restore visual tracking.</p>
                </div>
              )}
            </div>

            {/* Right Control Panel: 4/12 width */}
            <div className="lg:col-span-4 flex flex-col space-y-4">
              {/* Metrics Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3.5 text-center shadow-sm">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Active Guards</span>
                  <span className="text-xl font-extrabold text-emerald-800 mt-0.5 block">{guardsOnDuty.length}</span>
                </div>
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-3.5 text-center shadow-sm">
                  <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">Monitored Sites</span>
                  <span className="text-xl font-extrabold text-indigo-800 mt-0.5 block">{dutyLocations.length}</span>
                </div>
              </div>

              {/* Sidebar Tab Control */}
              <div className="flex bg-slate-100/80 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSidebarTab("guards")}
                  className={`flex-1 py-2 text-xs font-extrabold rounded-lg transition-all duration-200 ${
                    sidebarTab === "guards" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  🛡️ Guards ({guardsOnDuty.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab("locations")}
                  className={`flex-1 py-2 text-xs font-extrabold rounded-lg transition-all duration-200 ${
                    sidebarTab === "locations" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  📍 Locations ({dutyLocations.length})
                </button>
              </div>

              {/* Tabs Content Area */}
              <div className="flex-1 border border-slate-150 rounded-2xl p-4 overflow-y-auto max-h-[380px] lg:max-h-[420px] bg-slate-50/30">
                {sidebarTab === "guards" ? (
                  guardsOnDuty.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                      <span className="text-2xl block mb-2">😴</span>
                      <p className="text-xs font-semibold">No guards on shift today.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {guardsOnDuty.map((guard) => (
                        <div
                          key={guard.id}
                          className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm hover:shadow transition-all duration-200 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center font-bold text-xs shrink-0">
                              {guard.guardName.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-850">{guard.guardName}</p>
                              {guard.locationName ? (
                                <p className="text-[10px] text-indigo-650 font-semibold mt-0.5">📍 {guard.locationName}</p>
                              ) : (
                                <p className="text-[10px] text-slate-400 mt-0.5">Offline</p>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedCoords([guard.lat, guard.lng])}
                            className="bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 p-2 rounded-lg transition text-xs font-bold flex items-center gap-1.5 shrink-0"
                            title="Locate Guard on Map"
                          >
                            🧭 Locate
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  dutyLocations.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                      <span className="text-2xl block mb-2">📍</span>
                      <p className="text-xs font-semibold">No locations configured.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dutyLocations.map((loc) => (
                        <div
                          key={loc.id}
                          className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm hover:shadow transition-all duration-200 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                              📍
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-850">{loc.place_name}</p>
                              <p className="text-[10px] text-slate-450 mt-0.5">Geofence: {loc.radius_meters}m</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedCoords([loc.latitude, loc.longitude])}
                            className="bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 p-2 rounded-lg transition text-xs font-bold flex items-center gap-1.5 shrink-0"
                            title="Center map on location"
                          >
                            🗺️ Center
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default MapView;
