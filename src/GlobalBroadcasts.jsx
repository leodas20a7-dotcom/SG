import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { FaBullhorn, FaEdit, FaTrash, FaTimes } from 'react-icons/fa';
import { useToast } from './Toast';

function GlobalBroadcasts() {
  const { showToast, ToastContainer } = useToast();
  
  // Broadcast States
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastType, setBroadcastType] = useState('info');
  const [activeBroadcast, setActiveBroadcast] = useState(null);
  const [allBroadcasts, setAllBroadcasts] = useState([]);
  
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modals State
  const [editModal, setEditModal] = useState(null); // stores the broadcast object being edited
  const [editMessage, setEditMessage] = useState('');
  const [editType, setEditType] = useState('info');
  const [deleteModal, setDeleteModal] = useState(null); // stores the broadcast object being deleted
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchPlatformData();
  }, []);

  async function fetchPlatformData() {
    try {
      // Fetch all broadcasts
      const { data: broadcastData, error } = await supabase
        .from('global_broadcasts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (broadcastData) {
        setAllBroadcasts(broadcastData);
        const active = broadcastData.find(b => b.active === true);
        setActiveBroadcast(active || null);
      }
    } catch (err) {
      console.error("Error fetching broadcasts:", err);
      if (showToast) showToast("Error fetching broadcasts.", "error");
    } finally {
      setLoading(false);
    }
  }

  const handleCreateBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;
    setBroadcastLoading(true);
    try {
      // Deactivate any existing active broadcasts
      await supabase.from('global_broadcasts').update({ active: false }).eq('active', true);
      
      const { error } = await supabase.from('global_broadcasts').insert([{
        message: broadcastMessage.trim(),
        type: broadcastType,
        active: true
      }]);
      
      if (error) throw error;

      await supabase.from('platform_audit_logs').insert([{
        action_type: 'GLOBAL_BROADCAST',
        description: `Sent a new ${broadcastType.toUpperCase()} broadcast: "${broadcastMessage.trim()}"`
      }]);

      showToast("Global Broadcast sent successfully!", "success");
      setBroadcastMessage('');
      fetchPlatformData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setBroadcastLoading(false);
    }
  };

  const handleDeactivateBroadcast = async () => {
    if (!activeBroadcast) return;
    try {
      const { error } = await supabase.from('global_broadcasts').update({ active: false }).eq('id', activeBroadcast.id);
      if (error) throw error;
      showToast("Broadcast deactivated.", "success");
      fetchPlatformData();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleUpdateBroadcast = async () => {
    if (!editModal || !editMessage.trim()) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('global_broadcasts')
        .update({ message: editMessage.trim(), type: editType })
        .eq('id', editModal.id);
      
      if (error) throw error;
      showToast("Broadcast updated successfully.", "success");
      setEditModal(null);
      fetchPlatformData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteBroadcast = async () => {
    if (!deleteModal) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('global_broadcasts')
        .delete()
        .eq('id', deleteModal.id);
      
      if (error) throw error;
      showToast("Broadcast permanently deleted.", "success");
      setDeleteModal(null);
      fetchPlatformData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const openEditModal = (b) => {
    setEditModal(b);
    setEditMessage(b.message);
    setEditType(b.type);
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading broadcasts...</div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto animate-fade-in relative">
      <ToastContainer />
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">Global Broadcasts</h1>
        <p className="text-gray-500 dark:text-gray-400">Manage announcements sent to all users and organizations.</p>
      </div>

      {/* Global Broadcast Form */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-indigo-100 dark:border-slate-700 overflow-hidden mb-8">
        <div className="px-6 py-5 border-b border-indigo-100 dark:border-slate-700 bg-indigo-50/50 dark:bg-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-indigo-900 dark:text-indigo-400">Send New Broadcast</h2>
            <p className="text-sm text-indigo-600/80 dark:text-indigo-400/80">Active broadcasts appear at the top of every user's dashboard.</p>
          </div>
          <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center text-lg">
            📡
          </div>
        </div>
        
        <div className="p-6">
          {activeBroadcast ? (
            <div className={`p-5 rounded-xl border ${
              activeBroadcast.type === 'critical' ? 'bg-red-50 border-red-200' :
              activeBroadcast.type === 'warning' ? 'bg-amber-50 border-amber-200' :
              'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex justify-between items-start gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex h-2.5 w-2.5">
                      <span className={`animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full opacity-75 ${
                        activeBroadcast.type === 'critical' ? 'bg-red-400' :
                        activeBroadcast.type === 'warning' ? 'bg-amber-400' :
                        'bg-blue-400'
                      }`}></span>
                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                        activeBroadcast.type === 'critical' ? 'bg-red-500' :
                        activeBroadcast.type === 'warning' ? 'bg-amber-500' :
                        'bg-blue-500'
                      }`}></span>
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Currently Broadcasting</span>
                  </div>
                  <p className="text-gray-900 font-medium">{activeBroadcast.message}</p>
                </div>
                <button 
                  onClick={handleDeactivateBroadcast}
                  className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 hover:text-red-600 transition shadow-sm whitespace-nowrap"
                >
                  Deactivate
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateBroadcast} className="space-y-4">
              <div>
                <textarea 
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="Type your global announcement here..."
                  className="w-full h-24 border border-gray-200 dark:border-slate-600 rounded-xl p-4 bg-gray-50 dark:bg-slate-700 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  required
                ></textarea>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Type:</label>
                  <select 
                    value={broadcastType}
                    onChange={(e) => setBroadcastType(e.target.value)}
                    className="border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-sm text-gray-700 dark:text-gray-300"
                  >
                    <option value="info">Info (Blue)</option>
                    <option value="warning">Warning (Yellow)</option>
                    <option value="critical">Critical (Red)</option>
                  </select>
                </div>
                <button 
                  type="submit"
                  disabled={broadcastLoading || !broadcastMessage.trim()}
                  className={`px-6 py-2.5 font-bold text-white rounded-xl shadow-lg transition ${
                    broadcastLoading || !broadcastMessage.trim() ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                  }`}
                >
                  {broadcastLoading ? 'Broadcasting...' : 'Broadcast to All Users'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Broadcasts History */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">Broadcast History</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">View, edit, or delete past and present announcements.</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Message</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date Sent</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {allBroadcasts.map(b => (
                <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    {b.active ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-800 line-clamp-2 max-w-md">{b.message}</p>
                  </td>
                  <td className="px-6 py-4 capitalize text-sm text-gray-600">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold border ${
                      b.type === 'critical' ? 'bg-red-50 text-red-700 border-red-200' :
                      b.type === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {b.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {new Date(b.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button 
                        onClick={() => openEditModal(b)}
                        className="text-blue-600 hover:text-blue-800 transition" 
                        title="Edit Broadcast"
                      >
                        <FaEdit />
                      </button>
                      <button 
                        onClick={() => setDeleteModal(b)}
                        className="text-red-500 hover:text-red-700 transition" 
                        title="Delete Broadcast"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {allBroadcasts.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                    No broadcasts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl relative animate-scale-in">
            <button onClick={() => setEditModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <FaTimes />
            </button>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Edit Broadcast</h3>
            <p className="text-sm text-gray-500 mb-6">Modify the message or priority level.</p>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Message</label>
                <textarea 
                  value={editMessage}
                  onChange={(e) => setEditMessage(e.target.value)}
                  className="w-full h-24 border border-gray-200 rounded-xl p-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm"
                ></textarea>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Type</label>
                <select 
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full h-11 border border-gray-200 rounded-xl px-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setEditModal(null)} className="px-4 py-2 font-bold text-gray-500 hover:bg-gray-100 rounded-xl">Cancel</button>
              <button onClick={handleUpdateBroadcast} disabled={actionLoading || !editMessage.trim()} className="px-4 py-2 font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                {actionLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl relative animate-scale-in">
            <button onClick={() => setDeleteModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <FaTimes />
            </button>
            
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xl mb-4">
              <FaTrash />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Broadcast?</h3>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to permanently delete this broadcast? It will be removed from history completely.
            </p>

            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteModal(null)} className="flex-1 py-2 font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition">Cancel</button>
              <button onClick={handleDeleteBroadcast} disabled={actionLoading} className="flex-1 py-2 font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition">
                {actionLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GlobalBroadcasts;
