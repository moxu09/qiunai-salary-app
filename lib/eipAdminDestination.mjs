export function eipAdminDestination(deepnight, qiunai, isOwner) {
  const departments = [
    ["deepnight", "深夜不關燈", "/admin", deepnight],
    ["qiunai", "秋奈電競", "/admin/department/qiunai", qiunai],
  ].filter(([, , , access]) => access.isAdmin && access.capabilities.canAccessAdmin)
    .map(([key, label, prefix, access]) => ({
      key,
      label,
      href: prefix + (access.role === "audit_reviewer" ? "/device-audit" : "/salary"),
    }));

  if (departments.length === 2) {
    return isOwner ? { redirect: "/admin?view=overview" } : { departments };
  }
  return { redirect: departments[0]?.href || "https://hr.wearestilllhere.com/collaboration/workspace" };
}
