import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { collection_id, farmer_code, farmer_name, phone, quantity_kg, cumulative_kg, collected_at } = await req.json();

    if (!phone) {
      return new Response(JSON.stringify({ sent: false, reason: "no_phone" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message = `MaziwaFlow: Hi ${farmer_name ?? farmer_code}, ${quantity_kg} kg of milk recorded on ${collected_at}. Your cumulative total is ${cumulative_kg} kg.`;

    // Placeholder for actual SMS gateway integration.
    // In production, this would call an SMS provider like Africa's Talking,
    // Twilio, or Vonage. The message is logged here for development.
    console.log(`SMS to ${phone}: ${message}`);

    // Record the SMS attempt in notifications metadata via service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    await supabase.from("notifications").insert({
      user_id: null,
      farmer_code,
      title: "SMS Alert Sent",
      body: message,
      type: "collection",
      metadata: { collection_id, phone, channel: "sms" },
    });

    return new Response(JSON.stringify({ sent: true, message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
