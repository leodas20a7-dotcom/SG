import { useState } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import LoadingOverlay from "./LoadingOverlay";

import { FaEnvelope, FaLock } from "react-icons/fa";

function Login({ setSession }) {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { showToast, ToastContainer } = useToast();

  function validate() {
    const errs = {};
    if (!email.trim()) {
      errs.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Please enter a valid email address";
    }
    if (!password) {
      errs.password = "Password is required";
    } else if (password.length < 6) {
      errs.password = "Password must be at least 6 characters";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleLogin() {
    if (!validate()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          showToast("Invalid email or password. Please try again.", "error");
        } else if (error.message.includes("Email not confirmed")) {
          showToast("Please confirm your email before logging in.", "info");
        } else {
          showToast(error.message, "error");
        }
        return;
      }

      showToast("Login successful! Welcome back.", "success");
      // The session will be automatically handled by App.jsx's onAuthStateChange listener
    } catch (err) {
      showToast("Something went wrong. Please try again later.", "error");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleLogin();
  }

  const appLogo = "/logo.png";

  return (
    <>
      <ToastContainer />
      {loading && <LoadingOverlay message="Signing you in..." />}
      
      <div className="min-h-screen flex flex-col md:flex-row bg-[#1A1F2C] md:bg-white relative">
        
        {/* Mobile Top Visuals (Matches Sketch) */}
        <div className="md:hidden flex flex-col items-center justify-center pt-20 pb-16 relative z-0">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-[10%] left-[20%] w-[60%] h-[60%] rounded-full bg-blue-600/30 blur-[60px]"></div>
          </div>
          <div className="w-20 h-20 rounded-[1.25rem] overflow-hidden bg-white shadow-xl shadow-black/20 flex items-center justify-center mb-4 p-1.5 z-10">
             <img src={appLogo} alt="SecureSys Logo" className="w-full h-full object-cover rounded-[0.85rem]" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-widest z-10">SecureSys</h2>
        </div>

        {/* Desktop Left Side: Brand & Visuals */}
        <div className="hidden md:flex flex-col justify-between w-1/2 lg:w-[45%] bg-[#1A1F2C] p-12 relative overflow-hidden">
          {/* Subtle background glow effects */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full bg-blue-600/15 blur-[120px]"></div>
            <div className="absolute top-[60%] -right-[10%] w-[60%] h-[60%] rounded-full bg-indigo-600/10 blur-[100px]"></div>
          </div>
          
          {/* Top Logo */}
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-white shadow-lg flex items-center justify-center p-0.5">
              <img src={appLogo} alt="SecureSys Logo" className="w-full h-full object-cover rounded-lg" />
            </div>
            <span className="text-xl font-bold text-white tracking-wide">SecureSys</span>
          </div>

          {/* Center Text */}
          <div className="relative z-10 max-w-lg mb-10">
            <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight mb-6 tracking-tight">
              Secure, Monitor, and Manage Facilities.
            </h1>
            <p className="text-slate-400 text-lg leading-relaxed">
              Enterprise-grade security management platform tailored for modern workforce monitoring.
            </p>
          </div>
          
          {/* Footer Text */}
          <div className="relative z-10 text-slate-500 text-sm">
            &copy; {new Date().getFullYear()} SecureSys Platform. All rights reserved.
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="flex-1 flex flex-col justify-start md:justify-center px-8 pt-10 pb-12 sm:p-12 md:p-16 bg-white rounded-t-[40px] md:rounded-none relative z-10 shadow-[0_-20px_40px_rgba(0,0,0,0.2)] md:shadow-none -mt-6 md:mt-0">
          
          <div className="w-full max-w-md mx-auto">

            <div className="mb-10 text-center md:text-left">
              <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Welcome Back</h2>
              <p className="text-gray-500 mt-2">Please sign in to your account</p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                    <FaEnvelope />
                  </div>
                  <input
                    type="email"
                    placeholder="admin@example.com"
                    className={`w-full h-12 border rounded-xl pl-11 pr-4 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                      errors.email ? "border-red-300 focus:ring-red-500/20" : "border-gray-200 focus:border-blue-500 focus:ring-blue-500/20"
                    }`}
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setErrors((prev) => ({ ...prev, email: "" })); }}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                {errors.email && <p className="text-red-500 text-xs font-medium mt-1.5">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                    <FaLock />
                  </div>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className={`w-full h-12 border rounded-xl pl-11 pr-4 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                      errors.password ? "border-red-300 focus:ring-red-500/20" : "border-gray-200 focus:border-blue-500 focus:ring-blue-500/20"
                    }`}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrors((prev) => ({ ...prev, password: "" })); }}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                {errors.password && <p className="text-red-500 text-xs font-medium mt-1.5">{errors.password}</p>}
              </div>

              <div className="pt-4">
                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className={`w-full h-14 md:h-12 rounded-xl text-white font-bold text-sm transition-all duration-200 shadow-lg ${
                    loading ? "bg-gray-400 cursor-not-allowed shadow-none" : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/30 hover:-translate-y-0.5 active:translate-y-0"
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                      Signing in...
                    </span>
                  ) : "Sign In"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default Login;
