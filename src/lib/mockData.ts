import type { CalendarEvent, CalendarUser } from "@/types/calendar";
import { getDefaultTimezone, zonedTimeToUtc } from "./time";

const timezone = getDefaultTimezone();
const now = new Date().toISOString();

export const users: CalendarUser[] = [
  {
    id: "u_current",
    email: "owner@happydoggy.local",
    displayName: "Me",
    accent: "#2f6df6"
  },
  {
    id: "u_partner",
    email: "partner@happydoggy.local",
    displayName: "Partner",
    accent: "#d84f83"
  },
  {
    id: "u_friend",
    email: "friend@happydoggy.local",
    displayName: "Friend",
    accent: "#138a66"
  }
];

export const currentUser = users[0];

export function createMockEvents(dateKey: string): CalendarEvent[] {
  const previousDate = offsetDateKey(dateKey, -1);
  const nextDate = offsetDateKey(dateKey, 1);

  return [
    makeEvent("evt_early_study", "Study block", dateKey, 8 * 60 + 30, dateKey, 10 * 60, "Study", "#2f6df6", currentUser.id),
    makeEvent("evt_overlap_one", "Physics reading", dateKey, 9 * 60 + 15, dateKey, 10 * 60 + 45, "Study", "#40a66f", currentUser.id),
    makeEvent("evt_overlap_two", "Lab notes", dateKey, 9 * 60 + 45, dateKey, 11 * 60 + 15, "Work", "#e0a928", currentUser.id),
    makeEvent("evt_shared_lunch", "Lunch together", dateKey, 12 * 60, dateKey, 13 * 60 + 15, "Date", "#d84f83", currentUser.id, "relationship", [users[1].id]),
    makeEvent("evt_partner_work", "Partner focus", dateKey, 12 * 60 + 30, dateKey, 14 * 60, "Work", "#697386", users[1].id),
    makeEvent("evt_private_walk", "Private errand", dateKey, 15 * 60, dateKey, 15 * 60 + 45, "Life", "#cc514d", currentUser.id, "private"),
    makeEvent("evt_partner_health", "Gym", dateKey, 17 * 60, dateKey, 18 * 60 + 15, "Health", "#40a66f", users[1].id),
    makeEvent("evt_shared_date", "Evening plan", dateKey, 19 * 60, dateKey, 21 * 60, "Date", "#d84f83", users[1].id, "relationship", [currentUser.id]),
    makeEvent("evt_cross_midnight", "Late project", previousDate, 23 * 60 + 30, dateKey, 1 * 60 + 30, "Work", "#7a5cff", currentUser.id),
    makeEvent("evt_cross_overlap", "Night reset", dateKey, 0 * 60 + 45, dateKey, 2 * 60, "Health", "#697386", currentUser.id),
    makeEvent("evt_tomorrow_carry", "Travel prep", dateKey, 22 * 60 + 15, nextDate, 1 * 60, "Life", "#2f6df6", users[1].id),
    makeEvent("evt_all_day", "Anniversary", dateKey, 0, nextDate, 0, "Date", "#d84f83", currentUser.id, "relationship", [users[1].id], true)
  ];
}

export function makeEvent(
  id: string,
  title: string,
  startDateKey: string,
  startMinutes: number,
  endDateKey: string,
  endMinutes: number,
  category: CalendarEvent["category"],
  color: string,
  ownerUserId: string,
  visibility: CalendarEvent["visibility"] = "relationship",
  participantUserIds: string[] = [],
  isAllDay = false
): CalendarEvent {
  return {
    id,
    title,
    startAt: zonedTimeToUtc(startDateKey, startMinutes, timezone).toISOString(),
    endAt: zonedTimeToUtc(endDateKey, endMinutes, timezone).toISOString(),
    timezone,
    color,
    category,
    ownerUserId,
    visibility,
    participantUserIds,
    isAllDay,
    createdAt: now,
    updatedAt: now
  };
}

function offsetDateKey(dateKey: string, delta: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + delta, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export const categories: CalendarEvent["category"][] = ["Life", "Study", "Date", "Work", "Health", "Other"];

export const colors = ["#2f6df6", "#40a66f", "#e0a928", "#d84f83", "#cc514d", "#697386"];
