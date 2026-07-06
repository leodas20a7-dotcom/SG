import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import CustomSelect from "./CustomSelect";

function Users({ companyId }) {
  const [users, setUsers] = useState([]);
  const [guards, setGuards] = useState([]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("guard");
  const [linkedGuardId, setLinkedGuardId] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { showToast, ToastContainer } = useToast();

  async function fetchUsers() {
    try {
      let query = supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (companyId) query = query.eq("company_id", companyId);
      const { data } = await query;
      setUsers(data || []);
    } catch { showToast("Could not load users.", "error"); }
  }

  async function fetchGuards() {
    try {
      let query = supabase.from("guards").select("*").order("name");
      if (companyId) query = query.eq("company_id", companyId);
      const { data } = await query;
      setGuards(data || []);
    } catch { /* ignore */ }
  }

  function validate() {
    const errs = {};
    if (!fullName.trim()) errs.fullName = "Name is required";
    else if (fullName.trim().length < 2) errs.fullName = "Name must be at least 2 characters";
    if (!email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email";
    if (!password) errs.password = "Password is required";
    else if (password.length < 6) errs.password = "Min 6 characters";
    if (role === "guard" && !linkedGuardId) errs.linkedGuardId = "Select a guard record";
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
        await supabase.auth.setSession({
          access_token: savedSession.access_token,
          refresh_token: savedSession.refresh_token,
        });
      }

      const { error: profileError } = await supabase.from("profiles").insert([
        { id: userId, full_name: fullName.trim(), email: email.trim(), role },
      ]);
      if (profileError) { showToast("Error creating profile.", "error"); return; }

      if (role === "guard" && linkedGuardId) {
        await supabase.from("guards").update({ auth_user_id: userId }).eq("id", linkedGuardId);
      }

      showToast(`User "${fullName.trim()}" created!`, "success");
      setFullName(""); setEmail(""); setPassword(""); setRole("guard"); setLinkedGuardId("");
      fetchUsers();
    } catch { showToast("Network error.", "error"); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchUsers(); fetchGuards(); }, []);

  function clearError(field) { setErrors((p) => ({ ...p, [field]: "" })); }

  return (
    <>
      <ToastContainer />
      <div className="mt-10">
        <h1 className="text-2xl font-bold mb-5 text-gray-800">User Management</h1>

        <div className="glass-card rounded-2xl p-6 mb-8 ring-1 ring-cyan-200 relative z-50">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">👤 Add New User</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Full Name</label>
              <input type="text" placeholder="Enter name" value={fullName}
                onChange={(e) => { setFullName(e.target.value); clearError("fullName"); }}
                className={`w-full h-12 border p-3 rounded-lg focus:outline-none focus:ring-2 transition ${errors.fullName ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-cyan-300"}`} />
              {errors.fullName && <p className="text-red-500 text-sm mt-1">{errors.fullName}</p>}
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Email</label>
              <input type="email" placeholder="Enter email" value={email}
                onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                className={`w-full h-12 border p-3 rounded-lg focus:outline-none focus:ring-2 transition ${errors.email ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-cyan-300"}`} />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Password</label>
              <input type="password" placeholder="Min 6 chars" value={password}
                onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
                className={`w-full h-12 border p-3 rounded-lg focus:outline-none focus:ring-2 transition ${errors.password ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-cyan-300"}`} />
              {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Role</label>
              <CustomSelect
                value={role}
                onChange={(val) => { setRole(val); setLinkedGuardId(""); }}
                options={[
                  { value: "admin", label: "Admin" },
                  { value: "supervisor", label: "Supervisor" },
                  { value: "guard", label: "Guard" }
                ]}
                placeholder="Select Role"
                heightClass="h-12"
              />
            </div>
            {role === "guard" && (
              <div>
                <label className="block text-sm text-gray-500 mb-1">Link to Guard Record</label>
                <CustomSelect
                  value={linkedGuardId}
                  onChange={val => { setLinkedGuardId(val); clearError("linkedGuardId"); }}
                  options={[
                    { value: "", label: "Select Guard" },
                    ...guards.filter((g) => !g.auth_user_id).map((g) => ({ value: String(g.id), label: `${g.name} — ${g.site}` }))
                  ]}
                  placeholder="Select Guard"
                  error={!!errors.linkedGuardId}
                  heightClass="h-12"
                />
                {errors.linkedGuardId && <p className="text-red-500 text-sm mt-1">{errors.linkedGuardId}</p>}
              </div>
            )}
          </div>
          <button onClick={addUser} disabled={loading}
            className={`mt-5 px-6 py-3 rounded-lg text-white font-semibold transition ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-cyan-600 hover:bg-cyan-700"}`}>
            {loading ? "Creating..." : "Add User"}
          </button>
        </div>

        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left p-4 text-gray-600 font-semibold">Name</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Email</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Role</th>
                  <th className="text-left p-4 text-gray-600 font-semibold">Linked Guard</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-gray-400">No users found.</td></tr>
                ) : users.map((user) => {
                  const linked = guards.find((g) => g.auth_user_id === user.id);
                  return (
                    <tr key={user.id} className="border-b hover:bg-gray-50 transition">
                      <td className="p-4 font-medium">{user.full_name}</td>
                      <td className="p-4">{user.email}</td>
                      <td className="p-4">
                        <span className={`status-chip status-chip-${user.role}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-500">{linked ? linked.name : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

export default Users;
