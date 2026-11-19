// Typing presence is transient. Sending messages still uses the existing authenticated API.
export function createTypingPresence(now = Date.now) {
  const entries = new Map();
  const key = (organization, sender, recipient) => `${organization}:${sender}:${recipient}`;
  return {
    set(organization, sender, recipient, active) {
      const id = key(organization, sender, recipient);
      if (!active) {
        entries.delete(id);
        return;
      }
      entries.set(id, now() + 8000);
      for (const [entry, expires] of entries) if (expires <= now()) entries.delete(entry);
      while (entries.size > 5000) entries.delete(entries.keys().next().value);
    },
    has(organization, sender, recipient) {
      const id = key(organization, sender, recipient);
      if ((entries.get(id) || 0) > now()) return true;
      entries.delete(id);
      return false;
    },
  };
}
