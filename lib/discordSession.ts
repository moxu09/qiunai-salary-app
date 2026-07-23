type DiscordIdentity = {
  provider?: string;
  id?: string;
  identity_data?: Record<string, unknown>;
};

type DiscordSession = {
  user?: {
    user_metadata?: Record<string, unknown>;
    identities?: DiscordIdentity[];
  };
};

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function isDiscordId(value: string) {
  return /^\d{15,22}$/.test(value);
}

export function getDiscordIdFromSession(session: unknown) {
  const user = (session as DiscordSession | null)?.user;
  const discordIdentity = user?.identities?.find(
    (identity) => identity.provider === "discord"
  );
  const data = discordIdentity?.identity_data || {};

  for (const candidate of [
    data.provider_id,
    data.sub,
    data.user_id,
    discordIdentity?.id,
  ]) {
    const value = stringValue(candidate).trim();
    if (isDiscordId(value)) return value;
  }

  return "";
}

