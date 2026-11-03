// Single source of truth for permission keys. Seeded into the `permissions` table;
// roles map to these through `role_permissions` and can be edited by a Super Admin.
//
// Only staff (IT and HR) sign in. Employees are records that assets are assigned
// to; anything they confirm (receipt, requests) is recorded by staff for them.

export const PERMISSIONS = {
  // System
  "dashboard:read": "View the analytics dashboard",
  "user:manage": "Create users, change roles, deactivate accounts",
  "role:manage": "Edit which permissions each role has",
  "settings:manage": "Change system settings",
  "audit:read": "View the audit log",
  // Master data
  "master:manage": "Manage categories, departments, designations, branches and vendors",
  // Assets
  "asset:read": "View all assets",
  "asset:create": "Add assets",
  "asset:update": "Edit assets",
  "asset:delete": "Delete (archive) assets",
  "asset:import": "Bulk import assets",
  // Employees
  "employee:read": "View all employees",
  "employee:create": "Add employees",
  "employee:update": "Edit employees",
  "employee:import": "Bulk import employees",
  // Assignment & return
  "assignment:read": "View assignment and return history",
  "assignment:create": "Assign assets and record handover acknowledgements",
  "assignment:return": "Process asset returns",
  // Maintenance
  "maintenance:read": "View maintenance tickets",
  "maintenance:manage": "Create and update maintenance tickets",
  // Requests
  "request:read": "View asset requests",
  "request:create": "Log asset requests on behalf of employees",
  "request:approve": "Approve or reject asset requests",
  // Exit clearance
  "clearance:read": "View exit clearances",
  "clearance:manage": "Initiate and complete exit clearances",
  // Reports
  "report:read": "View reports",
  "report:export": "Export reports to Excel / CSV / PDF",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const SYSTEM_ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  HR: "HR",
} as const;

export type SystemRole = keyof typeof SYSTEM_ROLES;

/** Default grants used by the seed. Editable afterwards in Settings → Roles. */
export const DEFAULT_ROLE_PERMISSIONS: Record<SystemRole, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS.filter((p) => !["user:manage", "role:manage", "settings:manage"].includes(p)),
  HR: [
    "dashboard:read",
    "employee:read",
    "employee:create",
    "employee:update",
    "employee:import",
    "asset:read",
    "assignment:read",
    "assignment:create",
    "assignment:return",
    "maintenance:read",
    "request:read",
    "request:create",
    "clearance:read",
    "clearance:manage",
    "report:read",
    "report:export",
  ],
};

export function permissionModule(key: Permission) {
  return key.split(":")[0];
}
