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
import { FaUser, FaUserShield, FaCalendarAlt, FaKey, FaArrowRight, FaArrowLeft, FaCheck, FaTrashAlt, FaPen, FaClock, FaPlus, FaClipboardCheck, FaSpinner, FaCopy, FaEnvelope } from "react-icons/fa";
import { shortId } from "./lib/shortId";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const STATUS_OPTIONS = ["Active", "Inactive"];


/* ── helper: post a circular notification ── */
async function autoNotify(title, message, guardId = null, isBroadcast = false) {
  await supabase.from("notifications").insert([{ title, message, guard_id: guardId, is_broadcast: isBroadcast, type: "info", user_role: "guard" }]);
}

function Guards({ onGuardAdded, onNavigate, companyId }) {
  const [guards, setGuards] = useState([]);
  const [locations, setLocations] = useState([]);
  const [companyStatus, setCompanyStatus] = useState("active");
  const [purchasedSeats, setPurchasedSeats] = useState(0);

  // Wizard Step State
  const [currentStep, setCurrentStep] = useState(1);
  const [viewMode, setViewMode] = useState("form"); // "form" or "list"

  // Active guard for Temporary Override Modal
  const [overrideGuard, setOverrideGuard] = useState(null);
  const [selectedShiftGuard, setSelectedShiftGuard] = useState(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [selectedReportMonth, setSelectedReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const downloadGuardReport = async (guard) => {
    if (!guard) return;
    setIsGeneratingPDF(true);
    showToast("Generating PDF Report...", "info");

    try {
      const [year, month] = selectedReportMonth.split("-");
      const reportDate = new Date(year, parseInt(month) - 1, 1);

      const monthStart = new Date(reportDate.getFullYear(), reportDate.getMonth(), 1).toISOString();
      const monthEnd = new Date(reportDate.getFullYear(), reportDate.getMonth() + 1, 0).toISOString();

      const { data: att } = await supabase
        .from("attendance")
        .select("*")
        .eq("guard_id", guard.id)
        .gte("check_in_time", monthStart)
        .lte("check_in_time", monthEnd);

      const { data: sh } = await supabase
        .from("shifts")
        .select("*")
        .eq("guard_id", guard.id);

      const totalPresent = att ? att.filter(r => r.status === "Present" || r.status === "On Duty").length : 0;
      const totalAbsent = att ? att.filter(r => r.status === "Absent").length : 0;
      const totalLeave = att ? att.filter(r => r.status === "Leave" || r.status === "Half Day").length : 0;

      let totalHours = 0;
      let punctualityCount = 0;
      let checkedInCount = 0;

      att?.forEach(r => {
        if (r.check_in_time && r.check_out_time) {
          const hours = (new Date(r.check_out_time) - new Date(r.check_in_time)) / (1000 * 60 * 60);
          totalHours += hours > 0 ? hours : 0;
        }
        if (r.check_in_time && r.status !== "Leave" && r.status !== "Absent") {
          checkedInCount++;
          const activeShift = sh?.find(s => s.shift_date === null);
          if (activeShift && activeShift.start_time) {
            const checkInDate = new Date(r.check_in_time);
            const [shH, shM] = activeShift.start_time.split(":");
            const scheduledStart = new Date(checkInDate);
            scheduledStart.setHours(parseInt(shH), parseInt(shM), 0, 0);
            if ((checkInDate - scheduledStart) / (1000 * 60) <= 15) {
              punctualityCount++;
            }
          } else {
            const h = new Date(r.check_in_time).getHours();
            const m = new Date(r.check_in_time).getMinutes();
            if (h < 9 || (h === 9 && m === 0)) punctualityCount++;
          }
        }
      });

      const punctualityRate = checkedInCount > 0 ? Math.round((punctualityCount / checkedInCount) * 100) : 0;
      const overallScore = (totalPresent + totalAbsent) > 0
        ? Math.min(100, Math.round((totalPresent / (totalPresent + totalAbsent)) * 60 + (punctualityRate * 0.4)))
        : 0;

      const doc = new jsPDF();

      // Load and Draw App Logo
      const img = new Image();
      img.src = '/logo.png';
      await new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
      });
      doc.addImage(img, 'PNG', 14, 14, 12, 12);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(22);
      doc.setTextColor(40, 40, 40);
      doc.text("Guard Performance Report", 30, 22);

      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text(`Guard Name: ${guard.name}`, 14, 32);
      const dateStr = reportDate.toLocaleDateString('default', { month: 'long', year: 'numeric' });
      doc.text(`Report Month: ${dateStr}`, 14, 38);

      autoTable(doc, {
        startY: 45,
        head: [['Metric', 'Value']],
        body: [
          ['Overall Performance Score', `${overallScore}%`],
          ['Punctuality Rate', `${punctualityRate}%`],
          ['Total Hours Worked', `${totalHours.toFixed(1)} hrs`],
          ['Present Shifts', `${totalPresent}`],
          ['Leaves Granted', `${totalLeave}`],
          ['Unexcused Absences', `${totalAbsent}`]
        ],
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 11, cellPadding: 6 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 100 }, 1: { cellWidth: 'auto' } }
      });

      // Add Calculation Logic in Footer
      const finalY = doc.lastAutoTable.finalY + 15;
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.setFont("helvetica", "bold");
      doc.text("Calculation Methodology:", 14, finalY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.text("• Punctuality Rate: Percentage of shifts where check-in occurred within 15 mins of start time.", 14, finalY + 6);
      doc.text("• Overall Performance Score: Weighted average of Shift Attendance (60%) and Punctuality (40%).", 14, finalY + 11);

      doc.save(`Guard_Report_${(guard.name || "Guard").replace(/\s+/g, '_')}_${dateStr}.pdf`);
      showToast("PDF Report downloaded successfully!", "success");
    } catch (error) {
      console.error("PDF Generation Error:", error);
      showToast("Failed to generate PDF.", "error");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Core fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [site, setSite] = useState("");
  const [status, setStatus] = useState("Active");
  const [dutyLocationId, setDutyLocationId] = useState("");

  // Temporary location override (kept for date-specific overrides)
  const [tempLocationId, setTempLocationId] = useState("");
  const [tempFrom, setTempFrom] = useState("");
  const [tempTo, setTempTo] = useState("");
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
  const [showLimitPopup, setShowLimitPopup] = useState(false);
  const [newGuardCredentials, setNewGuardCredentials] = useState(null);
  const { showToast, ToastContainer } = useToast();

  /* ── validation ── */
  function validateStep1() {
    const errs = {};
    if (!name.trim()) errs.name = "Guard name is required";
    else if (name.trim().length < 2) errs.name = "Name must be at least 2 characters";
    else if (!/^[a-zA-Z\s]+$/.test(name.trim())) errs.name = "Name should only contain letters";
    if (!phone) errs.phone = "Phone number is required";
    else {
      const formattedPhone = phone.startsWith('+') ? phone : '+' + phone;
      const phoneNumber = parsePhoneNumberFromString(formattedPhone);
      if (!phoneNumber || !phoneNumber.isValid()) {
        errs.phone = "Enter a valid international phone number";
      } else {
        const isDuplicate = guards.some(g => g.phone === formattedPhone && g.id !== editingId);
        if (isDuplicate) errs.phone = "This phone number is already registered.";
      }
    }
    if (!site.trim()) errs.site = "Place is required";
    else if (site.trim().length < 2) errs.site = "Place must be at least 2 characters";
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
      const formattedPhone = phone.startsWith('+') ? phone : '+' + phone;
      const phoneNumber = parsePhoneNumberFromString(formattedPhone);
      if (!phoneNumber || !phoneNumber.isValid()) {
        errs.phone = "Enter a valid international phone number";
      } else {
        const isDuplicate = guards.some(g => g.phone === formattedPhone && g.id !== editingId);
        if (isDuplicate) errs.phone = "This phone number is already registered.";
      }
    }
    if (!site.trim()) errs.site = "Place is required";
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
            const { error: insErr } = await supabase.from("shifts").insert(overridePayloads);
            if (insErr) throw insErr;
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
      let q = supabase
        .from("guards")
        .select(`
          *,
          duty_location:duty_locations!duty_location_id(place_name),
          temp_duty_location:duty_locations!temp_location_id(place_name)
        `)
        .order("id", { ascending: true });
      if (companyId) q = q.eq("company_id", companyId);

      const { data: guardsData, error } = await q;

      if (error) {
        showToast(`Could not load guards: ${error.message}`, "error");
        return;
      }

      let qs = supabase
        .from("shifts")
        .select("*");
      if (companyId) qs = qs.eq("company_id", companyId);
      const { data: shiftsData } = await qs;

      const mapped = (guardsData || []).map(guard => {
        const guardShifts = (shiftsData || []).filter(s => s.guard_id === guard.id);
        // Weekly schedule rows: day_of_week IS NOT NULL
        const weeklyShifts = guardShifts.filter(s => s.day_of_week !== null && s.day_of_week !== undefined);
        // Date override rows: shift_date IS NOT NULL
        const dateOverrides = guardShifts.filter(s => s.shift_date !== null && s.shift_date !== undefined);
        return {
          ...guard,
          weeklyShifts,
          dateOverrides,
        };
      });

      setGuards(mapped);
    } catch (err) {
      showToast(`Network error: ${err?.message}`, "error");
    }
  }

  async function fetchLocations() {
    try {
      let q = supabase.from("duty_locations").select("*").order("place_name");
      if (companyId) q = q.eq("company_id", companyId);
      const { data } = await q;
      setLocations(data || []);
    } catch { /* ignore */ }
  }

  async function fetchCompanyStatus() {
    if (!companyId) return;
    try {
      const { data } = await supabase.from("companies").select("subscription_status, purchased_seats").eq("id", companyId).single();
      if (data) {
        setCompanyStatus(data.subscription_status || "active");
        setPurchasedSeats(data.purchased_seats || 0);
      }
    } catch { /* ignore */ }
  }

  async function fetchShiftTimings() {
    try {
      let q = supabase.from("shift_timings").select("*");
      if (companyId) q = q.eq("company_id", companyId);
      const { data } = await q;
      if (data && data.length > 0) {
        const timings = {};
        data.forEach((row) => {
          const startHHMM = row.start_time?.substring(0, 5) || "00:00";
          const endHHMM = row.end_time?.substring(0, 5) || "00:00";
          timings[row.shift_name] = {
            start: `${startHHMM}:00`,
            startSimple: startHHMM,
            end: `${endHHMM}:00`,
            endSimple: endHHMM
          };
        });
        setShiftTimings((prev) => ({ ...prev, ...timings }));
      }
    } catch (err) {
      console.error("Error fetching shift timings in Guards:", err);
    }
  }

  /* ── add guard ── */
  async function addGuard() {
    if (!validate()) return;

    // Check Seat Limits
    const activeGuardsCount = guards.filter(g => g.status === "Active").length;
    if (status === "Active" && activeGuardsCount >= purchasedSeats) {
      setShowLimitPopup(true);
      return;
    }

    setLoading(true);
    try {
      let authUserId = null;
      if (email.trim() && password) {
        const { data: { session: saved } } = await supabase.auth.getSession();
        sessionStorage.setItem("ignore_auth_change", "true");
        const { data: authData, error: authErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              is_guard: true,
              company_id: companyId,
              name: name.trim(),
              role: 'guard'
            }
          }
        });
        if (authErr) {
          sessionStorage.removeItem("ignore_auth_change");
          let msg = authErr.message;
          if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already exists")) {
            msg = "This email is already registered. If you reset the database recently, please run the SQL cleanup script in Supabase to clear old Auth accounts.";
          }
          showToast(`Auth Error: ${msg}`, "error");
          setLoading(false);
          return;
        }
        if (saved) {
          const { error: sessionErr } = await supabase.auth.setSession({ access_token: saved.access_token, refresh_token: saved.refresh_token });
          if (sessionErr) showToast("Session issue, please re-login.", "error");
        }
        sessionStorage.removeItem("ignore_auth_change");
        authUserId = authData.user?.id;
      }

      const { data: insertData, error } = await supabase.from("guards").insert([{
        company_id: companyId,
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
        alert("DEBUG GUARD INSERT ERROR: " + JSON.stringify(error));
        showToast(error.message.includes("duplicate") ? "Guard already exists." : "Could not add guard.", "error");
        setLoading(false);
        return;
      }

      if (!insertData || insertData.length === 0) {
        alert("DEBUG GUARD INSERT DATA EMPTY: Row Level Security might have silently blocked the insert!");
      }

      const guardId = insertData?.[0]?.id;


      showToast("Guard added successfully!", "success");

      if (email.trim() && password) {
        setNewGuardCredentials({
          name: name.trim(),
          email: email.trim(),
          password: password
        });
      }

      resetForm();
      fetchGuards();
      setViewMode("list");
      if (onGuardAdded) onGuardAdded();
    } catch {
      showToast("Network error.", "error");
    } finally {
      setLoading(false);
    }
  }

  /* ── start edit ── */
  function startEdit(guard) {
    setViewMode("form");
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


    setErrors({});
    setCurrentStep(1);
    const scrollContainer = document.querySelector(".overflow-y-auto") || window;
    scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    resetForm();
    setViewMode("list");
  }

  function resetForm() {
    setName(""); setPhone(""); setSite(""); setStatus("Active");
    setDutyLocationId(""); setTempLocationId(""); setTempFrom(""); setTempTo("");
    setEmail(""); setPassword("");

    setCurrentStep(1);
    setPrevDutyLocationId(null);
    setErrors({});
  }

  /* ── update guard ── */
  async function updateGuard() {
    if (!validate()) return;

    try {
      const { data: currentGuard } = await supabase.from("guards").select("*").eq("id", editingId).single();

      // Enforce billing limits if activating an inactive guard
      if (status === "Active" && currentGuard?.status !== "Active") {
        if (companyStatus === "past_due") {
          showToast("Payment is past due. Please update billing to activate guards.", "error");
          return;
        }
        const activeGuardsCount = guards.filter(g => g.status === "Active").length;
        if (activeGuardsCount >= purchasedSeats) {
          setShowLimitPopup(true);
          return;
        }
      }

      setLoading(true);
      let authUserId = currentGuard?.auth_user_id;

      // Create auth account if credentials added for first time
      if (email.trim() && !authUserId && password) {
        const { data: { session: saved } } = await supabase.auth.getSession();
        sessionStorage.setItem("ignore_auth_change", "true");
        const { data: authData, error: authErr } = await supabase.auth.signUp({ email: email.trim(), password });
        if (!authErr && authData.user) {
          authUserId = authData.user.id;
          const { error: profErr } = await supabase.from("profiles").insert([{ id: authUserId, full_name: name.trim(), email: email.trim(), role: "guard", company_id: companyId }]);
          if (profErr) { showToast("Failed to create user profile.", "error"); }
        }
        if (saved) {
          const { error: sessionErr } = await supabase.auth.setSession({ access_token: saved.access_token, refresh_token: saved.refresh_token });
          if (sessionErr) showToast("Session issue, please re-login.", "error");
        }
        sessionStorage.removeItem("ignore_auth_change");
      } else if (authUserId && password) {
        // Update existing user's password securely via RPC
        const { error: rpcErr } = await supabase.rpc("admin_update_user_password", {
          target_user_id: authUserId,
          new_password: password
        });
        if (rpcErr) {
          console.error("Password update error:", rpcErr);
          showToast("Failed to update password. Did you run the SQL RPC script?", "error");
          setLoading(false);
          return;
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

      // Delete live tracking first due to foreign key constraints on attendance
      await supabase.from("live_tracking").delete().eq("guard_id", id);

      // Delete other related records
      await Promise.all([
        supabase.from("attendance").delete().eq("guard_id", id),
        supabase.from("circulars").delete().eq("guard_id", id),
        supabase.from("incidents").delete().eq("guard_id", id),
        supabase.from("shifts").delete().eq("guard_id", id),
        supabase.from("notifications").delete().eq("guard_id", id),
        supabase.from("attendance_requests").delete().eq("guard_id", id),
      ]);

      const { error } = await supabase.from("guards").delete().eq("id", id);
      if (error) { showToast("Could not delete guard.", "error"); return; }

      // Delete profile and auth user to completely revoke access
      if (guardData?.auth_user_id) {
        // Delete from profiles (may cascade from auth.users depending on setup, but safe to do here)
        await supabase.from("profiles").delete().eq("id", guardData.auth_user_id);

        // Delete the actual auth.user so the email can be re-registered
        await supabase.rpc('delete_auth_user', { target_user_id: guardData.auth_user_id });
      }

      showToast("Guard and related data deleted.", "success");
      fetchGuards();
      if (onGuardAdded) onGuardAdded();
    } catch (err) {
      console.error(err);
      showToast("Network error or constraint failed.", "error");
    }
  }

  useEffect(() => { fetchGuards(); fetchLocations(); fetchShiftTimings(); fetchCompanyStatus(); }, [companyId]);
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
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
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
                  searchable={true}
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
                      const defaultTime = shiftTimings[val];
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
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-[450px] shadow-2xl border border-gray-150 max-h-[90vh] overflow-y-auto animate-fade-in mx-4">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-800">📅 Guard Profile & Schedule</h2>
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={selectedReportMonth}
                  onChange={(e) => setSelectedReportMonth(e.target.value)}
                  className="h-8 px-2 text-[11px] border border-gray-200 rounded-lg text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  title="Select month for report"
                />
                <button
                  onClick={() => downloadGuardReport(selectedShiftGuard)}
                  disabled={isGeneratingPDF}
                  className={`bg-indigo-50 text-indigo-700 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 transition shadow-sm border border-indigo-100 ${isGeneratingPDF ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-100'}`}
                  title="Download Monthly Report"
                >
                  {isGeneratingPDF ? <FaSpinner className="w-3.5 h-3.5 animate-spin" /> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>}
                  PDF
                </button>
                <button onClick={() => setSelectedShiftGuard(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
              </div>
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

        {/* ─── SEAT USAGE BANNER ─── */}
        <div className="glass-card rounded-2xl p-5 md:p-6 flex flex-col md:flex-row items-center justify-between gap-6 border border-slate-200/60 shadow-sm bg-gradient-to-r from-blue-50/40 to-white">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-2xl shadow-inner">
              <FaUserShield />
            </div>
            <div>
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">License Usage</h3>
              <div className="text-2xl font-extrabold text-slate-800">
                {guards.filter(g => g.status === "Active").length} <span className="text-slate-400 text-xl font-medium">/ {purchasedSeats} Seats</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap md:flex-nowrap gap-3 w-full md:w-auto">
            <div className="flex-1 md:flex-none px-5 py-3 bg-white rounded-xl border border-slate-200 shadow-sm text-center">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Active</p>
              <p className="text-xl font-black text-emerald-600">{guards.filter(g => g.status === "Active").length}</p>
            </div>
            <div className="flex-1 md:flex-none px-5 py-3 bg-white rounded-xl border border-slate-200 shadow-sm text-center">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Available</p>
              <p className="text-xl font-black text-blue-600">{Math.max(0, purchasedSeats - guards.filter(g => g.status === "Active").length)}</p>
            </div>
          </div>
        </div>

        {/* ─── ADD / EDIT FORM ─── */}
        {viewMode === "form" && (
          <div className={`glass-card rounded-3xl p-6 md:p-8 transition-all duration-300 relative z-40 border border-slate-200/80 shadow-[0_15px_30px_-10px_rgba(15,23,42,0.08)] ${editingId ? "ring-2 ring-blue-500/20 bg-blue-50/10" : "ring-1 ring-slate-200/50 bg-white/70"
            }`}>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                  {editingId ? (
                    <>
                      <span className="p-2 rounded-xl bg-blue-50 text-blue-600"><FaPen className="text-sm" /></span>
                      <span>Edit Guard Profile</span>
                    </>
                  ) : (
                    <>
                      <span className="p-2 rounded-xl bg-blue-50 text-blue-600"><FaPlus className="text-sm" /></span>
                      <span className="hidden md:inline">Add New Guard & Profile Login</span>
                      <span className="md:hidden">Add Guard</span>
                    </>
                  )}
                </h2>
                <p className="hidden md:block text-xs text-slate-450 mt-1 font-medium">Onboard, coordinate, and establish system credentials for guards.</p>
              </div>
              {editingId ? (
                <span className="text-[10px] font-bold uppercase tracking-widest bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                  Editing: ID {shortId(editingId)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/50 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 shadow-sm whitespace-nowrap"
                >
                  <FaClipboardCheck className="text-sm" />
                  <span>Guards Profile History</span>
                </button>
              )}
            </div>

            {/* Stepper progress indicator */}
            <div className="flex items-center w-full mb-8 select-none overflow-x-auto pb-2">
              {[
                { num: 1, name: "Personal Details", icon: FaUser },
                { num: 2, name: "Login Info", icon: FaKey }
              ].map((step, index) => {
                const IconComponent = step.icon;
                const isCurrent = currentStep === step.num;
                const isCompleted = currentStep > step.num;
                return (
                  <div key={step.num} className="flex-1 flex items-center min-w-[140px] last:flex-none">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${isCurrent
                        ? "bg-blue-600 text-white shadow-md shadow-blue-100 scale-105"
                        : isCompleted
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                          : "bg-slate-200/90 text-slate-600 border border-slate-300/30"
                        }`}>
                        {isCompleted ? <FaCheck className="text-xs" /> : <IconComponent className="text-xs" />}
                      </div>
                      <div className="text-left">
                        <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Step 0{step.num}</span>
                        <span className={`text-[11px] md:text-xs font-bold whitespace-nowrap ${isCurrent ? "text-slate-800" : "text-slate-650"}`}>{step.name}</span>
                      </div>
                    </div>
                    {index < 1 && (
                      <div className="flex-1 mx-4 h-0.5 bg-slate-200/80 relative min-w-[20px]">
                        <div className="absolute top-0 left-0 h-full bg-blue-650 transition-all duration-500"
                          style={{ width: isCompleted ? "100%" : "0%" }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Step 1: Personal details */}
            {currentStep === 1 && (
              <div className="space-y-5 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">Guard Name</label>
                    <input type="text" placeholder="Full name" value={name}
                      onChange={e => { setName(e.target.value); clearError("name"); }}
                      className={`w-full h-11 border px-3 rounded-xl focus:outline-none focus:ring-4 transition text-xs bg-[#F4F6F9] hover:bg-slate-100/60 focus:bg-white ${errors.name
                        ? "border-red-400 focus:ring-red-500/10 focus:border-red-500"
                        : "border-slate-200 focus:ring-blue-500/10 focus:border-blue-500"
                        }`}
                    />
                    {errors.name && <p className="text-red-500 text-xs mt-1.5 font-semibold">⚠️ {errors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">Phone Number</label>
                    <PhoneInput
                      country={'au'}
                      enableSearch={true}
                      value={phone}
                      onChange={v => { setPhone(v || ""); clearError("phone"); }}
                      inputStyle={{
                        width: '100%',
                        height: '44px',
                        borderRadius: '0.75rem',
                        borderColor: errors.phone ? '#f87171' : '#e2e8f0',
                        background: '#F4F6F9',
                        fontSize: '12px',
                        transition: 'all 0.2s'
                      }}
                      buttonStyle={{
                        borderRadius: '0.75rem 0 0 0.75rem',
                        borderColor: errors.phone ? '#f87171' : '#e2e8f0',
                        background: '#f1f5f9'
                      }}
                      dropdownStyle={{
                        width: '300px',
                        paddingLeft: '10px',
                        borderRadius: '0.75rem',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                        border: '1px solid #e2e8f0',
                        overflow: 'hidden',
                        paddingTop: '0px',
                        margin: '0px'
                      }}
                      searchStyle={{
                        width: '75%',
                        margin: '8px 5%',
                        padding: '8px 10px 8px 30px',
                        borderRadius: '0.5rem',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#f8fafc',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    {errors.phone && <p className="text-red-500 text-xs mt-1.5 font-semibold">⚠️ {errors.phone}</p>}
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">Place</label>
                    <input type="text" placeholder="Place / Area" value={site}
                      onChange={e => { setSite(e.target.value); clearError("site"); }}
                      className={`w-full h-11 border px-3 rounded-xl focus:outline-none focus:ring-4 transition text-xs bg-[#F4F6F9] hover:bg-slate-100/60 focus:bg-white ${errors.site
                        ? "border-red-400 focus:ring-red-500/10 focus:border-red-500"
                        : "border-slate-200 focus:ring-blue-500/10 focus:border-blue-500"
                        }`}
                    />
                    {errors.site && <p className="text-red-500 text-xs mt-1.5 font-semibold">⚠️ {errors.site}</p>}
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">Status</label>
                    <CustomSelect
                      value={status}
                      onChange={val => setStatus(val)}
                      options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))}
                      placeholder="Select Status"
                      heightClass="h-11"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Login Credentials */}
            {currentStep === 2 && (
              <div className="space-y-5 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Email {editingId && <span className="text-slate-400 font-normal normal-case">(read-only during update)</span>}
                    </label>
                    <input type="email" placeholder="guard@example.com" value={email}
                      onChange={e => { setEmail(e.target.value); clearError("email"); }}
                      readOnly={!!editingId}
                      className={`w-full h-11 border px-3 rounded-xl focus:outline-none focus:ring-4 transition text-xs ${editingId
                        ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 focus:ring-transparent"
                        : errors.email
                          ? "border-red-400 focus:ring-red-500/10 focus:border-red-500 bg-[#F4F6F9]"
                          : "border-slate-200 focus:ring-blue-500/10 focus:border-blue-500 bg-[#F4F6F9] hover:bg-slate-100/60 focus:bg-white"
                        }`}
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1.5 font-semibold">⚠️ {errors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Password {editingId && <span className="text-slate-400 font-normal normal-case">(leave blank to keep current)</span>}
                    </label>
                    <input type="password" placeholder="Min 6 characters" value={password}
                      onChange={e => { setPassword(e.target.value); clearError("password"); }}
                      className={`w-full h-11 border px-3 rounded-xl focus:outline-none focus:ring-4 transition text-xs ${errors.password
                        ? "border-red-400 focus:ring-red-500/10 focus:border-red-500 bg-[#F4F6F9]"
                        : "border-slate-200 focus:ring-blue-500/10 focus:border-blue-500 bg-[#F4F6F9] hover:bg-slate-100/60 focus:bg-white"
                        }`}
                    />
                    {errors.password && <p className="text-red-500 text-xs mt-1.5 font-semibold">⚠️ {errors.password}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between items-center mt-8 pt-5 border-t border-slate-150">
              <div className="flex gap-2">
                {currentStep > 1 && (
                  <button type="button" onClick={() => setCurrentStep(currentStep - 1)}
                    className="px-4 py-2 rounded-xl border border-slate-250 text-slate-650 hover:bg-slate-50 hover:text-slate-800 transition-all duration-200 text-xs font-semibold flex items-center gap-1.5">
                    <FaArrowLeft className="text-xs" />
                    <span>Back</span>
                  </button>
                )}
                {editingId && (
                  <button type="button" onClick={cancelEdit}
                    className="px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50/80 transition-all duration-200 text-xs font-semibold">
                    Cancel
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                {currentStep < 2 ? (
                  <button type="button" onClick={() => {
                    if (currentStep === 1 && !validateStep1()) return;
                    setCurrentStep(currentStep + 1);
                  }}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all duration-300 text-xs shadow-md shadow-blue-150 flex items-center gap-1.5">
                    <span>Next Step</span>
                    <FaArrowRight className="text-xs" />
                  </button>
                ) : (
                  <button type="button" onClick={editingId ? updateGuard : addGuard} disabled={loading}
                    className={`px-6 py-2.5 rounded-xl text-white font-bold transition-all duration-300 shadow-md flex items-center gap-2 text-xs ${loading
                      ? "bg-slate-350 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 shadow-blue-150"
                      }`}>
                    {loading ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Saving…</span>
                      </>
                    ) : editingId ? (
                      <>
                        <FaCheck className="text-xs" />
                        <span>Save Changes</span>
                      </>
                    ) : (
                      <>
                        <FaPlus className="text-xs" />
                        <span>Onboard Guard</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── GUARDS TABLE ─── */}
        {viewMode === "list" && (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white/80">
              <h2 className="font-bold text-gray-800 text-lg">Guard Profiles ({guards.length})</h2>
              <button
                type="button"
                onClick={() => {
                  if (companyStatus === "past_due") {
                    showToast("Payment is past due. Please update billing to add guards.", "error");
                    return;
                  }
                  resetForm();
                  setViewMode("form");
                }}
                className={`text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 shadow-md ${companyStatus === "past_due"
                  ? "bg-gray-400 cursor-not-allowed opacity-70"
                  : "bg-blue-600 hover:bg-blue-700 shadow-blue-150"
                  }`}
              >
                <FaPlus className="text-xs" />
                <span>Onboard New Guard</span>
              </button>
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
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/50 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <FaCalendarAlt className="text-xs" />
                            <span>View Details</span>
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`status-chip status-chip-${guard.status.toLowerCase()}`}>
                            {guard.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">

                            <button onClick={() => startEdit(guard)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1 shadow-sm shadow-blue-100">
                              <FaPen className="text-[10px]" />
                              <span>Edit</span>
                            </button>
                            <button onClick={() => setConfirmDelete({ id: guard.id, name: guard.name })}
                              className="bg-red-500 hover:bg-red-650 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1 shadow-sm shadow-red-100">
                              <FaTrashAlt className="text-[10px]" />
                              <span>Delete</span>
                            </button>
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
                          className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/50 px-2 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap text-center flex items-center justify-center gap-1"
                        >
                          <FaCalendarAlt className="text-[10px]" />
                          <span>Schedule</span>
                        </button>

                        <button
                          onClick={() => startEdit(guard)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1"
                        >
                          <FaPen className="text-[9px]" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => setConfirmDelete({ id: guard.id, name: guard.name })}
                          className="bg-red-500 hover:bg-red-650 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1"
                        >
                          <FaTrashAlt className="text-[9px]" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {showLimitPopup && (
        <div className="fixed inset-0 z-[100] bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              ⚠️
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Seat Limit Reached</h2>
            <p className="text-gray-500 text-sm mb-6">
              You have reached your limit of {purchasedSeats} active guard seats. Please upgrade your plan to add more guards.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowLimitPopup(false);
                  onNavigate("billing");
                }}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition shadow-md"
              >
                Go to Billing
              </button>
              <button
                onClick={() => setShowLimitPopup(false)}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {newGuardCredentials && (
        <div className="fixed inset-0 z-[100] bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-[2rem] p-6 max-w-md w-full shadow-2xl text-center animate-scale-up">
            <div className="w-12 h-12 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-3 text-xl">
              <FaCheck />
            </div>
            <h2 className="text-lg font-bold text-gray-800 mb-1">Guard Added Successfully</h2>
            <p className="text-gray-500 text-[11px] mb-5">
              Please save or send these login credentials to the guard.
            </p>

            <div className="bg-gray-50/80 p-4 rounded-2xl text-left mb-6 border border-gray-100 shadow-sm">
              <div className="mb-3">
                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block mb-0.5">Email</span>
                <div className="text-gray-700 font-semibold text-sm select-all">{newGuardCredentials.email}</div>
              </div>
              <div>
                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block mb-0.5">Password</span>
                <div className="text-gray-700 font-semibold text-sm select-all">{newGuardCredentials.password}</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 px-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`Email: ${newGuardCredentials.email}\nPassword: ${newGuardCredentials.password}`);
                  showToast("Credentials copied to clipboard", "success");
                }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition shadow-md flex items-center justify-center gap-1.5 text-xs"
              >
                <FaCopy /> Copy
              </button>

              <a
                href={`https://mail.google.com/mail/?view=cm&fs=1&to=${newGuardCredentials.email}&su=Login Credentials for SecureSys&body=Hi ${newGuardCredentials.name},%0D%0A%0D%0AHere are your login credentials for SecureSys:%0D%0A%0D%0AEmail: ${newGuardCredentials.email}%0D%0APassword: ${newGuardCredentials.password}%0D%0A%0D%0APlease keep these safe.`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition shadow-md flex items-center justify-center gap-1.5 text-xs"
              >
                <FaEnvelope /> Gmail
              </a>

              <button
                onClick={() => setNewGuardCredentials(null)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition flex items-center justify-center gap-1.5 text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Guards;
