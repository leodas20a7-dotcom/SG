import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import ConfirmModal from "./ConfirmModal";

const STATUS_OPTIONS = ["Active", "Inactive"];

/* ── helper: post a circular notification ── */
async function postCircular(title, content) {
  await supabase.from("circulars").insert([{ title, content }]);
}

function Guards({ onGuardAdded }) {
  const [guards, setGuards] = useState([]);
  const [locations, setLocations] = useState([]);

  // Core fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [site, setSite] = useState("");
  const [status, setStatus] = useState("Active");
  const [dutyLocationId, setDutyLocationId] = useState("");

  // Temporary location override
  const [tempLocationId, setTempLocationId] = useState("");
  const [tempFrom, setTempFrom] = useState("");
  const [tempTo, setTempTo] = useState("");

  // Login credentials
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [prevDutyLocationId, setPrevDutyLocationId] = useState(null); // track if location changed
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const { showToast, ToastContainer } = useToast();

  /* ── validation ── */
  function validate() {
    const errs = {};
    if (!name.trim()) errs.name = "Guard name is required";
    else if (name.trim().length < 2) errs.name = "Name must be at least 2 characters";
    else if (!/^[a-zA-Z\s]+$/.test(name.trim())) errs.name = "Name should only contain letters";
    if (!phone.trim()) errs.phone = "Phone number is required";
    else if (!/^\d{10}$/.test(phone.trim())) errs.phone = "Enter a valid 10-digit number";
    if (!site.trim()) errs.site = "Site is required";
    else if (site.trim().length < 2) errs.site = "Site must be at least 2 characters";

    // Temp location: if any temp field set, all must be set
    if (tempLocationId || tempFrom || tempTo) {
      if (!tempLocationId) errs.tempLocationId = "Select a temp location";
      if (!tempFrom) errs.tempFrom = "Start date required";
      if (!tempTo) errs.tempTo = "End date required";
      if (tempFrom && tempTo && tempFrom > tempTo) errs.tempTo = "End must be after start";
    }

    if (!editingId) {
      if (email.trim()) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email";
        if (!password) errs.password = "Password required";
        else if (password.length < 6) errs.password = "Min 6 characters";
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  /* ── fetch ── */
  async function fetchGuards() {
    try {
      const { data, error } = await supabase
        .from("guards")
        .select(`
          *,
          duty_location:duty_locations!duty_location_id(place_name),
          profiles(email),
          temp_duty_location:duty_locations!temp_location_id(place_name)
        `)
        .order("id", { ascending: true });
      if (error) {
        showToast(`Could not load guards: ${error.message}`, "error");
      } else {
        setGuards(data || []);
      }
    } catch (err) {
      showToast(`Network error: ${err?.message}`, "error");
    }
  }

  async function fetchLocations() {
    try {
      const { data } = await supabase.from("duty_locations").select("*").order("place_name");
      setLocations(data || []);
    } catch { /* ignore */ }
  }

  /* ── add guard ── */
  async function addGuard() {
    if (!validate()) return;
    setLoading(true);
    try {
      let authUserId = null;
      if (email.trim() && password) {
        const { data: { session: saved } } = await supabase.auth.getSession();
        const { data: authData, error: authErr } = await supabase.auth.signUp({ email: email.trim(), password });
        if (authErr) { showToast(`Auth Error: ${authErr.message}`, "error"); setLoading(false); return; }
        if (saved) {
          const { error: sessionErr } = await supabase.auth.setSession({ access_token: saved.access_token, refresh_token: saved.refresh_token });
          if (sessionErr) showToast("Session issue, please re-login.", "error");
        }
        authUserId = authData.user?.id;
        if (authUserId) {
          await supabase.from("profiles").insert([{ id: authUserId, full_name: name.trim(), email: email.trim(), role: "guard" }]);
        }
      }

      const { error } = await supabase.from("guards").insert([{
        name: name.trim(), phone: phone.trim(), site: site.trim(),
        status: status || "Active",
        duty_location_id: dutyLocationId || null,
        temp_location_id: tempLocationId || null,
        temp_location_from: tempFrom || null,
        temp_location_to: tempTo || null,
        auth_user_id: authUserId,
        email: email.trim() || null,
      }]);

      if (error) {
        showToast(error.message.includes("duplicate") ? "Guard already exists." : "Could not add guard.", "error");
        return;
      }

      // Auto-notify if temp location set
      if (tempLocationId && tempFrom && tempTo) {
        const locName = locations.find(l => l.id === parseInt(tempLocationId))?.place_name || "another location";
        await postCircular(
          `Temporary Duty Assignment – ${name.trim()}`,
          `Guard ${name.trim()} is temporarily assigned to ${locName} from ${tempFrom} to ${tempTo}.`
        );
      }

      showToast("Guard added successfully!", "success");
      resetForm();
      fetchGuards();
      if (onGuardAdded) onGuardAdded();
    } catch {
      showToast("Network error.", "error");
    } finally {
      setLoading(false);
    }
  }

  /* ── start edit ── */
  function startEdit(guard) {
    setEditingId(guard.id);
    setPrevDutyLocationId(guard.duty_location_id || null);
    setName(guard.name);
    setPhone(guard.phone);
    setSite(guard.site);
    setStatus(guard.status);
    setDutyLocationId(guard.duty_location_id || "");
    setTempLocationId(guard.temp_location_id ? String(guard.temp_location_id) : "");
    setTempFrom(guard.temp_location_from || "");
    setTempTo(guard.temp_location_to || "");
    const resolvedEmail = guard.email || guard.profiles?.email || "";
    setEmail(resolvedEmail);
    setPassword("");
    setErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    resetForm();
  }

  function resetForm() {
    setName(""); setPhone(""); setSite(""); setStatus("Active");
    setDutyLocationId(""); setTempLocationId(""); setTempFrom(""); setTempTo("");
    setEmail(""); setPassword("");
    setPrevDutyLocationId(null);
    setErrors({});
  }

  /* ── update guard ── */
  async function updateGuard() {
    if (!validate()) return;
    setLoading(true);
    try {
      const { data: currentGuard } = await supabase.from("guards").select("*").eq("id", editingId).single();
      let authUserId = currentGuard?.auth_user_id;

      // Create auth account if credentials added for first time
      if (email.trim() && !authUserId && password) {
        const { data: { session: saved } } = await supabase.auth.getSession();
        const { data: authData, error: authErr } = await supabase.auth.signUp({ email: email.trim(), password });
        if (!authErr && authData.user) {
          authUserId = authData.user.id;
          await supabase.from("profiles").insert([{ id: authUserId, full_name: name.trim(), email: email.trim(), role: "guard" }]);
        }
        if (saved) {
          const { error: sessionErr } = await supabase.auth.setSession({ access_token: saved.access_token, refresh_token: saved.refresh_token });
          if (sessionErr) showToast("Session issue, please re-login.", "error");
        }
      }

      const { error } = await supabase.from("guards").update({
        name: name.trim(), phone: phone.trim(), site: site.trim(), status,
        duty_location_id: dutyLocationId || null,
        temp_location_id: tempLocationId || null,
        temp_location_from: tempFrom || null,
        temp_location_to: tempTo || null,
        email: email.trim() || null,
        auth_user_id: authUserId,
      }).eq("id", editingId);

      if (error) { showToast("Could not update guard.", "error"); return; }

      // ── Auto-circular: primary location changed ──
      const newLocId = dutyLocationId ? parseInt(dutyLocationId) : null;
      if (newLocId !== prevDutyLocationId) {
        const locName = locations.find(l => l.id === newLocId)?.place_name || "a new location";
        await postCircular(
          `Duty Location Update – ${name.trim()}`,
          `Guard ${name.trim()}'s permanent duty location has been updated to: ${locName}.`
        );
      }

      // ── Auto-circular: temp location set or changed ──
      const prevTemp = currentGuard?.temp_location_id ? String(currentGuard.temp_location_id) : "";
      const prevFrom = currentGuard?.temp_location_from || "";
      const prevToVal = currentGuard?.temp_location_to || "";
      const tempChanged = tempLocationId !== prevTemp || tempFrom !== prevFrom || tempTo !== prevToVal;

      if (tempLocationId && tempFrom && tempTo && tempChanged) {
        const locName = locations.find(l => l.id === parseInt(tempLocationId))?.place_name || "a temporary location";
        await postCircular(
          `Temporary Location Update – ${name.trim()}`,
          `Guard ${name.trim()} is temporarily assigned to ${locName}\nFrom: ${tempFrom}  →  To: ${tempTo}\nAttendance will be calculated at the temporary location during this period.`
        );
      }

      showToast("Guard updated!", "success");
      cancelEdit();
      fetchGuards();
      if (onGuardAdded) onGuardAdded();
    } catch {
      showToast("Network error.", "error");
    } finally {
      setLoading(false);
    }
  }

  /* ── delete ── */
  async function deleteGuard(id) {
    try {
      const { error } = await supabase.from("guards").delete().eq("id", id);
      if (error) { showToast("Could not delete guard.", "error"); return; }
      showToast("Guard deleted.", "success");
      fetchGuards();
      if (onGuardAdded) onGuardAdded();
    } catch {
      showToast("Network error.", "error");
    }
  }

  useEffect(() => { fetchGuards(); fetchLocations(); }, []);
  function clearError(field) { setErrors(prev => ({ ...prev, [field]: "" })); }

  /* ── effective location for display ── */
  function effectiveLocation(guard) {
    const today = new Date().toISOString().split("T")[0];
    if (
      guard.temp_location_id &&
      guard.temp_location_from && guard.temp_location_to &&
      today >= guard.temp_location_from && today <= guard.temp_location_to
    ) {
      return { name: guard.temp_duty_location?.place_name || "Temp", isTemp: true };
    }
    return { name: guard.duty_location?.place_name || "—", isTemp: false };
  }

  /* ══ RENDER ══════════════════════════════════════════ */
  return (
    <>
      <ToastContainer />
      {confirmDelete && (
        <ConfirmModal
          message={`Delete "${confirmDelete.name}"?`}
          onConfirm={() => { deleteGuard(confirmDelete.id); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <div className="mt-4 space-y-8">
        {/* ─── ADD / EDIT FORM ─── */}
        <div className={`glass-card rounded-2xl p-6 transition ${editingId ? "ring-2 ring-blue-300" : "ring-1 ring-green-200"}`}>
          <h2 className="text-xl font-bold mb-6 text-gray-700">
            {editingId ? "✏️ Edit Guard Profile" : "➕ Add New Guard & Profile Login"}
          </h2>

          {/* Section: Personal details */}
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Personal Details</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Guard Name</label>
              <input type="text" placeholder="Full name" value={name}
                onChange={e => { setName(e.target.value); clearError("name"); }}
                className={`w-full h-11 border p-3 rounded-xl focus:outline-none focus:ring-2 transition ${errors.name ? "border-red-400 focus:ring-red-300" : "border-gray-200 focus:ring-blue-300"}`}
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Phone Number</label>
              <input type="text" placeholder="10-digit number" maxLength={10} value={phone}
                onChange={e => { setPhone(e.target.value.replace(/\D/g, "")); clearError("phone"); }}
                className={`w-full h-11 border p-3 rounded-xl focus:outline-none focus:ring-2 transition ${errors.phone ? "border-red-400 focus:ring-red-300" : "border-gray-200 focus:ring-blue-300"}`}
              />
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Site</label>
              <input type="text" placeholder="Site / Area" value={site}
                onChange={e => { setSite(e.target.value); clearError("site"); }}
                className={`w-full h-11 border p-3 rounded-xl focus:outline-none focus:ring-2 transition ${errors.site ? "border-red-400 focus:ring-red-300" : "border-gray-200 focus:ring-blue-300"}`}
              />
              {errors.site && <p className="text-red-500 text-xs mt-1">{errors.site}</p>}
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="w-full h-11 border border-gray-200 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Section: Duty Location */}
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Duty Location</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
            {/* Primary fixed location */}
            <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4">
              <p className="text-xs font-bold text-blue-600 mb-2">🏠 Primary Location <span className="text-blue-400 font-normal">(Fixed — rarely changes)</span></p>
              <select value={dutyLocationId} onChange={e => { setDutyLocationId(e.target.value); clearError("dutyLocationId"); }}
                className="w-full h-11 border border-blue-200 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-sm">
                <option value="">Not assigned</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.place_name}</option>)}
              </select>
            </div>

            {/* Temporary override */}
            <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-4">
              <p className="text-xs font-bold text-amber-600 mb-2">⏱️ Temporary Override <span className="text-amber-400 font-normal">(For specific days only)</span></p>
              <select value={tempLocationId} onChange={e => { setTempLocationId(e.target.value); clearError("tempLocationId"); }}
                className={`w-full h-11 border p-3 rounded-xl focus:outline-none focus:ring-2 bg-white text-sm mb-2 ${errors.tempLocationId ? "border-red-400 focus:ring-red-300" : "border-amber-200 focus:ring-amber-300"}`}>
                <option value="">None</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.place_name}</option>)}
              </select>
              {tempLocationId && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-amber-600 font-medium">From</label>
                    <input type="date" value={tempFrom}
                      onChange={e => { setTempFrom(e.target.value); clearError("tempFrom"); }}
                      className={`w-full h-9 border p-2 rounded-lg text-sm focus:outline-none focus:ring-2 ${errors.tempFrom ? "border-red-400 focus:ring-red-300" : "border-amber-200 focus:ring-amber-300"}`}
                    />
                    {errors.tempFrom && <p className="text-red-500 text-xs mt-0.5">{errors.tempFrom}</p>}
                  </div>
                  <div>
                    <label className="text-xs text-amber-600 font-medium">To</label>
                    <input type="date" value={tempTo} min={tempFrom}
                      onChange={e => { setTempTo(e.target.value); clearError("tempTo"); }}
                      className={`w-full h-9 border p-2 rounded-lg text-sm focus:outline-none focus:ring-2 ${errors.tempTo ? "border-red-400 focus:ring-red-300" : "border-amber-200 focus:ring-amber-300"}`}
                    />
                    {errors.tempTo && <p className="text-red-500 text-xs mt-0.5">{errors.tempTo}</p>}
                  </div>
                </div>
              )}
              {!tempLocationId && <p className="text-xs text-amber-400 mt-1">Select a location to enable date range</p>}
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-6 flex items-center gap-1">
            <span>💡</span> Attendance will be calculated at the <strong>temporary location</strong> during the override period, then revert to primary automatically.
          </p>

          {/* Section: Login credentials */}
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Login Credentials</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Email {editingId && <span className="text-gray-400">(autofilled from profile)</span>}</label>
              <input type="email" placeholder="guard@example.com" value={email}
                onChange={e => { setEmail(e.target.value); clearError("email"); }}
                className={`w-full h-11 border p-3 rounded-xl focus:outline-none focus:ring-2 transition ${errors.email ? "border-red-400 focus:ring-red-300" : "border-gray-200 focus:ring-blue-300"}`}
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">
                Password {editingId && <span className="text-gray-400">(leave blank to keep current)</span>}
              </label>
              <input type="password" placeholder="Min 6 characters" value={password}
                onChange={e => { setPassword(e.target.value); clearError("password"); }}
                className={`w-full h-11 border p-3 rounded-xl focus:outline-none focus:ring-2 transition ${errors.password ? "border-red-400 focus:ring-red-300" : "border-gray-200 focus:ring-blue-300"}`}
              />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={editingId ? updateGuard : addGuard} disabled={loading}
              className={`px-8 py-3 rounded-xl text-white font-bold transition shadow-sm ${loading ? "bg-gray-300 cursor-not-allowed" : editingId ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"}`}>
              {loading ? "Saving…" : editingId ? "Update Guard" : "Onboard Guard"}
            </button>
            {editingId && (
              <button onClick={cancelEdit} className="px-6 py-3 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50 transition">Cancel</button>
            )}
          </div>
        </div>

        {/* ─── GUARDS TABLE ─── */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-800 text-lg">Guard Profiles ({guards.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b">
                  {["Name", "Phone", "Email", "Site", "Location", "Status", "Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-gray-500 font-semibold text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {guards.length === 0 ? (
                  <tr><td colSpan={7} className="p-10 text-center text-gray-400">No guards found.</td></tr>
                ) : guards.map(guard => {
                  const eff = effectiveLocation(guard);
                  return (
                    <tr key={guard.id} className="border-b hover:bg-gray-50/60 transition">
                      <td className="px-4 py-3 font-semibold text-gray-800">{guard.name}</td>
                      <td className="px-4 py-3 text-gray-600">{guard.phone}</td>
                      <td className="px-4 py-3 text-gray-500">{guard.email || guard.profiles?.email || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{guard.site}</td>
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium text-gray-700">{eff.name}</span>
                          {eff.isTemp && (
                            <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">TEMP</span>
                          )}
                        </div>
                        {guard.temp_location_id && !eff.isTemp && (
                          <p className="text-xs text-amber-600 mt-0.5">
                            Temp: {guard.temp_duty_location?.place_name} ({guard.temp_location_from} → {guard.temp_location_to})
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${guard.status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {guard.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(guard)}
                            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition">Edit</button>
                          <button onClick={() => setConfirmDelete({ id: guard.id, name: guard.name })}
                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition">Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

export default Guards;
