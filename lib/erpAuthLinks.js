import "server-only";

const DISCORD_ID_PATTERN = /^\d{15,22}$/;
const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const ERP_LOGIN_METADATA_KEY = "erp_login";

function stringValue(value) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function normalizeEmail(value) {
  return stringValue(value).toLowerCase();
}

function normalizePhone(value) {
  return stringValue(value).replace(/[\s\-().]/g, "");
}

export function getProviderIdentity(user, provider) {
  return (user?.identities || []).find(
    (identity) => identity?.provider === provider
  ) || null;
}

export function getDiscordIdentityData(user) {
  return getProviderIdentity(user, "discord")?.identity_data || {};
}

export function getDiscordIdFromUser(user) {
  const identity = getProviderIdentity(user, "discord");
  const identityData = identity?.identity_data || {};
  const candidates = [
    identityData.provider_id,
    identityData.sub,
    identityData.user_id,
    identity?.provider_id,
    identity?.id,
  ];

  for (const candidate of candidates) {
    const value = stringValue(candidate);
    if (DISCORD_ID_PATTERN.test(value)) return value;
  }

  const providers = Array.isArray(user?.app_metadata?.providers)
    ? user.app_metadata.providers
    : [];
  const isLegacyDiscordUser =
    user?.app_metadata?.provider === "discord" || providers.includes("discord");

  if (isLegacyDiscordUser) {
    const metadata = user?.user_metadata || {};
    for (const candidate of [
      metadata.provider_id,
      metadata.sub,
      metadata.user_id,
    ]) {
      const value = stringValue(candidate);
      if (DISCORD_ID_PATTERN.test(value)) return value;
    }
  }

  return "";
}

export function getDiscordProfileFromUser(user) {
  const data = getDiscordIdentityData(user);
  return {
    id: getDiscordIdFromUser(user),
    name:
      stringValue(data.global_name) ||
      stringValue(data.full_name) ||
      stringValue(data.name) ||
      stringValue(data.preferred_username) ||
      stringValue(data.user_name) ||
      stringValue(data.username) ||
      "Discord 使用者",
    avatarUrl:
      stringValue(data.avatar_url) || stringValue(data.picture) || null,
  };
}

function getLoginMetadata(user) {
  const value = user?.app_metadata?.[ERP_LOGIN_METADATA_KEY];
  return value && typeof value === "object" ? value : {};
}

export function getErpAuthLinkStatus(user) {
  const metadata = getLoginMetadata(user);
  const discordId = getDiscordIdFromUser(user);
  const googleLinked = Boolean(getProviderIdentity(user, "google"));
  const configuredEmail = normalizeEmail(metadata.email);
  const currentEmail = normalizeEmail(user?.email);
  const pendingEmail = normalizeEmail(user?.new_email);
  const emailConfirmed = Boolean(user?.email_confirmed_at || user?.confirmed_at);
  const emailEnabled = metadata.email_enabled === true;
  const emailReady = Boolean(
    emailEnabled &&
      configuredEmail &&
      configuredEmail === currentEmail &&
      emailConfirmed
  );
  const configuredPhone = normalizePhone(metadata.phone);
  const currentPhone = normalizePhone(user?.phone);
  const pendingPhone = normalizePhone(user?.phone_change);
  const phoneConfirmed = Boolean(user?.phone_confirmed_at);
  const phoneEnabled = metadata.phone_enabled === true;
  const phoneReady = Boolean(
    phoneEnabled &&
      configuredPhone &&
      configuredPhone === currentPhone &&
      phoneConfirmed
  );

  return {
    discordId,
    discordLinked: Boolean(discordId),
    googleLinked,
    googleEnabled: metadata.google_enabled === true,
    googleReady: googleLinked && metadata.google_enabled === true,
    emailEnabled,
    emailReady,
    email: configuredEmail || currentEmail,
    currentEmail,
    pendingEmail,
    emailConfirmationPending: Boolean(
      emailEnabled && configuredEmail && !emailReady
    ),
    phoneEnabled,
    phoneReady,
    phone: configuredPhone || currentPhone,
    currentPhone,
    pendingPhone,
    phoneConfirmationPending: Boolean(
      phoneEnabled && configuredPhone && !phoneReady
    ),
    onboardingCompleted: metadata.onboarding_completed === true,
    needsOnboarding:
      Boolean(discordId) && metadata.onboarding_completed !== true,
  };
}

export async function getAuthUserFromBearer(supabaseAdmin, request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    const error = new Error("請先登入 ERP");
    error.status = 401;
    throw error;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    const authError = new Error("登入已失效，請重新登入");
    authError.status = 401;
    throw authError;
  }

  return data.user;
}

async function updateLoginMetadata(supabaseAdmin, user, changes) {
  const appMetadata = user?.app_metadata || {};
  const current = getLoginMetadata(user);
  const next = {
    ...current,
    ...changes,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
    user.id,
    {
      app_metadata: {
        ...appMetadata,
        [ERP_LOGIN_METADATA_KEY]: next,
      },
    }
  );

  if (error || !data?.user) {
    throw new Error(error?.message || "更新 ERP 登入綁定失敗");
  }

  return data.user;
}

export async function applyErpAuthLinkAction(
  supabaseAdmin,
  user,
  action,
  body = {}
) {
  const discordId = getDiscordIdFromUser(user);
  if (!discordId) {
    const error = new Error("首次登入必須使用 Discord，且帳號需保留 Discord 綁定");
    error.status = 403;
    throw error;
  }

  if (action === "record_discord_login") {
    const current = getLoginMetadata(user);
    return updateLoginMetadata(supabaseAdmin, user, {
      discord_verified: true,
      discord_id: discordId,
      first_discord_login_at:
        current.first_discord_login_at || new Date().toISOString(),
    });
  }

  if (action === "complete_onboarding") {
    return updateLoginMetadata(supabaseAdmin, user, {
      discord_verified: true,
      discord_id: discordId,
      onboarding_completed: true,
    });
  }

  if (action === "enable_google") {
    if (!getProviderIdentity(user, "google")) {
      throw new Error("尚未完成 Google 帳號連結");
    }
    return updateLoginMetadata(supabaseAdmin, user, {
      discord_verified: true,
      discord_id: discordId,
      google_enabled: true,
      onboarding_completed: true,
    });
  }

  if (action === "enable_email") {
    const email = normalizeEmail(body.email);
    if (!email || !email.includes("@") || email.length > 254) {
      throw new Error("請輸入有效的電子郵件地址");
    }

    const currentEmail = normalizeEmail(user?.email);
    const pendingEmail = normalizeEmail(user?.new_email);
    if (email !== currentEmail && email !== pendingEmail) {
      throw new Error("電子郵件尚未由目前登入帳號設定");
    }

    return updateLoginMetadata(supabaseAdmin, user, {
      discord_verified: true,
      discord_id: discordId,
      email_enabled: true,
      email,
      onboarding_completed: true,
    });
  }

  if (action === "enable_phone") {
    const phone = normalizePhone(body.phone);
    if (!E164_PHONE_PATTERN.test(phone)) {
      throw new Error("請輸入有效的國際電話號碼");
    }

    const currentPhone = normalizePhone(user?.phone);
    const pendingPhone = normalizePhone(user?.phone_change);
    if (phone !== currentPhone && phone !== pendingPhone) {
      throw new Error("電話號碼尚未由目前登入帳號設定");
    }

    return updateLoginMetadata(supabaseAdmin, user, {
      discord_verified: true,
      discord_id: discordId,
      phone_enabled: true,
      phone,
      onboarding_completed: true,
    });
  }

  throw new Error("不支援的登入綁定操作");
}
