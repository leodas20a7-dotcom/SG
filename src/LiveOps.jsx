import MapView from "./MapView";
import Attendance from "./Attendance";

function LiveOps({ role }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mt-6">
      <div className="xl:sticky xl:top-8 self-start">
        <MapView />
      </div>
      <div>
        <Attendance role={role} />
      </div>
    </div>
  );
}

export default LiveOps;
