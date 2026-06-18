"use client";

export type StatusTone = "error" | "success";

export function StatusMessage({
  tone,
  message,
  showUndo,
  onUndo
}: {
  tone: StatusTone;
  message: string;
  showUndo?: boolean;
  onUndo?: () => void;
}) {
  return (
    <div className={`statusMessage ${tone}`}>
      <span>{message}</span>
      {showUndo && onUndo ? (
        <button type="button" onClick={onUndo}>
          Undo
        </button>
      ) : null}
    </div>
  );
}
