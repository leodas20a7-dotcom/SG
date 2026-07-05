import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.31.0"

serve(async (req) => {
  try {
    const ewayPayload = await req.json()

    // eWay sends Webhook payloads when transactions are processed.
    // Example: {"TransactionID":12345678, "EventType":"Transaction"}

    // Initialize Supabase client with Service Role to bypass RLS
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // For a real integration, we would verify the payload signature from eWay here,
    // fetch the transaction details using the TransactionID, and update the database.
    // Assuming we successfully parsed the payload and extracted the company reference:
    
    // As a placeholder, let's assume we find the company ID from the transaction record:
    // const companyId = ewayTransaction.Customer.Reference;
    
    // await supabaseClient
    //   .from('companies')
    //   .update({ subscription_status: 'active' })
    //   .eq('id', companyId);

    // await supabaseClient
    //   .from('billing_history')
    //   .insert({
    //     company_id: companyId,
    //     amount_cents: ewayTransaction.Payment.TotalAmount,
    //     currency: 'AUD',
    //     status: 'paid'
    //   });

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error(error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
