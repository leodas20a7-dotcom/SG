import {
  FaChartBar,
  FaUserShield,
  FaClipboardCheck,
  FaExclamationTriangle,
  FaFileAlt,
  FaGlobeAsia,
  FaCog,
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
  { key: "correction-requests", label: "Corrections", icon: FaClipboardCheck, roles: ["admin", "supervisor"] },
  { key: "settings", label: "Settings", icon: FaCog, roles: ["admin"] },
];

function Sidebar({ role, page, onNavigate, isOpen, onClose }) {
  const { t } = useLanguage();
  const navItems = ALL_NAV.filter((item) => item.roles.includes(role));

  const appLogo = "/logo.png";

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-col w-64 h-screen sticky top-0 shrink-0 glass-sidebar shadow-lg">
        <div className="p-5 flex-1 flex flex-col">
          <div className="mb-8 text-center flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center bg-white shadow-md mb-2">
              <img src={appLogo} alt="SecureSys Logo" className="w-full h-full object-cover" />
            </div>
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
                  <span>{t(item.key)}</span>
                </li>
              );
            })}
          </ul>
        </div>
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

          {/* Nav Items */}
          <ul className="space-y-1 flex-1">
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
                  className={`cursor-pointer px-4 py-3.5 rounded-xl transition flex items-center gap-3 ${isActive
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-gray-600 hover:text-gray-900 hover:bg-white/80 font-medium"
                    }`}
                >
                  <Icon className={`text-lg ${isActive ? "text-white" : "text-blue-500"}`} />
                  <span className="text-sm font-medium">{t(item.key)}</span>
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
