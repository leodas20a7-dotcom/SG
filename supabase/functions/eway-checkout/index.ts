import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.31.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { companyId, requestedSeats, amountToCharge } = await req.json()

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Get the company details
    const { data: company, error: companyErr } = await supabaseClient
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single()

    if (companyErr || !company) {
      throw new Error('Company not found')
    }

    const quantity = parseInt(requestedSeats) || 1;
    const pricePerGuard = 2500; // $25.00 in cents
    
    // Calculate total amount in cents
    let totalAmount = quantity * pricePerGuard;
    if (typeof amountToCharge === 'number') {
      totalAmount = Math.round(amountToCharge * 100);
    }

    // 3. Create eWay Access Code (Hosted Payment Page)
    const ewayApiKey = Deno.env.get('EWAY_API_KEY');
    const ewayPassword = Deno.env.get('EWAY_PASSWORD');
    // For production use https://api.ewaypayments.com/AccessCodesShared
    const ewayUrl = 'https://api.sandbox.ewaypayments.com/AccessCodesShared'; 

    const authHeader = 'Basic ' + btoa(`${ewayApiKey}:${ewayPassword}`);

    const ewayPayload = {
      Customer: {
        Reference: companyId,
        FirstName: company.name,
        Email: company.contact_email
      },
      Payment: {
        TotalAmount: totalAmount,
        InvoiceReference: `SUB-${quantity}-${new Date().getTime().toString().slice(-10)}`,
        InvoiceDescription: `SecureSys Monthly License - ${quantity} Guards`,
        CurrencyCode: "AUD"
      },
      Method: "ProcessPayment",
      TransactionType: "Recurring", // Sets up a recurring token
      RedirectUrl: `${req.headers.get('origin')}/?checkout=success`,
      CancelUrl: `${req.headers.get('origin')}/?checkout=canceled`
    };

    const response = await fetch(ewayUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(ewayPayload)
    });

    const ewayData = await response.json();

    if (ewayData.Errors) {
      throw new Error(`eWay Error: ${ewayData.Errors}`);
    }

    if (!ewayData.SharedPaymentUrl) {
      return new Response(
        JSON.stringify({ error: `eWay API returned unexpected response: ${JSON.stringify(ewayData)}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // eWay returns a SharedPaymentUrl to redirect the user to
    return new Response(
      JSON.stringify({ url: ewayData.SharedPaymentUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error(error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
