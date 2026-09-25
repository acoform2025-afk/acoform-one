import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export class PermissionDeniedError extends Error {
  constructor(resource: string, action: string) {
    super(`Permission denied: ${resource}.${action}`);
    this.name = "PermissionDeniedError";
  }
}

/** Checked in the database (has_permission), so the same rule applies as in RLS. Cached per request. */
export const hasPermission = cache(async (resource: string, action: string): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", { p_resource: resource, p_action: action });
  if (error) {
    console.error("Permission check failed:", error.message);
    return false;
  }
  return data === true;
});

export async function requirePermission(resource: string, action: string): Promise<void> {
  if (!(await hasPermission(resource, action))) throw new PermissionDeniedError(resource, action);
}

export async function requirePermissionOrRedirect(resource: string, action: string, to = "/"): Promise<void> {
  if (!(await hasPermission(resource, action))) redirect(to);
}

/** PostgREST returns SETOF text as a plain string array. */
export const getCurrentUserRoles = cache(async (): Promise<string[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_user_role_codes");
  if (error) return [];
  return (data as unknown as string[]) ?? [];
});

export const getCurrentProfile = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("users").select("id, tenant_id, full_name, email").eq("id", user.id).single();
  return data;
});
