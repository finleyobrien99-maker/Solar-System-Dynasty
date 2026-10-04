import { useId, type KeyboardEvent, type ReactNode } from 'react';
export function tabKeys(event: KeyboardEvent<HTMLElement>) {
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const index = tabs.indexOf(event.target as HTMLButtonElement);
  if (index < 0) return;
  let next: number;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + tabs.length - 1) % tabs.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.length - 1;
  else return;
  event.preventDefault();
  tabs[next].focus();
  tabs[next].click();
}
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  panelId,
  compact,
}: {
  items: { id: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  panelId: string;
  compact?: boolean;
}) {
  const id = useId();
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={tabKeys} style={compact ? { marginBottom: 0 } : undefined}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={id + item.id}
          className={value === item.id ? 'on' : ''}
          aria-selected={value === item.id}
          aria-controls={panelId}
          tabIndex={value === item.id ? 0 : -1}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
