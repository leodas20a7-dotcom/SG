import { useRef, useState, useEffect } from "react";
import {
  FaChartBar,
  FaUserShield,
  FaClipboardCheck,
  FaCalendarAlt,
  FaExclamationTriangle,
  FaShieldAlt,
  FaFileAlt,
  FaMapMarkerAlt,
  FaGlobeAsia,
} from "react-icons/fa";

const ALL_NAV = [
  { key: "dashboard", label: "Dashboard", icon: FaChartBar, roles: ["admin", "supervisor", "guard"] },
  { key: "live-ops", label: "Live Tracking", icon: FaGlobeAsia, roles: ["admin", "supervisor"] },
  { key: "staff-registry", label: "Staff Registry", icon: FaUserShield, roles: ["admin"] },
  { key: "guard-profiles", label: "Guard Profiles", icon: FaClipboardCheck, roles: ["admin", "supervisor"] },
  { key: "system-users", label: "System Access", icon: FaUserShield, roles: ["admin"] },
  { key: "incidents", label: "Incident complaints", icon: FaExclamationTriangle, roles: ["admin", "supervisor", "guard"] },
  { key: "circulars", label: "Circulars Board", icon: FaFileAlt, roles: ["admin", "supervisor", "guard"] },
  { key: "correction-requests", label: "Correction Requests", icon: FaClipboardCheck, roles: ["admin", "supervisor"] },
];

function Sidebar({ role, page, onNavigate, onLogout }) {
  const [showNav, setShowNav] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const current = window.scrollY;
      if (current > lastScrollY.current && current > 60) {
        setShowNav(false);
      } else {
        setShowNav(true);
      }
      lastScrollY.current = current;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navItems = ALL_NAV.filter((item) => item.roles.includes(role));

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-col w-64 glass-sidebar shadow-lg">
        <div className="p-5 flex-1 flex flex-col">
          <div className="mb-8 text-center">
            <div className="text-3xl mb-1">🛡️</div>
            <h1 className="text-xl font-bold text-gray-800">SecureSys</h1>
            {role && (
              <span className="inline-block mt-2 px-3 py-1 text-xs rounded-full bg-blue-100 text-blue-700 font-medium capitalize">{role}</span>
            )}
          </div>

          <ul className="space-y-1 flex-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  className={`cursor-pointer px-4 py-3 rounded-xl transition flex items-center gap-3 ${page === item.key
                      ? "bg-white/80 text-blue-600 shadow-sm font-medium"
                      : "text-gray-500 hover:text-gray-800 hover:bg-white/40"
                    }`}
                >
                  <Icon className="text-lg" />
                  <span>{item.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div
        className={`md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200/50 transition-transform duration-300 ${showNav ? "translate-y-0" : "translate-y-full"
          }`}
        style={{ background: "rgba(255,255,255,0.97)", backdropFilter: "blur(12px)" }}
      >
        <div className="flex justify-around items-center py-2">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`flex flex-col items-center gap-1 px-2 py-1 text-xs ${page === item.key ? "text-blue-600" : "text-gray-500"
                  }`}
              >
                <Icon className="text-lg" />
                <span className="truncate max-w-[60px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default Sidebar;
