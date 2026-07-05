import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabase';
import { FaBuilding, FaUserShield, FaChartLine, FaCheckCircle, FaTimesCircle, FaEllipsisV, FaEdit, FaTrash, FaTimes, FaFilter, FaSearch } from 'react-icons/fa';
import { useToast } from './Toast';
import CompanyDeepDive from './CompanyDeepDive';

function TenantManagement() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState(null); // 'edit' or 'delete'
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [editStatus, setEditStatus] = useState('active');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [deepDiveCompany, setDeepDiveCompany] = useState(null);

  // Filters State
  const [showFilters, setShowFilters] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [filterEmail, setFilterEmail] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDate, setFilterDate] = useState('');

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

      setCompanies(companiesData || []);
    } catch (err) {
      console.error("Error fetching platform data:", err);
      if (showToast) showToast("Error fetching data.", "error");
    } finally {
      setLoading(false);
    }
  }
  const filteredCompanies = useMemo(() => {
    return companies.filter(c => {
      const matchName = c.name.toLowerCase().includes(filterName.toLowerCase());
      const matchEmail = c.contact_email.toLowerCase().includes(filterEmail.toLowerCase());
      const matchStatus = filterStatus === 'all' || c.subscription_status === filterStatus;
      
      let matchDate = true;
      if (filterDate) {
        // Match exact date (ignoring time)
        const cDate = new Date(c.created_at).toISOString().split('T')[0];
        matchDate = cDate === filterDate;
      }

      return matchName && matchEmail && matchStatus && matchDate;
    });
  }, [companies, filterName, filterEmail, filterStatus, filterDate]);

  const handleEditSubscription = async () => {
    if (!selectedCompany) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update({ subscription_status: editStatus })
        .eq('id', selectedCompany.id);
      
      if (error) throw error;

      await supabase.from('platform_audit_logs').insert([{
        action_type: 'TENANT_UPDATED',
        description: `Company "${selectedCompany.name}" subscription status changed to ${editStatus.toUpperCase()}`,
        company_id: selectedCompany.id
      }]);

      showToast("Subscription updated.", "success");
      setActionModal(null);
      fetchPlatformData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!selectedCompany) return;
    if (deleteConfirmText !== selectedCompany.name) {
      showToast("Company name does not match.", "error");
      return;
    }
    setActionLoading(true);
    try {
      await supabase.from('platform_audit_logs').insert([{
        action_type: 'TENANT_DELETED',
        description: `Company "${selectedCompany.name}" and all associated data was permanently deleted.`
      }]);

      const { error } = await supabase.rpc('delete_company_and_users', { target_company_id: selectedCompany.id });
      
      if (error) {
        // Fallback for before they run the SQL script
        const { error: delErr } = await supabase
          .from('companies')
          .delete()
          .eq('id', selectedCompany.id);
        if (delErr) throw delErr;
      }
      
      showToast("Company and all cascaded data permanently deleted.", "success");
      setActionModal(null);
      fetchPlatformData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
      setDeleteConfirmText('');
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading platform data...</div>;
  }

  if (deepDiveCompany) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <CompanyDeepDive company={deepDiveCompany} onBack={() => setDeepDiveCompany(null)} />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto animate-fade-in relative">
      <ToastContainer />
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Tenant Management</h1>
        <p className="text-gray-500">Manage and monitor all SaaS company accounts.</p>
      </div>


      {/* Companies List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 bg-slate-50 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800">Registered Tenants</h2>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition border ${
              showFilters ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <FaFilter /> {showFilters ? 'Hide Filters' : 'Filter Tenants'}
          </button>
        </div>
        
        {/* Filter Drawer */}
        {showFilters && (
          <div className="bg-white border-b border-gray-100 p-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Company Name</label>
                <div className="relative">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    placeholder="Search by name..." 
                    className="w-full h-10 pl-9 pr-3 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Contact Email</label>
                <div className="relative">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    value={filterEmail}
                    onChange={(e) => setFilterEmail(e.target.value)}
                    placeholder="Search by email..." 
                    className="w-full h-10 pl-9 pr-3 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Subscription Status</label>
                <select 
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="trialing">Trialing</option>
                  <option value="suspended">Suspended</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Joined Date</label>
                <input 
                  type="date" 
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                />
              </div>
            </div>
            
            <div className="mt-4 flex justify-end">
              <button 
                onClick={() => { setFilterName(''); setFilterEmail(''); setFilterStatus('all'); setFilterDate(''); }}
                className="text-sm font-bold text-gray-500 hover:text-gray-700 transition"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-semibold tracking-wide text-gray-500 uppercase border-b border-gray-100 bg-white">
                <th className="px-6 py-4">Company Name</th>
                <th className="px-6 py-4">Contact Email</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Joined At</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredCompanies.map((company) => (
                <tr key={company.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => setDeepDiveCompany(company)}
                      className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline transition text-left"
                    >
                      {company.name}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{company.contact_email}</td>
                  <td className="px-6 py-4">
                    {company.subscription_status === 'active' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <FaCheckCircle className="text-[10px]" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        <FaTimesCircle className="text-[10px]" /> Trialing / Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-sm">
                    {new Date(company.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right space-x-3">
                    <button 
                      onClick={() => { setSelectedCompany(company); setEditStatus(company.subscription_status); setActionModal('edit'); }}
                      className="text-indigo-600 hover:text-indigo-800 transition"
                      title="Edit Subscription"
                    >
                      <FaEdit />
                    </button>
                    <button 
                      onClick={() => { setSelectedCompany(company); setDeleteConfirmText(''); setActionModal('delete'); }}
                      className="text-red-500 hover:text-red-700 transition"
                      title="Delete Tenant"
                    >
                      <FaTrash />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredCompanies.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                    {companies.length === 0 ? "No companies registered yet." : "No companies match your filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Subscription Modal */}
      {actionModal === 'edit' && selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl relative animate-scale-in">
            <button onClick={() => setActionModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <FaTimes />
            </button>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Edit Subscription</h3>
            <p className="text-sm text-gray-500 mb-6">Manage billing status for <strong>{selectedCompany.name}</strong></p>
            
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Status</label>
              <select 
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="w-full h-11 border border-gray-200 rounded-xl px-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="active">Active</option>
                <option value="trialing">Trialing</option>
                <option value="suspended">Suspended</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setActionModal(null)} className="px-4 py-2 font-bold text-gray-500 hover:bg-gray-100 rounded-xl">Cancel</button>
              <button onClick={handleEditSubscription} disabled={actionLoading} className="px-4 py-2 font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700">
                {actionLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Tenant Modal */}
      {actionModal === 'delete' && selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-scale-in border-t-4 border-red-500">
            <button onClick={() => setActionModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <FaTimes />
            </button>
            
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xl shrink-0">
                <FaTrash />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Danger Zone</h3>
            </div>
            
            <p className="text-sm text-gray-700 mb-4 leading-relaxed">
              You are about to permanently delete <strong>{selectedCompany.name}</strong>. This will instantly wipe all of their guards, duty locations, incidents, and attendance logs from the system via cascade. This cannot be undone.
            </p>

            <div className="mb-6">
              <label className="block text-xs font-bold text-red-600 uppercase mb-2">Type "{selectedCompany.name}" to confirm</label>
              <input 
                type="text" 
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={selectedCompany.name}
                className="w-full h-11 border border-red-200 rounded-xl px-3 bg-red-50 focus:bg-white focus:ring-2 focus:ring-red-500 outline-none text-red-900 font-medium"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setActionModal(null)} className="px-4 py-2 font-bold text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
              <button 
                onClick={handleDeleteCompany} 
                disabled={actionLoading || deleteConfirmText !== selectedCompany.name} 
                className={`px-4 py-2 font-bold text-white rounded-xl ${actionLoading || deleteConfirmText !== selectedCompany.name ? 'bg-red-300 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {actionLoading ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TenantManagement;
