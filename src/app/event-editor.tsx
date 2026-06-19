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
  const [draftTitle, setDraftTitle] = useState(event.title);
  const [draftCategory, setDraftCategory] = useState(event.category);
  const [selectedColor, setSelectedColor] = useState(event.color);
  const [isPrivate, setIsPrivate] = useState(event.visibility === "private");
  const [includesSelectedUser, setIncludesSelectedUser] = useState(
    selectedUser ? event.participantUserIds.includes(selectedUser.id) : false
  );

  useEffect(() => {
    setDraftTitle(event.title);
    setDraftCategory(event.category);
    setSelectedColor(event.color);
    setIsPrivate(event.visibility === "private");
    setIncludesSelectedUser(selectedUser ? event.participantUserIds.includes(selectedUser.id) : false);
  }, [event, selectedUser]);

  function saveDraft() {
    onSave({
      ...event,
      title: draftTitle,
      category: draftCategory,
      color: selectedColor,
      visibility: isPrivate ? "private" : "relationship",
      participantUserIds: selectedUser && includesSelectedUser ? [selectedUser.id] : []
    });
    onClose();
  }

  return (
    <div className="modalLayer" role="dialog" aria-modal="true">
      <form className="editor" onSubmit={(submitEvent) => submitEvent.preventDefault()}>
        <div className="editorHeader">
          <h2>Edit event</h2>
          <button type="button" aria-label="Close editor" onClick={onClose}>
            ×
          </button>
        </div>

        <label className="editorField">
          Title
          <input
            value={draftTitle}
            disabled={!canEdit}
            onChange={(change) => setDraftTitle(change.target.value)}
          />
        </label>

        <label className="editorField">
          Category
          <select
            value={draftCategory}
            disabled={!canEdit}
            onChange={(change) => setDraftCategory(change.target.value as CalendarEvent["category"])}
          >
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>

        <fieldset className="editorField editorColorField">
          <legend>Color</legend>
          <div className="swatches">
            {colors.map((color) => (
              <button
                type="button"
                aria-label={`Set color ${color}`}
                className={selectedColor === color ? "selectedSwatch" : ""}
                style={{ background: color }}
                key={color}
                disabled={!canEdit}
                onClick={() => setSelectedColor(color)}
              />
            ))}
          </div>
        </fieldset>

        <div className="editorToggleRow">
          <label className="editorSwitchLine">
            <span>Private</span>
            <button
              type="button"
              className={isPrivate ? "editorSwitch active" : "editorSwitch"}
              role="switch"
              aria-checked={isPrivate}
              disabled={!canEdit}
              onClick={() => setIsPrivate((value) => !value)}
            >
              <span />
            </button>
          </label>
          <label className="editorSwitchLine">
            <span>Include {selectedUser?.displayName ?? "partner"}</span>
            <button
              type="button"
              className={includesSelectedUser ? "editorSwitch active" : "editorSwitch"}
              role="switch"
              aria-checked={includesSelectedUser}
              disabled={!canEdit || !selectedUser || !canManageParticipants}
              onClick={() => setIncludesSelectedUser((value) => !value)}
            >
              <span />
            </button>
          </label>
        </div>

        <div className="editorActionRow">
          <button type="button" className="danger" aria-label="Delete event" onClick={onDelete} disabled={!canDelete}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" />
              <path d="M6 9h12l-1 11H7L6 9Zm4 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" />
            </svg>
          </button>
          <button type="button" onClick={saveDraft} disabled={!canEdit}>
            Save with love
          </button>
        </div>
      </form>
    </div>
  );
}
