import React, { useEffect, useState, useRef } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import CustomSelect from "./CustomSelect";
import { FaCalendarAlt, FaClipboardList, FaExclamationCircle, FaUserClock, FaCheckCircle, FaTimes, FaChevronLeft, FaChevronRight, FaMapMarkerAlt } from "react-icons/fa";

const BASE_DAYS_OF_WEEK = [
  { label: "Mon", short: "M", full: "Monday", dow: 0 },
  { label: "Tue", short: "T", full: "Tuesday", dow: 1 },
  { label: "Wed", short: "W", full: "Wednesday", dow: 2 },
  { label: "Thu", short: "T", full: "Thursday", dow: 3 },
  { label: "Fri", short: "F", full: "Friday", dow: 4 },
  { label: "Sat", short: "S", full: "Saturday", dow: 5 },
];

function getDaysOfWeek(isSevenDayEnabled) {
  if (isSevenDayEnabled) {
    return [...BASE_DAYS_OF_WEEK, { label: "Sun", short: "S", full: "Sunday", dow: 6 }];
  }
  return BASE_DAYS_OF_WEEK;
}

function makeEmptySchedule(isSevenDayEnabled = false) {
  return getDaysOfWeek(isSevenDayEnabled).map(d => ({ dow: d.dow, locationId: "", shiftName: "", startTime: "", endTime: "", label: d.label, full: d.full }));
}

function Shifts({ companyId, onNavigate }) {
  const [guards, setGuards] = useState([]);
  const [locations, setLocations] = useState([]);
  const [shiftTimings, setShiftTimings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSevenDayEnabled, setIsSevenDayEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState("pending"); // 'pending' or 'assigned'
  const [selectedGuard, setSelectedGuard] = useState(null);
  const [weeklySchedule, setWeeklySchedule] = useState(makeEmptySchedule());
  const [copiedDay, setCopiedDay] = useState(null);
  const [saving, setSaving] = useState(false);
  const { showToast, ToastContainer } = useToast();
  const scrollContainerRef = useRef(null);

  const scrollCarousel = (dir) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: dir === 'left' ? -220 : 220, behavior: 'smooth' });
    }
  };
  const todayDow = new Date().getDay();
  // 5 = Friday, 6 = Saturday
  const isWeekend = todayDow === 5 || todayDow === 6;

  async function fetchData() {
    setLoading(true);
    try {
      const query = supabase.from("guards").select("*, shifts(*)").eq("status", "Active").order("name");
      if (companyId) {
          query.eq("company_id", companyId);
      }
      
      const locQuery = supabase.from("duty_locations").select("*").order("place_name");
      if (companyId) {
          locQuery.eq("company_id", companyId);
      }
      
      const timingQuery = supabase.from("shift_timings").select("*");
      
      let companyQuery;
      if (companyId) {
        companyQuery = supabase.from("companies").select("enable_seven_day_shifts").eq("id", companyId).single();
      } else {
        companyQuery = Promise.resolve({ data: null, error: null });
      }

      const [guardsRes, locsRes, timingsRes, companyRes] = await Promise.all([query, locQuery, timingQuery, companyQuery]);

      if (guardsRes.error) throw guardsRes.error;
      if (locsRes.error) throw locsRes.error;
      
      const sevenDayEnabled = companyRes?.data?.enable_seven_day_shifts || false;
      setIsSevenDayEnabled(sevenDayEnabled);
      if (!selectedGuard) {
        setWeeklySchedule(makeEmptySchedule(sevenDayEnabled));
      }
      if (timingsRes.error) console.error("Timings error (ignored):", timingsRes.error);

      // Filter shifts to only include weekly shifts (shift_date is null and day_of_week is not null)
      const guardsWithFilteredShifts = (guardsRes.data || []).map(g => ({
        ...g,
        weeklyShifts: (g.shifts || []).filter(s => s.shift_date === null && s.day_of_week !== null && s.day_of_week !== undefined)
      }));

      setGuards(guardsWithFilteredShifts);
      setLocations(locsRes.data || []);
      
      let fetchedTimings = timingsRes.data || [];
      if (fetchedTimings.length === 0) {
        fetchedTimings = [
          { shift_name: "Morning Shift", start_time: "06:00", end_time: "14:00" },
          { shift_name: "Evening Shift", start_time: "14:00", end_time: "22:00" },
          { shift_name: "Night Shift", start_time: "22:00", end_time: "06:00" },
          { shift_name: "Full Day", start_time: "08:00", end_time: "20:00" }
        ];
      }
      setShiftTimings(fetchedTimings);
    } catch (err) {
      console.error(err);
      showToast("Error loading data: " + (err.message || err.toString()), "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [companyId]);

  const pendingGuards = guards.filter(g => !g.weeklyShifts || g.weeklyShifts.length === 0);
  const assignedGuards = guards.filter(g => g.weeklyShifts && g.weeklyShifts.length > 0);

  const displayList = activeTab === "pending" ? pendingGuards : assignedGuards;

  function handleSelectGuard(guard) {
    setSelectedGuard(guard);
    setCopiedDay(null);
    
    // Build schedule array matching getDaysOfWeek length
    const schedule = makeEmptySchedule(isSevenDayEnabled);
    if (guard && guard.weeklyShifts && guard.weeklyShifts.length > 0) {
      guard.weeklyShifts.forEach(s => {
        const idx = schedule.findIndex(d => Number(d.dow) === Number(s.day_of_week));
        if (idx !== -1) {
          schedule[idx].locationId = s.duty_location_id ? String(s.duty_location_id) : "";
          schedule[idx].shiftName = s.shift_label || "";
          schedule[idx].startTime = s.start_time ? s.start_time.substring(0, 5) : "";
          schedule[idx].endTime = s.end_time ? s.end_time.substring(0, 5) : "";
        }
      });
    }
    setWeeklySchedule(schedule);
  }

  async function saveAssignment() {
    if (!selectedGuard) return;

    // Validation
    for (let i = 0; i < weeklySchedule.length; i++) {
      const d = weeklySchedule[i];
      const hasAnyTime = d.startTime || d.endTime;
      const isMissingTime = !d.startTime || !d.endTime;
      const hasLocation = !!d.locationId;

      if (hasAnyTime && !hasLocation) {
        showToast(`Please select a location for ${d.full} since shift times are entered.`, "error");
        return;
      }

      if (hasLocation && isMissingTime) {
        showToast(`Please fill in both start and end shift times for ${d.full}.`, "error");
        return;
      }
    }

    setSaving(true);
    try {
      // Delete old weekly rows for this guard
      await supabase
        .from("shifts")
        .delete()
        .eq("guard_id", selectedGuard.id)
        .is("shift_date", null);

      const weeklyPayloads = weeklySchedule
        .filter(d => d.startTime || d.endTime || d.locationId)
        .map(d => ({
          guard_id: selectedGuard.id,
          company_id: companyId || selectedGuard.company_id,
          day_of_week: d.dow,
          duty_location_id: d.locationId || null,
          shift_label: d.shiftName || null,
          start_time: d.startTime || null,
          end_time: d.endTime || null,
          shift_date: null,
        }));
      
      if (weeklyPayloads.length > 0) {
        const { error } = await supabase.from("shifts").insert(weeklyPayloads);
        if (error) throw error;
      }

      showToast(`Assignments saved for ${selectedGuard.name}`, "success");
      setSelectedGuard(null);
      fetchData(); // Refresh list
    } catch (err) {
      console.error(err);
      showToast("Error saving assignments: " + (err.message || err.toString()), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ToastContainer />
      <div className="mt-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FaCalendarAlt className="text-blue-600" /> Weekly Assignments
          </h1>
        </div>

        {/* Admin Reminder Banner on Fridays/Saturdays */}
        {isWeekend && pendingGuards.length > 0 && (
          <div className="mb-6 p-4 bg-amber-50 border-l-4 border-amber-500 text-amber-800 rounded-r-xl shadow-sm flex items-start gap-3 animate-fade-in">
            <FaExclamationCircle className="text-amber-500 mt-1 text-xl flex-shrink-0" />
            <div>
              <h3 className="font-bold text-amber-900">End of Week Reminder</h3>
              <p className="text-sm mt-1 font-medium">Please finalize and fill next week's duties for the {pendingGuards.length} pending guards.</p>
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          
          {/* LEFT: Guards List */}
          <div className="w-full lg:w-1/3 flex flex-col gap-4">
            {/* Tabs */}
            <div className="flex bg-white rounded-xl shadow-sm border border-slate-200/60 p-1">
              <button
                onClick={() => { setActiveTab("pending"); setSelectedGuard(null); }}
                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  activeTab === "pending" ? "bg-amber-100 text-amber-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <FaUserClock /> Pending ({pendingGuards.length})
              </button>
              <button
                onClick={() => { setActiveTab("assigned"); setSelectedGuard(null); }}
                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  activeTab === "assigned" ? "bg-emerald-100 text-emerald-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <FaCheckCircle /> Assigned ({assignedGuards.length})
              </button>
            </div>

            {/* List */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden min-h-[400px]">
              {loading ? (
                <div className="flex items-center justify-center h-48 text-slate-400">Loading guards...</div>
              ) : displayList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400 p-6 text-center">
                  <FaClipboardList className="text-4xl mb-3 opacity-20" />
                  <p className="font-semibold text-sm">No guards found in this category.</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 overflow-y-auto max-h-[600px]">
                  {displayList.map(guard => {
                    let shiftSummary = "No shifts assigned";
                    if (guard.weeklyShifts && guard.weeklyShifts.length > 0) {
                      const count = guard.weeklyShifts.length;
                      shiftSummary = `${count} day${count !== 1 ? 's' : ''} assigned`;
                    }

                    // Determine status
                    let isFullyAssigned = false;
                    if (guard.weeklyShifts && guard.weeklyShifts.length >= (isSevenDayEnabled ? 7 : 6)) {
                      isFullyAssigned = true;
                    }
                    const avatarLetter = guard.name ? guard.name.charAt(0).toUpperCase() : "?";

                    return (
                      <li key={guard.id}>
                        <button
                          onClick={() => handleSelectGuard(guard)}
                          className={`w-full text-left px-5 py-4 transition flex items-center justify-between group ${
                            selectedGuard?.id === guard.id 
                              ? "bg-blue-50 border-l-4 border-blue-600" 
                              : "hover:bg-slate-50 border-l-4 border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            {/* Avatar */}
                            <div className="relative">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm transition-colors ${
                                selectedGuard?.id === guard.id 
                                  ? "bg-gradient-to-br from-blue-600 to-indigo-600" 
                                  : "bg-gradient-to-br from-slate-400 to-slate-500 group-hover:from-blue-500 group-hover:to-indigo-500"
                              }`}>
                                {avatarLetter}
                              </div>
                              {/* Status Dot */}
                              {(guard.weeklyShifts && guard.weeklyShifts.length > 0) ? (
                                <div 
                                  className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${isFullyAssigned ? "bg-emerald-500" : "bg-amber-400"}`} 
                                  title={isFullyAssigned ? "Fully Assigned" : "Partially Assigned"}
                                ></div>
                              ) : null}
                            </div>
                            
                            <div>
                              <p className={`font-bold text-sm ${selectedGuard?.id === guard.id ? "text-blue-900" : "text-slate-800 group-hover:text-slate-900"}`}>
                                {guard.name}
                              </p>
                              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 font-medium">
                                🗓️ {shiftSummary}
                              </p>
                            </div>
                          </div>
                          <div className={`transition-all duration-300 ${selectedGuard?.id === guard.id ? "text-blue-500 translate-x-1" : "text-slate-300 group-hover:text-blue-400 group-hover:translate-x-1"}`}>
                             →
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* RIGHT: Editor Panel */}
          <div className="w-full lg:w-2/3">
            {selectedGuard ? (
              <div className="bg-white rounded-2xl shadow-lg shadow-blue-900/5 border border-slate-200 overflow-hidden animate-fade-in relative">
                
                {/* Header */}
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-black text-slate-800 tracking-tight">Assign Duties</h2>
                    <p className="text-sm font-semibold text-blue-600 mt-0.5">{selectedGuard.name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {locations.length === 0 && (
                      <button
                        onClick={() => {
                          if (onNavigate) onNavigate("staff-registry");
                          setTimeout(() => {
                            window.dispatchEvent(new CustomEvent("navigate_to_locations"));
                          }, 100);
                        }}
                        className="animate-bounce flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 rounded-lg text-xs font-bold border border-red-200 shadow-sm transition-all"
                      >
                        <FaMapMarkerAlt /> Add Location
                      </button>
                    )}
                    <button onClick={() => setSelectedGuard(null)} className="p-2 text-slate-400 hover:bg-slate-200 rounded-full transition">
                      <FaTimes />
                    </button>
                  </div>
                </div>

                {/* Editor Body */}
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <FaCalendarAlt /> Weekly Shift Schedule
                    </p>
                    {copiedDay !== null && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full font-bold animate-pulse shadow-sm">
                        🎨 Painter active — click another day to paste
                      </span>
                    )}
                  </div>

                  {/* Desktop / Tablet Grid (Horizontal Scroll) */}
                  <div className="relative group/carousel">
                    {/* Scroll Buttons */}
                    <button 
                      type="button"
                      onClick={() => scrollCarousel('left')}
                      className="absolute left-0 top-1/2 -translate-y-1/2 -ml-3 z-10 w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-md border border-slate-200 text-slate-500 hover:text-blue-600 hover:scale-110 transition-all opacity-0 group-hover/carousel:opacity-100 focus:opacity-100"
                    >
                      <FaChevronLeft className="text-sm pr-0.5" />
                    </button>
                    
                    <button 
                      type="button"
                      onClick={() => scrollCarousel('right')}
                      className="absolute right-0 top-1/2 -translate-y-1/2 -mr-3 z-10 w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-md border border-slate-200 text-slate-500 hover:text-blue-600 hover:scale-110 transition-all opacity-0 group-hover/carousel:opacity-100 focus:opacity-100"
                    >
                      <FaChevronRight className="text-sm pl-0.5" />
                    </button>

                    <div ref={scrollContainerRef} className="flex overflow-x-auto pb-6 pt-2 px-2 snap-x snap-mandatory gap-4 custom-scrollbar scroll-smooth">
                    {weeklySchedule.map((day, idx) => {
                      const isCopied = copiedDay === idx;
                      return (
                        <div key={day.dow} className={`snap-center shrink-0 w-[200px] flex flex-col gap-3 p-3.5 rounded-2xl border transition-all duration-300 ${isCopied ? "bg-blue-50/50 border-blue-300 shadow-md shadow-blue-500/10" : "bg-slate-50/50 border-slate-200/60 hover:border-blue-200 hover:bg-slate-50 hover:shadow-sm"}`}>
                          {/* Header */}
                          <div className="flex justify-between items-center mb-1">
                            <span className={`text-xs font-black uppercase tracking-widest ${isCopied ? "text-blue-600" : "text-slate-600"}`}>{day.label}</span>
                            <button
                              type="button"
                              title={isCopied ? "Painter active (click to cancel)" : "Copy this day (Format Painter)"}
                              onClick={() => {
                                if (copiedDay === idx) { setCopiedDay(null); return; }
                                if (copiedDay !== null) {
                                  const src = weeklySchedule[copiedDay];
                                  setWeeklySchedule(prev => prev.map((d, i) => i === idx ? { ...d, locationId: src.locationId, shiftName: src.shiftName, startTime: src.startTime, endTime: src.endTime } : d));
                                  setCopiedDay(null);
                                } else {
                                  setCopiedDay(idx);
                                }
                              }}
                              className={`text-[12px] w-7 h-7 rounded-lg font-bold transition-all shadow-sm flex items-center justify-center ${isCopied ? "bg-blue-500 text-white ring-4 ring-blue-500/20 scale-110" : "bg-white border border-slate-200 text-slate-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 hover:shadow-md"}`}
                            >🎨</button>
                          </div>

                          {/* Location */}
                          <div className={`rounded-xl border p-1 transition-all bg-white ${isCopied ? "border-blue-400 ring-2 ring-blue-500/20" : "border-slate-200"}`}>
                            <CustomSelect
                              value={day.locationId}
                              onChange={val => setWeeklySchedule(prev => prev.map((d, i) => i === idx ? { ...d, locationId: val } : d))}
                              options={[{ value: "", label: "Select Site" }, ...locations.map(l => ({ value: String(l.id), label: l.place_name }))]}
                              placeholder="Select Site"
                              heightClass="h-9"
                              searchable={true}
                            />
                          </div>

                          {/* Shift Template */}
                          <div className={`rounded-xl border p-1 transition-all flex items-center justify-center bg-white ${isCopied ? "border-blue-400 ring-2 ring-blue-500/20" : "border-slate-200"}`}>
                            <select
                              value={day.shiftName}
                              onChange={e => {
                                const val = e.target.value;
                                const timing = shiftTimings.find(t => t.shift_name === val);
                                setWeeklySchedule(prev => prev.map((d, i) => i === idx ? { 
                                  ...d, 
                                  shiftName: val,
                                  startTime: timing ? timing.start_time.substring(0, 5) : d.startTime,
                                  endTime: timing ? timing.end_time.substring(0, 5) : d.endTime
                                } : d));
                              }}
                              className="w-full h-8 bg-transparent text-[11px] font-bold text-slate-600 outline-none cursor-pointer px-1"
                            >
                              <option value="">Custom Shift</option>
                              {shiftTimings.map(t => (
                                <option key={t.shift_name} value={t.shift_name}>{t.shift_name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Times */}
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <div>
                              <label className="block text-[9px] text-slate-400 font-bold mb-1 text-center uppercase tracking-wider">Start</label>
                              <input type="time" value={day.startTime}
                                onChange={e => setWeeklySchedule(prev => prev.map((d, i) => i === idx ? { ...d, startTime: e.target.value } : d))}
                                className="w-full h-9 border border-slate-200 px-1 rounded-lg text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white shadow-sm text-center transition-all hover:border-blue-300" />
                            </div>
                            <div>
                              <label className="block text-[9px] text-slate-400 font-bold mb-1 text-center uppercase tracking-wider">End</label>
                              <input type="time" value={day.endTime}
                                onChange={e => setWeeklySchedule(prev => prev.map((d, i) => i === idx ? { ...d, endTime: e.target.value } : d))}
                                className="w-full h-9 border border-slate-200 px-1 rounded-lg text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white shadow-sm text-center transition-all hover:border-blue-300" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </div>
                  
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between">
                     <p className="text-xs text-blue-800 font-medium flex items-center gap-2">
                       <span className="text-lg">💡</span> Click 🎨 on a day to copy it, then click 🎨 on another day to paste.
                     </p>
                  </div>

                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white/80 backdrop-blur-md px-6 py-4 border-t border-slate-200/60 flex justify-end gap-3 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] rounded-b-2xl">
                  <button onClick={() => setSelectedGuard(null)} className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-200/70 transition">
                    Cancel
                  </button>
                  <button onClick={saveAssignment} disabled={saving} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 transition disabled:opacity-50 transform hover:-translate-y-0.5">
                    {saving ? "Saving..." : "Save Assignment"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[450px] flex flex-col items-center justify-center text-center p-8 bg-gradient-to-br from-slate-50 via-white to-blue-50/30 rounded-3xl border-2 border-dashed border-indigo-100/70 shadow-[inset_0_4px_20px_rgba(238,242,255,0.5)] relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100/40 via-transparent to-transparent pointer-events-none"></div>
                
                {/* Floating Icon Container */}
                <div className="relative mb-8 transition-transform duration-700 ease-in-out transform group-hover:-translate-y-2">
                  <div className="absolute -inset-4 bg-gradient-to-r from-blue-400 to-indigo-500 blur-2xl opacity-20 rounded-full animate-pulse"></div>
                  <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-indigo-500 to-blue-600 shadow-xl shadow-indigo-500/30 flex items-center justify-center text-white text-4xl transform rotate-[-8deg] group-hover:rotate-0 transition-all duration-500">
                    <FaCalendarAlt />
                  </div>
                  {/* Decorative sparkles */}
                  <div className="absolute -top-2 -right-2 text-amber-400 text-xl animate-bounce" style={{ animationDelay: '0.2s' }}>✨</div>
                  <div className="absolute bottom-2 -left-4 text-blue-300 text-lg animate-bounce" style={{ animationDelay: '0.5s' }}>✦</div>
                </div>

                <h3 className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-blue-600 mb-2">
                  Select a guard to start scheduling!
                </h3>
                <p className="text-sm text-slate-500 max-w-sm font-medium leading-relaxed">
                  Choose a guard from the pending or assigned list on the left to set their weekly duty locations and shift times.
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}

export default Shifts;
