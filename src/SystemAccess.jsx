import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import CustomSelect from "./CustomSelect";

function SystemAccess() {
  const [users, setUsers] = useState([]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("supervisor");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { showToast, ToastContainer } = useToast();

  async function fetchUsers() {
    try {
      // Fetch only admins and supervisors
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .in("role", ["admin", "supervisor"])
        .order("created_at", { ascending: false });
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
    setLoading(true);
    try {
      const { data: { session: savedSession } } = await supabase.auth.getSession();

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (authError) {
        if (authError.message.includes("already")) {
          showToast("This email is already registered.", "error");
        } else {
          showToast(authError.message, "error");
        }
        return;
      }
      const userId = authData.user?.id;
      if (!userId) { showToast("Could not create user account.", "error"); return; }

      if (savedSession) {
        const { error: sessionErr } = await supabase.auth.setSession({
          access_token: savedSession.access_token,
          refresh_token: savedSession.refresh_token,
        });
        if (sessionErr) showToast("Session issue, please re-login.", "error");
      }

      const { error: profileError } = await supabase.from("profiles").insert([
        { id: userId, full_name: fullName.trim(), email: email.trim(), role },
      ]);
      if (profileError) { showToast("Error creating profile.", "error"); return; }

      showToast(`User "${fullName.trim()}" created!`, "success");
      setFullName(""); setEmail(""); setPassword(""); setRole("supervisor");
      fetchUsers();
    } catch { showToast("Network error.", "error"); }
    finally { setLoading(false); }
  }

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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <input type="password" placeholder="Min 6 chars" value={password}
                onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
                className={`w-full h-11 border px-3 rounded-xl focus:outline-none focus:ring-4 transition text-xs bg-[#F4F6F9] hover:bg-slate-100/60 focus:bg-white ${
                  errors.password 
                    ? "border-red-400 focus:ring-red-500/10 focus:border-red-500" 
                    : "border-slate-200 focus:ring-blue-500/10 focus:border-blue-500"
                }`} />
              {errors.password && <p className="text-red-500 text-xs mt-1.5 font-semibold">⚠️ {errors.password}</p>}
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-655 uppercase tracking-wider mb-2">Role</label>
              <CustomSelect
                value={role}
                onChange={val => setRole(val)}
                options={[
                  { value: "supervisor", label: "Supervisor" },
                  { value: "admin", label: "Admin" }
                ]}
                placeholder="Supervisor"
                heightClass="h-11"
              />
            </div>
          </div>
          <button onClick={addUser} disabled={loading}
            className={`mt-6 px-5 py-2.5 rounded-xl text-white font-bold text-xs bg-blue-600 hover:bg-blue-700 transition shadow-md shadow-blue-150 flex items-center gap-1.5 ${
              loading ? "bg-slate-350 cursor-not-allowed shadow-none" : ""
            }`}>
            {loading ? "Creating..." : "Add Administrative User"}
          </button>
        </div>

        <div className="glass-card rounded-2xl overflow-hidden border border-slate-150 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold text-[10px] uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold text-[10px] uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold text-[10px] uppercase tracking-wide">Role</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={3} className="p-8 text-center text-gray-400">No users found.</td></tr>
                ) : users.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-semibold text-slate-800 text-sm">{user.full_name}</td>
                    <td className="px-4 py-3 text-slate-600 text-sm">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`status-chip status-chip-${user.role}`}>
                        {user.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list view */}
          <div className="block md:hidden divide-y divide-gray-100">
            {users.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No users found.</div>
            ) : (
              users.map((user) => (
                <div key={user.id} className="p-4 flex justify-between items-center gap-3">
                  <div>
                    <h4 className="font-bold text-gray-850 text-sm">{user.full_name}</h4>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                  <span className={`status-chip status-chip-${user.role}`}>
                    {user.role}
                  </span>
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
