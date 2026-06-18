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
  const [showMap, setShowMap] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState(null);
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [showIncidentDensity, setShowIncidentDensity] = useState(false);
  const [patrolTrailPoints, setPatrolTrailPoints] = useState([]);
  const [incidents, setIncidents] = useState([]);
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
      <div className="mt-2">

        <div className="glass-card rounded-2xl p-6 ring-1 ring-blue-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-700">🗺️ Live Map & Operations</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setHeatmapMode(!heatmapMode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm ${
                  heatmapMode ? "bg-orange-600 text-white hover:bg-orange-700" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                🔥 {heatmapMode ? "Hide Heatmap" : "Patrol Heatmap"}
              </button>
              <button
                onClick={() => setShowIncidentDensity(!showIncidentDensity)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm ${
                  showIncidentDensity ? "bg-red-600 text-white hover:bg-red-700" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                🚨 {showIncidentDensity ? "Hide Incidents" : "Incident Density"}
              </button>
              <button
                onClick={() => setShowMap(!showMap)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  showMap ? "bg-red-100 text-red-650 hover:bg-red-200" : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {showMap ? "Hide Map" : "Show Map"}
              </button>
            </div>
          </div>
          {showMap && (
            loading ? (
              <div className="text-center py-12 text-gray-400">Loading map data...</div>
            ) : (
              <>
                <div className="bg-gray-100 rounded-xl overflow-hidden" style={{ height: "500px" }}>
                  <MapContainer center={[centerLat, centerLng]} zoom={14} className="w-full h-full">
                    <ChangeMapView coords={selectedCoords || [centerLat, centerLng]} />
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    
                    {/* Render advanced polygonal geofence boundaries for duty locations */}
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
                          
                          {/* Inner Safety Zone */}
                          <Circle
                            center={[loc.latitude, loc.longitude]}
                            radius={loc.radius_meters || 100}
                            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.08, weight: 1 }}
                          />
                          
                          {/* Outer Dashed Octagonal Advanced Geofence Boundary */}
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

                    {/* Patrol Heatmap representation */}
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

                    {/* Incident Density Plotting */}
                    {showIncidentDensity && incidents.map((inc) => {
                      // Fallback to guard's duty location if incident has no coords
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

                    {/* Standard Guard Pins */}
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
                <div className="flex flex-wrap gap-4 mt-4 text-xs font-semibold text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-blue-100 border border-blue-500 inline-block" /> Core Safety Zones</span>
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 border-2 border-dashed border-indigo-500 inline-block" /> Octagonal Geofence Perimeter</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block animate-pulse" /> Guards On Duty ({guardsOnDuty.length})</span>
                  {heatmapMode && (
                    <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-orange-100 border border-orange-500 inline-block" /> Patrol Density Heatmap</span>
                  )}
                  {showIncidentDensity && (
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block animate-ping" /> Incident Hotspots</span>
                  )}
                </div>
              </>
            )
          )}
          {!showMap && (
            <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl">
              <span className="text-3xl block mb-2">🗺️</span>
              <p className="font-medium">Map is hidden</p>
              <p className="text-sm mt-1">Click "Show Map" to view live tracking</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="glass-card rounded-2xl p-5 ring-1 ring-emerald-200">
            <h3 className="text-sm font-semibold text-gray-600 mb-3">📍 Duty Locations</h3>
            {dutyLocations.length === 0 ? (
              <p className="text-gray-400 text-sm">No locations configured.</p>
            ) : (
              <ul className="space-y-2">
                {dutyLocations.map((loc) => (
                  <li key={loc.id}>
                    <button
                      onClick={() => setSelectedCoords([loc.latitude, loc.longitude])}
                      className="w-full text-left text-sm text-gray-600 flex items-center gap-2 hover:bg-blue-50 p-2 rounded-lg transition-all duration-200"
                    >
                      <span className="w-2 h-2 rounded-full bg-blue-600" />
                      {loc.place_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="glass-card rounded-2xl p-5 ring-1 ring-blue-200">
            <h3 className="text-sm font-semibold text-gray-600 mb-3">🛡️ Active Guards</h3>
            {guardsOnDuty.length === 0 ? (
              <p className="text-gray-400 text-sm">No guards currently on duty.</p>
            ) : (
              <ul className="space-y-2">
                {guardsOnDuty.map((guard) => (
                  <li key={guard.id}>
                    <button
                      onClick={() => setSelectedCoords([guard.lat, guard.lng])}
                      className="w-full text-left text-sm text-gray-600 flex items-center gap-2 hover:bg-emerald-50 p-2 rounded-lg transition-all duration-200"
                    >
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                      <span>{guard.guardName}</span>
                      {guard.locationName && <span className="text-gray-400">@ {guard.locationName}</span>}
                      <span className="text-gray-400 ml-auto">{new Date(guard.time).toLocaleTimeString()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default MapView;
