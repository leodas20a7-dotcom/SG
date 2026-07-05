import { useState, useRef } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import LoadingOverlay from "./LoadingOverlay";
import DarkModeToggle from "./DarkModeToggle";

import { FaEnvelope, FaLock, FaArrowRight, FaShieldAlt, FaEye, FaEyeSlash, FaCheckCircle } from "react-icons/fa";

function Login({ setSession, onNavigateToSignup }) {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [isMobileFormCollapsed, setIsMobileFormCollapsed] = useState(false);
  const touchStartY = useRef(null);
  const { showToast, ToastContainer } = useToast();

  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    if (!touchStartY.current) return;
    const touchEndY = e.touches[0].clientY;
    const diff = touchEndY - touchStartY.current;
    
    // swipe down
    if (diff > 50) {
      setIsMobileFormCollapsed(true);
      touchStartY.current = null;
    }
    // swipe up
    if (diff < -50) {
      setIsMobileFormCollapsed(false);
      touchStartY.current = null;
    }
  };

  const handleTouchEnd = () => {
    touchStartY.current = null;
  };

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

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(40px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes shine {
          100% { transform: translateX(100%); }
        }
        .animate-shine {
          animation: shine 1.5s ease-in-out infinite;
        }
      `}</style>

      <div className="h-[100dvh] overflow-hidden flex flex-col md:flex-row bg-gradient-to-br from-[#11141e] via-[#1A1F2C] to-[#2a1b42] md:bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] md:from-indigo-50/50 md:via-slate-50 md:to-white dark:md:from-indigo-900/20 dark:md:via-slate-900 dark:md:to-slate-900 relative">
        <div className="absolute top-6 right-6 md:top-8 md:right-8 z-50 hidden md:flex items-center justify-center p-1.5 rounded-full bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/40 dark:border-slate-700/50 shadow-sm hover:scale-105 transition-transform duration-300">
          <DarkModeToggle />
        </div>

        {/* Floating Security Elements (Mobile Background) */}
        <div className="md:hidden absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-4 w-2 h-2 rounded-full bg-purple-500/40"></div>
          <div className="absolute top-32 right-8 w-3 h-3 rounded-full bg-blue-500/30"></div>
          <div className="absolute top-10 right-10 text-indigo-500/10 text-5xl rotate-12"><FaShieldAlt /></div>
          <div className="absolute bottom-[60%] left-8 text-purple-500/10 text-3xl -rotate-12"><FaShieldAlt /></div>
        </div>

        {/* Mobile Top Visuals & Background Text */}
        <div className="md:hidden flex flex-col items-center justify-start pt-8 px-6 relative z-10 shrink-0">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none flex items-center justify-center">
            {/* Glowing radial light behind logo */}
            <div className="w-24 h-24 rounded-full bg-purple-500/30 blur-[40px] absolute top-12"></div>
          </div>
          <div className="flex flex-col items-center justify-center relative z-20">
            <div className="w-16 h-16 rounded-[1.25rem] overflow-hidden bg-white shadow-[0_0_25px_rgba(99,102,241,0.5)] flex items-center justify-center mb-3 p-1 relative z-20 before:absolute before:inset-0 before:rounded-[1.25rem] before:shadow-[0_0_15px_rgba(99,102,241,0.8)] before:animate-pulse">
              <img src={appLogo} alt="SecureSys Logo" className="w-full h-full object-cover rounded-[0.8rem] relative z-10" />
            </div>
            <h2 className="text-[22px] font-bold text-white tracking-widest">SecureSys</h2>
          </div>
          
          {/* Background Text Revealed on Swipe */}
          <div className={`mt-8 text-center transition-opacity duration-500 ease-in-out ${isMobileFormCollapsed ? "opacity-100" : "opacity-0"}`}>
            <h1 className="text-3xl font-bold text-white leading-tight mb-4 tracking-tight">
              Secure, Monitor,<br />and Manage <span className="text-indigo-400">Facilities.</span>
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed px-4">
              Enterprise-grade security management platform tailored for modern workforce monitoring.
            </p>
          </div>
        </div>

        {/* Desktop Left Side: Brand & Visuals */}
        <div className="hidden md:flex flex-col justify-between w-1/2 lg:w-[45%] bg-[#1A1F2C] p-12 relative overflow-hidden">
          {/* Subtle background glow effects */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full bg-indigo-600/15 blur-[120px]"></div>
            <div className="absolute top-[60%] -right-[10%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[100px]"></div>
          </div>

          <div className="relative z-10">
            {/* Top Logo */}
            <div className="flex items-center gap-3 mb-16">
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-white shadow-lg flex items-center justify-center p-0.5">
                <img src={appLogo} alt="SecureSys Logo" className="w-full h-full object-cover rounded-lg" />
              </div>
              <span className="text-xl font-bold text-white tracking-wide">SecureSys</span>
            </div>

            {/* Center Text */}
            <div className="max-w-lg">
              <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight mb-6 tracking-tight">
                Secure, Monitor,<br />and Manage <span className="text-indigo-400">Facilities.</span>
              </h1>
              <p className="text-slate-400 text-lg leading-relaxed">
                Enterprise-grade security management platform tailored for modern workforce monitoring.
              </p>
            </div>
          </div>

          {/* Glowing Shield Graphic */}
          <div className="relative z-10 flex-1 flex items-center justify-center mt-12 mb-8">
            <div className="relative flex justify-center items-center w-full max-w-[300px] aspect-square">
              {/* Concentric rings */}
              <div className="absolute w-full h-full border border-indigo-500/20 rounded-[100%] scale-x-[2.5] scale-y-[0.8] top-1/2 -translate-y-1/2"></div>
              <div className="absolute w-[70%] h-[70%] border border-indigo-400/30 rounded-[100%] scale-x-[2.5] scale-y-[0.8] top-1/2 -translate-y-1/2"></div>
              <div className="absolute w-[40%] h-[40%] border border-indigo-300/40 rounded-[100%] scale-x-[2.5] scale-y-[0.8] top-1/2 -translate-y-1/2"></div>

              {/* Central glow & shield */}
              <div className="absolute w-32 h-32 bg-indigo-600/40 blur-[40px] rounded-full"></div>
              <div className="relative z-10 text-indigo-400 text-7xl drop-shadow-[0_0_20px_rgba(99,102,241,0.6)]">
                <FaShieldAlt />
              </div>
            </div>
          </div>

          {/* Footer Text */}

        </div>

        {/* Right Side: Login Form */}
        <div 
          className={`flex-1 md:flex flex-col justify-center px-6 pt-6 pb-6 md:p-16 md:bg-slate-50 dark:md:bg-slate-900 bg-white dark:bg-slate-800 rounded-t-[40px] md:rounded-none absolute md:relative bottom-0 left-0 w-full z-20 shadow-[0_-15px_40px_rgba(0,0,0,0.2)] md:shadow-none animate-slide-up border-t border-white/40 md:border-none transition-transform duration-500 ease-in-out max-md:h-[calc(100dvh-190px)] md:h-full md:translate-y-0 ${isMobileFormCollapsed ? "max-md:translate-y-[65%]" : "max-md:translate-y-0"}`}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >

          {/* Drag Handle for Mobile */}
          <div 
            className="md:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6 cursor-pointer shrink-0"
            onClick={() => setIsMobileFormCollapsed(!isMobileFormCollapsed)}
          ></div>

          <div className="w-full max-w-[380px] mx-auto md:bg-white dark:md:bg-slate-800 md:p-8 md:rounded-[2rem] md:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] md:border md:border-slate-100 dark:md:border-slate-700 relative flex flex-col justify-center h-full md:h-max md:my-auto">

            {/* Desktop Lock Icon */}
            <div className="hidden md:flex w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 items-center justify-center mx-auto mb-6 shrink-0">
              <FaShieldAlt className="text-2xl" />
            </div>

            {/* Mobile Logo Block - Removed because we display it above the card */}

            <div className="mb-8 md:mb-10 text-center shrink-0">
              <h2 className="text-[28px] md:text-3xl font-extrabold text-[#1A1F2C] dark:text-white tracking-tight flex items-center justify-center gap-2 mb-2">Welcome Back <span className="inline-block">👋</span></h2>
              <p className="text-gray-500 dark:text-slate-400 text-sm md:text-base font-medium">Please sign in to your account</p>
            </div>

            <div className="space-y-4 md:space-y-5">
              <div>
                <label className="block text-xs md:text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5 md:mb-2">Email Address</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                    <FaEnvelope />
                  </div>
                  <input
                    type="email"
                    placeholder="enter your email"
                    className={`w-full h-11 md:h-12 border rounded-xl pl-11 pr-4 text-sm bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-4 transition-all ${errors.email ? "border-red-300 focus:ring-red-500/20" : "border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500/20"
                      }`}
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setErrors((prev) => ({ ...prev, email: "" })); }}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                {errors.email && <p className="text-red-500 text-xs font-medium mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-xs md:text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5 md:mb-2">Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                    <FaLock />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="password"
                    className={`w-full h-11 md:h-12 border rounded-xl pl-11 pr-12 text-sm bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-4 transition-all ${errors.password ? "border-red-300 focus:ring-red-500/20" : "border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500/20"
                      }`}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrors((prev) => ({ ...prev, password: "" })); }}
                    onKeyDown={handleKeyDown}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition"
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-xs font-medium mt-1">{errors.password}</p>}
              </div>



              <div className="pt-2 md:pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  onClick={handleLogin}
                  className="w-full h-11 md:h-12 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold rounded-xl transition-all duration-300 transform hover:scale-[1.02] hover:shadow-[0_10px_25px_-5px_rgba(79,70,229,0.5)] flex items-center justify-center gap-2 relative overflow-hidden group"
                >
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-shine" />
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </div>

              <div className="mt-6 md:mt-8 text-center text-xs md:text-sm">
                <p className="text-gray-500 dark:text-slate-400 font-medium mb-1">Don't have an agency account yet?</p>
                <button onClick={onNavigateToSignup} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-bold transition-all relative group inline-block py-1">
                  Register here
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 group-hover:w-full transition-all duration-300"></span>
                </button>
              </div>

              <div className="pt-6 md:pt-4 pb-4 md:pb-0 flex justify-center items-center gap-1.5 opacity-80 shrink-0">
                <FaCheckCircle className="text-green-500 text-[10px]" />
                <span className="text-[9px] md:text-[10px] font-semibold tracking-wide text-slate-500">All Rights Reserved 2026</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default Login;
