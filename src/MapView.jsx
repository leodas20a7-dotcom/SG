import { useEffect, useState, useRef } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
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

function MapView() {
  const [guardsOnDuty, setGuardsOnDuty] = useState([]);
  const [dutyLocations, setDutyLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState(null);
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
    } catch { /* ignore */ }
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
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-700">🗺️ Live Map</h2>
            <button
              onClick={() => setShowMap(!showMap)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                showMap ? "bg-red-100 text-red-600 hover:bg-red-200" : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {showMap ? "Hide Map" : "Show Map"}
            </button>
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
                    {dutyLocations.map((loc) => (
                      <Marker key={`loc-${loc.id}`} position={[loc.latitude, loc.longitude]} icon={locationIcon}>
                        <Popup>
                          <div className="text-sm">
                            <p className="font-semibold text-gray-800">{loc.place_name}</p>
                            <p className="text-gray-500">📍 {loc.latitude}, {loc.longitude}</p>
                            <p className="text-gray-500">📏 {loc.radius_meters}m radius</p>
                            {loc.shift_start && <p className="text-gray-500">🕐 {loc.shift_start} - {loc.shift_end || "—"}</p>}
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                    {dutyLocations.map((loc) => (
                      <Circle
                        key={`loc-circle-${loc.id}`}
                        center={[loc.latitude, loc.longitude]}
                        radius={loc.radius_meters || 100}
                        pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2 }}
                      />
                    ))}
                    {guardsOnDuty.map((guard) => (
                      <Marker key={`guard-${guard.id}`} position={[guard.lat, guard.lng]} icon={guardIcon}>
                        <Popup>
                          <div className="text-sm">
                            <p className="font-semibold text-gray-800">🛡️ {guard.guardName}</p>
                            {guard.locationName && <p className="text-gray-600">📍 {guard.locationName}</p>}
                            <p className="text-gray-500">{guard.lat.toFixed(6)}, {guard.lng.toFixed(6)}</p>
                            <p className="text-gray-500">🕐 {new Date(guard.time).toLocaleTimeString()}</p>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
                <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-600 inline-block" /> Duty Locations ({dutyLocations.length})</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block animate-pulse" /> Guards On Duty ({guardsOnDuty.length})</span>
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
