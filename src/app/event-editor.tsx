"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarEvent, CalendarUser } from "@/types/calendar";
import { categories, colors } from "@/lib/mockData";
import { addDays, formatTime, getLocalDateKey, localMinutes, zonedTimeToUtc } from "@/lib/time";

type ForMode = "just-me" | "let-see" | "together";

const CROSS_MIDNIGHT_MAX_MINUTES = 6 * 60;

export function EventEditor({
  event,
  selectedUser,
  canEdit,
  canDelete,
  canManageParticipants,
  notice,
  onClose,
  onDelete,
  onSave
}: {
  event: CalendarEvent;
  selectedUser: CalendarUser | null;
  canEdit: boolean;
  canDelete: boolean;
  canManageParticipants: boolean;
  notice?: string;
  onClose: () => void;
  onDelete: () => void;
  onSave: (event: CalendarEvent) => void;
}) {
  const [draftTitle, setDraftTitle] = useState(event.title);
  const [draftDate, setDraftDate] = useState(() => getLocalDateKey(new Date(event.startAt), event.timezone));
  const [draftStartTime, setDraftStartTime] = useState(() => formatTime(Math.floor(localMinutes(new Date(event.startAt), event.timezone))));
  const [draftEndTime, setDraftEndTime] = useState(() => formatTime(Math.floor(localMinutes(new Date(event.endAt), event.timezone))));
  const [isAllDay, setIsAllDay] = useState(event.isAllDay);
  const [draftCategory, setDraftCategory] = useState(event.category);
  const [selectedColor, setSelectedColor] = useState(event.color);
  const [forMode, setForMode] = useState<ForMode>(() => getForMode(event, selectedUser));

  const canChangeFor = canEdit && canManageParticipants;
  const summary = useMemo(
    () => buildSummary(draftDate, draftStartTime, draftEndTime, isAllDay, draftCategory, event.timezone),
    [draftCategory, draftDate, draftEndTime, draftStartTime, event.timezone, isAllDay]
  );

  useEffect(() => {
    setDraftTitle(event.title);
    setDraftDate(getLocalDateKey(new Date(event.startAt), event.timezone));
    setDraftStartTime(formatTime(Math.floor(localMinutes(new Date(event.startAt), event.timezone))));
    setDraftEndTime(formatTime(Math.floor(localMinutes(new Date(event.endAt), event.timezone))));
    setIsAllDay(event.isAllDay);
    setDraftCategory(event.category);
    setSelectedColor(event.color);
    setForMode(getForMode(event, selectedUser));
  }, [event, selectedUser]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, []);

  function saveDraft() {
    const normalizedRange = normalizeDraftRange(draftDate, draftStartTime, draftEndTime, isAllDay, event.timezone);
    const nextForMode = selectedUser || forMode !== "together" ? forMode : "let-see";

    onSave({
      ...event,
      title: draftTitle.trim() || "New event",
      startAt: normalizedRange.startAt,
      endAt: normalizedRange.endAt,
      category: draftCategory,
      color: selectedColor,
      visibility: nextForMode === "just-me" ? "private" : "relationship",
      participantUserIds: nextForMode === "together" && selectedUser ? [selectedUser.id] : [],
      isAllDay,
      updatedAt: new Date().toISOString()
    });
  }

  return (
    <div className="modalLayer eventEditorLayer" role="dialog" aria-modal="true" aria-label="Edit event">
      <form className="editor event-editor-sheet" onSubmit={(submitEvent) => {
        submitEvent.preventDefault();
        if (canEdit) saveDraft();
      }}>
        <header className="eventEditorHero">
          <button className="eventEditorClose" type="button" aria-label="Close editor" onClick={onClose}>
            &times;
          </button>
          <div className="eventTitleWrap">
            <span className="eventColorSignal" style={{ background: selectedColor }} aria-hidden="true" />
            <input
              className="eventTitleInput"
              value={draftTitle}
              disabled={!canEdit}
              placeholder="Event title"
              autoFocus={!event.title.trim() || event.title === "New event"}
              onChange={(change) => setDraftTitle(change.target.value)}
            />
            <p className="eventSummaryLine">{summary}</p>
          </div>
        </header>

        <div className="event-editor-content">
          {notice ? <p className="eventDraftNotice">{notice}</p> : null}

          <section className="eventEditorSection" aria-label="When">
          <div className="eventSectionHeader">
            <span>When</span>
          </div>
          <div className={isAllDay ? "eventWhenGrid allDay" : "eventWhenGrid"}>
            <label className="eventSoftField">
              <span>Date</span>
              <input type="date" value={draftDate} disabled={!canEdit} onChange={(change) => setDraftDate(change.target.value)} />
            </label>
            {!isAllDay ? (
              <>
                <label className="eventSoftField">
                  <span>Start</span>
                  <input
                    type="time"
                    value={draftStartTime}
                    step={900}
                    disabled={!canEdit}
                    onChange={(change) => setDraftStartTime(change.target.value)}
                  />
                </label>
                <label className="eventSoftField">
                  <span>End</span>
                  <input
                    type="time"
                    value={draftEndTime}
                    step={900}
                    disabled={!canEdit}
                    onChange={(change) => setDraftEndTime(change.target.value)}
                  />
                </label>
              </>
            ) : null}
          </div>
          <label className="eventInlineSwitch">
            <span>All day</span>
            <button
              type="button"
              className={isAllDay ? "editorSwitch active" : "editorSwitch"}
              role="switch"
              aria-checked={isAllDay}
              disabled={!canEdit}
              onClick={() => setIsAllDay((value) => !value)}
            >
              <span />
            </button>
          </label>
          </section>

          <section className={canChangeFor ? "eventEditorSection" : "eventEditorSection readOnlySection"} aria-label="For">
          <div className="eventSectionHeader">
            <span>For</span>
          </div>
          <div className="eventForSegment" aria-label="Event visibility">
            <button
              type="button"
              className={forMode === "just-me" ? "active" : ""}
              disabled={!canChangeFor}
              onClick={() => setForMode("just-me")}
            >
              Just me
            </button>
            <button
              type="button"
              className={forMode === "let-see" ? "active" : ""}
              disabled={!canChangeFor}
              onClick={() => setForMode("let-see")}
            >
              Let them see
            </button>
            <button
              type="button"
              className={forMode === "together" ? "active" : ""}
              disabled={!canChangeFor || !selectedUser}
              onClick={() => setForMode("together")}
            >
              Together
            </button>
          </div>
          </section>

          <section className="eventEditorSection" aria-label="Style">
          <div className="eventSectionHeader">
            <span>Style</span>
          </div>
          <div className="eventCategoryPills" aria-label="Category">
            {categories.map((category) => (
              <button
                type="button"
                className={draftCategory === category ? "active" : ""}
                key={category}
                disabled={!canEdit}
                onClick={() => setDraftCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="eventColorSwatches" aria-label="Color">
            {colors.map((color) => (
              <button
                type="button"
                aria-label={`Set color ${color}`}
                aria-pressed={selectedColor === color}
                className={selectedColor === color ? "selected" : ""}
                style={{ background: color }}
                key={color}
                disabled={!canEdit}
                onClick={() => setSelectedColor(color)}
              />
            ))}
          </div>
          </section>
        </div>

        <div className="eventEditorActions">
          <button type="button" className="danger" aria-label="Delete event" onClick={onDelete} disabled={!canDelete}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" />
              <path d="M6 9h12l-1 11H7L6 9Zm4 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" />
            </svg>
          </button>
          <button type="submit" disabled={!canEdit}>
            {notice ? "Confirm event" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function getForMode(event: CalendarEvent, selectedUser: CalendarUser | null): ForMode {
  if (event.visibility === "private") return "just-me";
  if (selectedUser && event.participantUserIds.includes(selectedUser.id)) return "together";
  return "let-see";
}

function normalizeDraftRange(dateKey: string, startTime: string, endTime: string, isAllDay: boolean, timezone: string) {
  if (isAllDay) {
    return {
      startAt: zonedTimeToUtc(dateKey, 0, timezone).toISOString(),
      endAt: zonedTimeToUtc(addDays(dateKey, 1), 0, timezone).toISOString()
    };
  }

  const startMinutes = parseClockTime(startTime) ?? 9 * 60;
  const endMinutes = parseClockTime(endTime) ?? startMinutes + 60;
  const crossedMidnightDuration = endMinutes < startMinutes ? 1440 - startMinutes + endMinutes : 0;

  if (endMinutes > startMinutes) {
    return {
      startAt: zonedTimeToUtc(dateKey, startMinutes, timezone).toISOString(),
      endAt: zonedTimeToUtc(dateKey, endMinutes, timezone).toISOString()
    };
  }

  if (crossedMidnightDuration > 0 && crossedMidnightDuration <= CROSS_MIDNIGHT_MAX_MINUTES) {
    return {
      startAt: zonedTimeToUtc(dateKey, startMinutes, timezone).toISOString(),
      endAt: zonedTimeToUtc(addDays(dateKey, 1), endMinutes, timezone).toISOString()
    };
  }

  const repairedEnd = startMinutes + 60;
  const endDateKey = repairedEnd >= 1440 ? addDays(dateKey, 1) : dateKey;
  return {
    startAt: zonedTimeToUtc(dateKey, startMinutes, timezone).toISOString(),
    endAt: zonedTimeToUtc(endDateKey, repairedEnd % 1440, timezone).toISOString()
  };
}

function buildSummary(dateKey: string, startTime: string, endTime: string, isAllDay: boolean, category: CalendarEvent["category"], timezone: string) {
  const dateText = formatSummaryDate(dateKey, timezone);
  const timeText = isAllDay ? "All day" : `${startTime || "09:00"}-${endTime || "10:00"}`;
  return `${dateText} \u00b7 ${timeText} \u00b7 ${category}`;
}

function formatSummaryDate(dateKey: string, timezone: string) {
  if (dateKey === getLocalDateKey(new Date(), timezone)) return "Today";

  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return "Date";

  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, day, 12))
  );
}

function parseClockTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}