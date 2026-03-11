import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- Auth ---

async function authenticate(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("agent_keys")
    .select("agent_name")
    .eq("api_key", key)
    .single();
  if (error || !data) return null;
  return data.agent_name;
}

// --- CORS headers ---

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// --- Request handler ---

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (!key) {
    return Response.json(
      { error: "Missing key parameter" },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const agentName = await authenticate(key);
  if (!agentName) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const hours = parseInt(url.searchParams.get("hours") || "24", 10);
  const agent = url.searchParams.get("agent") || null;
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);

  const { data, error } = await supabase.rpc("bus_activity", {
    hours_back: hours,
    agent_filter: agent,
    result_limit: limit,
  });

  if (error) {
    return Response.json(
      { error: error.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  return Response.json(data, {
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "no-cache",
    },
  });
});
