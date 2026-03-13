import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- Auth: returns a display name for the caller ---

interface AuthResult {
  name: string;
  method: "jwt" | "apikey";
}

async function authenticate(req: Request): Promise<AuthResult | null> {
  // 1. Try Supabase Auth JWT from Authorization header
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      const name =
        user.user_metadata?.full_name ||
        user.user_metadata?.preferred_username ||
        user.email ||
        "user";
      return { name, method: "jwt" };
    }
  }

  // 2. Fall back to API key
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (key) {
    const { data, error } = await supabase
      .from("agent_keys")
      .select("agent_name")
      .eq("api_key", key)
      .single();
    if (!error && data) {
      return { name: data.agent_name, method: "apikey" };
    }
  }

  return null;
}

// --- CORS headers ---

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// --- Request handler ---

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const auth = await authenticate(req);
  if (!auth) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const url = new URL(req.url);
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
