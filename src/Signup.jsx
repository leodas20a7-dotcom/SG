import { useState, useRef } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";
import LoadingOverlay from "./LoadingOverlay";
import CustomSelect from "./CustomSelect";
import DarkModeToggle from "./DarkModeToggle";

import { FaEnvelope, FaLock, FaArrowRight, FaShieldAlt, FaEye, FaEyeSlash, FaCheckCircle, FaBuilding } from "react-icons/fa";

function Signup({ setSession, onNavigateToLogin }) {

  const [agencyName, setAgencyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [timezone, setTimezone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const TIMEZONES = [
    { label: "United States (New York)", value: "America/New_York" },
    { label: "United States (Los Angeles)", value: "America/Los_Angeles" },
    { label: "United Kingdom", value: "Europe/London" },
    { label: "India", value: "Asia/Kolkata" },
    { label: "Australia (Sydney)", value: "Australia/Sydney" },
    { label: "Australia (Melbourne)", value: "Australia/Melbourne" },
    { label: "Australia (Brisbane)", value: "Australia/Brisbane" },
    { label: "Australia (Perth)", value: "Australia/Perth" },
    { label: "Australia (Adelaide)", value: "Australia/Adelaide" },
    { label: "Australia (Hobart)", value: "Australia/Hobart" },
    { label: "Australia (Darwin)", value: "Australia/Darwin" },
    { label: "Canada (Toronto)", value: "America/Toronto" },
    { label: "Singapore", value: "Asia/Singapore" },
    { label: "United Arab Emirates", value: "Asia/Dubai" },
    { label: "Germany", value: "Europe/Berlin" },
    { label: "France", value: "Europe/Paris" },
    { label: "Japan", value: "Asia/Tokyo" },
    { label: "China", value: "Asia/Shanghai" },
    { label: "South Africa", value: "Africa/Johannesburg" },
    { label: "Brazil (Sao Paulo)", value: "America/Sao_Paulo" },
    { label: "Mexico (Mexico City)", value: "America/Mexico_City" },
    { label: "New Zealand", value: "Pacific/Auckland" },
    { label: "Malaysia", value: "Asia/Kuala_Lumpur" },
    { label: "Philippines", value: "Asia/Manila" },
    { label: "Indonesia (Jakarta)", value: "Asia/Jakarta" },
    { label: "Saudi Arabia", value: "Asia/Riyadh" },
    { label: "Egypt", value: "Africa/Cairo" },
    { label: "Nigeria", value: "Africa/Lagos" },
    { label: "Kenya", value: "Africa/Nairobi" },
    { label: "South Korea", value: "Asia/Seoul" },
    { label: "Pakistan", value: "Asia/Karachi" },
    { label: "Bangladesh", value: "Asia/Dhaka" },
    { label: "Turkey", value: "Europe/Istanbul" },
    { label: "Italy", value: "Europe/Rome" },
    { label: "Spain", value: "Europe/Madrid" },
    { label: "Argentina", value: "America/Argentina/Buenos_Aires" },
    { label: "Colombia", value: "America/Bogota" },
    { label: "Peru", value: "America/Lima" },
    { label: "Chile", value: "America/Santiago" },
    { label: "Thailand", value: "Asia/Bangkok" },
    { label: "Vietnam", value: "Asia/Ho_Chi_Minh" },
    { label: "Israel", value: "Asia/Jerusalem" },
    { label: "UTC (Default)", value: "UTC" }
  ].sort((a, b) => a.label.localeCompare(b.label));

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
    if (!agencyName.trim()) {
      errs.agencyName = "Agency name is required";
    }
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
    if (!confirmPassword) {
      errs.confirmPassword = "Confirm password is required";
    } else if (password !== confirmPassword) {
      errs.confirmPassword = "Passwords do not match";
    }
    if (!timezone) {
      errs.timezone = "Region / Time Zone is required";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSignup() {
    if (!validate()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            company_name: agencyName.trim(),
            timezone: timezone
          }
        }
      });

      if (error) {
        showToast(error.message, "error");
        return;
      }

      if (data?.user?.identities?.length === 0) {
        showToast("An account with this email already exists.", "error");
        return;
      }

      showToast("Registration successful! Please check your email to verify your account.", "success");
      // Optional: switch back to login view automatically after a few seconds
      setTimeout(() => {
        if (onNavigateToLogin) onNavigateToLogin();
      }, 3000);
      
    } catch (err) {
      showToast("Something went wrong. Please try again later.", "error");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleSignup();
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
            <div className="w-16 h-16 rounded-[1.25rem] overflow-hidden bg-white shadow-xl shadow-black/10 flex items-center justify-center mb-3 p-1">
              <img src={appLogo} alt="SecureSys Logo" className="w-full h-full object-cover rounded-[0.8rem]" />
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
              <h1 className="text-4xl lg:text-5xl font-bold text-white leading-[1.1] mb-6 tracking-tight">
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
              <div className="absolute w-full h-full border border-indigo-500/20 rounded-[100%] scale-x-[2.5] scale-y-[0.8] top-1/2 -translate-y-1/2 animate-[pulse_4s_ease-in-out_infinite]"></div>
              <div className="absolute w-[70%] h-[70%] border border-indigo-400/30 rounded-[100%] scale-x-[2.5] scale-y-[0.8] top-1/2 -translate-y-1/2 animate-[pulse_4s_ease-in-out_1s_infinite]"></div>
              <div className="absolute w-[40%] h-[40%] border border-indigo-300/40 rounded-[100%] scale-x-[2.5] scale-y-[0.8] top-1/2 -translate-y-1/2 animate-[pulse_4s_ease-in-out_2s_infinite]"></div>

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
          className={`flex-1 overflow-y-auto md:flex flex-col px-6 pt-6 pb-6 md:px-8 md:py-8 lg:p-16 md:bg-slate-50 dark:md:bg-slate-900 bg-white dark:bg-slate-800 rounded-t-[40px] md:rounded-none absolute md:relative bottom-0 left-0 w-full z-20 shadow-[0_-15px_40px_rgba(0,0,0,0.2)] md:shadow-none animate-slide-up border-t border-white/40 md:border-none transition-transform duration-500 ease-in-out max-md:h-[calc(100dvh-190px)] md:h-full md:translate-y-0 ${isMobileFormCollapsed ? "max-md:translate-y-[65%]" : "max-md:translate-y-0"}`}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >

          {/* Drag Handle for Mobile */}
          <div 
            className="md:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6 cursor-pointer shrink-0"
            onClick={() => setIsMobileFormCollapsed(!isMobileFormCollapsed)}
          ></div>

          <div className="w-full max-w-[380px] mx-auto md:bg-white dark:md:bg-slate-800 md:p-8 md:rounded-[2rem] md:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] md:border md:border-slate-100 dark:md:border-slate-700 relative flex flex-col h-full md:h-auto my-auto shrink-0">

            {/* Desktop Lock Icon */}
            <div className="hidden md:flex w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 items-center justify-center mx-auto mb-6 shrink-0">
              <FaShieldAlt className="text-2xl" />
            </div>

            {/* Mobile Logo Block - Removed because we display it above the card */}

            <div className="mb-8 md:mb-10 text-center shrink-0 mt-4 md:mt-0">
              <h2 className="text-[28px] md:text-3xl font-extrabold text-[#1A1F2C] dark:text-white tracking-tight flex items-center justify-center gap-2 mb-2">Create Agency</h2>
              <p className="text-gray-500 dark:text-slate-400 text-sm md:text-base font-medium">Register your security company</p>
            </div>

            <div className="space-y-5 md:space-y-6">
              <div>
                <label className="block text-xs md:text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2 md:mb-2.5">Agency Name</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                    <FaBuilding />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Enter your security agency name"
                    className={`w-full h-11 md:h-12 border rounded-xl pl-11 pr-4 text-sm bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-4 transition-all ${errors.agencyName ? "border-red-300 focus:ring-red-500/20" : "border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500/10"
                      }`}
                    value={agencyName}
                    onChange={(e) => { setAgencyName(e.target.value); setErrors((prev) => ({ ...prev, agencyName: "" })); }}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                {errors.agencyName && <p className="text-red-500 text-xs font-medium mt-1">{errors.agencyName}</p>}
              </div>

              <div>
                <label className="block text-xs md:text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2 md:mb-2.5">Email Address</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                    <FaEnvelope />
                  </div>
                  <input
                    type="email"
                    required
                    placeholder="enter your email"
                    className={`w-full h-11 md:h-12 border rounded-xl pl-11 pr-4 text-sm bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-4 transition-all ${errors.email ? "border-red-300 focus:ring-red-500/20" : "border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500/10"
                      }`}
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setErrors((prev) => ({ ...prev, email: "" })); }}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                {errors.email && <p className="text-red-500 text-xs font-medium mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-xs md:text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2 md:mb-2.5">Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                    <FaLock />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="password"
                    className={`w-full h-11 md:h-12 border rounded-xl pl-11 pr-12 text-sm bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-4 transition-all ${errors.password ? "border-red-300 focus:ring-red-500/20" : "border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500/10"
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

              <div>
                <label className="block text-xs md:text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2 md:mb-2.5">Confirm Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                    <FaLock />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="confirm password"
                    className={`w-full h-11 md:h-12 border rounded-xl pl-11 pr-12 text-sm bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-4 transition-all ${errors.confirmPassword ? "border-red-300 focus:ring-red-500/20" : "border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500/10"
                      }`}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setErrors((prev) => ({ ...prev, confirmPassword: "" })); }}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                {errors.confirmPassword && <p className="text-red-500 text-xs font-medium mt-1">{errors.confirmPassword}</p>}
              </div>

              <div className="z-50 pb-2">
                <label className="block text-xs md:text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2 md:mb-2.5">Region / Time Zone</label>
                <div className="relative">
                  <CustomSelect
                    value={timezone}
                    onChange={(val) => { setTimezone(val); setErrors((prev) => ({ ...prev, timezone: "" })); }}
                    options={TIMEZONES}
                    placeholder="Search country..."
                    searchable={true}
                    heightClass="h-11 md:h-12"
                    className={`w-full text-sm ${errors.timezone ? "border border-red-300 rounded-xl" : ""}`}
                  />
                </div>
                {errors.timezone && <p className="text-red-500 text-xs font-medium mt-1">{errors.timezone}</p>}
              </div>



              <div className="pt-2">
                <button
                  onClick={handleSignup}
                  disabled={loading}
                  className={`w-full h-12 md:h-12 rounded-xl text-white font-bold text-[15px] transition-all duration-200 flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(76,59,252,0.25)] ${loading ? "bg-slate-400 cursor-not-allowed shadow-none" : "bg-[#4C3BFC] hover:bg-[#4332e6] hover:-translate-y-0.5 active:translate-y-0"
                    }`}
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    "Register Agency"
                  )}
                </button>
              </div>

              <div className="mt-4 md:mt-6 text-center text-xs md:text-sm">
                <p className="text-gray-500 dark:text-slate-400 font-medium mb-1">Already have an account?</p>
                <button onClick={onNavigateToLogin} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-bold transition-all relative group inline-block py-1">
                  Sign in
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

export default Signup;
