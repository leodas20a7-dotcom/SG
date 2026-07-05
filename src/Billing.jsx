import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import LoadingOverlay from "./LoadingOverlay";
import { FaCreditCard, FaLock, FaCheckCircle, FaExclamationTriangle, FaUsers, FaPlus, FaTimes, FaMoneyBillWave } from "react-icons/fa";
import { useToast } from "./Toast";

function Billing({ companyId }) {
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState(null);
  
  // Now tracks *additional* seats instead of total
  const [additionalSeats, setAdditionalSeats] = useState(0);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [showMathModal, setShowMathModal] = useState(false);
  
  const [runTour, setRunTour] = useState(!localStorage.getItem('hasSeenBillingTour'));
  const tourSteps = [
    {
      target: '#tour-billing-stats',
      content: 'Here you can see your current active subscription and exactly when your next bill is due.',
      disableBeacon: true,
    },
    {
      target: '#tour-billing-manage',
      content: 'Need to update your credit card? Click here to securely manage your payment methods.',
    },
    {
      target: '#tour-billing-add',
      content: 'Growing your team? Easily add licenses here. The cost will automatically prorate so you only pay for the exact days remaining!',
    }
  ];

  const handleJoyrideCallback = (data) => {
    const { status } = data;
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      localStorage.setItem('hasSeenBillingTour', 'true');
      setRunTour(false);
    }
  };
  
  const { showToast, ToastContainer } = useToast();

  const PRICE_PER_GUARD = 25; // Example: $25 per guard per month

  useEffect(() => {
    async function loadBillingInfo() {
      if (!companyId) return;
      try {
        const { data: comp, error: compErr } = await supabase
          .from("companies")
          .select("*")
          .eq("id", companyId)
          .single();

        if (compErr) throw compErr;
        setCompany(comp);

      } catch (err) {
        console.error("Error loading billing info:", err);
      } finally {
        setLoading(false);
      }
    }

    loadBillingInfo();
    
    // MOCK WEBHOOK FOR LOCAL TESTING
    if (window.location.search.includes("checkout=success")) {
      handleMockWebhookSuccess();
    }
  }, [companyId]);

  const handleMockWebhookSuccess = async () => {
    setIsProcessing(true);
    try {
      const { data: comp } = await supabase.from("companies").select("purchased_seats, current_period_end, name").eq("id", companyId).single();
      const currentSeats = comp?.purchased_seats || 0;
      
      const savedAdditionalSeats = localStorage.getItem('pending_additional_seats');
      const extraSeats = savedAdditionalSeats ? parseInt(savedAdditionalSeats) : 0;
      const newTotalSeats = currentSeats + extraSeats;
      
      const isRenewal = localStorage.getItem('pending_renewal') === 'true';
      
      // Preserve original billing cycle date if it exists, otherwise set to 30 days from now
      let periodEnd = comp?.current_period_end ? new Date(comp.current_period_end) : new Date();
      if (!comp?.current_period_end) {
        periodEnd.setDate(periodEnd.getDate() + 30);
      }
      
      // If they explicitly paid to renew, advance the date by 30 days
      if (isRenewal) {
          // If the bill was already past due, maybe we should set the new date to 30 days from TODAY?
          // Or 30 days from the old periodEnd. Standard is from old periodEnd if active, or today if past due.
          if (comp?.subscription_status === 'past_due') {
              periodEnd = new Date(); // Reset to today
              periodEnd.setDate(periodEnd.getDate() + 30);
          } else {
              periodEnd.setDate(periodEnd.getDate() + 30); // Extend existing
          }
      }
      
      const { data: updateData, error: updateError } = await supabase.from("companies").update({
        subscription_status: "active",
        purchased_seats: newTotalSeats,
        current_period_end: periodEnd.toISOString()
      }).eq("id", companyId).select();
      
      if (updateError) {
        alert("UPDATE ERROR: " + JSON.stringify(updateError));
        throw updateError;
      }
      
      if (!updateData || updateData.length === 0) {
        alert(`NO ROWS UPDATED! Company ID: ${companyId}. RLS blocked it or ID not found.`);
      } else {
        showToast("Payment Successful!", "success");
        
        let actionDesc = isRenewal 
            ? `Company "${comp?.name || 'Unknown'}" successfully paid their subscription renewal.`
            : `Company "${comp?.name || 'Unknown'}" successfully processed a payment for additional seats.`;

        await supabase.from('platform_audit_logs').insert([{
          action_type: 'BILLING_PAYMENT',
          description: actionDesc,
          company_id: companyId
        }]);
      }
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Reload comp
      const { data } = await supabase.from("companies").select("*").eq("id", companyId).single();
      setCompany(data);
      setAdditionalSeats(0);
      localStorage.removeItem('pending_additional_seats');
      localStorage.removeItem('pending_renewal');
    } catch(err) {
      alert("CATCH ERROR: " + err.message);
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManageBilling = async (actionType, explicitAmountToCharge) => {
    setShowActionModal(false);
    setIsProcessing(true);
    try {
      // actionType is "add_seats", "update_card", or "pay_due_bill"
      let requestedSeatsForBackend = company?.purchased_seats || 0;
      let amountToCharge = 0;
      
      localStorage.removeItem('pending_renewal'); // Reset
      
      if (actionType === "add_seats") {
        requestedSeatsForBackend = (company?.purchased_seats || 0) + additionalSeats;
        localStorage.setItem('pending_additional_seats', additionalSeats.toString());
        amountToCharge = explicitAmountToCharge ?? proratedCharge;
      } else if (actionType === "pay_due_bill") {
        localStorage.setItem('pending_additional_seats', '0');
        localStorage.setItem('pending_renewal', 'true');
        amountToCharge = currentMonthlyBill; // Charge for current seats
      } else {
        localStorage.setItem('pending_additional_seats', '0');
        amountToCharge = 0; // $0 auth for updating card
      }

      // In a real implementation, this calls your Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('eway-checkout', { 
        body: { companyId, requestedSeats: requestedSeatsForBackend, amountToCharge } 
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data && data.url) {
        window.location.href = data.url;
      } else {
         showToast("Failed to retrieve eWay URL", "error");
         setIsProcessing(false);
      }

    } catch (error) {
      console.error(error);
      const errorMessage = error.message || error.context?.error || "Failed to connect to billing server.";
      showToast(errorMessage, "error");
      setIsProcessing(false);
    }
  };

  const handleAddSeatFocus = () => {
    setShowActionModal(false);
    // Optionally focus the section by scrolling or just highlight it
    // In this simple UI, closing the modal naturally directs them there
    setAdditionalSeats(1); 
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading Billing Data...</div>;

  const statusColors = {
    active: "bg-green-100 text-green-700 border-green-200",
    trialing: "bg-blue-100 text-blue-700 border-blue-200",
    past_due: "bg-red-100 text-red-700 border-red-200",
  };

  const statusColor = statusColors[company?.subscription_status] || "bg-gray-100 text-gray-700 border-gray-200";
  
  const currentSeats = company?.purchased_seats || 0;
  const currentMonthlyBill = currentSeats * PRICE_PER_GUARD;
  const newTotalMonthlyBill = (currentSeats + additionalSeats) * PRICE_PER_GUARD;

  // Simple Mock Proration Calculation
  let proratedCharge = 0;
  let daysLeft = 0;
  if (company?.current_period_end) {
    const end = new Date(company.current_period_end);
    end.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    daysLeft = Math.max(0, Math.round((end - now) / (1000 * 60 * 60 * 24)));
    const prorateMultiplier = daysLeft / 30; // removed the 1 month cap to accurately charge for >30 days
    proratedCharge = additionalSeats * PRICE_PER_GUARD * prorateMultiplier;
  } else {
    proratedCharge = additionalSeats * PRICE_PER_GUARD; // no end date, just full charge
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 relative">
      <ToastContainer />
      {isProcessing && <LoadingOverlay message="Connecting to eWay..." />}
      
      {/* Billing Action Modal */}
      {showActionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative animate-scale-in">
            <button 
              onClick={() => setShowActionModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 w-8 h-8 rounded-full flex items-center justify-center transition"
            >
              <FaTimes />
            </button>
            
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl mb-6 mx-auto">
              <FaCreditCard />
            </div>
            
            <h2 className="text-xl font-bold text-slate-800 text-center mb-2">What would you like to do?</h2>
            <p className="text-sm text-slate-500 text-center mb-8">
              Select an option below to proceed securely via eWay.
            </p>
            
            <div className="space-y-3">
              <button
                onClick={() => handleManageBilling("pay_due_bill")}
                className="w-full text-left flex items-start gap-4 p-4 rounded-xl border-2 border-slate-100 hover:border-indigo-500 hover:bg-indigo-50 transition group"
              >
                <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-indigo-100 text-slate-400 group-hover:text-indigo-600 flex items-center justify-center shrink-0">
                  <FaMoneyBillWave />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 group-hover:text-indigo-800">
                    {company?.subscription_status === 'trialing' ? 'Start Paid Subscription' : 'Pay Current Subscription'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {company?.subscription_status === 'trialing' 
                      ? `Upgrade from trial to a paid plan for ${currentSeats} seat(s).` 
                      : `Renew or pay your past due bill for ${currentSeats} seat(s).`}
                  </p>
                </div>
              </button>
              
              <button
                onClick={handleAddSeatFocus}
                className="w-full text-left flex items-start gap-4 p-4 rounded-xl border-2 border-slate-100 hover:border-indigo-500 hover:bg-indigo-50 transition group"
              >
                <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-indigo-100 text-slate-400 group-hover:text-indigo-600 flex items-center justify-center shrink-0">
                  <FaUsers />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 group-hover:text-indigo-800">Purchase Additional Seats</h3>
                  <p className="text-xs text-slate-500 mt-1">Add more guards to your current plan and pay the prorated difference.</p>
                </div>
              </button>
            </div>
            
            <div className="mt-6 text-center">
              <button 
                onClick={() => handleManageBilling("update_card")}
                className="text-xs text-slate-400 hover:text-slate-600 font-medium underline underline-offset-4"
              >
                I just want to update my credit card without paying.
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Billing & Subscription</h2>
          <p className="text-gray-500 mt-1">Manage your payment methods and view past invoices.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Plan Overview Card */}
        <div className="md:col-span-2 glass-card rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none text-9xl -mt-10 -mr-10 text-indigo-600">
            <FaCreditCard />
          </div>
          
          <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            <FaLock className="text-indigo-500" /> Secure Payment Info
          </h3>

          <div id="tour-billing-stats" className="bg-gray-50 rounded-xl p-5 border border-gray-100 mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Current Status</span>
              <span className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full border ${statusColor}`}>
                {company?.subscription_status || "Unknown"}
              </span>
            </div>
            
            {company?.current_period_end && (
              <div className="flex justify-between items-center mt-4">
                <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Next Bill Due</span>
                <span className="text-sm font-bold text-gray-800">
                  {new Date(company.current_period_end).toLocaleDateString('en-GB')}
                </span>
              </div>
            )}
            
            <div className="flex justify-between items-center mt-4">
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Current Active Seats</span>
              <span className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <FaUsers className="text-gray-400" /> {currentSeats}
              </span>
            </div>
            
            {company?.subscription_status === 'past_due' && (
               <div className="flex items-center gap-2 mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                 <FaExclamationTriangle className="shrink-0" />
                 <span>Your last payment failed. Please update your payment method to avoid service interruption.</span>
               </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <button
              id="tour-billing-manage"
              onClick={() => setShowActionModal(true)}
              className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
            >
              <FaCreditCard />
              {company?.subscription_status === 'past_due' ? "Pay Past Due Bill" : "Manage Billing & Cards"}
            </button>
            <span className="text-xs text-gray-400 flex items-center gap-1">
               <FaLock /> Payments are processed securely by eWay Australia
            </span>
          </div>
        </div>

        {/* Upgrade Plan Card */}
        <div id="tour-billing-add" className="rounded-2xl p-6 bg-gradient-to-br from-slate-800 to-slate-900 text-white relative overflow-hidden border border-slate-700 shadow-xl flex flex-col justify-between">
           <div className="relative z-10">
              <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <FaPlus /> Add Additional Seats
                </h3>
                <div className="flex items-center gap-4 bg-slate-800 p-2 rounded-2xl w-max border border-slate-700 shadow-inner">
                  <button 
                    onClick={() => setAdditionalSeats(Math.max(0, additionalSeats - 1))}
                    className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center hover:bg-slate-600 transition disabled:opacity-50"
                    disabled={additionalSeats === 0}
                  >
                    -
                  </button>
                  <div className="text-4xl font-black w-12 text-center">{additionalSeats}</div>
                  <button 
                    onClick={() => setAdditionalSeats(additionalSeats + 1)}
                    className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center hover:bg-slate-600 transition"
                  >
                    +
                  </button>
                </div>
                
                {additionalSeats > 0 ? (
                  <div className="mt-6 space-y-3 animate-fade-in bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Prorated Charge Today</span>
                      <span className="font-bold text-white">${proratedCharge.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">New Total Seats</span>
                      <span className="font-bold text-white">{currentSeats + additionalSeats}</span>
                    </div>
                    <div className="border-t border-slate-700 my-2 pt-2 flex justify-between">
                      <span className="text-sm text-slate-300 font-semibold uppercase tracking-wider">New Monthly Bill</span>
                      <span className="font-bold text-green-400">${newTotalMonthlyBill}/mo</span>
                    </div>
                    
                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={() => setShowMathModal(true)}
                        className="text-xs font-medium text-indigo-400 hover:text-indigo-300 underline underline-offset-4 transition"
                      >
                        View Math Breakdown
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 mt-4 leading-relaxed">
                    Need to hire more guards? Add licenses here. Your bill will be prorated automatically.
                  </div>
                )}
              </div>
           </div>
           
           <div className="relative z-10 mt-6 pt-4 border-t border-slate-700">
             <button
               onClick={() => handleManageBilling("add_seats", proratedCharge)}
               disabled={additionalSeats === 0}
               className={`w-full py-3.5 rounded-xl font-bold flex justify-center items-center gap-2 transition ${additionalSeats > 0 ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
             >
               Checkout & Upgrade
             </button>
           </div>
        </div>
      </div>
      {/* Math Breakdown Modal */}
      {showMathModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-slate-800 rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl relative animate-scale-in border border-slate-700">
            <button 
              onClick={() => setShowMathModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 bg-slate-700 hover:bg-slate-600 w-8 h-8 rounded-full flex items-center justify-center transition"
            >
              <FaTimes />
            </button>
            
            <h2 className="text-xl font-bold text-white mb-4">Math Breakdown</h2>
            
            <div className="space-y-4">
              <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
                <p className="text-sm text-indigo-200 leading-relaxed">
                  <strong className="text-white block mb-1">How billing works:</strong> 
                  We use "Proration" (Co-terming). Instead of creating a new billing cycle for this new seat, you are only charged a prorated amount today for the days remaining in your current billing period. On your next normal due date, all seats will renew together on a single bill.
                </p>
              </div>
              
              {daysLeft > 30 && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                  <p className="text-sm text-amber-200 leading-relaxed">
                    <strong className="text-white block mb-1">Why is this higher than ${PRICE_PER_GUARD}?</strong> 
                    Because you previously extended your billing cycle, your next bill isn't due for another <strong>{daysLeft} days</strong>. <br/><br/>
                    A standard 30-day seat costs <strong>${PRICE_PER_GUARD}</strong>, so covering the new seat for the full <strong>{daysLeft} days</strong> prorates to exactly <strong>${proratedCharge.toFixed(2)}</strong>.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Billing;
