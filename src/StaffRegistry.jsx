import { useEffect, useState } from "react";
import Guards from "./Guards";
import DutyLocations from "./DutyLocations";
import { FaUserShield, FaMapMarkerAlt } from "react-icons/fa";

function StaffRegistry({ tourTab, onNavigate, companyId }) {
  const [activeTab, setActiveTab] = useState("guards");

  const [runTour, setRunTour] = useState(!localStorage.getItem('hasSeenStaffRegistryTour'));
  const tourSteps = [
    {
      target: '#tour-staff-guards',
      content: 'This is where you register new security guards. You can manage their profiles, passcodes, and system access here.',
      disableBeacon: true,
    },
    {
      target: '#tour-staff-locations',
      content: 'Before assigning shifts, make sure to add your client Duty Locations here! Guards will check in at these specific sites.',
    }
  ];

  const handleJoyrideCallback = (data) => {
    const { status } = data;
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      localStorage.setItem('hasSeenStaffRegistryTour', 'true');
      setRunTour(false);
    }
  };

  useEffect(() => {
    if (tourTab) {
      setActiveTab(tourTab);
    }
    
    const handleNavigateToLocations = () => {
      setActiveTab("locations");
    };
    window.addEventListener("navigate_to_locations", handleNavigateToLocations);
    return () => window.removeEventListener("navigate_to_locations", handleNavigateToLocations);
  }, [tourTab]);

  return (
    <div className="mt-8 relative">
      <div className="flex justify-center mb-6">
        <div className="p-1 rounded-2xl inline-flex gap-1 shadow-sm border border-gray-100 bg-white/80 backdrop-blur-md">
          <button
            id="tour-staff-guards"
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
            id="tour-staff-locations"
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
        {activeTab === "guards" && <Guards onNavigate={onNavigate} companyId={companyId} />}
        {activeTab === "locations" && <DutyLocations companyId={companyId} />}
      </div>
    </div>
  );
}

export default StaffRegistry;
