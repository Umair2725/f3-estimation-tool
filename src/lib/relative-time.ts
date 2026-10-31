// "Last active" wording for the people list: short, plain and never more precise than needed.
export function lastActiveLabel(at: Date | null, now: Date): string {
  if (!at) return "Never";
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 15) return "Now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return at.toISOString().slice(0, 10);
}
