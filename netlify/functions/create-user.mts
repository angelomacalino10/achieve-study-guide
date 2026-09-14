import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wtfmlcdiwlsywdhwngig.supabase.co";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return new Response(JSON.stringify({ error: "Server is missing its Supabase key." }), { status: 500 });
  }
  const admin = createClient(SUPABASE_URL, serviceKey);

  // Confirm the caller is signed in and is an admin before doing anything.
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "You must be signed in." }), { status: 401 });
  }

  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData?.user) {
    return new Response(JSON.stringify({ error: "Your session is invalid. Please sign in again." }), { status: 401 });
  }

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", callerData.user.id)
    .single();

  if (profileErr || !profile || profile.role !== "admin") {
    return new Response(JSON.stringify({ error: "Only admins can create accounts." }), { status: 403 });
  }

  // Now actually create the account. Course access for Viewers is assigned
  // afterward from the Users list, not at creation time.
  let body: { email?: string; password?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request." }), { status: 400 });
  }
  const email = (body.email || "").trim();
  const password = body.password || "";
  const role = body.role === "admin" ? "admin" : "viewer";

  if (!email || !password) {
    return new Response(JSON.stringify({ error: "Email and password are both required." }), { status: 400 });
  }
  if (password.length < 6) {
    return new Response(JSON.stringify({ error: "Password must be at least 6 characters." }), { status: 400 });
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !created?.user) {
    return new Response(JSON.stringify({ error: createErr?.message || "Could not create account." }), { status: 400 });
  }

  await admin.from("profiles").insert({ id: created.user.id, email, role, assigned_courses: [] });

  return new Response(JSON.stringify({ success: true, id: created.user.id, email, role }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

export const config = { path: "/api/create-user" };
