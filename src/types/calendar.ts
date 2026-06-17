export type Category = "Life" | "Study" | "Date" | "Work" | "Health" | "Other";
export type EventVisibility = "relationship" | "private";

export type CalendarUser = {
  id: string;
  email: string;
  displayName: string;
  accent: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  timezone: string;
  color: string;
  category: Category;
  ownerUserId: string;
  visibility: EventVisibility;
  participantUserIds: string[];
  isAllDay: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RenderLane = "current" | "selected" | "shared";

export type EventSegment = {
  event: CalendarEvent;
  lane: RenderLane;
  segmentId: string;
  startMinutes: number;
  endMinutes: number;
  startsBeforeDay: boolean;
  continuesAfterDay: boolean;
};

export type LaidOutSegment = EventSegment & {
  columnIndex: number;
  columnCount: number;
};
