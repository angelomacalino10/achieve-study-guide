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

  // Confirm the caller is signed in. Anyone signed in — Viewer or Admin —
  // can update their own profile through this endpoint. There is no userId
  // in the request body: this function only ever touches the caller's own
  // account, taken from their verified token, never anyone else's.
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "You must be signed in." }), { status: 401 });
  }

  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData?.user) {
    return new Response(JSON.stringify({ error: "Your session is invalid. Please sign in again." }), { status: 401 });
  }
  const userId = callerData.user.id;

  const { data: currentProfile, error: currentErr } = await admin
    .from("profiles")
    .select("email, first_name, last_name")
    .eq("id", userId)
    .single();
  if (currentErr || !currentProfile) {
    return new Response(JSON.stringify({ error: "Could not find your account." }), { status: 404 });
  }

  let body: { firstName?: string; lastName?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request." }), { status: 400 });
  }
  const firstName = (body.firstName || "").trim();
  const lastName = (body.lastName || "").trim();
  const newEmail = (body.email || "").trim();
  const newPassword = body.password || "";

  if (!firstName || !lastName) {
    return new Response(JSON.stringify({ error: "First and last name are both required." }), { status: 400 });
  }
  if (!newEmail) {
    return new Response(JSON.stringify({ error: "Email can't be empty." }), { status: 400 });
  }
  if (newPassword && newPassword.length < 6) {
    return new Response(JSON.stringify({ error: "Password must be at least 6 characters." }), { status: 400 });
  }

  // Deliberately only these fields — this function has no code path that
  // touches role or assigned_courses, no matter what the request contains.
  const emailChanged = newEmail !== currentProfile.email;
  if (emailChanged || newPassword) {
    const authUpdate: { email?: string; password?: string } = {};
    if (emailChanged) authUpdate.email = newEmail;
    if (newPassword) authUpdate.password = newPassword;
    const { error: authErr } = await admin.auth.admin.updateUserById(userId, authUpdate);
    if (authErr) {
      return new Response(JSON.stringify({ error: authErr.message }), { status: 400 });
    }
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName, email: newEmail })
    .eq("id", userId);
  if (profileErr) {
    return new Response(JSON.stringify({ error: profileErr.message }), { status: 400 });
  }

  return new Response(JSON.stringify({ success: true, email: newEmail }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

export const config = { path: "/api/update-own-profile" };
