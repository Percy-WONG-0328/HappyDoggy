"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent, CalendarUser, LaidOutSegment, RenderLane } from "@/types/calendar";
import { categories, colors, createMockEvents, currentUser as mockCurrentUser, makeEvent, users as mockUsers } from "@/lib/mockData";
import { layoutSegments, splitEventsForDay } from "@/lib/layout";
import {
  acceptRelationshipInvite,
  canUseSupabase,
  createCalendarEvent,
  deleteCalendarEvent,
  fetchEventsForDate,
  fetchIncomingRelationshipInvites,
  fetchRelatedUsers,
  getCurrentSessionUser,
  inviteUserByEmail,
  type RelationshipInvite,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  updateCalendarEvent,
  updateCurrentProfile
} from "@/lib/calendarRepository";
import {
  addDays,
  formatDateLabel,
  formatTime,
  getDefaultTimezone,
  getLocalDateKey,
  snapMinutes,
  zonedTimeToUtc
} from "@/lib/time";
import { getSupabaseClient } from "@/lib/supabase";
import { StatusMessage, type StatusTone } from "./status-message";

const PIXELS_PER_MINUTE = 1.15;
const DAY_HEIGHT = 1440 * PIXELS_PER_MINUTE;
const MIN_EVENT_MINUTES = 15;

type DraftRange = {
  lane: RenderLane;
  startMinutes: number;
  endMinutes: number;
};

type DragState =
  | {
      kind: "create";
      lane: RenderLane;
      anchorMinutes: number;
    }
  | {
      kind: "move";
      eventId: string;
      originalEvent: CalendarEvent;
      originMinutes: number;
      startMinutes: number;
      endMinutes: number;
    }
  | {
      kind: "resize-start" | "resize-end";
      eventId: string;
      originalEvent: CalendarEvent;
      originMinutes: number;
      startMinutes: number;
      endMinutes: number;
    };

type SaveStatus = "idle" | "saving" | "saved" | "syncing" | "error";
type AuthMode = "login" | "register";

type PendingDelete = {
  event: CalendarEvent;
  previousEvents: CalendarEvent[];
  dateKey: string;
};

type OptimisticSave = {
  baselineEvents: CalendarEvent[];
  latestToken: number;
};

export default function Home() {
  const timezone = getDefaultTimezone();
  const cloudEnabled = canUseSupabase();
  const [dateKey, setDateKey] = useState(() => getLocalDateKey(new Date(), timezone));
  const [appUsers, setAppUsers] = useState(mockUsers);
  const [currentUserId, setCurrentUserId] = useState(mockCurrentUser.id);
  const [selectedUserId, setSelectedUserId] = useState(mockUsers[1].id);
  const [events, setEvents] = useState(() => createMockEvents(getLocalDateKey(new Date(), timezone)));
  const [draft, setDraft] = useState<DraftRange | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [mobileCreateLane, setMobileCreateLane] = useState<RenderLane | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [relationshipInvites, setRelationshipInvites] = useState<RelationshipInvite[]>([]);
  const [isLoading, setIsLoading] = useState(cloudEnabled);
  const [isSyncing, setIsSyncing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<StatusTone>("error");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const longPressRef = useRef<number | null>(null);
  const eventsRef = useRef(events);
  const pendingDeleteRef = useRef<PendingDelete | null>(null);
  const optimisticSavesRef = useRef(new Map<string, OptimisticSave>());
  const saveMutationSeqRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const saveStatusTimerRef = useRef<number | null>(null);
  const deleteTimerRef = useRef<number | null>(null);

  const currentUser = appUsers.find((user) => user.id === currentUserId) ?? appUsers[0] ?? mockCurrentUser;
  const selectedUser =
    appUsers.find((user) => user.id === selectedUserId && user.id !== currentUser.id) ??
    appUsers.find((user) => user.id !== currentUser.id) ??
    null;
  const comparisonUser = selectedUser ?? currentUser;
  const visible = useMemo(
    () => splitEventsForDay(events, dateKey, timezone, currentUser, comparisonUser),
    [comparisonUser, currentUser, dateKey, events, timezone]
  );
  const laidOutSegments = useMemo(() => layoutSegments(visible.segments), [visible.segments]);
  const editingEvent = editingEventId ? events.find((event) => event.id === editingEventId) ?? null : null;

  useEffect(() => {
    setProfileDisplayName(currentUser.displayName);
  }, [currentUser.id, currentUser.displayName]);

  useEffect(() => {
    if (!cloudEnabled) return;
    void bootstrapCloudSession();
  }, [cloudEnabled]);

  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) window.clearTimeout(saveStatusTimerRef.current);
      if (deleteTimerRef.current) window.clearTimeout(deleteTimerRef.current);
    };
  }, []);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    pendingDeleteRef.current = pendingDelete;
  }, [pendingDelete]);

  useEffect(() => {
    if (!cloudEnabled || currentUserId === mockCurrentUser.id) return;
    refreshCloudEvents(dateKey).catch(handleCloudError);
  }, [cloudEnabled, currentUserId, dateKey, timezone]);

  useEffect(() => {
    if (!cloudEnabled || currentUserId === mockCurrentUser.id) return;

    function refreshWhenVisible() {
      if (document.visibilityState === "visible" && !editingEventId && !dragState) {
        refreshCloudEvents(dateKey).catch(handleCloudError);
      }
    }

    const intervalId = window.setInterval(refreshWhenVisible, 30000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [cloudEnabled, currentUserId, dateKey, dragState, editingEventId, timezone]);

  useEffect(() => {
    if (!cloudEnabled || currentUserId === mockCurrentUser.id) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    let refreshTimer: number | null = null;
    const scheduleRealtimeRefresh = () => {
      if (editingEventId || dragState) return;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshAccountContext().catch(handleCloudError);
        refreshCloudEvents(dateKey).catch(handleCloudError);
      }, 350);
    };

    const channel = supabase
      .channel(`happydoggy-calendar-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, scheduleRealtimeRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_participants" }, scheduleRealtimeRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_relationships" }, scheduleRealtimeRefresh)
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          setStatusTone("error");
          setStatusMessage("Realtime connection failed. Manual Sync still works.");
          setSaveStatus("error");
        }
      });

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [cloudEnabled, currentUserId, dateKey, dragState, editingEventId, timezone]);

  function markSaveStatus(nextStatus: SaveStatus) {
    if (saveStatusTimerRef.current) {
      window.clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = null;
    }

    setSaveStatus(nextStatus);

    if (nextStatus === "saved") {
      saveStatusTimerRef.current = window.setTimeout(() => {
        setSaveStatus("idle");
        saveStatusTimerRef.current = null;
      }, 2200);
    }
  }

  function handleCloudError(error: unknown) {
    markSaveStatus("error");
    setStatusTone("error");
    setStatusMessage(getErrorMessage(error));
  }

  function restoreEvents(previousEvents: CalendarEvent[]) {
    eventsRef.current = previousEvents;
    setEvents(previousEvents);
  }

  function handleRollbackError(error: unknown, previousEvents: CalendarEvent[], fallbackMessage: string) {
    restoreEvents(previousEvents);
    markSaveStatus("error");
    setStatusTone("error");
    setStatusMessage(`${fallbackMessage} ${getErrorMessage(error)}`);
  }

  function clearPendingDelete() {
    if (deleteTimerRef.current) {
      window.clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    pendingDeleteRef.current = null;
    setPendingDelete(null);
  }

  function undoDelete() {
    if (!pendingDelete) return;
    restoreEvents(pendingDelete.previousEvents);
    clearPendingDelete();
    markSaveStatus("saved");
    setStatusTone("success");
    setStatusMessage("Delete undone.");
  }

  function commitPendingDelete(deleteRequest: PendingDelete) {
    clearPendingDelete();
    markSaveStatus("saving");
    deleteCalendarEvent(deleteRequest.event.id)
      .then(() => {
        markSaveStatus("saved");
        return refreshCloudEvents(deleteRequest.dateKey);
      })
      .catch((error) => {
        restoreEvents(deleteRequest.previousEvents);
        markSaveStatus("error");
        setStatusTone("error");
        setStatusMessage(`Delete failed. The event was restored. ${getErrorMessage(error)}`);
      });
  }

  async function bootstrapCloudSession() {
    setIsLoading(true);
    setStatusTone("error");
    setStatusMessage("");

    try {
      const sessionUser = await getCurrentSessionUser();
      if (!sessionUser) {
        setIsLoading(false);
        return;
      }

      setCurrentUserId(sessionUser.id);
      await refreshAccountContext(sessionUser.id);
      await refreshCloudEvents(dateKey);
    } catch (error) {
      handleCloudError(error);
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshAccountContext(sessionUserId = currentUserId) {
    if (!cloudEnabled || sessionUserId === mockCurrentUser.id) return;

    const relatedUsers = await fetchRelatedUsers(sessionUserId);
    const sessionUser = await getCurrentSessionUser();
    const sessionProfile =
      relatedUsers.find((user) => user.id === sessionUserId) ??
      (sessionUser ? userFromSession(sessionUser) : currentUser);
    const nextUsers = [sessionProfile, ...relatedUsers.filter((user) => user.id !== sessionUserId)];
    const firstComparisonUser = nextUsers.find((user) => user.id !== sessionUserId);
    const nextSelectedUser = nextUsers.find((user) => user.id === selectedUserId && user.id !== sessionUserId);

    setAppUsers(nextUsers);
    setProfileDisplayName(sessionProfile.displayName);
    setSelectedUserId((nextSelectedUser ?? firstComparisonUser)?.id ?? "");
    setRelationshipInvites(await fetchIncomingRelationshipInvites());
  }

  async function refreshCloudEvents(nextDateKey: string) {
    if (!cloudEnabled) return;
    if (isRefreshingRef.current) return;

    isRefreshingRef.current = true;
    setIsSyncing(true);
    markSaveStatus("syncing");

    try {
      const pendingDeletedEvent = pendingDeleteRef.current;
      const cloudEvents = (await fetchEventsForDate(nextDateKey, timezone)).filter(
        (event) => pendingDeletedEvent?.dateKey !== nextDateKey || event.id !== pendingDeletedEvent.event.id
      );
      setEvents(cloudEvents);
      eventsRef.current = cloudEvents;
      optimisticSavesRef.current.clear();
      markSaveStatus("saved");
    } catch (error) {
      markSaveStatus("error");
      throw error;
    } finally {
      isRefreshingRef.current = false;
      setIsSyncing(false);
    }
  }

  async function handleAuthSubmit(submitEvent: React.FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    setIsLoading(true);
    setStatusMessage("");

    try {
      if (authMode === "register") {
        const signedIn = await signUpWithPassword(authEmail, authPassword, authDisplayName);
        if (!signedIn) {
          setAuthMode("login");
          setStatusTone("success");
          setStatusMessage("Account created. Check your email if confirmation is required, then log in.");
          return;
        }
      } else {
        await signInWithPassword(authEmail, authPassword);
      }
      await bootstrapCloudSession();
    } catch (error) {
      handleCloudError(error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    if (!cloudEnabled) return;
    if (pendingDelete) commitPendingDelete(pendingDelete);
    await signOut();
    setCurrentUserId(mockCurrentUser.id);
    setAppUsers(mockUsers);
    setRelationshipInvites([]);
    setEvents(createMockEvents(dateKey));
    setStatusMessage("");
  }

  async function handleProfileSave() {
    if (!cloudEnabled) return;
    setStatusMessage("");
    markSaveStatus("saving");

    try {
      await updateCurrentProfile(profileDisplayName);
      await refreshAccountContext();
      markSaveStatus("saved");
    } catch (error) {
      handleCloudError(error);
    }
  }

  async function handleInviteSubmit(submitEvent: React.FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (!cloudEnabled) return;

    setStatusMessage("");
    markSaveStatus("saving");

    try {
      await inviteUserByEmail(inviteEmail);
      setInviteEmail("");
      await refreshAccountContext();
      markSaveStatus("saved");
      setStatusTone("success");
      setStatusMessage("Invitation sent.");
    } catch (error) {
      handleCloudError(error);
    }
  }

  async function handleAcceptInvite(invite: RelationshipInvite) {
    if (!cloudEnabled) return;

    setStatusMessage("");
    markSaveStatus("saving");

    try {
      await acceptRelationshipInvite(invite);
      await refreshAccountContext();
      await refreshCloudEvents(dateKey);
      markSaveStatus("saved");
      setStatusTone("success");
      setStatusMessage(`You are now connected with ${invite.inviterDisplayName}.`);
    } catch (error) {
      handleCloudError(error);
    }
  }

  async function resetDay(nextDateKey: string) {
    if (pendingDelete) commitPendingDelete(pendingDelete);
    setDateKey(nextDateKey);
    setDraft(null);
    setEditingEventId(null);

    if (cloudEnabled && currentUserId !== mockCurrentUser.id) {
      try {
        await refreshCloudEvents(nextDateKey);
      } catch (error) {
        handleCloudError(error);
      }
      return;
    }

    setEvents(createMockEvents(nextDateKey));
  }

  function minutesFromPointer(clientY: number) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return snapMinutes((clientY - rect.top) / PIXELS_PER_MINUTE);
  }

  function handleEmptyPointerDown(event: React.PointerEvent<HTMLDivElement>, lane: RenderLane) {
    if (event.button !== 0) return;
    const minutes = minutesFromPointer(event.clientY);
    const target = event.currentTarget;
    const pointerId = event.pointerId;

    if (event.pointerType === "touch" && mobileCreateLane) {
      event.preventDefault();
      target.setPointerCapture(pointerId);
      setDragState({ kind: "create", lane: mobileCreateLane, anchorMinutes: minutes });
      setDraft({ lane: mobileCreateLane, startMinutes: minutes, endMinutes: minutes + MIN_EVENT_MINUTES });
      return;
    }

    if (event.pointerType === "touch") {
      longPressRef.current = window.setTimeout(() => {
        target.setPointerCapture(pointerId);
        setDragState({ kind: "create", lane, anchorMinutes: minutes });
        setDraft({ lane, startMinutes: minutes, endMinutes: minutes + MIN_EVENT_MINUTES });
      }, 420);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ kind: "create", lane, anchorMinutes: minutes });
    setDraft({ lane, startMinutes: minutes, endMinutes: minutes + MIN_EVENT_MINUTES });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragState) return;
    event.preventDefault();
    const minutes = minutesFromPointer(event.clientY);

    if (dragState.kind === "create") {
      event.preventDefault();
      const startMinutes = Math.min(dragState.anchorMinutes, minutes);
      const endMinutes = Math.max(dragState.anchorMinutes, minutes);
      setDraft({
        lane: dragState.lane,
        startMinutes,
        endMinutes: Math.max(endMinutes, startMinutes + MIN_EVENT_MINUTES)
      });
      return;
    }

    const delta = minutes - dragState.originMinutes;
    const duration = dragState.endMinutes - dragState.startMinutes;

    const editableEvent = eventsRef.current.find((eventItem) => eventItem.id === dragState.eventId);
    if (!editableEvent || !canEditEvent(editableEvent, currentUser.id, cloudEnabled)) return;

    if (dragState.kind === "move") {
      const nextStart = Math.max(0, Math.min(1440 - duration, dragState.startMinutes + delta));
      updateEventTime(dragState.eventId, nextStart, nextStart + duration, false);
      return;
    }

    if (dragState.kind === "resize-start") {
      updateEventTime(
        dragState.eventId,
        Math.min(dragState.endMinutes - MIN_EVENT_MINUTES, Math.max(0, dragState.startMinutes + delta)),
        dragState.endMinutes,
        false
      );
      return;
    }

    updateEventTime(
      dragState.eventId,
      dragState.startMinutes,
      Math.max(dragState.startMinutes + MIN_EVENT_MINUTES, Math.min(1440, dragState.endMinutes + delta)),
      false
    );
  }

  function finishPointerInteraction() {
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }

    if (dragState && dragState.kind !== "create") {
      persistEvent(dragState.eventId, {
        rollbackEvent: dragState.originalEvent,
        syncParticipants: false,
        refreshAfterSave: true
      });
    }

    if (dragState?.kind === "create" && draft && draft.endMinutes - draft.startMinutes >= MIN_EVENT_MINUTES) {
      const ownerUserId = currentUser.id;
      const participantUserIds = draft.lane === "shared" && selectedUser ? [selectedUser.id] : [];
      const event = makeEvent(
        crypto.randomUUID(),
        "New event",
        dateKey,
        draft.startMinutes,
        dateKey,
        draft.endMinutes,
        "Life",
        draft.lane === "shared" ? colors[3] : colors[0],
        ownerUserId,
        "relationship",
        participantUserIds
      );
      const previousEvents = eventsRef.current;
      setEvents((current) => [...current, event]);
      eventsRef.current = [...eventsRef.current, event];

      if (cloudEnabled) {
        setStatusMessage("");
        markSaveStatus("saving");
        createCalendarEvent(event)
          .then(() => {
            markSaveStatus("saved");
            setEditingEventId(event.id);
            return refreshCloudEvents(dateKey);
          })
          .catch((error) => {
            setEditingEventId(null);
            handleRollbackError(error, previousEvents, "Create failed. The event was removed.");
          });
      } else {
        setEditingEventId(event.id);
      }
    }

    setMobileCreateLane(null);
    setDraft(null);
    setDragState(null);
  }

  function persistEvent(
    eventId: string,
    options: { rollbackEvent?: CalendarEvent; syncParticipants?: boolean; refreshAfterSave?: boolean } = {}
  ) {
    if (!cloudEnabled) return;

    const event = eventsRef.current.find((eventItem) => eventItem.id === eventId);
    if (!event) return;
    const previousEvents = options.rollbackEvent
      ? eventsRef.current.map((eventItem) => (eventItem.id === eventId ? options.rollbackEvent as CalendarEvent : eventItem))
      : eventsRef.current;

    markSaveStatus("saving");
    updateCalendarEvent(event, {
      syncParticipants: options.syncParticipants
    })
      .then(() => {
        markSaveStatus("saved");
        if (options.refreshAfterSave) return refreshCloudEvents(dateKey);
        return undefined;
      })
      .catch((error) => handleRollbackError(error, previousEvents, "Save failed. Changes were restored."));
  }

  function updateEventTime(eventId: string, startMinutes: number, endMinutes: number, persist = true) {
    applyEventChange(eventId, (event) => ({
      ...event,
      startAt: zonedTimeToUtc(dateKey, snapMinutes(startMinutes), timezone).toISOString(),
      endAt: zonedTimeToUtc(dateKey, snapMinutes(endMinutes), timezone).toISOString(),
      updatedAt: new Date().toISOString()
    }), { persist });
  }

  function updateEvent(eventId: string, patch: Partial<CalendarEvent>) {
    applyEventChange(eventId, (event) => ({
      ...event,
      ...patch,
      updatedAt: new Date().toISOString()
    }), {
      syncParticipants: Boolean(patch.participantUserIds)
    });
  }

  function applyEventChange(
    eventId: string,
    updater: (event: CalendarEvent) => CalendarEvent,
    options: { persist?: boolean; syncParticipants?: boolean } = {}
  ) {
    const existingEvent = eventsRef.current.find((event) => event.id === eventId);
    if (!existingEvent) return;

    if (!canEditEvent(existingEvent, currentUser.id, cloudEnabled)) {
      setStatusTone("error");
      setStatusMessage("You can only edit your own events or shared events you participate in.");
      return;
    }

    const changedEvent = updater(existingEvent);
    const previousEvents = eventsRef.current;
    const nextEvents = eventsRef.current.map((event) => (event.id === eventId ? changedEvent : event));
    eventsRef.current = nextEvents;
    setEvents(nextEvents);

    if (cloudEnabled && options.persist !== false) {
      const token = saveMutationSeqRef.current + 1;
      saveMutationSeqRef.current = token;
      const activeSave = optimisticSavesRef.current.get(eventId);
      optimisticSavesRef.current.set(eventId, {
        baselineEvents: activeSave?.baselineEvents ?? previousEvents,
        latestToken: token
      });

      markSaveStatus("saving");
      updateCalendarEvent(changedEvent, {
        syncParticipants: options.syncParticipants && changedEvent.ownerUserId === currentUser.id
      })
        .then(() => {
          const latestSave = optimisticSavesRef.current.get(eventId);
          if (latestSave?.latestToken !== token) return;
          optimisticSavesRef.current.delete(eventId);
          markSaveStatus("saved");
        })
        .catch((error) => {
          const latestSave = optimisticSavesRef.current.get(eventId);
          if (latestSave?.latestToken !== token) return;
          optimisticSavesRef.current.delete(eventId);
          handleRollbackError(error, latestSave.baselineEvents, "Save failed. Changes were restored.");
        });
    }
  }

  function deleteEvent(eventId: string) {
    const eventToDelete = eventsRef.current.find((event) => event.id === eventId);
    if (!eventToDelete) return;

    if (!canDeleteEvent(eventToDelete, currentUser.id, cloudEnabled)) {
      setStatusTone("error");
      setStatusMessage("Only the owner or a shared participant can delete this event.");
      return;
    }

    if (pendingDelete) commitPendingDelete(pendingDelete);

    const previousEvents = eventsRef.current;
    const nextEvents = eventsRef.current.filter((event) => event.id !== eventId);
    const deleteRequest = { event: eventToDelete, previousEvents, dateKey };

    restoreEvents(nextEvents);
    setEditingEventId(null);

    if (cloudEnabled) {
      pendingDeleteRef.current = deleteRequest;
      setPendingDelete(deleteRequest);
      markSaveStatus("saved");
      setStatusTone("success");
      setStatusMessage("Event deleted.");
      deleteTimerRef.current = window.setTimeout(() => commitPendingDelete(deleteRequest), 6000);
    }
  }

  if (cloudEnabled && currentUserId === mockCurrentUser.id) {
    return (
      <main className="loginShell">
        <form className="loginPanel" onSubmit={handleAuthSubmit}>
          <p className="eyebrow">HappyDoggy Phase 3</p>
          <h1>{authMode === "login" ? "Sign in" : "Create account"}</h1>
          <div className="segmentedControl" aria-label="Authentication mode">
            <button
              type="button"
              className={authMode === "login" ? "activeSegment" : ""}
              onClick={() => setAuthMode("login")}
            >
              Login
            </button>
            <button
              type="button"
              className={authMode === "register" ? "activeSegment" : ""}
              onClick={() => setAuthMode("register")}
            >
              Register
            </button>
          </div>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              required
            />
          </label>
          {authMode === "register" ? (
            <label>
              Display name
              <input
                autoComplete="nickname"
                value={authDisplayName}
                onChange={(event) => setAuthDisplayName(event.target.value)}
                placeholder="Percy"
              />
            </label>
          ) : null}
          <label>
            Password
            <input
              type="password"
              autoComplete={authMode === "login" ? "current-password" : "new-password"}
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Working..." : authMode === "login" ? "Login" : "Create account"}
          </button>
          {statusMessage ? <p className={`statusMessage ${statusTone}`}>{statusMessage}</p> : null}
        </form>
      </main>
    );
  }

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <p className="eyebrow">{cloudEnabled ? "HappyDoggy Phase 3" : "HappyDoggy Phase 1"}</p>
          <h1>{formatDateLabel(dateKey)}</h1>
        </div>
        <div className="toolbar">
          <div className="dateControls">
            <button aria-label="Previous day" onClick={() => void resetDay(addDays(dateKey, -1))}>
              &lt;
            </button>
            <input value={dateKey} type="date" onChange={(event) => void resetDay(event.target.value)} />
            <button onClick={() => void resetDay(getLocalDateKey(new Date(), timezone))}>Today</button>
            <button aria-label="Next day" onClick={() => void resetDay(addDays(dateKey, 1))}>
              &gt;
            </button>
          </div>
          <select
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            disabled={appUsers.filter((user) => user.id !== currentUser.id).length === 0}
          >
            {appUsers.filter((user) => user.id !== currentUser.id).length === 0 ? (
              <option value="">No active relationships</option>
            ) : (
              appUsers
                .filter((user) => user.id !== currentUser.id)
                .map((user) => (
                  <option value={user.id} key={user.id}>
                    Compare: {user.displayName}
                  </option>
                ))
            )}
          </select>
          <div className="mobileCreateActions" aria-label="Mobile create mode">
            <button
              className={mobileCreateLane === "current" ? "activeCreate" : ""}
              onClick={() => setMobileCreateLane((lane) => (lane === "current" ? null : "current"))}
            >
              + Me
            </button>
            {selectedUser ? (
              <button
                className={mobileCreateLane === "shared" ? "activeCreate" : ""}
                onClick={() => setMobileCreateLane((lane) => (lane === "shared" ? null : "shared"))}
              >
                + Both
              </button>
            ) : null}
          </div>
          {cloudEnabled ? (
            <span className={`syncBadge ${saveStatus}`}>{getSaveStatusLabel(saveStatus)}</span>
          ) : null}
          {cloudEnabled ? (
            <button className="syncButton" onClick={() => refreshCloudEvents(dateKey).catch(handleCloudError)}>
              {isSyncing ? "Syncing..." : "Sync"}
            </button>
          ) : null}
          {cloudEnabled ? (
            <button className="logoutButton" onClick={() => void handleLogout()}>
              Logout
            </button>
          ) : (
            <button>Mock mode</button>
          )}
        </div>
      </header>
      {cloudEnabled ? (
        <section className="accountPanel" aria-label="Account and invitations">
          <div className="profileControls">
            <label>
              Display name
              <input value={profileDisplayName} onChange={(event) => setProfileDisplayName(event.target.value)} />
            </label>
            <button onClick={() => void handleProfileSave()} disabled={profileDisplayName.trim() === currentUser.displayName}>
              Save name
            </button>
          </div>
          <form className="inviteControls" onSubmit={handleInviteSubmit}>
            <label>
              Invite by email
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="partner@example.com"
              />
            </label>
            <button type="submit" disabled={!inviteEmail.trim()}>
              Invite
            </button>
          </form>
          {relationshipInvites.length ? (
            <div className="inviteList">
              {relationshipInvites.map((invite) => (
                <div className="inviteItem" key={invite.id}>
                  <span>{invite.inviterDisplayName} invited you</span>
                  <button onClick={() => void handleAcceptInvite(invite)}>Accept</button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      {statusMessage ? (
        <StatusMessage tone={statusTone} message={statusMessage} showUndo={Boolean(pendingDelete)} onUndo={undoDelete} />
      ) : null}
      {cloudEnabled && !selectedUser ? (
        <p className="statusMessage error">
          No active relationship is available yet. Invite someone by email or accept a pending invitation to enable
          shared events.
        </p>
      ) : null}

      <section className="allDayStrip" aria-label="All day events">
        <span>All day</span>
        <div>
          {visible.allDayEvents.map((event) => (
            <button
              className="allDayEvent"
              style={{ borderColor: event.color }}
              key={event.id}
              onClick={() => setEditingEventId(event.id)}
            >
              {event.title}
            </button>
          ))}
        </div>
      </section>

      <section className="calendarFrame">
        <div className="timeHeader" />
        <div className="laneHeaders">
          <span>{currentUser.displayName}</span>
          <span>Shared</span>
          <span>{selectedUser?.displayName ?? "No comparison user"}</span>
        </div>

        <div className="timeRail">
          {Array.from({ length: 25 }, (_, hour) => (
            <span key={hour} style={{ top: hour * 60 * PIXELS_PER_MINUTE }}>
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        <div
          ref={timelineRef}
          className="timeline"
          style={{ height: DAY_HEIGHT }}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerInteraction}
          onPointerCancel={finishPointerInteraction}
          onPointerLeave={() => {
            if (longPressRef.current) {
              window.clearTimeout(longPressRef.current);
              longPressRef.current = null;
            }
          }}
        >
          <div className="hourLines">
            {Array.from({ length: 25 }, (_, hour) => (
              <span key={hour} style={{ top: hour * 60 * PIXELS_PER_MINUTE }} />
            ))}
          </div>

          <div className="emptyLayer laneCurrent" onPointerDown={(event) => handleEmptyPointerDown(event, "current")} />
          {selectedUser ? (
            <div className="emptyLayer laneShared" onPointerDown={(event) => handleEmptyPointerDown(event, "shared")} />
          ) : null}

          {draft ? <DraftBlock draft={draft} /> : null}
          {laidOutSegments.map((segment) => {
            const overlapsSideLane = hasSideLaneOverlap(segment, laidOutSegments);

            return (
              <EventBlock
                key={segment.segmentId}
                segment={segment}
                overlapsSideLane={overlapsSideLane}
                editable={canEditEvent(segment.event, currentUser.id, cloudEnabled)}
                onEdit={() => {
                  if (canEditEvent(segment.event, currentUser.id, cloudEnabled)) {
                    setEditingEventId(segment.event.id);
                  }
                }}
                onDragStart={(pointerEvent, mode) => {
                  if (!canEditEvent(segment.event, currentUser.id, cloudEnabled)) return;
                  pointerEvent.preventDefault();
                  pointerEvent.stopPropagation();
                  pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
                  const pointerMinutes = minutesFromPointer(pointerEvent.clientY);
                  setDragState({
                    kind: mode,
                    eventId: segment.event.id,
                    originalEvent: segment.event,
                    originMinutes: pointerMinutes,
                    startMinutes: segment.startMinutes,
                    endMinutes: segment.endMinutes
                  });
                }}
              />
            );
          })}
        </div>
      </section>

      {editingEvent ? (
        <EventEditor
          event={editingEvent}
          selectedUser={selectedUser}
          canEdit={canEditEvent(editingEvent, currentUser.id, cloudEnabled)}
          canDelete={canDeleteEvent(editingEvent, currentUser.id, cloudEnabled)}
          canManageParticipants={editingEvent.ownerUserId === currentUser.id}
          onClose={() => setEditingEventId(null)}
          onDelete={() => deleteEvent(editingEvent.id)}
          onChange={(patch) => updateEvent(editingEvent.id, patch)}
        />
      ) : null}
    </main>
  );
}

function EventBlock({
  segment,
  overlapsSideLane,
  editable,
  onEdit,
  onDragStart
}: {
  segment: LaidOutSegment;
  overlapsSideLane: boolean;
  editable: boolean;
  onEdit: () => void;
  onDragStart: (event: React.PointerEvent<HTMLElement>, mode: Exclude<DragState["kind"], "create">) => void;
}) {
  const style = getSegmentStyle(segment);
  const className = ["eventBlock", segment.lane, overlapsSideLane ? "sideOverlap" : "", editable ? "" : "readOnly"]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={className} style={style} onDoubleClick={onEdit}>
      {editable ? (
        <button className="resizeHandle top" aria-label="Resize start" onPointerDown={(event) => onDragStart(event, "resize-start")} />
      ) : null}
      <button
        className="eventBody"
        onClick={onEdit}
        onPointerDown={(event) => {
          if (editable) onDragStart(event, "move");
        }}
      >
        <span className="eventTitle">{segment.event.title}</span>
        <span className="eventMeta">
          {segment.startsBeforeDay ? "< " : ""}
          {formatTime(segment.startMinutes)}-{formatTime(segment.endMinutes)}
          {segment.continuesAfterDay ? " >" : ""}
        </span>
      </button>
      {editable ? (
        <button className="resizeHandle bottom" aria-label="Resize end" onPointerDown={(event) => onDragStart(event, "resize-end")} />
      ) : null}
    </article>
  );
}

function DraftBlock({ draft }: { draft: DraftRange }) {
  return (
    <div className={`draftBlock ${draft.lane}`} style={getDraftStyle(draft)}>
      {formatTime(draft.startMinutes)}-{formatTime(draft.endMinutes)}
    </div>
  );
}

function EventEditor({
  event,
  selectedUser,
  canEdit,
  canDelete,
  canManageParticipants,
  onClose,
  onDelete,
  onChange
}: {
  event: CalendarEvent;
  selectedUser: CalendarUser | null;
  canEdit: boolean;
  canDelete: boolean;
  canManageParticipants: boolean;
  onClose: () => void;
  onDelete: () => void;
  onChange: (patch: Partial<CalendarEvent>) => void;
}) {
  const isShared = selectedUser ? event.participantUserIds.includes(selectedUser.id) : false;

  return (
    <div className="modalLayer" role="dialog" aria-modal="true">
      <form className="editor" onSubmit={(submitEvent) => submitEvent.preventDefault()}>
        <div className="editorHeader">
          <h2>Edit event</h2>
          <button type="button" aria-label="Close editor" onClick={onClose}>
            x
          </button>
        </div>

        <label>
          Title
          <input
            value={event.title}
            disabled={!canEdit}
            onChange={(change) => onChange({ title: change.target.value })}
          />
        </label>

        <label>
          Category
          <select
            value={event.category}
            disabled={!canEdit}
            onChange={(change) => onChange({ category: change.target.value as CalendarEvent["category"] })}
          >
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>Color</legend>
          <div className="swatches">
            {colors.map((color) => (
              <button
                type="button"
                aria-label={`Set color ${color}`}
                className={event.color === color ? "selectedSwatch" : ""}
                style={{ background: color }}
                key={color}
                disabled={!canEdit}
                onClick={() => onChange({ color })}
              />
            ))}
          </div>
        </fieldset>

        <label className="checkboxLine">
          <input
            type="checkbox"
            checked={event.visibility === "private"}
            disabled={!canEdit}
            onChange={(change) => onChange({ visibility: change.target.checked ? "private" : "relationship" })}
          />
          Private
        </label>

        {selectedUser && canManageParticipants ? (
          <label className="checkboxLine">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(change) =>
                onChange({
                  participantUserIds: change.target.checked ? [selectedUser.id] : []
                })
              }
            />
            Include {selectedUser.displayName}
          </label>
        ) : null}

        <div className="editorActions">
          <button type="button" className="danger" onClick={onDelete} disabled={!canDelete}>
            Delete
          </button>
          <button type="button" onClick={onClose}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const fields = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const message = [fields.message, fields.details, fields.hint, fields.code]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ");

    if (message) return message;
  }

  if (typeof error === "string") return error;
  return "Something went wrong.";
}

function getSaveStatusLabel(status: SaveStatus) {
  if (status === "saving") return "Saving";
  if (status === "saved") return "Saved";
  if (status === "syncing") return "Syncing";
  if (status === "error") return "Sync failed";
  return "Live";
}

function canEditEvent(event: CalendarEvent, currentUserId: string, cloudEnabled: boolean) {
  if (!cloudEnabled) return true;
  return event.ownerUserId === currentUserId || event.participantUserIds.includes(currentUserId);
}

function canDeleteEvent(event: CalendarEvent, currentUserId: string, cloudEnabled: boolean) {
  if (!cloudEnabled) return true;
  return (
    event.ownerUserId === currentUserId ||
    (event.visibility !== "private" && event.participantUserIds.includes(currentUserId))
  );
}

function userFromSession(user: { id: string; email?: string | null; user_metadata?: { display_name?: string } }): CalendarUser {
  const email = user.email ?? "signed-in-user@happydoggy.local";

  return {
    id: user.id,
    email,
    displayName: user.user_metadata?.display_name || email.split("@")[0] || "Me",
    accent: "#2f6df6"
  };
}

function getSegmentStyle(segment: LaidOutSegment): React.CSSProperties {
  const lane = getLaneGeometry(segment.lane);
  const width = lane.width / segment.columnCount;
  const left = lane.left + width * segment.columnIndex;

  return {
    top: segment.startMinutes * PIXELS_PER_MINUTE,
    height: Math.max(28, (segment.endMinutes - segment.startMinutes) * PIXELS_PER_MINUTE - 4),
    left: `${left}%`,
    width: `calc(${width}% - 6px)`,
    borderColor: segment.event.color,
    background: `${segment.event.color}18`
  };
}

function getDraftStyle(draft: DraftRange): React.CSSProperties {
  const lane = getLaneGeometry(draft.lane);
  return {
    top: draft.startMinutes * PIXELS_PER_MINUTE,
    height: Math.max(28, (draft.endMinutes - draft.startMinutes) * PIXELS_PER_MINUTE),
    left: `${lane.left}%`,
    width: `calc(${lane.width}% - 6px)`
  };
}

function getLaneGeometry(lane: RenderLane) {
  if (lane === "current") return { left: 0, width: 47 };
  if (lane === "selected") return { left: 53, width: 47 };
  return { left: 23.5, width: 53 };
}

function hasSideLaneOverlap(segment: LaidOutSegment, segments: LaidOutSegment[]) {
  if (segment.lane !== "shared") return false;

  return segments.some(
    (candidate) =>
      candidate.lane !== "shared" &&
      candidate.startMinutes < segment.endMinutes &&
      candidate.endMinutes > segment.startMinutes
  );
}
