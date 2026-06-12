import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function DutyLocations() {
  const [locations, setLocations] = useState([]);
  const [placeName, setPlaceName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radius, setRadius] = useState("100");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [mapLat, setMapLat] = useState("");
  const [mapLng, setMapLng] = useState("");
  const { showToast, ToastContainer } = useToast();

  async function fetchLocations() {
    try {
      const { data } = await supabase.from("duty_locations").select("*").order("created_at", { ascending: false });
      setLocations(data || []);
    } catch {
      showToast("Could not load duty locations.", "error");
    }
  }

  function validate() {
    const errs = {};
    if (!placeName.trim()) errs.placeName = "Place name is required";
    const lat = parseFloat(latitude);
    if (!latitude.trim()) errs.latitude = "Latitude is required";
    else if (isNaN(lat) || lat < -90 || lat > 90) errs.latitude = "Invalid latitude (-90 to 90)";
    const lng = parseFloat(longitude);
    if (!longitude.trim()) errs.longitude = "Longitude is required";
    else if (isNaN(lng) || lng < -180 || lng > 180) errs.longitude = "Invalid longitude (-180 to 180)";
    const r = parseInt(radius);
    if (!radius.trim()) errs.radius = "Radius is required";
    else if (isNaN(r) || r < 10) errs.radius = "Min radius is 10 meters";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function addLocation() {
    if (!validate()) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("duty_locations").insert([{
        place_name: placeName.trim(),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        radius_meters: parseInt(radius)
      }]);
      if (error) { showToast("Error saving location.", "error"); return; }
      showToast("Duty location added!", "success");
      setPlaceName(""); setLatitude(""); setLongitude(""); setRadius("100");
      fetchLocations();
    } catch {
      showToast("Network error.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function deleteLocation(id) {
    try {
      await supabase.from("duty_locations").delete().eq("id", id);
      showToast("Location deleted.", "success");
      fetchLocations();
    } catch {
      showToast("Error deleting location.", "error");
    }
  }

  async function getCurrentLocation() {
    if (!navigator.geolocation) { showToast("Geolocation not supported.", "error"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLatitude(pos.coords.latitude.toFixed(6)); setLongitude(pos.coords.longitude.toFixed(6)); },
      () => showToast("Could not get current location.", "error")
    );
  }

  useEffect(() => { fetchLocations(); }, []);

  function MapClickHandler() {
    useMapEvents({
      click(e) {
        setMapLat(e.latlng.lat.toFixed(6));
        setMapLng(e.latlng.lng.toFixed(6));
      },
    });
    return null;
  }

  return (
    <>
      <ToastContainer />
      {showMap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowMap(false)}>
          <div className="bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-3xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-5 py-3 border-b">
              <h3 className="font-semibold text-gray-700">📍 Select Location on Map</h3>
              <button onClick={() => setShowMap(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div style={{ height: "400px" }}>
              <MapContainer center={[parseFloat(mapLat) || 13.0827, parseFloat(mapLng) || 80.2707]} zoom={15} className="w-full h-full">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapClickHandler />
                {mapLat && mapLng && <Marker position={[parseFloat(mapLat), parseFloat(mapLng)]} />}
              </MapContainer>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50">
              <div className="text-sm text-gray-500">
                {mapLat && mapLng ? `Selected: ${mapLat}, ${mapLng}` : "Click on the map to select a location"}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowMap(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition text-sm">Cancel</button>
                <button onClick={() => { setLatitude(mapLat); setLongitude(mapLng); setShowMap(false); }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition text-sm font-medium">Confirm Location</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="mt-4">
        <div className="glass-card rounded-2xl p-6 mb-8 ring-1 ring-emerald-200">
          <h2 className="text-xl font-semibold mb-4 text-gray-700 font-bold">📍 Add Duty Location</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Place Name</label>
              <input type="text" placeholder="e.g. Koyambedu" value={placeName}
                onChange={(e) => { setPlaceName(e.target.value); setErrors((p) => ({ ...p, placeName: "" })); }}
                className={`w-full h-12 border p-3 rounded-lg focus:outline-none focus:ring-2 transition ${errors.placeName ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-emerald-300"}`} />
              {errors.placeName && <p className="text-red-500 text-sm mt-1">{errors.placeName}</p>}
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Latitude</label>
              <div className="flex gap-2">
                <input type="number" step="any" placeholder="13.0827" value={latitude}
                  onChange={(e) => { setLatitude(e.target.value); setErrors((p) => ({ ...p, latitude: "" })); }}
                  className={`flex-1 w-full h-12 border p-3 rounded-lg focus:outline-none focus:ring-2 transition ${errors.latitude ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-emerald-300"}`} />
                <button onClick={getCurrentLocation} className="h-12 px-3 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition text-sm whitespace-nowrap">📍 Use My</button>
              </div>
              {errors.latitude && <p className="text-red-500 text-sm mt-1">{errors.latitude}</p>}
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Longitude</label>
              <input type="number" step="any" placeholder="80.2707" value={longitude}
                onChange={(e) => { setLongitude(e.target.value); setErrors((p) => ({ ...p, longitude: "" })); }}
                className={`w-full h-12 border p-3 rounded-lg focus:outline-none focus:ring-2 transition ${errors.longitude ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-emerald-300"}`} />
              {errors.longitude && <p className="text-red-500 text-sm mt-1">{errors.longitude}</p>}
              <button onClick={() => { setMapLat(latitude || "13.0827"); setMapLng(longitude || "80.2707"); setShowMap(true); }}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700 hover:underline">🗺️ Pick on Map</button>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Radius (meters)</label>
              <input type="number" min="10" placeholder="100" value={radius}
                onChange={(e) => { setRadius(e.target.value); setErrors((p) => ({ ...p, radius: "" })); }}
                className={`w-full h-12 border p-3 rounded-lg focus:outline-none focus:ring-2 transition ${errors.radius ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-emerald-300"}`} />
              {errors.radius && <p className="text-red-500 text-sm mt-1">{errors.radius}</p>}
            </div>
          </div>
          <button onClick={addLocation} disabled={loading}
            className={`mt-5 px-6 py-3 rounded-lg text-white font-semibold transition ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"}`}>
            {loading ? "Saving..." : "Add Location"}
          </button>
        </div>

        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left p-4 text-gray-600 font-semibold">Place</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Latitude</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Longitude</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Radius</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-400">No duty locations set.</td></tr>
                ) : locations.map((loc) => (
                  <tr key={loc.id} className="border-b hover:bg-gray-50 transition">
                    <td className="p-4 font-medium">{loc.place_name}</td>
                    <td className="p-4 text-gray-500">{loc.latitude}</td>
                    <td className="p-4 text-gray-500">{loc.longitude}</td>
                    <td className="p-4">{loc.radius_meters}m</td>
                    <td className="p-4">
                      <button onClick={() => deleteLocation(loc.id)}
                        className="text-red-500 hover:text-red-700 text-sm font-medium">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

export default DutyLocations;
