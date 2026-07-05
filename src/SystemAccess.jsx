import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import CustomSelect from "./CustomSelect";
import { ALL_NAV } from "./Sidebar";
import { FaCog, FaTimes, FaLock, FaCheck, FaEdit, FaTrash, FaEye, FaEyeSlash, FaUsersSlash } from "react-icons/fa";

function SystemAccess({ companyId }) {
  const [users, setUsers] = useState([]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("supervisor");
  const [selectedPages, setSelectedPages] = useState([]);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { showToast, ToastContainer } = useToast();

  async function fetchUsers() {
    try {
      // Fetch only admins and supervisors
      let q = supabase
        .from("profiles")
        .select("*")
        .in("role", ["admin", "supervisor"])
        .order("created_at", { ascending: false });
      if (companyId) q = q.eq("company_id", companyId);
      const { data } = await q;
      setUsers(data || []);
    } catch { showToast("Could not load users.", "error"); }
  }

  function validate() {
    const errs = {};
    if (!fullName.trim()) errs.fullName = "Name is required";
    else if (fullName.trim().length < 2) errs.fullName = "Name must be at least 2 characters";
    if (!email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email";
    if (!password) errs.password = "Password is required";
    else if (password.length < 6) errs.password = "Min 6 characters";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function addUser() {
    if (!validate()) return;

    if (editingUserId) {
      setLoading(true);
      try {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ name: fullName.trim(), role, allowed_pages: selectedPages.length > 0 ? selectedPages : null, email: email.trim() })
          .eq("id", editingUserId);
        
        if (profileError) { 
          showToast("Error updating profile: " + profileError.message, "error"); 
          return; 
        }
        showToast(`User "${fullName.trim()}" updated!`, "success");
        setFullName(""); setEmail(""); setPassword(""); setRole("supervisor"); setSelectedPages([]); setEditingUserId(null);
        fetchUsers();
      } catch (err) {
        console.error("Update error:", err);
        showToast("Error: " + err.message, "error"); 
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      setLoading(true);
      
      // Temporarily tell App.jsx to ignore auth state changes so we don't get kicked out
      sessionStorage.setItem("ignore_auth_change", "true");

      const { data: { session: savedSession } } = await supabase.auth.getSession();

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            is_sub_user: true,
            company_id: companyId,
            role: role,
            name: fullName.trim()
          }
        }
      });
      if (authError) {
        sessionStorage.removeItem("ignore_auth_change");
        if (authError.message.includes("already")) {
          showToast("This email is already registered.", "error");
        } else {
          showToast(authError.message, "error");
        }
        return;
      }
      const userId = authData.user?.id;
      if (!userId) { 
        sessionStorage.removeItem("ignore_auth_change");
        showToast("Could not create user account.", "error"); 
        return; 
      }

      if (savedSession) {
        const { error: sessionErr } = await supabase.auth.setSession({
          access_token: savedSession.access_token,
          refresh_token: savedSession.refresh_token,
        });
        if (sessionErr) showToast("Session issue, please re-login.", "error");
      }

      if (selectedPages.length > 0) {
        await supabase.from("profiles").update({ allowed_pages: selectedPages }).eq('id', userId);
      }
      
      // We are done with sensitive auth switching, allow App.jsx to react normally again
      sessionStorage.removeItem("ignore_auth_change");

      // The database trigger will automatically create the profile row using the metadata we passed.
      showToast("User added successfully!", "success");
      setFullName(""); setEmail(""); setPassword(""); setRole("supervisor"); setSelectedPages([]);
      fetchUsers();
    } catch { 
      sessionStorage.removeItem("ignore_auth_change");
      showToast("Network error.", "error"); 
    }
    finally { 
      setLoading(false); 
    }
  }

  const editUser = (user) => {
    setEditingUserId(user.id);
    setFullName(user.name || "");
    setEmail(user.email || "");
    setRole(user.role || "supervisor");
    setSelectedPages(user.allowed_pages || []);
    setPassword("********"); // Dummy password display, not updated if untouched
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${user.name}?`)) return;
    try {
      const { error } = await supabase.rpc('delete_auth_user', { target_user_id: user.id });
      if (error) {
        // If RPC is missing, fallback to just deleting the profile
        const { error: delErr } = await supabase.from("profiles").delete().eq("id", user.id);
        if (delErr) throw delErr;
      }

      showToast("User deleted successfully.", "success");
      fetchUsers();
    } catch (err) {
      showToast("Error deleting user: " + err.message, "error");
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  function clearError(field) { setErrors((p) => ({ ...p, [field]: "" })); }

  return (
    <>
      <ToastContainer />
      <div className="mt-2">

        <div className="glass-card rounded-2xl p-6 mb-8 border border-slate-200/80 shadow-[0_15px_30px_-10px_rgba(15,23,42,0.08)] relative z-50">
          <h2 className="text-base font-bold mb-6 text-gray-800 flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600">👤</span>
            <span>Create Admin / Supervisor Login</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-bold text-slate-655 uppercase tracking-wider mb-2">Full Name</label>
              <input type="text" placeholder="Enter name" value={fullName}
                onChange={(e) => { setFullName(e.target.value); clearError("fullName"); }}
                className={`w-full h-11 border px-3 rounded-xl focus:outline-none focus:ring-4 transition text-xs bg-[#F4F6F9] hover:bg-slate-100/60 focus:bg-white ${
                  errors.fullName 
                    ? "border-red-400 focus:ring-red-500/10 focus:border-red-500" 
                    : "border-slate-200 focus:ring-blue-500/10 focus:border-blue-500"
                }`} />
              {errors.fullName && <p className="text-red-500 text-xs mt-1.5 font-semibold">⚠️ {errors.fullName}</p>}
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-655 uppercase tracking-wider mb-2">Email</label>
              <input type="email" placeholder="Enter email" value={email}
                onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                className={`w-full h-11 border px-3 rounded-xl focus:outline-none focus:ring-4 transition text-xs bg-[#F4F6F9] hover:bg-slate-100/60 focus:bg-white ${
                  errors.email 
                    ? "border-red-400 focus:ring-red-500/10 focus:border-red-500" 
                    : "border-slate-200 focus:ring-blue-500/10 focus:border-blue-500"
                }`} />
              {errors.email && <p className="text-red-500 text-xs mt-1.5 font-semibold">⚠️ {errors.email}</p>}
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-655 uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} placeholder="Min 6 chars" value={password}
                  disabled={editingUserId !== null}
                  onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
                  className={`w-full h-11 border pl-3 pr-10 rounded-xl focus:outline-none focus:ring-4 transition text-xs ${
                    editingUserId ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200" : "bg-[#F4F6F9] hover:bg-slate-100/60 focus:bg-white"
                  } ${
                    errors.password 
                      ? "border-red-400 focus:ring-red-500/10 focus:border-red-500" 
                      : "border-slate-200 focus:ring-blue-500/10 focus:border-blue-500"
                  }`} />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1.5 font-semibold">⚠️ {errors.password}</p>}
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-655 uppercase tracking-wider mb-2">Role & Permissions</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <CustomSelect
                    value={role}
                    onChange={val => { setRole(val); setSelectedPages([]); }}
                    options={[
                      { value: "supervisor", label: "Supervisor" },
                      { value: "admin", label: "Admin" }
                    ]}
                    placeholder="Supervisor"
                    heightClass="h-11"
                  />
                </div>
                <button 
                  onClick={() => setShowAccessModal(true)}
                  className={`px-4 h-11 shrink-0 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 border ${
                    selectedPages.length > 0 
                      ? "bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm shadow-indigo-100" 
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 shadow-sm"
                  }`}
                >
                  <FaLock className={selectedPages.length > 0 ? "text-indigo-500" : "text-slate-400"} />
                  {selectedPages.length > 0 ? `${selectedPages.length} Pages Allowed` : "Full Access (Default)"}
                </button>
              </div>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
            {editingUserId && (
              <button onClick={() => { setEditingUserId(null); setFullName(""); setEmail(""); setPassword(""); setRole("supervisor"); setSelectedPages([]); }}
                className="px-5 py-2.5 rounded-xl text-slate-600 font-bold text-xs bg-slate-100 hover:bg-slate-200 transition">
                Cancel
              </button>
            )}
            <button onClick={addUser} disabled={loading}
              className={`px-6 py-2.5 rounded-xl text-white font-bold text-xs bg-blue-600 hover:bg-blue-700 transition shadow-md shadow-blue-150 flex items-center justify-center gap-1.5 ${
                loading ? "bg-slate-350 cursor-not-allowed shadow-none" : ""
              }`}>
              {loading ? "Saving..." : (editingUserId ? "Update Administrative User" : "Add Administrative User")}
            </button>
          </div>
        </div>

        {/* Page Access Modal */}
        {showAccessModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative animate-scale-in">
              <button onClick={() => setShowAccessModal(false)} className="absolute top-6 right-6 w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition">
                <FaTimes />
              </button>
              
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl shadow-sm">
                  <FaLock />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Page Access Limits</h3>
                  <p className="text-sm text-slate-500">Select which pages this {role} can view.</p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-4 mb-6">
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  <strong>Note:</strong> If no pages are selected, the user will have <span className="font-bold">Full Access</span> to all pages standard for their role. Dashboard is always accessible.
                </p>
              </div>

              <div className="max-h-[40vh] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                {ALL_NAV.filter(n => n.roles.includes(role)).map(nav => {
                  const isSelected = selectedPages.includes(nav.key);
                  const Icon = nav.icon;
                  return (
                    <div 
                      key={nav.key}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedPages(prev => prev.filter(p => p !== nav.key));
                        } else {
                          setSelectedPages(prev => [...prev, nav.key]);
                        }
                      }}
                      className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition border ${
                        isSelected 
                          ? "bg-indigo-50 border-indigo-200/70" 
                          : "bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={isSelected ? "text-indigo-600 text-lg" : "text-slate-400 text-lg"} />
                        <span className={`font-semibold text-sm ${isSelected ? "text-indigo-900" : "text-slate-600"}`}>
                          {nav.label}
                        </span>
                      </div>
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                        isSelected ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 border border-slate-200"
                      }`}>
                        {isSelected && <FaCheck className="text-xs" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => setSelectedPages([])} 
                  className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-100 transition"
                >
                  Clear All
                </button>
                <button 
                  onClick={() => setShowAccessModal(false)}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 transition"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="glass-card rounded-2xl overflow-hidden border border-slate-150 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-100/50 border-b">
                  <th className="text-left px-4 py-3 text-slate-600 font-bold text-[10px] uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-bold text-[10px] uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-bold text-[10px] uppercase tracking-wider">Role</th>
                  <th className="text-right px-4 py-3 text-slate-600 font-bold text-[10px] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                          <FaUsersSlash className="text-2xl text-slate-300" />
                        </div>
                        <p className="font-semibold text-sm">No administrative users yet</p>
                        <p className="text-xs mt-1 text-slate-500">Create one above to grant system access.</p>
                      </div>
                    </td>
                  </tr>
                ) : users.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-semibold text-slate-800 text-sm">{user.name || "N/A"}</td>
                    <td className="px-4 py-3 text-slate-600 text-sm">{user.email || "N/A"}</td>
                    <td className="px-4 py-3">
                      <span className={`status-chip status-chip-${user.role}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button onClick={() => editUser(user)} className="text-blue-500 hover:text-blue-700 transition p-1">
                        <FaEdit />
                      </button>
                      <button onClick={() => deleteUser(user)} className="text-red-500 hover:text-red-700 transition p-1">
                        <FaTrash />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list view */}
          <div className="block md:hidden divide-y divide-gray-100">
            {users.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                  <FaUsersSlash className="text-2xl text-slate-300" />
                </div>
                <p className="font-semibold text-sm">No administrative users yet</p>
                <p className="text-xs mt-1 text-slate-500 text-center px-4">Create one above to grant system access.</p>
              </div>
            ) : (
              users.map((user) => (
                <div key={user.id} className="p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-gray-850 text-sm">{user.name || "N/A"}</h4>
                      <p className="text-xs text-gray-500">{user.email || "N/A"}</p>
                    </div>
                    <span className={`status-chip status-chip-${user.role}`}>
                      {user.role}
                    </span>
                  </div>
                  <div className="flex justify-end gap-3 mt-1 pt-2 border-t border-gray-50">
                    <button onClick={() => editUser(user)} className="text-xs font-bold text-blue-600 flex items-center gap-1 hover:text-blue-800">
                      <FaEdit /> Edit
                    </button>
                    <button onClick={() => deleteUser(user)} className="text-xs font-bold text-red-600 flex items-center gap-1 hover:text-red-800">
                      <FaTrash /> Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default SystemAccess;
