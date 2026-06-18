import { useState } from "react";
import Guards from "./Guards";
import DutyLocations from "./DutyLocations";

function StaffRegistry() {
  const [activeTab, setActiveTab] = useState("guards");

  return (
    <div className="mt-8">
      <div className="flex mb-6 bg-slate-100 p-1 rounded-2xl shadow-inner gap-1 max-w-md md:max-w-none">
        <button
          onClick={() => setActiveTab("guards")}
          className={`flex-1 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all duration-300 whitespace-nowrap flex items-center justify-center gap-1.5 ${
            activeTab === "guards" 
              ? "bg-indigo-600 text-white shadow-md" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
          }`}
        >
          <span>👮</span>
          <span className="hidden sm:inline">Guard Profiles & Login</span>
          <span className="sm:hidden">Profiles</span>
        </button>
        <button
          onClick={() => setActiveTab("locations")}
          className={`flex-1 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all duration-300 whitespace-nowrap flex items-center justify-center gap-1.5 ${
            activeTab === "locations" 
              ? "bg-indigo-600 text-white shadow-md" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
          }`}
        >
          <span>📍</span>
          <span className="hidden sm:inline">Duty Locations</span>
          <span className="sm:hidden">Locations</span>
        </button>
      </div>

      <div className="transition-all duration-300">
        {activeTab === "guards" && <Guards />}
        {activeTab === "locations" && <DutyLocations />}
      </div>
    </div>
  );
}

export default StaffRegistry;
