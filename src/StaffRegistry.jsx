import { useState } from "react";
import Guards from "./Guards";
import DutyLocations from "./DutyLocations";
import Shifts from "./Shifts";

function StaffRegistry() {
  const [activeTab, setActiveTab] = useState("guards");

  return (
    <div className="mt-8">
      <div className="flex border-b border-gray-200 mb-6 bg-white p-2 rounded-xl shadow-sm gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("guards")}
          className={`flex-1 md:flex-initial px-5 py-3 rounded-lg text-sm font-semibold transition whitespace-nowrap ${
            activeTab === "guards" ? "bg-indigo-600 text-white shadow-md" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
          }`}
        >
          👮 Guard Profiles & Login
        </button>
        <button
          onClick={() => setActiveTab("locations")}
          className={`flex-1 md:flex-initial px-5 py-3 rounded-lg text-sm font-semibold transition whitespace-nowrap ${
            activeTab === "locations" ? "bg-indigo-600 text-white shadow-md" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
          }`}
        >
          📍 Duty Locations
        </button>
        <button
          onClick={() => setActiveTab("shifts")}
          className={`flex-1 md:flex-initial px-5 py-3 rounded-lg text-sm font-semibold transition whitespace-nowrap ${
            activeTab === "shifts" ? "bg-indigo-600 text-white shadow-md" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
          }`}
        >
          🗓️ Shift Scheduling
        </button>
      </div>

      <div className="transition-all duration-300">
        {activeTab === "guards" && <Guards />}
        {activeTab === "locations" && <DutyLocations />}
        {activeTab === "shifts" && <Shifts />}
      </div>
    </div>
  );
}

export default StaffRegistry;
