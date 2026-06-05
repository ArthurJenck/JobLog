import { useState } from 'react';

export function EditableEventDate({
  at,
  onUpdate,
}: {
  at: string;
  onUpdate: (newAt: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const isFuture = new Date(at) > new Date();

  if (editing) {
    return (
      <input
        type="date"
        defaultValue={at.slice(0, 10)}
        className="text-xs h-5 w-32 border-b border-muted-foreground/50 bg-transparent focus:outline-none focus:border-foreground"
        autoFocus
        onChange={(e) => {
          if (e.target.value) {
            onUpdate(new Date(e.target.value + 'T12:00:00').toISOString());
          }
        }}
        onBlur={() => setEditing(false)}
      />
    );
  }

  return (
    <button
      className={`text-xs ${isFuture ? 'text-blue-500' : 'text-muted-foreground'} hover:underline text-left`}
      onClick={() => setEditing(true)}
    >
      {new Date(at).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}
      {isFuture && <span className="ml-1 opacity-70">(à venir)</span>}
    </button>
  );
}
