import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { supabase } from './lib/supabase';
import { FaBuilding, FaUserShield, FaChartLine, FaCheckCircle, FaTimesCircle, FaEllipsisV, FaEdit, FaTrash, FaTimes, FaFilter, FaSearch } from 'react-icons/fa';
import { useToast } from './Toast';

const CompanyDeepDive = React.lazy(() => import('./CompanyDeepDive'));

function PlatformAdminDashboard() {
  const [companies, setCompanies] = useState([]);
  const [stats, setStats] = useState({ totalCompanies: 0, totalGuards: 0, activeSubscriptions: 0 });
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState(null); // 'edit' or 'delete'
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [editStatus, setEditStatus] = useState('active');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [deepDiveCompany, setDeepDiveCompany] = useState(null);
  
  // Filters State (removed but kept for now if needed, we'll strip unused vars)
  const { showToast, ToastContainer } = useToast();

  useEffect(() => {
    fetchPlatformData();
  }, []);

  async function fetchPlatformData() {
    try {
      // 1. Fetch all companies
      const { data: companiesData, error: compErr } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (compErr) throw compErr;

      // 2. Fetch total guards across system
      const { count: guardCount, error: guardErr } = await supabase
        .from('guards')
        .select('*', { count: 'exact', head: true });

      if (guardErr) throw guardErr;

      // 3. Fetch active broadcast
      const { data: broadcastData } = await supabase
        .from('global_broadcasts')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      setCompanies(companiesData || []);
      setStats({
        totalCompanies: companiesData?.length || 0,
        totalGuards: guardCount || 0,
        activeSubscriptions: companiesData?.filter(c => c.subscription_status === 'active').length || 0,
      });
    } catch (err) {
      console.error("Error fetching platform data:", err);
      if (showToast) showToast("Error fetching data.", "error");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading platform data...</div>;
  }

  if (deepDiveCompany) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
          <CompanyDeepDive company={deepDiveCompany} onBack={() => setDeepDiveCompany(null)} />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto animate-fade-in relative">
      <ToastContainer />
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Platform Administration</h1>
        <p className="text-gray-500 dark:text-gray-400">Global overview of all SaaS tenants and system metrics.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">Total Companies</p>
            <h3 className="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalCompanies}</h3>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl">
            <FaBuilding />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">Total Guards</p>
            <h3 className="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalGuards}</h3>
          </div>
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-xl">
            <FaUserShield />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">Active Subscriptions</p>
            <h3 className="text-3xl font-bold text-gray-900 dark:text-white">{stats.activeSubscriptions}</h3>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl">
            <FaChartLine />
          </div>
        </div>
      </div>

    </div>
  );
}

export default PlatformAdminDashboard;
