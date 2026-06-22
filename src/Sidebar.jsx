import React, { useRef, useState, useEffect } from "react";
import {
  FaChartBar,
  FaUserShield,
  FaClipboardCheck,
  FaExclamationTriangle,
  FaFileAlt,
  FaGlobeAsia,
  FaCog,
  FaChevronDown,
  FaChevronUp,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";
import { useLanguage } from "./LanguageContext";

const ALL_NAV = [
  { key: "dashboard", label: "Dashboard", icon: FaChartBar, roles: ["admin", "supervisor", "guard"] },
  { key: "live-ops", label: "Live Tracking", icon: FaGlobeAsia, roles: ["admin", "supervisor"] },
  { key: "staff-registry", label: "Staff Registry", icon: FaUserShield, roles: ["admin"] },
  { key: "guard-profiles", label: "Guard Profiles", icon: FaClipboardCheck, roles: ["admin", "supervisor"] },
  { key: "system-users", label: "System Access", icon: FaUserShield, roles: ["admin"] },
  { key: "incidents", label: "Incidents", icon: FaExclamationTriangle, roles: ["admin", "supervisor", "guard"] },
  { key: "circulars", label: "Circulars", icon: FaFileAlt, roles: ["admin", "supervisor", "guard"] },
  { key: "correction-requests", label: "Requests", icon: FaClipboardCheck, roles: ["admin", "supervisor"] },
  { key: "settings", label: "Settings", icon: FaCog, roles: ["admin"] },
];

function Sidebar({ role, page, onNavigate, isOpen, onClose }) {
  const { t } = useLanguage();
  const navItems = ALL_NAV.filter((item) => item.roles.includes(role));

  const appLogo = "/logo.png";
  
  const sidebarRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const [canScroll, setCanScroll] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const checkScroll = () => {
    const el = sidebarRef.current;
    if (!el) return;
    const hasScroll = el.scrollHeight > el.clientHeight;
    setCanScroll(hasScroll);
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 10;
    setIsAtBottom(atBottom);
  };

  useEffect(() => {
    const el = sidebarRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll);
      checkScroll();
      const timer = setTimeout(checkScroll, 200);
      window.addEventListener("resize", checkScroll);
      
      return () => {
        el.removeEventListener("scroll", checkScroll);
        window.removeEventListener("resize", checkScroll);
        clearTimeout(timer);
      };
    }
  }, [role, page]); // check scroll if role or active page changes

  const handleScrollClick = () => {
    const el = sidebarRef.current;
    if (!el) return;
    if (isAtBottom) {
      el.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  };

  return (
    <>
      {/* Desktop sidebar */}
      <div className={`hidden md:flex md:flex-col h-screen sticky top-0 shrink-0 glass-sidebar shadow-lg tour-sidebar-target relative transition-all duration-300 ${isCollapsed ? "w-20" : "w-64"}`}>
        <div ref={sidebarRef} className="p-5 flex-1 flex flex-col overflow-y-auto min-h-0">
          <div 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="mb-8 text-center flex flex-col items-center cursor-pointer select-none group/logo"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            <div className={`w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center bg-white shadow-md mb-2 transition-all duration-300 group-hover/logo:scale-105 active:scale-95 ${isCollapsed ? "scale-90" : ""}`}>
              <img src={appLogo} alt="SecureSys Logo" className="w-full h-full object-cover" />
            </div>

            {!isCollapsed && (
              <>
                <h1 className="text-xl font-bold text-white transition-colors duration-200 group-hover/logo:text-slate-200 animate-fade-in">SecureSys</h1>
                {role && (
                  <span className="inline-block mt-2 px-3 py-0.5 text-[10px] rounded-full bg-white/10 text-slate-100 border border-white/10 font-bold uppercase tracking-wider animate-fade-in">{role}</span>
                )}
              </>
            )}
          </div>

          <ul className="space-y-1.5 pb-16">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = page === item.key;
              return (
                <li
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  className={`cursor-pointer rounded-xl transition-all duration-300 flex items-center relative overflow-hidden group ${
                    isCollapsed ? "justify-center p-3" : "px-4.5 py-3 gap-3.5"
                  } ${isActive
                      ? "bg-blue-600 text-white font-bold shadow-md shadow-slate-950/40 border border-white/10"
                      : "text-slate-400 hover:text-white hover:bg-white/5 font-medium"
                    }`}
                  title={isCollapsed ? t(item.key) : ""}
                  >
                  <Icon className={`text-lg transition-all duration-300 ${isActive ? "text-white scale-110" : "text-slate-400 group-hover:text-white group-hover:scale-110"}`} />
                  {!isCollapsed && (
                    <span className="text-[13px] tracking-wide animate-fade-in">{t(item.key)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        {canScroll && (
          <button
            onClick={handleScrollClick}
            className="absolute bottom-4 right-4 w-10 h-10 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-full flex items-center justify-center shadow-lg border border-slate-800 hover:scale-105 active:scale-95 transition-all z-20"
            title={isAtBottom ? "Scroll to Top" : "Scroll to Bottom"}
          >
            {isAtBottom ? <FaChevronUp className="text-sm" /> : <FaChevronDown className="text-sm" />}
          </button>
        )}
      </div>

      {/* Mobile Drawer Overlay */}
      <div
        className={`md:hidden fixed inset-0 bg-black/40 z-[70] backdrop-blur-sm transition-opacity duration-300 ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Mobile Drawer */}
      <div className={`md:hidden fixed inset-y-0 left-0 w-72 z-[80] transform transition-transform duration-300 ease-in-out flex flex-col`}
        style={{
          background: "linear-gradient(160deg, #f0f4ff 0%, #ffffff 100%)",
          boxShadow: "4px 0 24px rgba(0,0,0,0.12)",
          transform: isOpen ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        <div className="p-5 flex-1 flex flex-col overflow-y-auto">
          {/* Drawer Header */}
          <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center bg-white shadow-sm shrink-0">
                <img src={appLogo} alt="SecureSys Logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-800">SecureSys</h1>
                {role && (
                  <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 font-medium capitalize">{role}</span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 rounded-full transition"
            >
              ✕
            </button>
          </div>

          <ul className="space-y-2 flex-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = page === item.key;
              return (
                <li
                  key={item.key}
                  onClick={() => {
                    onNavigate(item.key);
                    onClose();
                  }}
                  className={`cursor-pointer px-4.5 py-3.5 rounded-xl transition-all duration-300 flex items-center gap-3.5 ${isActive
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20 font-bold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-semibold"
                    }`}
                >
                  <Icon className={`text-lg transition-transform duration-350 ${isActive ? "text-white scale-110" : "text-blue-500"}`} />
                  <span className="text-sm tracking-wide">{t(item.key)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}

export default Sidebar;
