import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

function Charts({ companyId }) {

  const [barData, setBarData] = useState({ labels: [], datasets: [] });
  const [pieData, setPieData] = useState({ labels: [], datasets: [] });

  useEffect(() => {
    async function fetchData() {
      let qG = supabase.from("guards").select("*", { count: "exact", head: true });
      let qA = supabase.from("attendance").select("*", { count: "exact", head: true });
      let qS = supabase.from("shifts").select("*", { count: "exact", head: true });
      let qI = supabase.from("incidents").select("*", { count: "exact", head: true });

      if (companyId) {
        qG = qG.eq("company_id", companyId);
        qA = qA.eq("company_id", companyId);
        qS = qS.eq("company_id", companyId);
        qI = qI.eq("company_id", companyId);
      }

      const { count: guards } = await qG;
      const { count: attendance } = await qA;
      const { count: shifts } = await qS;
      const { count: incidents } = await qI;

      setBarData({
        labels: ["Guards", "Attendance", "Shifts", "Incidents"],
        datasets: [{
          label: "Count",
          data: [guards || 0, attendance || 0, shifts || 0, incidents || 0],
          backgroundColor: ["#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"],
        }],
      });

      let qStatuses = supabase.from("incidents").select("incident_status");
      if (companyId) {
        qStatuses = qStatuses.eq("company_id", companyId);
      }
      const { data: statuses } = await qStatuses;
      if (statuses) {
        const counts = {};
        statuses.forEach((i) => { counts[i.incident_status] = (counts[i.incident_status] || 0) + 1; });
        const labels = Object.keys(counts);
        const values = Object.values(counts);
        setPieData({
          labels,
          datasets: [{
            data: values,
            backgroundColor: ["#f59e0b", "#3b82f6", "#10b981"],
          }],
        });
      }
    }
    fetchData();
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-xl font-semibold mb-5 text-gray-700">System Overview</h2>
        <Bar data={barData} options={{ 
          responsive: true, 
          color: '#94a3b8',
          scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148, 163, 184, 0.1)' } },
            y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148, 163, 184, 0.1)' } }
          },
          plugins: { legend: { display: false } } 
        }} />
      </div>

      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-xl font-semibold mb-5 text-gray-700">Incident Status</h2>
        {pieData.labels.length > 0
          ? <Pie data={pieData} options={{ 
              responsive: true,
              color: '#94a3b8',
              plugins: { legend: { labels: { color: '#94a3b8' } } }
            }} />
          : <div className="flex items-center justify-center h-[300px] text-gray-400">No incident data</div>
        }
      </div>
    </div>
  );
}

export default Charts;
