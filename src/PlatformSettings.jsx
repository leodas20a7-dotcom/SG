import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { FaHistory, FaBuilding, FaMoneyBillWave, FaBullhorn, FaSync } from 'react-icons/fa';
import LoadingOverlay from './LoadingOverlay';

function PlatformSettings() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('platform_audit_logs')
        .select(`
          *,
          companies ( name )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error("Error fetching logs:", error);
      } else {
        setLogs(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const getIconForAction = (action) => {
    if (action.includes('TENANT')) return <FaBuilding className="text-blue-500" />;
    if (action.includes('BILLING')) return <FaMoneyBillWave className="text-green-500" />;
    if (action.includes('BROADCAST')) return <FaBullhorn className="text-purple-500" />;
    return <FaHistory className="text-gray-500" />;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-fade-in relative">
      {loading && <LoadingOverlay message="Loading audit logs..." />}
      
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Platform Settings & Audit Logs</h2>
          <p className="text-gray-500 mt-1">View major administrative actions across the platform.</p>
        </div>
        <button 
          onClick={fetchLogs}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-bold transition shadow-sm text-sm"
        >
          <FaSync className={loading ? "animate-spin" : ""} /> Refresh Logs
        </button>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden bg-white shadow-sm border border-gray-100">
        <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-700 uppercase tracking-wider text-xs flex items-center gap-2">
            <FaHistory /> Activity Feed
          </h3>
          <span className="text-xs text-gray-500 font-medium">Last 100 events</span>
        </div>
        
        <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
          {logs.length === 0 && !loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              No major actions have been recorded yet.
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-gray-50 transition flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center shrink-0 mt-1">
                  {getIconForAction(log.action_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 mb-0.5">
                    {log.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="font-medium bg-gray-100 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">
                      {log.action_type}
                    </span>
                    {log.companies?.name && (
                      <span className="flex items-center gap-1">
                        <FaBuilding className="text-gray-400" /> {log.companies.name}
                      </span>
                    )}
                    <span>{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default PlatformSettings;
