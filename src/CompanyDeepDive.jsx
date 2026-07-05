import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { FaArrowLeft, FaUsers, FaMapMarkerAlt, FaExclamationTriangle, FaCalendarCheck } from 'react-icons/fa';

function CompanyDeepDive({ company, onBack }) {
  const [stats, setStats] = useState({ guards: 0, locations: 0, incidents: 0, attendance: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCompanyData() {
      if (!company) return;
      try {
        setLoading(true);
        const [guardsRes, locationsRes, incidentsRes, attendanceRes] = await Promise.all([
          supabase.from('guards').select('*', { count: 'exact', head: true }).eq('company_id', company.id),
          supabase.from('duty_locations').select('*', { count: 'exact', head: true }).eq('company_id', company.id),
          supabase.from('incidents').select('*', { count: 'exact', head: true }).eq('company_id', company.id),
          supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('company_id', company.id)
        ]);

        setStats({
          guards: guardsRes.count || 0,
          locations: locationsRes.count || 0,
          incidents: incidentsRes.count || 0,
          attendance: attendanceRes.count || 0
        });
      } catch (err) {
        console.error("Error fetching company deep dive:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchCompanyData();
  }, [company]);

  if (!company) return null;

  return (
    <div className="animate-fade-in">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-bold mb-6 transition"
      >
        <FaArrowLeft /> Back to Platform Overview
      </button>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 mb-1">{company.name}</h2>
          <p className="text-gray-500">Registered: {new Date(company.created_at).toLocaleDateString()} • Contact: <a href={`mailto:${company.contact_email}`} className="text-indigo-500 hover:underline">{company.contact_email}</a></p>
        </div>
        <div>
          <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border shadow-sm ${
            company.subscription_status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
            'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            Status: {company.subscription_status}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center hover:shadow-md transition">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-xl mb-3">
              <FaUsers />
            </div>
            <h3 className="text-3xl font-bold text-gray-900">{stats.guards}</h3>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mt-1">Guards</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center hover:shadow-md transition">
            <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center text-xl mb-3">
              <FaMapMarkerAlt />
            </div>
            <h3 className="text-3xl font-bold text-gray-900">{stats.locations}</h3>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mt-1">Duty Locations</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center hover:shadow-md transition">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-xl mb-3">
              <FaExclamationTriangle />
            </div>
            <h3 className="text-3xl font-bold text-gray-900">{stats.incidents}</h3>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mt-1">Incidents</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center hover:shadow-md transition">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center text-xl mb-3">
              <FaCalendarCheck />
            </div>
            <h3 className="text-3xl font-bold text-gray-900">{stats.attendance}</h3>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mt-1">Attendance Logs</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default CompanyDeepDive;
