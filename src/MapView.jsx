import { useEffect, useState, useRef } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function MapView() {
  const [guardsOnDuty, setGuardsOnDuty] = useState([]);
  const [dutyLocations, setDutyLocations] = useState([]);
  const [loading, setLoading] = useState(true);
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
  const centerLat = pins.length > 0 ? pins[0].lat : 13.0827;
  const centerLng = pins.length > 0 ? pins[0].lng : 80.2707;

  return (
    <>
      <ToastContainer />
      <div className="mt-10">
        <h1 className="text-2xl font-bold mb-5 text-gray-800">📍 Live Tracking Map</h1>

        <div className="glass-card rounded-2xl p-6 ring-1 ring-blue-200">
          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading map data...</div>
          ) : (
            <>
              <div className="bg-gray-100 rounded-xl overflow-hidden" style={{ height: "500px" }}>
                <MapContainer center={[centerLat, centerLng]} zoom={14} className="w-full h-full">
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {dutyLocations.map((loc) => (
                    <Marker key={`loc-${loc.id}`} position={[loc.latitude, loc.longitude]}>
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
                  {guardsOnDuty.map((guard) => (
                    <Marker key={`guard-${guard.id}`} position={[guard.lat, guard.lng]}>
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
                  <li key={loc.id} className="text-sm text-gray-600 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                    {loc.place_name}
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
                  <li key={guard.id} className="text-sm text-gray-600 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                    <span>{guard.guardName}</span>
                    {guard.locationName && <span className="text-gray-400">@ {guard.locationName}</span>}
                    <span className="text-gray-400 ml-auto">{new Date(guard.time).toLocaleTimeString()}</span>
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
