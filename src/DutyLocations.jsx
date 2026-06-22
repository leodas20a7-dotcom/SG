import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import { MapContainer, TileLayer, Marker, Circle, Polygon, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { getLocation } from "./lib/geoUtils";
import LoadingOverlay from "./LoadingOverlay";
import { getGeofencePolygonPoints } from "./MapView";
import { FaMapMarkerAlt, FaCompass, FaCrosshairs, FaCheck, FaTimes, FaSearch, FaPen, FaTrashAlt, FaPlus } from "react-icons/fa";

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
  const [locLoading, setLocLoading] = useState(false);

  function parseCoordinates(input) {
    if (!input) return null;
    const trimmed = input.trim();
    
    // Pattern 1: Google Maps URL containing q=lat,lng
    const qPattern = /[?&]q=([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/;
    const qMatch = trimmed.match(qPattern);
    if (qMatch) {
      return { lat: parseFloat(qMatch[1]).toFixed(6), lng: parseFloat(qMatch[2]).toFixed(6) };
    }
    
    // Pattern 2: Google Maps URL containing @lat,lng
    const atPattern = /@([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/;
    const atMatch = trimmed.match(atPattern);
    if (atMatch) {
      return { lat: parseFloat(atMatch[1]).toFixed(6), lng: parseFloat(atMatch[2]).toFixed(6) };
    }

    // Pattern 3: Direct coordinates like "13.0705979, 80.2034464"
    const coordPattern = /^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)$/;
    const coordMatch = trimmed.match(coordPattern);
    if (coordMatch) {
      return { lat: parseFloat(coordMatch[1]).toFixed(6), lng: parseFloat(coordMatch[2]).toFixed(6) };
    }

    return null;
  }

  function handleLocationInput(val, isLat) {
    const parsed = parseCoordinates(val);
    if (parsed) {
      setLatitude(parsed.lat);
      setLongitude(parsed.lng);
      showToast(`Parsed coordinates: ${parsed.lat}, ${parsed.lng}`, "success");
    } else {
      if (isLat) {
        setLatitude(val);
      } else {
        setLongitude(val);
      }
    }
    setErrors((p) => ({ ...p, latitude: "", longitude: "" }));
  }

  async function handleSearchLocation() {
    if (!searchQuery.trim()) return;

    const parsed = parseCoordinates(searchQuery);
    if (parsed) {
      setMapLat(parsed.lat);
      setMapLng(parsed.lng);
      setLatitude(parsed.lat);
      setLongitude(parsed.lng);
      showToast(`Parsed coordinates: ${parsed.lat}, ${parsed.lng}`, "success");
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      // Use countrycodes=au to restrict to Australia natively without breaking the text search
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=au&q=${encodeURIComponent(searchQuery)}`);
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
    const scrollContainer = document.querySelector(".overflow-y-auto") || window;
    scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
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
    setLocLoading(true);
    try {
      const pos = await getLocation();
      setLatitude(pos.lat.toFixed(6));
      setLongitude(pos.lng.toFixed(6));
      showToast("High-accuracy location acquired", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLocLoading(false);
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
      {loading && <LoadingOverlay message="Saving shift location..." />}
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
                placeholder="Search place name (e.g. Melbourne, Sydney)..."
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
              <MapContainer center={[parseFloat(mapLat) || -33.8688, parseFloat(mapLng) || 151.2093]} zoom={15} className="w-full h-full">
                <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                <MapClickHandler />
                <ChangeMapView coords={[parseFloat(mapLat) || -33.8688, parseFloat(mapLng) || 151.2093]} />
                {mapLat && mapLng && (
                  <>
                    <Marker position={[parseFloat(mapLat), parseFloat(mapLng)]} />
                    <Circle
                      center={[parseFloat(mapLat), parseFloat(mapLng)]}
                      radius={parseInt(radius) || 100}
                      pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.08, weight: 1 }}
                    />
                    <Polygon
                      positions={getGeofencePolygonPoints(parseFloat(mapLat), parseFloat(mapLng), parseInt(radius) || 100)}
                      pathOptions={{ color: '#6366f1', fillColor: 'transparent', dashArray: '8, 6', weight: 2 }}
                    />
                  </>
                )}
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
        <div className={`glass-card rounded-3xl p-6 md:p-8 mb-8 transition-all duration-300 border border-slate-200/80 shadow-[0_15px_30px_-10px_rgba(15,23,42,0.08)] ${
          editingId ? "ring-2 ring-blue-500/20 bg-blue-50/10" : "ring-1 ring-slate-200/50 bg-white/70"
        }`}>
          <h2 className="text-xl font-extrabold mb-6 text-slate-800 tracking-tight flex items-center gap-2">
            {editingId ? (
              <>
                <span className="p-2 rounded-xl bg-blue-50 text-blue-600"><FaPen className="text-sm" /></span>
                <span>Edit Shift Location</span>
              </>
            ) : (
              <>
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600"><FaMapMarkerAlt className="text-sm" /></span>
                <span>Add Shift Location</span>
              </>
            )}
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Place Name</label>
              <input type="text" placeholder="e.g. Koyambedu" value={placeName}
                onChange={(e) => { setPlaceName(e.target.value); setErrors((p) => ({ ...p, placeName: "" })); }}
                className={`w-full h-11 border px-3 rounded-xl focus:outline-none focus:ring-4 transition text-xs bg-slate-50/50 hover:bg-slate-50 focus:bg-white ${
                  errors.placeName ? "border-red-400 focus:ring-red-500/10 focus:border-red-500" : "border-slate-200 focus:ring-emerald-500/10 focus:border-emerald-600"
                }`} />
              {errors.placeName && <p className="text-red-500 text-xs mt-1.5 font-semibold">⚠️ {errors.placeName}</p>}
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Latitude</label>
              <div className="flex gap-2">
                <input type="text" placeholder="-33.8688" value={latitude}
                  onChange={(e) => handleLocationInput(e.target.value, true)}
                  className={`flex-1 w-full h-11 border px-3 rounded-xl focus:outline-none focus:ring-4 transition text-xs bg-slate-50/50 hover:bg-slate-50 focus:bg-white ${
                    errors.latitude ? "border-red-400 focus:ring-red-500/10 focus:border-red-500" : "border-slate-200 focus:ring-emerald-500/10 focus:border-emerald-600"
                  }`} />
                <button onClick={() => { setMapLat(latitude || "-33.8688"); setMapLng(longitude || "151.2093"); setShowMap(true); }} 
                  className="h-11 px-4 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition text-xs font-bold whitespace-nowrap flex items-center gap-1.5 border border-blue-200/50">
                  <FaCompass className="text-xs" />
                  <span>Pick on Map</span>
                </button>
              </div>
              {errors.latitude && <p className="text-red-500 text-xs mt-1.5 font-semibold">⚠️ {errors.latitude}</p>}
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Longitude</label>
              <input type="text" placeholder="80.2707" value={longitude}
                onChange={(e) => handleLocationInput(e.target.value, false)}
                className={`w-full h-11 border px-3 rounded-xl focus:outline-none focus:ring-4 transition text-xs bg-slate-50/50 hover:bg-slate-50 focus:bg-white ${
                  errors.longitude ? "border-red-400 focus:ring-red-500/10 focus:border-red-500" : "border-slate-200 focus:ring-emerald-500/10 focus:border-emerald-600"
                }`} />
              {errors.longitude && <p className="text-red-500 text-xs mt-1.5 font-semibold">⚠️ {errors.longitude}</p>}
              <button 
                onClick={getCurrentLocation}
                disabled={locLoading}
                className="mt-2.5 text-xs text-blue-655 hover:text-blue-700 font-bold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition hover:underline"
              >
                {locLoading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Getting Location...</span>
                  </>
                ) : (
                  <>
                    <FaCrosshairs className="text-xs text-blue-650" />
                    <span>Use My Location</span>
                  </>
                )}
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Radius (meters)</label>
              <input type="number" min="10" placeholder="100" value={radius}
                onChange={(e) => { setRadius(e.target.value); setErrors((p) => ({ ...p, radius: "" })); }}
                className={`w-full h-11 border px-3 rounded-xl focus:outline-none focus:ring-4 transition text-xs bg-slate-50/50 hover:bg-slate-50 focus:bg-white ${
                  errors.radius ? "border-red-400 focus:ring-red-500/10 focus:border-red-500" : "border-slate-200 focus:ring-emerald-500/10 focus:border-emerald-600"
                }`} />
              {errors.radius && <p className="text-red-500 text-xs mt-1.5 font-semibold">⚠️ {errors.radius}</p>}
            </div>
          </div>
          <div className="flex gap-3 mt-6 pt-5 border-t border-slate-150">
            <button onClick={saveLocation} disabled={loading}
              className={`px-5 py-2.5 rounded-xl text-white font-bold text-xs transition-all duration-300 shadow-md flex items-center gap-1.5 ${
                loading 
                  ? "bg-slate-350 cursor-not-allowed" 
                  : editingId 
                    ? "bg-blue-600 hover:bg-blue-700 shadow-blue-150" 
                    : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-150"
              }`}>
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <FaCheck className="text-xs" />
                  <span>{editingId ? "Update Location" : "Add Location"}</span>
                </>
              )}
            </button>
            {editingId && (
              <button onClick={cancelEdit} disabled={loading}
                className="px-5 py-2.5 rounded-xl border border-slate-205 text-slate-600 hover:bg-slate-50 transition text-sm font-semibold flex items-center gap-1.5">
                <FaTimes className="text-xs" />
                <span>Cancel</span>
              </button>
            )}
          </div>
        </div>

        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto hidden md:block">
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
                  <tr><td colSpan={5} className="p-8 text-center text-gray-400">No shift locations set.</td></tr>
                ) : locations.map((loc) => (
                  <tr key={loc.id} className="border-b hover:bg-gray-50 transition">
                    <td className="p-4 font-medium">{loc.place_name}</td>
                    <td className="p-4 text-gray-500">{loc.latitude}</td>
                    <td className="p-4 text-gray-500">{loc.longitude}</td>
                    <td className="p-4">{loc.radius_meters}m</td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit(loc)}
                          className="bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1">
                          <FaPen className="text-[10px]" />
                          <span>Edit</span>
                        </button>
                        <button onClick={() => deleteLocation(loc.id)}
                          className="bg-red-50 hover:bg-red-600 text-red-700 hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1">
                          <FaTrashAlt className="text-[10px]" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list view */}
          <div className="block md:hidden divide-y divide-gray-100">
            {locations.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No shift locations set.</div>
            ) : (
              locations.map((loc) => (
                <div key={loc.id} className="p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-gray-800 text-sm">📍 {loc.place_name}</h4>
                    <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full">Radius: {loc.radius_meters}m</span>
                  </div>
                  <div className="text-xs text-gray-505 space-y-1">
                    <p><span className="font-semibold text-gray-400">Latitude:</span> {loc.latitude}</p>
                    <p><span className="font-semibold text-gray-400">Longitude:</span> {loc.longitude}</p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => handleEdit(loc)}
                      className="bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1">
                      <FaPen className="text-[9px]" />
                      <span>Edit</span>
                    </button>
                    <button onClick={() => deleteLocation(loc.id)}
                      className="bg-red-50 hover:bg-red-650 text-red-700 hover:text-white px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1">
                      <FaTrashAlt className="text-[9px]" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default DutyLocations;
