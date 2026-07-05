import { useEffect, useState } from "react";
import MapView from "./MapView";
import Attendance from "./Attendance";

function LiveOps({ role, tourView, companyId }) {
  const [view, setView] = useState(() => {
    const savedView = typeof window !== "undefined" ? sessionStorage.getItem("liveops_view") : null;
    return savedView || "map";
  }); // "map" or "checkin"

  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("liveops_view");
    }
  }, []);

  useEffect(() => {
    if (tourView) {
      setView(tourView);
    }
  }, [tourView]);

  return (
    <div className="mt-2">
      {/* Premium Toggle Switch in center */}
      <div className="flex justify-center mb-6">
        <div className="p-1 rounded-2xl inline-flex gap-1 shadow-sm border border-gray-100 bg-white/80 backdrop-blur-md">
          <button
            onClick={() => setView("map")}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 flex items-center gap-2 ${
              view === "map"
                ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                : "text-gray-500 hover:text-gray-800 hover:bg-gray-50/50"
            }`}
          >
            🗺️ Live Map
          </button>
          <button
            onClick={() => setView("checkin")}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 flex items-center gap-2 ${
              view === "checkin"
                ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                : "text-gray-500 hover:text-gray-800 hover:bg-gray-50/50"
            }`}
          >
            📋 Attendance
          </button>
        </div>
      </div>

      <div className="animate-fade-in">
        {view === "map" ? (
          <MapView companyId={companyId} />
        ) : (
          <Attendance role={role} companyId={companyId} />
        )}
      </div>
    </div>
  );
}

export default LiveOps;
