import type { CalendarEvent, CalendarUser } from "@/types/calendar";
import { getDayBoundsUtc } from "./time";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

type ProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

type EventRow = {
  id: string;
  owner_user_id: string;
  title: string;
  start_at: string;
  end_at: string;
  timezone: string;
  category: CalendarEvent["category"];
  color: string;
  visibility: CalendarEvent["visibility"];
  is_all_day: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  event_participants?: Array<{ user_id: string; role: string }>;
};

export type RelationshipInvite = {
  id: string;
  inviterId: string;
  inviterEmail: string;
  inviterDisplayName: string;
  createdAt: string;
};

type RelationshipInviteRow = {
  id: string;
  user_id: string;
  created_at: string;
  profiles: Pick<ProfileRow, "id" | "email" | "display_name"> | Pick<ProfileRow, "id" | "email" | "display_name">[] | null;
};

const profileAccents = ["#2f6df6", "#d84f83", "#138a66", "#e0a928", "#7a5cff"];

export async function signUpWithPassword(email: string, password: string, displayName: string) {
  const supabase = requireSupabase();

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName || email.split("@")[0]
        }
      }
    });
    if (error) throw error;
    return Boolean(data.session);
  } catch (error) {
    throw coerceSupabaseError(error, "Could not reach Supabase Auth. Check your network or proxy and try again.");
  }
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = requireSupabase();

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  } catch (error) {
    throw coerceSupabaseError(error, "Could not reach Supabase Auth. Check your network or proxy and try again.");
  }
}

export async function signOut() {
  const supabase = requireSupabase();

  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    throw coerceSupabaseError(error, "Could not sign out because Supabase Auth is unreachable.");
  }
}

export async function getCurrentSessionUser() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.user ?? null;
  } catch (error) {
    throw coerceSupabaseError(error, "Could not restore your Supabase session. Check your network or proxy.");
  }
}

export async function fetchRelatedUsers(currentUserId: string): Promise<CalendarUser[]> {
  const supabase = requireSupabase();

  const { data: relationships, error: relationshipError } = await supabase
    .from("user_relationships")
    .select("related_user_id")
    .eq("user_id", currentUserId)
    .eq("status", "active");

  if (relationshipError) throw relationshipError;

  const relatedIds = (relationships ?? []).map((row) => row.related_user_id);
  const ids = [currentUserId, ...relatedIds];
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,display_name,avatar_url,created_at")
    .in("id", ids);

  if (profileError) throw profileError;

  return (profiles as ProfileRow[]).map((profile, index) => mapProfile(profile, index));
}

export async function updateCurrentProfile(displayName: string) {
  const supabase = requireSupabase();
  const user = await getCurrentSessionUser();
  if (!user) throw new Error("Sign in before updating your profile.");

  const trimmedName = displayName.trim();
  if (!trimmedName) throw new Error("Display name cannot be empty.");

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: trimmedName })
    .eq("id", user.id);
  if (error) throw error;

  await supabase.auth.updateUser({ data: { display_name: trimmedName } });
}

export async function inviteUserByEmail(email: string) {
  const supabase = requireSupabase();
  const user = await getCurrentSessionUser();
  if (!user) throw new Error("Sign in before inviting someone.");

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Enter an email address to invite.");
  if (normalizedEmail === user.email?.toLowerCase()) throw new Error("You cannot invite yourself.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,display_name,avatar_url,created_at")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error("No Fig account uses that email yet.");

  const invitedProfile = profile as ProfileRow;
  const { data: existingRelationship, error: existingError } = await supabase
    .from("user_relationships")
    .select("status")
    .eq("user_id", user.id)
    .eq("related_user_id", invitedProfile.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existingRelationship?.status === "active") throw new Error("You are already connected with this user.");
  if (existingRelationship?.status === "pending") throw new Error("An invitation is already pending.");

  const { error } = await supabase
    .from("user_relationships")
    .insert({
      user_id: user.id,
      related_user_id: invitedProfile.id,
      status: "pending",
      relationship_type: "close_friend"
    });
  if (error) throw error;
}

export async function fetchIncomingRelationshipInvites(): Promise<RelationshipInvite[]> {
  const supabase = requireSupabase();
  const user = await getCurrentSessionUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("user_relationships")
    .select("id,user_id,created_at,profiles!user_relationships_user_id_fkey(id,email,display_name)")
    .eq("related_user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as RelationshipInviteRow[]).map(mapRelationshipInvite);
}

export async function acceptRelationshipInvite(invite: RelationshipInvite) {
  const supabase = requireSupabase();

  const { error } = await supabase.rpc("accept_relationship_invite", { invite_id_to_accept: invite.id });
  if (error) throw error;
}

export async function fetchEventsForDate(dateKey: string, timezone: string): Promise<CalendarEvent[]> {
  const supabase = requireSupabase();
  const { start, end } = getDayBoundsUtc(dateKey, timezone);

  const { data, error } = await supabase
    .from("events")
    .select("*, event_participants(user_id, role)")
    .lt("start_at", end.toISOString())
    .gt("end_at", start.toISOString())
    .order("start_at", { ascending: true });

  if (error) throw error;
  return (data as EventRow[]).map(mapEventRow);
}

export async function createCalendarEvent(event: CalendarEvent) {
  const supabase = requireSupabase();
  const { participantUserIds, ...insertEvent } = toEventInsert(event);

  const { data, error } = await supabase.from("events").insert(insertEvent).select().single();
  if (error) throw error;

  if (participantUserIds.length) {
    const rows = uniqueParticipantIds(participantUserIds, event.ownerUserId).map((userId) => ({
      event_id: data.id,
      user_id: userId,
      role: "participant"
    }));
    const { error: participantError } = await supabase
      .from("event_participants")
      .upsert(rows, { onConflict: "event_id,user_id", ignoreDuplicates: false });
    if (participantError) throw participantError;
  }

  return data.id as string;
}

export async function getCurrentUserId() {
  const user = await getCurrentSessionUser();
  return user?.id ?? null;
}

export async function updateCalendarEvent(event: CalendarEvent, options: { syncParticipants?: boolean } = {}) {
  const supabase = requireSupabase();
  const { participantUserIds, ...updateEvent } = toEventInsert(event);

  const { error } = await supabase.from("events").update(updateEvent).eq("id", event.id);
  if (error) throw error;

  if (options.syncParticipants) {
    const { error: deleteParticipantsError } = await supabase
      .from("event_participants")
      .delete()
      .eq("event_id", event.id);
    if (deleteParticipantsError) throw deleteParticipantsError;

    if (participantUserIds.length) {
      const rows = uniqueParticipantIds(participantUserIds, event.ownerUserId).map((userId) => ({
        event_id: event.id,
        user_id: userId,
        role: "participant"
      }));
      const { error: participantError } = await supabase
        .from("event_participants")
        .upsert(rows, { onConflict: "event_id,user_id", ignoreDuplicates: false });
      if (participantError) throw participantError;
    }
  }
}

export async function deleteCalendarEvent(eventId: string) {
  const supabase = requireSupabase();
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) throw error;
}

export function canUseSupabase() {
  return isSupabaseConfigured();
}

function mapProfile(profile: ProfileRow, index: number): CalendarUser {
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.display_name || profile.email,
    accent: profileAccents[index % profileAccents.length]
  };
}

function mapRelationshipInvite(row: RelationshipInviteRow): RelationshipInvite {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const email = profile?.email ?? "unknown@happydoggy.local";

  return {
    id: row.id,
    inviterId: row.user_id,
    inviterEmail: email,
    inviterDisplayName: profile?.display_name || email.split("@")[0] || "Someone",
    createdAt: row.created_at
  };
}

function mapEventRow(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    startAt: row.start_at,
    endAt: row.end_at,
    timezone: row.timezone,
    color: row.color,
    category: row.category,
    ownerUserId: row.owner_user_id,
    visibility: row.visibility,
    participantUserIds: (row.event_participants ?? [])
      .filter((participant) => participant.role !== "owner")
      .map((participant) => participant.user_id),
    isAllDay: row.is_all_day,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toEventInsert(event: CalendarEvent) {
  return {
    id: event.id,
    owner_user_id: event.ownerUserId,
    title: event.title,
    start_at: event.startAt,
    end_at: event.endAt,
    timezone: event.timezone,
    category: event.category,
    color: event.color,
    visibility: event.visibility,
    is_all_day: event.isAllDay,
    updated_at: new Date().toISOString(),
    participantUserIds: event.participantUserIds
  };
}

function uniqueParticipantIds(participantUserIds: string[], ownerUserId: string) {
  return Array.from(new Set(participantUserIds)).filter((userId) => userId !== ownerUserId);
}

function coerceSupabaseError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message !== "Failed to fetch") return error;
  return new Error(fallbackMessage);
}

function requireSupabase() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return supabase;
}
