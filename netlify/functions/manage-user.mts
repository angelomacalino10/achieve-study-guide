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

  const { data: callerProfile, error: callerProfileErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", callerData.user.id)
    .single();

  if (callerProfileErr || !callerProfile || callerProfile.role !== "admin") {
    return new Response(JSON.stringify({ error: "Only admins can manage accounts." }), { status: 403 });
  }

  let body: { action?: string; userId?: string; newRole?: string; courses?: string[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request." }), { status: 400 });
  }
  const action = body.action;
  const userId = body.userId;
  const VALID_ACTIONS = ["hide", "unhide", "delete", "set_role", "set_courses"];

  if (!userId || !VALID_ACTIONS.includes(action || "")) {
    return new Response(JSON.stringify({ error: "Missing or invalid action/userId." }), { status: 400 });
  }

  // Never let an admin accidentally lock themselves out.
  if (userId === callerData.user.id) {
    return new Response(JSON.stringify({ error: "You can't do that to your own account." }), { status: 400 });
  }

  // Every action needs the target's current state and email — both for the
  // action itself (e.g. knowing their old role) and for the audit entry.
  const { data: targetProfile, error: targetErr } = await admin
    .from("profiles")
    .select("email, role, assigned_courses")
    .eq("id", userId)
    .single();
  if (targetErr || !targetProfile) {
    return new Response(JSON.stringify({ error: "Could not find that account." }), { status: 404 });
  }

  async function logAudit(auditAction: string, details: string) {
    await admin.from("admin_audit_log").insert({
      actor_id: callerData!.user.id,
      actor_email: callerData!.user.email,
      action: auditAction,
      target_email: targetProfile!.email,
      details,
    });
  }

  if (action === "hide" || action === "unhide") {
    const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: action === "hide" ? "876000h" : "none", // ~100 years, or lift the ban
    });
    if (banErr) {
      return new Response(JSON.stringify({ error: banErr.message }), { status: 400 });
    }
    const { error: profileErr } = await admin
      .from("profiles")
      .update({ hidden: action === "hide" })
      .eq("id", userId);
    if (profileErr) {
      return new Response(JSON.stringify({ error: profileErr.message }), { status: 400 });
    }
    await logAudit(action, action === "hide" ? "Hid account (login disabled, history kept)" : "Unhid account (login restored)");
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "content-type": "application/json" } });
  }

  if (action === "delete") {
    // Remove their history first — the auth user's foreign key on activity_log
    // isn't cascading, so this has to happen before the account itself can go.
    await admin.from("activity_log").delete().eq("user_id", userId);
    const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
    if (deleteErr) {
      return new Response(JSON.stringify({ error: deleteErr.message }), { status: 400 });
    }
    await logAudit("delete", "Permanently deleted account and all activity history");
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "content-type": "application/json" } });
  }

  if (action === "set_role") {
    const newRole = body.newRole === "admin" ? "admin" : "viewer";
    const { error: roleErr } = await admin.from("profiles").update({ role: newRole }).eq("id", userId);
    if (roleErr) {
      return new Response(JSON.stringify({ error: roleErr.message }), { status: 400 });
    }
    await logAudit("role_change", `Changed role from ${targetProfile.role} to ${newRole}`);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "content-type": "application/json" } });
  }

  if (action === "set_courses") {
    const courses = Array.isArray(body.courses) ? body.courses : [];
    const { error: coursesErr } = await admin.from("profiles").update({ assigned_courses: courses }).eq("id", userId);
    if (coursesErr) {
      return new Response(JSON.stringify({ error: coursesErr.message }), { status: 400 });
    }
    await logAudit("course_change", courses.length ? `Set course access to: ${courses.join(", ")}` : "Removed all course access");
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "content-type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "Unhandled action." }), { status: 400 });
};

export const config = { path: "/api/manage-user" };
