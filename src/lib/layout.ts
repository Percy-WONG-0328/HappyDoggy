import type {
  CalendarEvent,
  CalendarUser,
  EventSegment,
  LaidOutSegment,
  RenderLane
} from "@/types/calendar";
import { getDayBoundsUtc, localMinutes } from "./time";

export function getEventLane(
  event: CalendarEvent,
  currentUser: CalendarUser,
  selectedUser: CalendarUser
): RenderLane | null {
  const hasCurrent = event.ownerUserId === currentUser.id || event.participantUserIds.includes(currentUser.id);
  const hasSelected =
    event.ownerUserId === selectedUser.id || event.participantUserIds.includes(selectedUser.id);

  if (hasCurrent && hasSelected) return "shared";
  if (event.ownerUserId === currentUser.id) return "current";
  if (event.ownerUserId === selectedUser.id && event.visibility !== "private") return "selected";
  return null;
}

export function splitEventsForDay(
  events: CalendarEvent[],
  dateKey: string,
  timezone: string,
  currentUser: CalendarUser,
  selectedUser: CalendarUser
) {
  const { start: dayStart, end: dayEnd } = getDayBoundsUtc(dateKey, timezone);
  const segments: EventSegment[] = [];
  const allDayEvents: CalendarEvent[] = [];

  for (const event of events) {
    const lane = getEventLane(event, currentUser, selectedUser);
    if (!lane) continue;

    if (event.isAllDay) {
      const start = new Date(event.startAt);
      const end = new Date(event.endAt);
      if (start < dayEnd && end > dayStart) allDayEvents.push(event);
      continue;
    }

    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    if (start >= dayEnd || end <= dayStart) continue;

    const clippedStart = start < dayStart ? dayStart : start;
    const clippedEnd = end > dayEnd ? dayEnd : end;
    const startMinutes = start < dayStart ? 0 : Math.floor(localMinutes(clippedStart, timezone));
    const endMinutes = end > dayEnd ? 1440 : Math.ceil(localMinutes(clippedEnd, timezone));

    if (endMinutes <= startMinutes) continue;

    segments.push({
      event,
      lane,
      segmentId: `${event.id}:${dateKey}:${startMinutes}-${endMinutes}`,
      startMinutes,
      endMinutes,
      startsBeforeDay: start < dayStart,
      continuesAfterDay: end > dayEnd
    });
  }

  return {
    allDayEvents: allDayEvents.sort(compareEvents),
    segments: segments.sort(compareSegments)
  };
}

export function layoutSegments(segments: EventSegment[]) {
  const byLane = new Map<RenderLane, EventSegment[]>();
  for (const segment of segments) {
    const list = byLane.get(segment.lane) ?? [];
    list.push(segment);
    byLane.set(segment.lane, list);
  }

  return Array.from(byLane.values()).flatMap(layoutLane);
}

function layoutLane(segments: EventSegment[]): LaidOutSegment[] {
  const ordered = [...segments].sort(compareSegments);
  const groups: EventSegment[][] = [];
  let currentGroup: EventSegment[] = [];
  let currentEnd = -1;

  for (const segment of ordered) {
    if (currentGroup.length === 0 || segment.startMinutes < currentEnd) {
      currentGroup.push(segment);
      currentEnd = Math.max(currentEnd, segment.endMinutes);
    } else {
      groups.push(currentGroup);
      currentGroup = [segment];
      currentEnd = segment.endMinutes;
    }
  }

  if (currentGroup.length) groups.push(currentGroup);
  return groups.flatMap(assignColumns);
}

function assignColumns(group: EventSegment[]): LaidOutSegment[] {
  const columns: EventSegment[][] = [];
  const assignments = new Map<string, number>();

  for (const segment of group) {
    let columnIndex = columns.findIndex((column) => {
      const last = column[column.length - 1];
      return last.endMinutes <= segment.startMinutes;
    });

    if (columnIndex === -1) {
      columnIndex = columns.length;
      columns.push([]);
    }

    columns[columnIndex].push(segment);
    assignments.set(segment.segmentId, columnIndex);
  }

  return group.map((segment) => ({
    ...segment,
    columnIndex: assignments.get(segment.segmentId) ?? 0,
    columnCount: columns.length
  }));
}

function compareEvents(a: CalendarEvent, b: CalendarEvent) {
  return a.startAt.localeCompare(b.startAt) || a.endAt.localeCompare(b.endAt) || a.id.localeCompare(b.id);
}

function compareSegments(a: EventSegment, b: EventSegment) {
  const durationA = a.endMinutes - a.startMinutes;
  const durationB = b.endMinutes - b.startMinutes;
  return (
    a.startMinutes - b.startMinutes ||
    durationB - durationA ||
    a.event.id.localeCompare(b.event.id)
  );
}
