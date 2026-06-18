import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import ConfirmModal from "./ConfirmModal";
import LoadingOverlay from "./LoadingOverlay";
import PhoneInputRaw from 'react-phone-input-2';
const PhoneInput = PhoneInputRaw.default ? PhoneInputRaw.default : PhoneInputRaw;
import 'react-phone-input-2/lib/style.css';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import CustomSelect from "./CustomSelect";

const STATUS_OPTIONS = ["Active", "Inactive"];
const SHIFT_OPTIONS = ["Morning Shift", "Evening Shift", "Night Shift", "Full Day", "Custom"];
const DEFAULT_TIMINGS = {
  "Morning Shift": { start: "06:00:00", startSimple: "06:00", end: "14:00:00", endSimple: "14:00" },
  "Evening Shift": { start: "14:00:00", startSimple: "14:00", end: "22:00:00", endSimple: "22:00" },
  "Night Shift": { start: "22:00:00", startSimple: "22:00", end: "06:00:00", endSimple: "06:00" },
  "Full Day": { start: "08:00:00", startSimple: "08:00", end: "20:00:00", endSimple: "20:00" },
};

/* ── helper: post a circular notification ── */
async function autoNotify(title, message, guardId = null, isBroadcast = false) {
  await supabase.from("notifications").insert([{ title, message, guard_id: guardId, is_broadcast: isBroadcast, type: "info", user_role: "guard" }]);
}

function Guards({ onGuardAdded }) {
  const [guards, setGuards] = useState([]);
  const [locations, setLocations] = useState([]);

  // Wizard Step State
  const [currentStep, setCurrentStep] = useState(1);

  // Active guard for Temporary Override Modal
  const [overrideGuard, setOverrideGuard] = useState(null);
  const [selectedShiftGuard, setSelectedShiftGuard] = useState(null);

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

  // Shift fields
  const [shiftName, setShiftName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [tempShiftName, setTempShiftName] = useState("");
  const [tempStartTime, setTempStartTime] = useState("");
  const [tempEndTime, setTempEndTime] = useState("");

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
  function validateStep1() {
    const errs = {};
    if (!name.trim()) errs.name = "Guard name is required";
    else if (name.trim().length < 2) errs.name = "Name must be at least 2 characters";
    else if (!/^[a-zA-Z\s]+$/.test(name.trim())) errs.name = "Name should only contain letters";
    if (!phone) errs.phone = "Phone number is required";
    else {
      const phoneNumber = parsePhoneNumberFromString(phone.startsWith('+') ? phone : '+' + phone);
      if (!phoneNumber || !phoneNumber.isValid()) {
        errs.phone = "Enter a valid international phone number";
      }
    }
    if (!site.trim()) errs.site = "Site is required";
    else if (site.trim().length < 2) errs.site = "Site must be at least 2 characters";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateStep3() {
    const errs = {};
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

  function validate() {
    const errs = {};
    if (!name.trim()) errs.name = "Guard name is required";
    if (!phone) errs.phone = "Phone number is required";
    else {
      const phoneNumber = parsePhoneNumberFromString(phone.startsWith('+') ? phone : '+' + phone);
      if (!phoneNumber || !phoneNumber.isValid()) {
        errs.phone = "Enter a valid international phone number";
      }
    }
    if (!site.trim()) errs.site = "Site is required";
    if (!editingId && email.trim() && !password) errs.password = "Password required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSaveTempOverride(guardId, data) {
    setLoading(true);
    try {
      const { tempLocationId, tempFrom, tempTo, tempShiftName, tempStartTime, tempEndTime } = data;

      // Update guard record
      const { error: guardErr } = await supabase
        .from("guards")
        .update({
          temp_location_id: tempLocationId || null,
          temp_location_from: tempFrom || null,
          temp_location_to: tempTo || null,
        })
        .eq("id", guardId);

      if (guardErr) {
        showToast("Error updating temporary location.", "error");
        setLoading(false);
        return;
      }

      // Delete existing temporary shifts for this guard in the range
      if (tempFrom && tempTo) {
        await supabase
          .from("shifts")
          .delete()
          .eq("guard_id", guardId)
          .gte("shift_date", tempFrom)
          .lte("shift_date", tempTo);

        // If a shift name is specified, insert the temp shifts
        if (tempShiftName) {
          let start = new Date(tempFrom);
          let end = new Date(tempTo);
          let dateList = [];
          while (start <= end) {
            dateList.push(start.toISOString().split("T")[0]);
            start.setDate(start.getDate() + 1);
          }

          const overridePayloads = dateList.map(d => ({
            guard_id: guardId,
            site: overrideGuard.site || "",
            shift_name: tempShiftName,
            start_time: tempStartTime || null,
            end_time: tempEndTime || null,
            shift_date: d
          }));

          if (overridePayloads.length > 0) {
            await supabase.from("shifts").insert(overridePayloads);
          }
        }
      }

      // Notify
      if (tempLocationId && tempFrom && tempTo) {
        const locName = locations.find(l => String(l.id) === String(tempLocationId))?.place_name || "a temporary location";
        await autoNotify(
          `Temporary Assignment Update – ${overrideGuard.name}`,
          `Guard ${overrideGuard.name} has been assigned to ${locName} from ${tempFrom} to ${tempTo}.`,
          guardId
        );
      }

      showToast("Temporary override updated successfully!", "success");
      setOverrideGuard(null);
      fetchGuards();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleClearTempOverride(guardId) {
    setLoading(true);
    try {
      // Clear guard record override fields
      const { error: guardErr } = await supabase
        .from("guards")
        .update({
          temp_location_id: null,
          temp_location_from: null,
          temp_location_to: null,
        })
        .eq("id", guardId);

      if (guardErr) {
        showToast("Error clearing override.", "error");
        setLoading(false);
        return;
      }

      showToast("Temporary override cleared!", "success");
      setOverrideGuard(null);
      fetchGuards();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  /* ── fetch ── */
  async function fetchGuards() {
    try {
      const { data: guardsData, error } = await supabase
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
        return;
      }

      const { data: shiftsData } = await supabase
        .from("shifts")
        .select("*");

      const mapped = (guardsData || []).map(guard => {
        const guardShifts = (shiftsData || []).filter(s => s.guard_id === guard.id);
        const constantShift = guardShifts.find(s => s.shift_date === null);
        const tempShifts = guardShifts.filter(s => s.shift_date !== null);
        return {
          ...guard,
          constantShift,
          tempShifts
        };
      });

      setGuards(mapped);
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

      const { data: insertData, error } = await supabase.from("guards").insert([{
        name: name.trim(), phone: phone.startsWith('+') ? phone : '+' + phone, site: site.trim(),
        status: status || "Active",
        duty_location_id: dutyLocationId || null,
        temp_location_id: tempLocationId || null,
        temp_location_from: tempFrom || null,
        temp_location_to: tempTo || null,
        auth_user_id: authUserId,
        email: email.trim() || null,
      }]).select();

      if (error) {
        showToast(error.message.includes("duplicate") ? "Guard already exists." : "Could not add guard.", "error");
        return;
      }

      const guardId = insertData[0]?.id;

      // Save Constant Shift
      if (guardId && shiftName) {
        await supabase.from("shifts").insert([{
          guard_id: guardId,
          site: site.trim(),
          shift_name: shiftName,
          start_time: startTime || null,
          end_time: endTime || null,
          shift_date: null
        }]);
      }

      // Save Temporary Shift Override
      if (guardId && tempFrom && tempTo && tempShiftName) {
        let start = new Date(tempFrom);
        let end = new Date(tempTo);
        let dateList = [];
        while (start <= end) {
          dateList.push(start.toISOString().split("T")[0]);
          start.setDate(start.getDate() + 1);
        }

        const overridePayloads = dateList.map(d => ({
          guard_id: guardId,
          site: site.trim(),
          shift_name: tempShiftName,
          start_time: tempStartTime || null,
          end_time: tempEndTime || null,
          shift_date: d
        }));

        if (overridePayloads.length > 0) {
          await supabase.from("shifts").insert(overridePayloads);
        }
      }

      // Auto-notify if temp location set
      if (tempLocationId && tempFrom && tempTo) {
        const locName = locations.find(l => l.id === parseInt(tempLocationId))?.place_name || "another location";
        await autoNotify(
          `Temporary Duty Assignment – ${name.trim()}`,
          `Guard ${name.trim()} is temporarily assigned to ${locName} from ${tempFrom} to ${tempTo}.`,
          guardId
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
    setPhone(guard.phone || "");
    setSite(guard.site);
    setStatus(guard.status);
    setDutyLocationId(guard.duty_location_id || "");
    setTempLocationId(guard.temp_location_id ? String(guard.temp_location_id) : "");
    setTempFrom(guard.temp_location_from || "");
    setTempTo(guard.temp_location_to || "");
    const resolvedEmail = guard.email || guard.profiles?.email || "";
    setEmail(resolvedEmail);
    setPassword("");

    // Load Constant Shift details
    if (guard.constantShift) {
      setShiftName(guard.constantShift.shift_name || "");
      setStartTime(guard.constantShift.start_time || "");
      setEndTime(guard.constantShift.end_time || "");
    } else {
      setShiftName("");
      setStartTime("");
      setEndTime("");
    }

    // Load Temporary Shift details
    if (guard.tempShifts && guard.tempShifts.length > 0) {
      const tShift = guard.tempShifts[0];
      setTempShiftName(tShift.shift_name || "");
      setTempStartTime(tShift.start_time || "");
      setTempEndTime(tShift.end_time || "");
    } else {
      setTempShiftName("");
      setTempStartTime("");
      setTempEndTime("");
    }

    setErrors({});
    setCurrentStep(1);
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
    setShiftName(""); setStartTime(""); setEndTime("");
    setTempShiftName(""); setTempStartTime(""); setTempEndTime("");
    setCurrentStep(1);
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
        name: name.trim(), phone: phone.startsWith('+') ? phone : '+' + phone, site: site.trim(), status,
        duty_location_id: dutyLocationId || null,
        temp_location_id: tempLocationId || null,
        temp_location_from: tempFrom || null,
        temp_location_to: tempTo || null,
        email: email.trim() || null,
        auth_user_id: authUserId,
      }).eq("id", editingId);

      if (error) { showToast("Could not update guard.", "error"); return; }

      // Save/Update Constant Shift
      if (shiftName) {
        const { data: existingConstant } = await supabase
          .from("shifts")
          .select("id")
          .eq("guard_id", editingId)
          .is("shift_date", null)
          .maybeSingle();

        const shiftPayload = {
          guard_id: editingId,
          site: site.trim(),
          shift_name: shiftName,
          start_time: startTime || null,
          end_time: endTime || null,
          shift_date: null
        };

        if (existingConstant?.id) {
          await supabase.from("shifts").update(shiftPayload).eq("id", existingConstant.id);
        } else {
          await supabase.from("shifts").insert([shiftPayload]);
        }
      }

      // Save/Update Temporary Shift Override
      if (tempFrom && tempTo && tempShiftName) {
        await supabase
          .from("shifts")
          .delete()
          .eq("guard_id", editingId)
          .gte("shift_date", tempFrom)
          .lte("shift_date", tempTo);

        let start = new Date(tempFrom);
        let end = new Date(tempTo);
        let dateList = [];
        while (start <= end) {
          dateList.push(start.toISOString().split("T")[0]);
          start.setDate(start.getDate() + 1);
        }

        const overridePayloads = dateList.map(d => ({
          guard_id: editingId,
          site: site.trim(),
          shift_name: tempShiftName,
          start_time: tempStartTime || null,
          end_time: tempEndTime || null,
          shift_date: d
        }));

        if (overridePayloads.length > 0) {
          await supabase.from("shifts").insert(overridePayloads);
        }
      }

      // ── Auto-circular: primary location changed ──
      const newLocId = dutyLocationId ? parseInt(dutyLocationId) : null;
      if (newLocId !== prevDutyLocationId) {
        const locName = locations.find(l => l.id === newLocId)?.place_name || "a new location";
        await autoNotify(
          `Duty Location Update – ${name.trim()}`,
          `Guard ${name.trim()}'s permanent duty location has been updated to: ${locName}.`,
          editingId
        );
      }

      // ── Auto-circular: temp location set or changed ──
      const prevTemp = currentGuard?.temp_location_id ? String(currentGuard.temp_location_id) : "";
      const prevFrom = currentGuard?.temp_location_from || "";
      const prevToVal = currentGuard?.temp_location_to || "";
      const tempChanged = tempLocationId !== prevTemp || tempFrom !== prevFrom || tempTo !== prevToVal;

      if (tempLocationId && tempFrom && tempTo && tempChanged) {
        const locName = locations.find(l => l.id === parseInt(tempLocationId))?.place_name || "a temporary location";
        await autoNotify(
          `Temporary Location Update – ${name.trim()}`,
          `Guard ${name.trim()} is temporarily assigned to ${locName}\nFrom: ${tempFrom}  →  To: ${tempTo}\nAttendance will be calculated at the temporary location during this period.`,
          editingId
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
      // Get auth user id to delete profile later
      const { data: guardData } = await supabase.from("guards").select("auth_user_id").eq("id", id).maybeSingle();

      // Delete all related records first
      await Promise.all([
        supabase.from("attendance").delete().eq("guard_id", id),
        supabase.from("circulars").delete().eq("guard_id", id),
        supabase.from("incidents").delete().eq("guard_id", id),
        supabase.from("shifts").delete().eq("guard_id", id),
        supabase.from("live_tracking").delete().eq("guard_id", id),
        supabase.from("notifications").delete().eq("guard_id", id),
        supabase.from("attendance_requests").delete().eq("guard_id", id),
      ]);

      const { error } = await supabase.from("guards").delete().eq("id", id);
      if (error) { showToast("Could not delete guard.", "error"); return; }

      // Delete profile to revoke access
      if (guardData?.auth_user_id) {
        await supabase.from("profiles").delete().eq("id", guardData.auth_user_id);
      }

      showToast("Guard and related data deleted.", "success");
      fetchGuards();
      if (onGuardAdded) onGuardAdded();
    } catch (err) {
      console.error(err);
      showToast("Network error or constraint failed.", "error");
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
      {loading && <LoadingOverlay message="Saving guard details..." />}
      {confirmDelete && (
        <ConfirmModal
          message={`Delete "${confirmDelete.name}"?`}
          onConfirm={() => { deleteGuard(confirmDelete.id); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {overrideGuard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-[500px] shadow-2xl border border-gray-150 max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-800">⏱️ Temporary Assignment</h2>
              <button onClick={() => setOverrideGuard(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <p className="text-gray-500 text-sm mb-4">Set temporary shift and location override details for <strong>{overrideGuard.name}</strong>.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-amber-700 mb-1">Temporary Duty Location</label>
                <CustomSelect
                  value={tempLocationId}
                  onChange={val => setTempLocationId(val)}
                  options={[
                    { value: "", label: "None (Keep Primary Location)" },
                    ...locations.map(l => ({ value: String(l.id), label: l.place_name }))
                  ]}
                  placeholder="None (Keep Primary Location)"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-amber-700 mb-1">From Date</label>
                  <input type="date" value={tempFrom} onChange={e => setTempFrom(e.target.value)}
                    className="w-full h-10 border border-amber-200 p-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-700 mb-1">To Date</label>
                  <input type="date" value={tempTo} min={tempFrom} onChange={e => setTempTo(e.target.value)}
                    className="w-full h-10 border border-amber-200 p-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white" />
                </div>
              </div>

              {/* Quick selection options */}
              <div className="flex gap-2">
                <button type="button" onClick={() => {
                  const today = new Date().toISOString().split("T")[0];
                  setTempFrom(today);
                  setTempTo(today);
                }} className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200/50 rounded-lg text-xs font-bold hover:bg-amber-100 transition">
                  Today Only
                </button>
                <button type="button" onClick={() => {
                  const today = new Date();
                  const tomorrow = new Date();
                  tomorrow.setDate(today.getDate() + 1);
                  setTempFrom(tomorrow.toISOString().split("T")[0]);
                  setTempTo(tomorrow.toISOString().split("T")[0]);
                }} className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200/50 rounded-lg text-xs font-bold hover:bg-amber-100 transition">
                  Tomorrow Only
                </button>
                <button type="button" onClick={() => {
                  const start = new Date();
                  const end = new Date();
                  end.setDate(start.getDate() + 2); // 3 days total (today, tmr, day after)
                  setTempFrom(start.toISOString().split("T")[0]);
                  setTempTo(end.toISOString().split("T")[0]);
                }} className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200/50 rounded-lg text-xs font-bold hover:bg-amber-100 transition">
                  Next 3 Days
                </button>
              </div>

              <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-4 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-amber-700 mb-1">Temporary Shift Type</label>
                  <CustomSelect
                    value={tempShiftName}
                    onChange={val => {
                      setTempShiftName(val);
                      const defaultTime = DEFAULT_TIMINGS[val];
                      if (defaultTime) {
                        setTempStartTime(defaultTime.startSimple);
                        setTempEndTime(defaultTime.endSimple);
                      }
                    }}
                    options={[
                      { value: "", label: "Select Temp Shift" },
                      ...SHIFT_OPTIONS.map(s => ({ value: s, label: s }))
                    ]}
                    placeholder="Select Temp Shift"
                    className="mb-2"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-amber-600 font-bold">Start Time</label>
                      <input type="time" value={tempStartTime} onChange={e => setTempStartTime(e.target.value)}
                        className="w-full h-9 border border-amber-200 p-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white" />
                    </div>
                    <div>
                      <label className="text-[10px] text-amber-600 font-bold">End Time</label>
                      <input type="time" value={tempEndTime} onChange={e => setTempEndTime(e.target.value)}
                        className="w-full h-9 border border-amber-200 p-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-gray-100">
              {overrideGuard.temp_location_id && (
                <button type="button" onClick={() => handleClearTempOverride(overrideGuard.id)}
                  className="px-4 py-2 bg-red-50 text-red-650 border border-red-200 rounded-xl hover:bg-red-100 transition text-sm font-semibold mr-auto">
                  Clear Override
                </button>
              )}
              <button type="button" onClick={() => setOverrideGuard(null)}
                className="px-4 py-2 border border-gray-305 text-gray-600 rounded-xl hover:bg-gray-50 transition text-sm font-semibold">
                Cancel
              </button>
              <button type="button" onClick={() => handleSaveTempOverride(overrideGuard.id, {
                tempLocationId, tempFrom, tempTo, tempShiftName, tempStartTime, tempEndTime
              })}
                className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition text-sm font-bold shadow-md shadow-amber-200">
                Save Override
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedShiftGuard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-[450px] shadow-2xl border border-gray-150 max-h-[90vh] overflow-y-auto animate-fade-in mx-4">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-800">📅 Shift & Location Details</h2>
              <button onClick={() => setSelectedShiftGuard(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-450 font-bold uppercase tracking-wider">Guard Name</p>
                <p className="text-lg font-bold text-gray-800">{selectedShiftGuard.name}</p>
              </div>

              <div className="border-t border-gray-105 pt-3">
                <p className="text-xs text-indigo-500 font-bold uppercase tracking-wider mb-1.5">Today's Active Assignment</p>
                {(() => {
                  const eff = effectiveLocation(selectedShiftGuard);
                  const today = new Date().toISOString().split("T")[0];
                  const hasTempShift = selectedShiftGuard.tempShifts && selectedShiftGuard.tempShifts.length > 0 &&
                    selectedShiftGuard.temp_location_from && selectedShiftGuard.temp_location_to &&
                    today >= selectedShiftGuard.temp_location_from && today <= selectedShiftGuard.temp_location_to;

                  const activeShift = hasTempShift ? selectedShiftGuard.tempShifts[0] : selectedShiftGuard.constantShift;
                  return (
                    <div className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100/50">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-gray-805">{eff.name}</span>
                        {eff.isTemp && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">TEMP OVERRIDE</span>
                        )}
                      </div>
                      {activeShift ? (
                        <p className="text-sm text-indigo-650 font-semibold">
                          ⏰ {activeShift.shift_name} ({activeShift.start_time?.substring(0, 5) || "—"} - {activeShift.end_time?.substring(0, 5) || "—"})
                        </p>
                      ) : (
                        <p className="text-sm text-gray-400">No shift assigned</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 gap-3 border-t border-gray-105 pt-3">
                <div>
                  <p className="text-xs text-gray-450 font-bold uppercase tracking-wider mb-1">Constant Schedule</p>
                  <div className="bg-gray-50 rounded-xl p-3 text-sm">
                    <p className="font-semibold text-gray-700">Location: {selectedShiftGuard.duty_location?.place_name || "—"}</p>
                    {selectedShiftGuard.constantShift ? (
                      <p className="text-gray-650">Shift: {selectedShiftGuard.constantShift.shift_name} ({selectedShiftGuard.constantShift.start_time?.substring(0, 5) || "—"} - {selectedShiftGuard.constantShift.end_time?.substring(0, 5) || "—"})</p>
                    ) : (
                      <p className="text-gray-400">No constant shift</p>
                    )}
                  </div>
                </div>

                {selectedShiftGuard.temp_location_from && selectedShiftGuard.temp_location_to && (
                  <div>
                    <p className="text-xs text-amber-700 font-bold uppercase tracking-wider mb-1">Temporary Override</p>
                    <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 text-sm">
                      <p className="font-semibold text-amber-800">Location: {selectedShiftGuard.temp_duty_location?.place_name || "—"}</p>
                      {selectedShiftGuard.tempShifts && selectedShiftGuard.tempShifts.length > 0 ? (
                        <p className="text-amber-705 text-xs">Shift: {selectedShiftGuard.tempShifts[0].shift_name} ({selectedShiftGuard.tempShifts[0].start_time?.substring(0, 5) || "—"} - {selectedShiftGuard.tempShifts[0].end_time?.substring(0, 5) || "—"})</p>
                      ) : (
                        <p className="text-amber-600 text-xs">No temporary shift</p>
                      )}
                      <p className="text-[11px] text-amber-600 font-medium mt-1">
                        Validity: {selectedShiftGuard.temp_location_from} to {selectedShiftGuard.temp_location_to}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end mt-6 pt-4 border-t border-gray-100">
              <button type="button" onClick={() => setSelectedShiftGuard(null)}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition text-sm font-bold shadow-md shadow-indigo-150">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-8">
        {/* ─── ADD / EDIT FORM ─── */}
        <div className={`glass-card rounded-2xl p-6 transition ${editingId ? "ring-2 ring-blue-300" : "ring-1 ring-green-200"}`}>
          <h2 className="text-xl font-bold mb-6 text-gray-700">
            {editingId ? "✏️ Edit Guard Profile" : "➕ Add New Guard & Profile Login"}
          </h2>

          {/* Stepper progress indicator */}
          <div className="flex items-center gap-2 mb-6 border-b pb-4 border-gray-100 overflow-x-auto">
            {[
              { num: 1, name: "Personal Details", icon: "👤" },
              { num: 2, name: "Constant Assignment", icon: "🏠" },
              { num: 3, name: "Login Credentials", icon: "🔑" }
            ].map(step => (
              <div key={step.num} className="flex items-center gap-2 mr-4 shrink-0">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${currentStep === step.num
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-150"
                  : currentStep > step.num
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-gray-400"
                  }`}>
                  {currentStep > step.num ? "✓" : step.num}
                </span>
                <span className={`text-sm font-semibold transition ${currentStep === step.num ? "text-gray-800" : "text-gray-400"
                  }`}>
                  {step.icon} {step.name}
                </span>
                {step.num < 3 && <span className="text-gray-300 ml-2">➔</span>}
              </div>
            ))}
          </div>

          {/* Step 1: Personal details */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Personal Details</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <PhoneInput
                    country={'au'}
                    enableSearch={true}
                    value={phone}
                    onChange={v => { setPhone(v || ""); clearError("phone"); }}
                    inputStyle={{
                      width: '100%',
                      height: '44px',
                      borderRadius: '0.75rem',
                      borderColor: errors.phone ? '#f87171' : '#e5e7eb',
                      background: '#ffffff'
                    }}
                    buttonStyle={{
                      borderRadius: '0.75rem 0 0 0.75rem',
                      borderColor: errors.phone ? '#f87171' : '#e5e7eb',
                      background: '#f9fafb'
                    }}
                    dropdownStyle={{
                      width: '300px',
                      paddingLeft: '10px',
                      borderRadius: '0.75rem',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                      border: '1px solid #e5e7eb',
                      overflow: 'hidden',
                      paddingTop: '0px',
                      margin: '0px'
                    }}
                    searchStyle={{
                      width: '75%',
                      margin: '8px 5%',
                      padding: '8px 10px 8px 30px',
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db',
                      backgroundColor: '#f9fafb',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
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
                  <CustomSelect
                    value={status}
                    onChange={val => setStatus(val)}
                    options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))}
                    placeholder="Select Status"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Constant Assignment */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Constant Assignment</p>
              <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-6 space-y-4">
                <div>
                  <p className="text-sm font-bold text-blue-600 mb-1.5">🏠 Primary Fixed Location</p>
                  <CustomSelect
                    value={dutyLocationId}
                    onChange={val => { setDutyLocationId(val); clearError("dutyLocationId"); }}
                    options={[
                      { value: "", label: "Not assigned" },
                      ...locations.map(l => ({ value: String(l.id), label: l.place_name }))
                    ]}
                    placeholder="Not assigned"
                  />
                </div>

                <div>
                  <p className="text-sm font-bold text-blue-600 mb-1.5">⏰ Constant Shift Timing</p>
                  <CustomSelect
                    value={shiftName}
                    onChange={val => {
                      setShiftName(val);
                      const defaultTime = DEFAULT_TIMINGS[val];
                      if (defaultTime) {
                        setStartTime(defaultTime.startSimple);
                        setEndTime(defaultTime.endSimple);
                      }
                    }}
                    options={[
                      { value: "", label: "Select Constant Shift" },
                      ...SHIFT_OPTIONS.map(s => ({ value: s, label: s }))
                    ]}
                    placeholder="Select Constant Shift"
                  />
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <label className="text-xs text-blue-600 font-medium">Start Time</label>
                      <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                        className="w-full h-10 border border-blue-200 p-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white" />
                    </div>
                    <div>
                      <label className="text-xs text-blue-600 font-medium">End Time</label>
                      <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                        className="w-full h-10 border border-blue-200 p-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Login Credentials */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Login Credentials</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-100">
            <div className="flex gap-2">
              {currentStep > 1 && (
                <button type="button" onClick={() => setCurrentStep(currentStep - 1)}
                  className="px-5 py-2.5 rounded-xl border border-gray-350 text-gray-600 hover:bg-gray-50 transition text-sm font-semibold">
                  Back
                </button>
              )}
              {editingId && (
                <button type="button" onClick={cancelEdit}
                  className="px-5 py-2.5 rounded-xl border border-gray-300 text-red-600 hover:bg-red-50 transition text-sm font-semibold">
                  Cancel
                </button>
              )}
            </div>

            <div className="flex gap-2">
              {currentStep < 3 ? (
                <button type="button" onClick={() => {
                  if (currentStep === 1 && !validateStep1()) return;
                  setCurrentStep(currentStep + 1);
                }}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition text-sm shadow-md shadow-indigo-150">
                  Next Step ➔
                </button>
              ) : (
                <button type="button" onClick={editingId ? updateGuard : addGuard} disabled={loading}
                  className={`px-8 py-2.5 rounded-xl text-white font-bold transition shadow-md ${loading ? "bg-gray-300 cursor-not-allowed" : editingId ? "bg-blue-600 hover:bg-blue-700 shadow-blue-150" : "bg-green-600 hover:bg-green-700 shadow-green-150"}`}>
                  {loading ? "Saving…" : editingId ? "Save Changes" : "Onboard Guard"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ─── GUARDS TABLE ─── */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-800 text-lg">Guard Profiles ({guards.length})</h2>
          </div>
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full border-collapse text-sm min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b">
                  {["Name", "Phone", "Email", "Site", "Location & Shift", "Status", "Actions"].map(h => (
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
                        <button
                          type="button"
                          onClick={() => setSelectedShiftGuard(guard)}
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/50 px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap"
                        >
                          📅 View Details
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`status-chip status-chip-${guard.status.toLowerCase()}`}>
                          {guard.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => {
                            setOverrideGuard(guard);
                            setTempLocationId(guard.temp_location_id ? String(guard.temp_location_id) : "");
                            setTempFrom(guard.temp_location_from || "");
                            setTempTo(guard.temp_location_to || "");
                            if (guard.tempShifts && guard.tempShifts.length > 0) {
                              const tShift = guard.tempShifts[0];
                              setTempShiftName(tShift.shift_name || "");
                              setTempStartTime(tShift.start_time || "");
                              setTempEndTime(tShift.end_time || "");
                            } else {
                              setTempShiftName("");
                              setTempStartTime("");
                              setTempEndTime("");
                            }
                          }}
                            className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition text-nowrap">⏱️ Temp Override</button>
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

          {/* Mobile list view */}
          <div className="block md:hidden divide-y divide-gray-100">
            {guards.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No guards found.</div>
            ) : (
              guards.map(guard => {
                const eff = effectiveLocation(guard);
                return (
                  <div key={guard.id} className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-gray-800 text-sm">{guard.name}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">{guard.email || guard.profiles?.email || "No email"}</p>
                      </div>
                      <span className={`status-chip status-chip-${guard.status.toLowerCase()}`}>
                        {guard.status}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 bg-gray-50 p-2.5 rounded-xl">
                      <div>
                        <span className="font-semibold block text-gray-400">Phone:</span>
                        {guard.phone || "—"}
                      </div>
                      <div>
                        <span className="font-semibold block text-gray-400">Site:</span>
                        {guard.site}
                      </div>
                      <div className="col-span-2">
                        <span className="font-semibold block text-gray-400">Location:</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-medium text-gray-850">{eff.name}</span>
                          {eff.isTemp && (
                            <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">TEMP OVERRIDE</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setSelectedShiftGuard(guard)}
                        className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/50 px-2 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap text-center"
                      >
                        📅 Schedule
                      </button>
                      <button 
                        onClick={() => {
                          setOverrideGuard(guard);
                          setTempLocationId(guard.temp_location_id ? String(guard.temp_location_id) : "");
                          setTempFrom(guard.temp_location_from || "");
                          setTempTo(guard.temp_location_to || "");
                          if (guard.tempShifts && guard.tempShifts.length > 0) {
                            const tShift = guard.tempShifts[0];
                            setTempShiftName(tShift.shift_name || "");
                            setTempStartTime(tShift.start_time || "");
                            setTempEndTime(tShift.end_time || "");
                          } else {
                            setTempShiftName("");
                            setTempStartTime("");
                            setTempEndTime("");
                          }
                        }}
                        className="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition"
                      >
                        ⏱️ Temp
                      </button>
                      <button 
                        onClick={() => startEdit(guard)}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => setConfirmDelete({ id: guard.id, name: guard.name })}
                        className="bg-red-500 hover:bg-red-600 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default Guards;
