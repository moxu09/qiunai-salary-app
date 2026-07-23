export const ERP_ROLES = ["super_admin", "store_manager", "customer_service", "employee"];
export const ERP_ROLE_LABELS = { super_admin: "最高管理員", store_manager: "店經理", customer_service: "客服", employee: "員工" };
const ADMIN_ROLES = new Set(["super_admin", "store_manager", "customer_service"]);
export function normalizeErpRole(value) { const role = String(value || "").trim(); return ERP_ROLES.includes(role) ? role : "employee"; }
export function isErpAdminRole(role) { return ADMIN_ROLES.has(normalizeErpRole(role)); }
export function getErpCapabilities(role) { const normalized = normalizeErpRole(role); const superAdmin = normalized === "super_admin"; const manager = normalized === "store_manager"; const support = normalized === "customer_service"; return { role: normalized, canAccessAdmin: superAdmin || manager || support, canViewAllAdmin: superAdmin || manager, canReviewAll: superAdmin || manager, canReviewOrdersAndTips: superAdmin || manager || support, canManageRoles: superAdmin || manager, canAssignPrivilegedRoles: superAdmin, canUploadFiles: superAdmin || manager, canDeleteFiles: superAdmin, canReorderFiles: superAdmin }; }
export function canManageTargetRole(actorRole, targetRole) { const actor = normalizeErpRole(actorRole); const target = normalizeErpRole(targetRole); if (actor === "super_admin") return true; if (actor === "store_manager") return target === "customer_service" || target === "employee"; return false; }

