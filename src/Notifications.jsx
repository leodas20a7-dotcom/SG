import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./lib/supabase";
import { FaBell } from "react-icons/fa";

function Notifications({ role, guardId, companyId, guardName, onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [emergencyAlert, setEmergencyAlert] = useState(null);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addNotification = (title, message, type) => {
    setNotifications((prev) => [
      { id: Date.now(), title, message, type, time: new Date() },
      ...prev,
    ].slice(0, 20)); // Keep only the latest 20
    setUnreadCount((prev) => prev + 1);
  };

  // Helper to check if a notification is allowed for the logged in guard
  // Removed name-based filtering; database queries and realtime listener handle guard_id filtering.
  const isAllowed = (notif) => {
    return true;
  };

  useEffect(() => {
    let channel;
    const currentRole = role?.toLowerCase();
    if (!currentRole) return;

    // 1. Fetch existing unread notifications from DB
    const fetchNotifications = async () => {
      let query = supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(40);

      if (["admin", "super_admin", "supervisor"].includes(currentRole)) {
        query = query.in("user_role", ["admin", "super_admin", "supervisor"]);
      } else if (currentRole === "guard" && guardId) {
        // Guards see notifications specifically for them or broadcast notifications
        query = query.eq("user_role", "guard").or(`guard_id.eq.${guardId},guard_id.is.null`);
      } else {
        query = query.eq("user_role", currentRole);
      }

      const { data: notificationsData } = await query;
      if (notificationsData) {
        let finalNotifications = notificationsData.filter(isAllowed);

        // Strict company filter for admins
        if (["admin", "super_admin", "supervisor"].includes(currentRole) && companyId) {
          finalNotifications = finalNotifications.filter(n => n.company_id === companyId || n.is_broadcast === true);
        }

        if (currentRole === "guard" && guardId) {
          // Fetch circulars this guard is allowed to see to filter out irrelevant circular notifications
          const { data: visibleCirculars } = await supabase
            .from("circulars")
            .select("title")
            .eq("company_id", companyId);

          const allowedCircularTitles = new Set(visibleCirculars?.map(c => c.title) || []);

          finalNotifications = finalNotifications.filter(n => {
            if (n.title === "New Circular") {
              const prefix = "A new announcement was posted: ";
              if (n.message && n.message.startsWith(prefix)) {
                const circTitle = n.message.substring(prefix.length);
                return allowedCircularTitles.has(circTitle);
              }
            }
            return true;
          });
        }

        const mapped = finalNotifications.slice(0, 20).map(n => ({
          ...n,
          time: new Date(n.created_at) // map DB created_at to time
        }));

        setNotifications(mapped);
        
        const unreadMapped = mapped.filter(n => !n.is_read);
        setUnreadCount(unreadMapped.length);

        // Check if there are any unread SOS alerts
        const unreadSos = unreadMapped.find(n => n.type === "error" && (n.title?.toUpperCase().includes("SOS") || n.title?.toUpperCase().includes("EMERGENCY")));
        if (unreadSos) {
          setEmergencyAlert(unreadSos);
          // Play an alarm sound
          try {
            const audio = new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg");
            audio.play().catch(e => console.log("Audio play blocked by browser:", e));
          } catch (e) {}
        }
      }
    };

    fetchNotifications();

    // 2. Subscribe to NEW persistent notifications
    const uniqueId = Math.random().toString(36).substring(7);
    channel = supabase
      .channel(`persistent-notifications-${uniqueId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        async (payload) => {
          const newNotif = payload.new;
          
          if (!isAllowed(newNotif)) return;

          // Check if notification is meant for this role
          if (["admin", "super_admin", "supervisor"].includes(currentRole)) {
            if (!["admin", "super_admin", "supervisor"].includes(newNotif.user_role)) return;
          } else {
            if (newNotif.user_role !== currentRole) return;
          }

          // Filter by company for Admins and Supervisors
          if (["admin", "super_admin", "supervisor"].includes(currentRole) && companyId) {
            // Ignore if notification belongs to a different company, AND it's not an explicit broadcast
            if (newNotif.company_id !== companyId && newNotif.is_broadcast !== true) {
              return;
            }
          }

          // Filter guard-specific notifications
          if (currentRole === "guard") {
            if (newNotif.guard_id && newNotif.guard_id !== guardId) return;

            if (newNotif.title === "New Circular") {
              const prefix = "A new announcement was posted: ";
              if (newNotif.message && newNotif.message.startsWith(prefix)) {
                const circTitle = newNotif.message.substring(prefix.length);
                const { data } = await supabase
                  .from("circulars")
                  .select("id")
                  .eq("title", circTitle)
                  .or(`is_broadcast.eq.true,guard_id.eq.${guardId}`);

                if (!data || data.length === 0) {
                  // Not allowed to see this circular, ignore notification
                  return;
                }
              }
            }
          }

          console.log("New Persistent Notification Received:", newNotif);
          setNotifications((prev) => [
            { ...newNotif, time: new Date(newNotif.created_at) },
            ...prev,
          ].slice(0, 20));
          setUnreadCount((prev) => prev + 1);

          // Trigger massive popup for SOS
          if (newNotif.type === "error" && (newNotif.title?.toUpperCase().includes("SOS") || newNotif.title?.toUpperCase().includes("EMERGENCY"))) {
            setEmergencyAlert(newNotif);
            
            // Play an alarm sound
            try {
              const audio = new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg");
              audio.play().catch(e => console.log("Audio play blocked by browser:", e));
            } catch (e) {}
          }
        }
      )
      .subscribe((status, err) => {
        console.log("Persistent Realtime Subscription Status:", status, err || "");
      });

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [role, guardId]);

  const toggleDropdown = async () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState && unreadCount > 0) {
      setUnreadCount(0); // Mark as read instantly on UI
      
      // Update the DB in the background
      const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
      if (unreadIds.length > 0) {
        await supabase
          .from("notifications")
          .update({ is_read: true })
          .in("id", unreadIds);
        
        // Update local state to reflect read status
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      }
    }
  };

  const handleAcknowledgeEmergency = async () => {
    if (emergencyAlert) {
      // Mark this specific emergency alert as read in the database
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", emergencyAlert.id);
      
      setEmergencyAlert(null);
      
      // Also update local list state if it's in there
      setNotifications(prev => prev.map(n => 
        n.id === emergencyAlert.id ? { ...n, is_read: true } : n
      ));
      
      // We don't want it popping up again on reload!
    }
  };

  const clearHistory = async () => {
    setNotifications([]);
    setUnreadCount(0);
    const currentRole = role?.toLowerCase();
    if (!currentRole) return;
    let query = supabase.from("notifications").delete().eq("user_role", currentRole);
    if (currentRole === "guard" && guardId) {
      query = query.eq("guard_id", guardId);
    }
    await query;
  };

  const handleNotificationClick = async (notif) => {
    if (onNavigate) {
      if (notif.title === "New Issue Reported") {
        onNavigate("correction-requests");
      } else if (notif.title === "New Incident Reported") {
        onNavigate("incidents");
      } else if (
        notif.title === "Request Updated" || 
        (notif.title && notif.title.includes("Request Update")) ||
        (notif.title && notif.title.includes("Leave Request")) ||
        (notif.title && notif.title.includes("Correction Request"))
      ) {
        let resolvedType = null;
        try {
          const { data } = await supabase
            .from("attendance_requests")
            .select("request_type, status")
            .eq("guard_id", guardId)
            .order("created_at", { ascending: false })
            .limit(5);

          if (data && data.length > 0) {
            const isRejected = notif.message && notif.message.toLowerCase().includes("rejected");
            const isApproved = notif.message && notif.message.toLowerCase().includes("approved");
            const targetStatus = isRejected ? "Rejected" : isApproved ? "Approved" : null;

            let match = null;
            if (targetStatus) {
              match = data.find(r => r.status === targetStatus);
            }
            if (!match) {
              match = data[0];
            }
            resolvedType = match.request_type;
          }
        } catch (err) {
          console.error("Error determining request type:", err);
        }

        if (resolvedType === "leave") {
          onNavigate("leave-history");
        } else if (resolvedType === "text" || resolvedType === "voice") {
          onNavigate("correction-history");
        } else {
          // Fallback to message parsing
          if (notif.message && notif.message.toLowerCase().includes("leave")) {
            onNavigate("leave-history");
          } else {
            onNavigate("correction-history");
          }
        }
      }
      else if (notif.title === "New Circular") onNavigate("circulars");
      else if (notif.title && notif.title.includes("Leave Request")) onNavigate("leave-history");
      else if (notif.title && notif.title.includes("Correction Request")) onNavigate("correction-history");
    }
    setIsOpen(false);
  };

  const getIcon = (type) => {
    switch (type) {
      case "warning": return "🚨";
      case "success": return "✅";
      case "error": return "❌";
      default: return "📩";
    }
  };

  return (
    <>
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={toggleDropdown}
        className="relative p-2.5 rounded-full hover:bg-gray-100 transition focus:outline-none"
      >
        <FaBell className="text-gray-600 text-xl" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 border-2 border-white rounded-full animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 dark:border-slate-800 z-50 overflow-hidden transform origin-top-right transition-all">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800 bg-gray-50/80 dark:bg-slate-800/80 flex justify-between items-center">
            <h3 className="font-bold text-gray-800 text-sm">Notifications</h3>
            {notifications.length > 0 && (
              <button 
                onClick={clearHistory}
                className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg transition font-medium border border-transparent hover:border-red-100"
              >
                Clear History
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 px-4 text-center text-gray-400">
                <div className="text-3xl mb-2 opacity-50">🔕</div>
                <p className="text-sm">No new notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-slate-800/50">
                {notifications.map((notif) => (
                  <div 
                    key={notif.id} 
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-4 transition flex items-start gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 ${notif.is_read ? "bg-white dark:bg-transparent" : "bg-blue-50/50 dark:bg-blue-900/20"}`}
                  >
                    <span className="text-xl shrink-0 mt-0.5">{getIcon(notif.type)}</span>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{notif.title}</p>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">{notif.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1.5 font-medium uppercase tracking-wider">
                        {notif.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      {/* EMERGENCY SOS POPUP MODAL (Rendered outside the DOM tree to prevent clipping) */}
      {emergencyAlert && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full p-8 md:p-10 text-center border-[6px] border-[#ff3b30] relative animate-in zoom-in-95 duration-500 ease-out flex flex-col items-center">
            
            {/* Top Icon */}
            <div className="bg-[#fff0f0] w-24 h-24 rounded-3xl flex items-center justify-center shadow-sm mb-6 -mt-16 border border-white">
              <span className="text-5xl drop-shadow-md">🚨</span>
            </div>
            
            <h2 className="text-2xl md:text-3xl font-black text-gray-800 mb-6 tracking-wide">
              EMERGENCY SOS ALERT
            </h2>
            
            {/* Message Box */}
            <div className="bg-[#fff6f6] border border-[#ffe0e0] w-full text-left p-6 rounded-2xl mb-8">
              <p className="font-medium text-slate-600 text-[15px] leading-relaxed">
                {emergencyAlert.message}
              </p>
              <div className="mt-5 flex items-center">
                <p className="text-[#ff3b30] text-xs font-bold uppercase tracking-wider">
                  RECEIVED: {emergencyAlert.time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                </p>
              </div>
            </div>

            <button
              onClick={handleAcknowledgeEmergency}
              className="w-full bg-[#f8312f] hover:bg-[#d62828] text-white font-bold text-[17px] py-4 rounded-2xl shadow-[0_8px_20px_-6px_rgba(248,49,47,0.6)] transition-all active:scale-[0.98]"
            >
              Acknowledge Alert
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default Notifications;
