"use client";

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
            X
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
