import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { getLocation } from "./lib/geoUtils";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
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

function DutyLocations() {
  const [locations, setLocations] = useState([]);
  const [editingId, setEditingId] = useState(null);
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

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  async function handleSearchLocation() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      // Use countrycodes=in to restrict to India natively without breaking the text search
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data || []);
      if (data && data.length > 0) {
        const first = data[0];
        setMapLat(parseFloat(first.lat).toFixed(6));
        setMapLng(parseFloat(first.lon).toFixed(6));
        if (!placeName) {
          setPlaceName(first.display_name.split(",")[0]);
        }
      } else {
        showToast("No locations found.", "error");
      }
    } catch {
      showToast("Error searching location.", "error");
    } finally {
      setSearching(false);
    }
  }

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

  async function saveLocation() {
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = {
        place_name: placeName.trim(),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        radius_meters: parseInt(radius)
      };

      let error;
      if (editingId) {
        const { error: err } = await supabase.from("duty_locations").update(payload).eq("id", editingId);
        error = err;
      } else {
        const { error: err } = await supabase.from("duty_locations").insert([payload]);
        error = err;
      }

      if (error) { showToast(editingId ? "Error updating location." : "Error saving location.", "error"); return; }
      showToast(editingId ? "Duty location updated!" : "Duty location added!", "success");
      cancelEdit();
      fetchLocations();
    } catch {
      showToast("Network error.", "error");
    } finally {
      setLoading(false);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setPlaceName(""); setLatitude(""); setLongitude(""); setRadius("100");
    setErrors({});
  }

  function handleEdit(loc) {
    setEditingId(loc.id);
    setPlaceName(loc.place_name);
    setLatitude(loc.latitude.toString());
    setLongitude(loc.longitude.toString());
    setRadius(loc.radius_meters.toString());
    setErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    try {
      const pos = await getLocation();
      setLatitude(pos.lat.toFixed(6));
      setLongitude(pos.lng.toFixed(6));
      showToast("High-accuracy location acquired", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
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
              <button onClick={() => { setShowMap(false); setSearchResults([]); setSearchQuery(""); }} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            
            {/* Search Bar */}
            <div className="p-3 bg-gray-50 border-b border-gray-100 flex gap-2">
              <input
                type="text"
                placeholder="Search place name (e.g. Koyambedu, Chennai)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearchLocation()}
                className="flex-1 h-10 border border-gray-300 px-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white text-sm"
              />
              <button
                onClick={handleSearchLocation}
                disabled={searching}
                className="h-10 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition text-sm font-semibold shadow-sm shrink-0"
              >
                {searching ? "Searching..." : "🔍 Search"}
              </button>
            </div>

            {/* Suggestions list */}
            {searchResults.length > 0 && (
              <div className="max-h-28 overflow-y-auto bg-white border-b border-gray-200 divide-y text-xs text-gray-700">
                {searchResults.slice(0, 5).map((result, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setMapLat(parseFloat(result.lat).toFixed(6));
                      setMapLng(parseFloat(result.lon).toFixed(6));
                      setPlaceName(result.display_name.split(",")[0]);
                      setSearchResults([]);
                    }}
                    className="p-2.5 hover:bg-emerald-50 cursor-pointer transition truncate"
                  >
                    📍 {result.display_name}
                  </div>
                ))}
              </div>
            )}

            <div style={{ height: "400px" }}>
              <MapContainer center={[parseFloat(mapLat) || 13.0827, parseFloat(mapLng) || 80.2707]} zoom={15} className="w-full h-full">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapClickHandler />
                <ChangeMapView coords={[parseFloat(mapLat) || 13.0827, parseFloat(mapLng) || 80.2707]} />
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
          <h2 className="text-xl font-semibold mb-4 text-gray-700 font-bold">
            {editingId ? "✏️ Edit Duty Location" : "📍 Add Duty Location"}
          </h2>
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
          <div className="flex gap-3 mt-5">
            <button onClick={saveLocation} disabled={loading}
              className={`px-6 py-3 rounded-lg text-white font-semibold transition ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"}`}>
              {loading ? "Saving..." : editingId ? "Update Location" : "Add Location"}
            </button>
            {editingId && (
              <button onClick={cancelEdit} disabled={loading}
                className="px-6 py-3 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 font-semibold transition">
                Cancel
              </button>
            )}
          </div>
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
                      <div className="flex gap-3">
                        <button onClick={() => handleEdit(loc)}
                          className="text-blue-500 hover:text-blue-700 text-sm font-medium">Edit</button>
                        <button onClick={() => deleteLocation(loc.id)}
                          className="text-red-500 hover:text-red-700 text-sm font-medium">Delete</button>
                      </div>
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
