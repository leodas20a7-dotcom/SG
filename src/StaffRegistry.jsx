import { useEffect, useState } from "react";
import Guards from "./Guards";
import DutyLocations from "./DutyLocations";
import { FaUserShield, FaMapMarkerAlt } from "react-icons/fa";

function StaffRegistry({ tourTab, onNavigate }) {
  const [activeTab, setActiveTab] = useState("guards");

  useEffect(() => {
    if (tourTab) {
      setActiveTab(tourTab);
    }
  }, [tourTab]);

  return (
    <div className="mt-8">
      <div className="flex justify-center mb-6">
        <div className="p-1 rounded-2xl inline-flex gap-1 shadow-sm border border-gray-100 bg-white/80 backdrop-blur-md">
          <button
            onClick={() => setActiveTab("guards")}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 flex items-center gap-2 ${
              activeTab === "guards" 
                ? "bg-blue-600 text-white shadow-md shadow-blue-200" 
                : "text-slate-500 hover:text-slate-800 hover:bg-gray-50/50"
            }`}
          >
            <FaUserShield className={`text-sm ${activeTab === "guards" ? "text-white" : "text-slate-400"}`} />
            <span>Guard Profiles & Login</span>
          </button>
          <button
            onClick={() => setActiveTab("locations")}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 flex items-center gap-2 ${
              activeTab === "locations" 
                ? "bg-blue-600 text-white shadow-md shadow-blue-200" 
                : "text-slate-500 hover:text-slate-800 hover:bg-gray-50/50"
            }`}
          >
            <FaMapMarkerAlt className={`text-sm ${activeTab === "locations" ? "text-white" : "text-slate-400"}`} />
            <span>Shift Locations</span>
          </button>
        </div>
      </div>

      <div className="transition-all duration-300">
        {activeTab === "guards" && <Guards onNavigate={onNavigate} />}
        {activeTab === "locations" && <DutyLocations />}
      </div>
    </div>
  );
}

export default StaffRegistry;
