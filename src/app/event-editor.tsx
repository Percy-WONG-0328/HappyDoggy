"use client";

import { useEffect, useState } from "react";
import type { CalendarEvent, CalendarUser } from "@/types/calendar";
import { categories, colors } from "@/lib/mockData";

export function EventEditor({
  event,
  selectedUser,
  canEdit,
  canDelete,
  canManageParticipants,
  onClose,
  onDelete,
  onSave
}: {
  event: CalendarEvent;
  selectedUser: CalendarUser | null;
  canEdit: boolean;
  canDelete: boolean;
  canManageParticipants: boolean;
  onClose: () => void;
  onDelete: () => void;
  onSave: (event: CalendarEvent) => void;
}) {
  const [draftEvent, setDraftEvent] = useState(event);
  const isShared = selectedUser ? draftEvent.participantUserIds.includes(selectedUser.id) : false;

  useEffect(() => {
    setDraftEvent(event);
  }, [event]);

  function updateDraft(patch: Partial<CalendarEvent>) {
    setDraftEvent((currentEvent) => ({
      ...currentEvent,
      ...patch
    }));
  }

  return (
    <div className="modalLayer" role="dialog" aria-modal="true">
      <form className="editor" onSubmit={(submitEvent) => submitEvent.preventDefault()}>
        <div className="editorHeader">
          <h2>Edit event</h2>
          <button type="button" aria-label="Close editor" onClick={onClose}>
            X
          </button>
        </div>

        <label>
          Title
          <input
            value={draftEvent.title}
            disabled={!canEdit}
            onChange={(change) => updateDraft({ title: change.target.value })}
          />
        </label>

        <label>
          Category
          <select
            value={draftEvent.category}
            disabled={!canEdit}
            onChange={(change) => updateDraft({ category: change.target.value as CalendarEvent["category"] })}
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
                className={draftEvent.color === color ? "selectedSwatch" : ""}
                style={{ background: color }}
                key={color}
                disabled={!canEdit}
                onClick={() => updateDraft({ color })}
              />
            ))}
          </div>
        </fieldset>

        <label className="checkboxLine">
          <input
            type="checkbox"
            checked={draftEvent.visibility === "private"}
            disabled={!canEdit}
            onChange={(change) => updateDraft({ visibility: change.target.checked ? "private" : "relationship" })}
          />
          Private
        </label>

        {selectedUser && canManageParticipants ? (
          <label className="checkboxLine">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(change) =>
                updateDraft({
                  participantUserIds: change.target.checked ? [selectedUser.id] : []
                })
              }
            />
            Include {selectedUser.displayName}
          </label>
        ) : null}

        <div className="editorActions">
          <button type="button" className="danger" aria-label="Delete event" onClick={onDelete} disabled={!canDelete}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" />
              <path d="M6 9h12l-1 11H7L6 9Zm4 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draftEvent);
              onClose();
            }}
          >
            Save with love
          </button>
        </div>
      </form>
    </div>
  );
}
