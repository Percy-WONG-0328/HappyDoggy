"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent, CalendarUser, LaidOutSegment, RenderLane } from "@/types/calendar";
import { colors, createMockEvents, currentUser as mockCurrentUser, makeEvent, users as mockUsers } from "@/lib/mockData";
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
import { EventEditor } from "./event-editor";
import { StatusMessage, type StatusTone } from "./status-message";

const PIXELS_PER_MINUTE = 1.15;
const DAY_HEIGHT = 1440 * PIXELS_PER_MINUTE;
const MIN_EVENT_MINUTES = 15;
const GRID_INTERVAL_MINUTES = 15;

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
type AppView = "day" | "week" | "profile";

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
  const [appView, setAppView] = useState<AppView>("day");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [relationshipInvites, setRelationshipInvites] = useState<RelationshipInvite[]>([]);
  const [weekEvents, setWeekEvents] = useState<CalendarEvent[]>([]);
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
  const weekDates = useMemo(() => getWeekDates(dateKey), [dateKey]);
  const headerEyebrow = useMemo(() => formatHeaderEyebrow(dateKey, timezone), [dateKey, timezone]);
  const displayedWeekEvents = useMemo(
    () => (cloudEnabled ? weekEvents : weekDates.flatMap((weekDate) => createMockEvents(weekDate))),
    [cloudEnabled, weekDates, weekEvents]
  );

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
    if (!cloudEnabled || currentUserId === mockCurrentUser.id || appView !== "week") return;
    refreshWeekEvents().catch(handleCloudError);
  }, [appView, cloudEnabled, currentUserId, dateKey, timezone]);

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

      const todayKey = getLocalDateKey(new Date(), timezone);
      setAppView("day");
      setDateKey(todayKey);
      setCurrentUserId(sessionUser.id);
      await refreshAccountContext(sessionUser.id);
      await refreshCloudEvents(todayKey);
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

  async function refreshWeekEvents() {
    if (!cloudEnabled) return;

    setIsSyncing(true);
    markSaveStatus("syncing");

    try {
      const pendingDeletedEvent = pendingDeleteRef.current;
      const eventGroups = await Promise.all(weekDates.map((weekDate) => fetchEventsForDate(weekDate, timezone)));
      const deduped = new Map<string, CalendarEvent>();

      for (const event of eventGroups.flat()) {
        if (pendingDeletedEvent?.event.id === event.id) continue;
        deduped.set(event.id, event);
      }

      setWeekEvents(Array.from(deduped.values()).sort((a, b) => a.startAt.localeCompare(b.startAt)));
      markSaveStatus("saved");
    } catch (error) {
      markSaveStatus("error");
      throw error;
    } finally {
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
      {appView !== "profile" ? (
        <header className="dayHeader">
          <div className="comparisonBar">
            <p className="compareLine">
              <button
                className="compareAvatar"
                type="button"
                aria-label="Open profile"
                onClick={() => setAppView("profile")}
              >
                {currentUser.displayName.slice(0, 1).toUpperCase()}
            </button>
            Fused pulp with <em>{selectedUser?.displayName ?? "no one yet"}</em>
          </p>
          <div className={`compactViewToggle ${appView === "week" ? "weekActive" : ""}`} aria-label="Calendar view">
            <span className="toggleIndicator" />
            <button type="button" aria-pressed={appView === "day"} onClick={() => setAppView("day")}>
              Day
            </button>
            <button type="button" aria-pressed={appView === "week"} onClick={() => setAppView("week")}>
              Week
            </button>
          </div>
        </div>
          {appView === "day" ? (
            <div className="navigationBar">
              <div className="navSide navSideLeft">
                <button className="circleNavButton" aria-label="Previous day" onClick={() => void resetDay(addDays(dateKey, -1))}>
                  &lt;
                </button>
              </div>
              <div className="dateNav" aria-label="Current date">
                <div className="dateStack">
                  <p className="eyebrow">{headerEyebrow}</p>
                  <h1>{formatDateLabel(dateKey)}</h1>
                </div>
              </div>
              <div className="navSide navSideRight">
                <button className="circleNavButton" aria-label="Next day" onClick={() => void resetDay(addDays(dateKey, 1))}>
                  &gt;
                </button>
              </div>
            </div>
          ) : null}
        </header>
      ) : null}
      {statusMessage ? (
        <StatusMessage tone={statusTone} message={statusMessage} showUndo={Boolean(pendingDelete)} onUndo={undoDelete} />
      ) : null}
      {appView !== "profile" && cloudEnabled && !selectedUser ? (
        <p className="statusMessage error">
          No active relationship is available yet. Shared events will appear after you connect with someone.
        </p>
      ) : null}

      {appView === "profile" ? (
        <ProfileView
          currentUser={currentUser}
          selectedUser={selectedUser}
          profileDisplayName={profileDisplayName}
          inviteEmail={inviteEmail}
          relationshipInvites={relationshipInvites}
          cloudEnabled={cloudEnabled}
          sharedThisWeek={countSharedEvents(displayedWeekEvents, currentUser, selectedUser)}
          onProfileDisplayNameChange={setProfileDisplayName}
          onInviteEmailChange={setInviteEmail}
          onProfileSave={() => void handleProfileSave()}
          onInviteSubmit={handleInviteSubmit}
          onAcceptInvite={(invite) => void handleAcceptInvite(invite)}
          onBack={() => setAppView("day")}
          onSignOut={() => void handleLogout()}
        />
      ) : appView === "week" ? (
        <WeekView
          dates={weekDates}
          events={displayedWeekEvents}
          currentDateKey={dateKey}
          currentUser={currentUser}
          selectedUser={comparisonUser}
          timezone={timezone}
          onWeekChange={(nextDateKey) => void resetDay(nextDateKey)}
        />
      ) : (
        <>
          <div className="dayTimelineScrollArea">
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
                  {Array.from({ length: 1440 / GRID_INTERVAL_MINUTES + 1 }, (_, slot) => {
                    const minutes = slot * GRID_INTERVAL_MINUTES;
                    const isHour = minutes % 60 === 0;

                    return (
                      <span
                        className={isHour ? "hourLine" : "quarterLine"}
                        key={minutes}
                        style={{ top: minutes * PIXELS_PER_MINUTE }}
                      />
                    );
                  })}
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
          </div>

          {editingEvent ? null : (
            <div className="dayCreateActions" aria-label="Create event">
              <button
                type="button"
                className={mobileCreateLane === "current" ? "activeCreate" : ""}
                onClick={() => setMobileCreateLane((lane) => (lane === "current" ? null : "current"))}
              >
                + Add for me
              </button>
              {selectedUser ? (
                <button
                  type="button"
                  className={mobileCreateLane === "shared" ? "activeCreate" : ""}
                  onClick={() => setMobileCreateLane((lane) => (lane === "shared" ? null : "shared"))}
                >
                  + For both
                </button>
              ) : null}
            </div>
          )}
        </>
      )}

      {editingEvent ? (
        <EventEditor
          event={editingEvent}
          selectedUser={selectedUser}
          canEdit={canEditEvent(editingEvent, currentUser.id, cloudEnabled)}
          canDelete={canDeleteEvent(editingEvent, currentUser.id, cloudEnabled)}
          canManageParticipants={editingEvent.ownerUserId === currentUser.id}
          onClose={() => setEditingEventId(null)}
          onDelete={() => deleteEvent(editingEvent.id)}
          onSave={(draftEvent) => updateEvent(editingEvent.id, draftEvent)}
        />
      ) : null}
    </main>
  );
}

function ProfileView({
  currentUser,
  selectedUser,
  profileDisplayName,
  inviteEmail,
  relationshipInvites,
  cloudEnabled,
  sharedThisWeek,
  onProfileDisplayNameChange,
  onInviteEmailChange,
  onProfileSave,
  onInviteSubmit,
  onAcceptInvite,
  onBack,
  onSignOut
}: {
  currentUser: CalendarUser;
  selectedUser: CalendarUser | null;
  profileDisplayName: string;
  inviteEmail: string;
  relationshipInvites: RelationshipInvite[];
  cloudEnabled: boolean;
  sharedThisWeek: number;
  onProfileDisplayNameChange: (value: string) => void;
  onInviteEmailChange: (value: string) => void;
  onProfileSave: () => void;
  onInviteSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onAcceptInvite: (invite: RelationshipInvite) => void;
  onBack: () => void;
  onSignOut: () => void;
}) {
  const initial = currentUser.displayName.slice(0, 1).toLowerCase() || "h";
  const partnerInitial = selectedUser?.displayName.slice(0, 1).toUpperCase() || "?";

  return (
    <section className="profilePage" aria-label="Profile">
      <button className="profileBackButton" type="button" onClick={onBack}>
        <span aria-hidden="true">&lsaquo;</span>
        Calendar
      </button>
      <div className="profileHero">
        <div className="profileAvatar">{initial}</div>
        <h2>{currentUser.displayName}</h2>
        <p>@{currentUser.email.split("@")[0]}</p>
      </div>

      <div className="pairingCard">
        <p className="profileEyebrow">paired</p>
        <div className="pairingMain">
          <div className="pairAvatars" aria-hidden="true">
            <span>{initial}</span>
            <span>{partnerInitial}</span>
          </div>
          <div>
            <h3>{selectedUser ? `${currentUser.displayName} & ${selectedUser.displayName}` : "Waiting for your person"}</h3>
            <p>{selectedUser ? "connected in HappyDoggy" : "send or accept an invite to begin"}</p>
          </div>
        </div>
        <div className="pairStats">
          <div>
            <strong>{selectedUser ? "Active" : "Open"}</strong>
            <span>relationship</span>
          </div>
          <div>
            <strong>{sharedThisWeek}</strong>
            <span>shared this week</span>
          </div>
        </div>
      </div>

      <div className="profilePanel">
        <div className="profileControls">
          <label>
            Display name
            <input value={profileDisplayName} onChange={(event) => onProfileDisplayNameChange(event.target.value)} />
          </label>
          <button onClick={onProfileSave} disabled={!cloudEnabled || profileDisplayName.trim() === currentUser.displayName}>
            Save name
          </button>
        </div>

        <form className="inviteControls" onSubmit={onInviteSubmit}>
          <label>
            Invite by email
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => onInviteEmailChange(event.target.value)}
              placeholder="partner@example.com"
            />
          </label>
          <button type="submit" disabled={!cloudEnabled || !inviteEmail.trim()}>
            Invite
          </button>
        </form>

        {relationshipInvites.length ? (
          <div className="inviteList">
            {relationshipInvites.map((invite) => (
              <div className="inviteItem" key={invite.id}>
                <span>{invite.inviterDisplayName} invited you</span>
                <button onClick={() => onAcceptInvite(invite)}>Accept</button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="settingsList" aria-label="Settings">
        <button type="button">
          <span><i className="dotGuava" />Categories & colors</span>
          <b>›</b>
        </button>
        <button type="button">
          <span><i className="dotSage" />Notifications</span>
          <b>›</b>
        </button>
        <button type="button">
          <span><i className="dotSlate" />Calendar sync</span>
          <b>›</b>
        </button>
        <button type="button">
          <span><i className="dotGold" />Account & privacy</span>
          <b>›</b>
        </button>
      </div>

      {cloudEnabled ? (
        <button className="signOutText" type="button" onClick={onSignOut}>
          Sign out
        </button>
      ) : null}
    </section>
  );
}

function WeekView({
  dates,
  events,
  currentDateKey,
  currentUser,
  selectedUser,
  timezone,
  onWeekChange
}: {
  dates: string[];
  events: CalendarEvent[];
  currentDateKey: string;
  currentUser: CalendarUser;
  selectedUser: CalendarUser;
  timezone: string;
  onWeekChange: (dateKey: string) => void;
}) {
  const weekGridRef = useRef<HTMLDivElement | null>(null);
  const noFreeEveningTimerRef = useRef<number | null>(null);
  const [highlightedEveningDays, setHighlightedEveningDays] = useState<string[]>([]);
  const [showNoFreeEvenings, setShowNoFreeEvenings] = useState(false);
  const weekLabel = `${formatShortDate(dates[0])} - ${formatShortDate(dates[6])}`;
  const weekEyebrow = dates.includes(getLocalDateKey(new Date(), timezone)) ? "This week" : "Week of";
  const sharedCount = countSharedEvents(events, currentUser, selectedUser);
  const startMinute = 0;
  const endMinute = 24 * 60;
  const totalMinutes = endMinute - startMinute;
  const hourMarks = [0, 4, 8, 12, 16, 20, 24];

  useEffect(() => {
    weekGridRef.current?.scrollTo({ top: 7 * 60, behavior: "auto" });
  }, [currentDateKey]);

  useEffect(() => {
    setHighlightedEveningDays([]);
    setShowNoFreeEvenings(false);
    if (noFreeEveningTimerRef.current) window.clearTimeout(noFreeEveningTimerRef.current);
  }, [dates]);

  function findSharedEvenings() {
    const freeDays = getSharedFreeEvenings(dates, events, timezone, currentUser, selectedUser);

    if (highlightedEveningDays.length) {
      setHighlightedEveningDays([]);
      setShowNoFreeEvenings(false);
      return;
    }

    if (freeDays.length) {
      setShowNoFreeEvenings(false);
      setHighlightedEveningDays(freeDays);
      return;
    }

    setShowNoFreeEvenings(true);
    if (noFreeEveningTimerRef.current) window.clearTimeout(noFreeEveningTimerRef.current);
    noFreeEveningTimerRef.current = window.setTimeout(() => setShowNoFreeEvenings(false), 3000);
  }

  return (
    <section className="weekPage" aria-label="Week view">
      <div className="weekSummary">
        <p className="eyebrow">{weekEyebrow}</p>
        <div className="weekRangeNav">
          <button className="circleNavButton" type="button" aria-label="Previous week" onClick={() => onWeekChange(addDays(dates[0], -7))}>
            &lt;
          </button>
          <h2>{weekLabel}</h2>
          <button className="circleNavButton" type="button" aria-label="Next week" onClick={() => onWeekChange(addDays(dates[0], 7))}>
            &gt;
          </button>
        </div>
        <p><span />{sharedCount} moments together this week</p>
      </div>

      <div className="weekGrid" ref={weekGridRef}>
        <div className="weekDays">
          <div />
          {dates.map((day) => {
            const parts = getDateParts(day);
            return (
              <button className={day === currentDateKey ? "today" : ""} type="button" key={day}>
                <span>{parts.weekday}</span>
                <strong>{parts.day}</strong>
              </button>
            );
          })}
        </div>
        <div className="weekTimeline">
          <div className="weekTimes">
            {hourMarks.map((hour) => (
              <span key={hour} style={{ top: `${((hour * 60 - startMinute) / totalMinutes) * 100}%` }}>
                {formatWeekHour(hour)}
              </span>
            ))}
          </div>
          <div className="weekColumns">
            {hourMarks.map((hour) => (
              <span className="weekRule" key={hour} style={{ top: `${((hour * 60 - startMinute) / totalMinutes) * 100}%` }} />
            ))}
            {dates.map((day) => {
              const daySegments = splitEventsForDay(events, day, timezone, currentUser, selectedUser).segments.filter(
                (segment) => segment.endMinutes > startMinute && segment.startMinutes < endMinute
              );

              return (
                <div className={day === currentDateKey ? "weekColumn todayColumn" : "weekColumn"} key={day}>
                  {highlightedEveningDays.includes(day) ? (
                    <span
                      className="sharedEveningHighlight"
                      style={{
                        top: `${((17 * 60 - startMinute) / totalMinutes) * 100}%`,
                        height: `${((4 * 60) / totalMinutes) * 100}%`
                      }}
                    />
                  ) : null}
                  {daySegments.map((segment) => {
                    const top = ((Math.max(segment.startMinutes, startMinute) - startMinute) / totalMinutes) * 100;
                    const height =
                      ((Math.min(segment.endMinutes, endMinute) - Math.max(segment.startMinutes, startMinute)) /
                        totalMinutes) *
                      100;
                    const isShared = segment.lane === "shared";
                    const className = ["weekEvent", segment.lane, isShared ? "wide" : ""].filter(Boolean).join(" ");

                    return (
                      <span
                        className={className}
                        key={segment.segmentId}
                        style={{ top: `${top}%`, height: `${Math.max(height, 3)}%` }}
                        aria-label={`${segment.event.title} ${formatTime(segment.startMinutes)}-${formatTime(segment.endMinutes)}`}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="weekLegend">
        <span><i className="legendYou" />you</span>
        <span><i className="legendShared" />shared</span>
        <span><i className="legendPartner" />{selectedUser.displayName}</span>
      </div>

      {showNoFreeEvenings ? <p className="findTimeNote">No shared free evenings this week</p> : null}
      <button className="findTimeButton" type="button" onClick={findSharedEvenings}>
        Find Time Together
      </button>
    </section>
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

function getWeekDates(dateKey: string) {
  const { year, month, day } = getDateParts(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const dayOfWeek = date.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  return Array.from({ length: 7 }, (_, index) => addDays(dateKey, mondayOffset + index));
}

function getDateParts(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = new Intl.DateTimeFormat("en", { weekday: "short" }).format(date).slice(0, 1);

  return { year, month, day, weekday };
}

function formatShortDate(dateKey: string) {
  const { year, month, day } = getDateParts(dateKey);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, day, 12))
  );
}

function formatHeaderEyebrow(dateKey: string, timezone: string) {
  if (dateKey === getLocalDateKey(new Date(), timezone)) return "TODAY";

  const { year, month, day } = getDateParts(dateKey);
  return new Intl.DateTimeFormat("en", { weekday: "long" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)))
    .toUpperCase();
}

function formatWeekHour(hour: number) {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

function getSharedFreeEvenings(
  dates: string[],
  events: CalendarEvent[],
  timezone: string,
  currentUser: CalendarUser,
  selectedUser: CalendarUser
) {
  const eveningStart = 17 * 60;
  const eveningEnd = 21 * 60;

  return dates
    .filter((day) => {
      const { allDayEvents, segments } = splitEventsForDay(events, day, timezone, currentUser, selectedUser);
      if (allDayEvents.length) return false;

      return !segments.some((segment) => segment.startMinutes < eveningEnd && segment.endMinutes > eveningStart);
    });
}

function countSharedEvents(events: CalendarEvent[], currentUser: CalendarUser, selectedUser: CalendarUser | null) {
  if (!selectedUser) return 0;

  return events.filter((event) => {
    const hasCurrent = event.ownerUserId === currentUser.id || event.participantUserIds.includes(currentUser.id);
    const hasSelected = event.ownerUserId === selectedUser.id || event.participantUserIds.includes(selectedUser.id);
    return hasCurrent && hasSelected;
  }).length;
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
