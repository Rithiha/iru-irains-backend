const client = require("../connection");
const bcrypt = require("bcrypt");

const REGIONS = [
  "HQ",
  "North West",
  "North East",
  "Central India",
  "South Peninsular",
  "East & North East",
];

const DEFAULT_ROLES = [
  { code: "hq", name: "HQ Admin", description: "Full access — headquarters", createdAt: "2025-12-29" },
  { code: "mc", name: "MC User", description: "Meteorological Centre pages", createdAt: "2026-06-11" },
  { code: "sp", name: "SP User", description: "State and special portal pages", createdAt: "2026-06-11" },
  { code: "public", name: "Public", description: "Read-only public maps and reports", createdAt: "2025-12-30" },
];

const DEFAULT_ROUTES = [
  { path: "/irains-dashboard", label: "Dashboard", allowedRoles: ["hq", "mc", "public", "sp"] },
  { path: "/data-entry", label: "Data Entry", allowedRoles: ["hq", "mc"] },
  { path: "/newverification", label: "Verification", allowedRoles: ["hq", "mc"] },
  { path: "/admin-panel", label: "Admin Panel", allowedRoles: ["hq"] },
  { path: "/data-management", label: "Data Management", allowedRoles: ["hq"] },
  { path: "/permissions", label: "Permissions", allowedRoles: ["hq"] },
  { path: "/new-email-dissemination", label: "Email Dissemination", allowedRoles: ["hq", "mc", "sp"] },
  { path: "/station-statistics", label: "Station Statistics", allowedRoles: ["hq", "mc", "sp"] },
  { path: "/spatial-table", label: "Spatial Table", allowedRoles: ["hq", "mc", "public", "sp"] },
  { path: "/monsoon-activity", label: "Monsoon Activity", allowedRoles: ["hq", "mc", "public", "sp"] },
  { path: "/all-maps", label: "All Maps", allowedRoles: ["hq", "mc", "public", "sp"] },
  { path: "/yearlystationstatistics", label: "Yearly Station Stats", allowedRoles: ["hq", "mc", "sp"] },
  { path: "/rainfalldatacm", label: "Rainfall Data CM", allowedRoles: ["hq", "mc", "sp"] },
];

let ensurePromise = null;

const normalizeCode = (value) => String(value || "").toLowerCase().trim();

const normalizePath = (path) => {
  if (!path) return "/";
  let p = String(path).trim();
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
};

const uniqueRoleCode = async (name) => {
  const base = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24) || "role";
  let code = base;
  let n = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await client.query(
      `SELECT 1 FROM public.rbac_roles WHERE code = $1 LIMIT 1`,
      [code]
    );
    if (!existing.rows.length) return code;
    code = `${base.slice(0, 20)}${n}`;
    n += 1;
  }
};

const toIsoDate = (value) => {
  if (!value) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  const raw = String(value);
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  return toIsoDate(null);
};

const serializeRole = (row) => ({
  id: Number(row.id),
  code: row.code,
  name: row.name,
  description: row.description || "",
  active: row.active !== false,
  createdAt: toIsoDate(row.created_at),
});

const serializeUser = (row, roleCodes = []) => ({
  id: Number(row.id),
  username: row.username,
  fullName: row.full_name || "",
  email: row.email || "",
  phone: row.phone || "",
  designation: row.designation || "",
  district: row.district || "HQ",
  roleCodes: roleCodes.map(normalizeCode).filter(Boolean),
  active: row.active !== false,
  loginUserid: row.login_userid || null,
});

const serializeRoute = (row, allowedRoles = []) => ({
  id: Number(row.id),
  path: normalizePath(row.path),
  label: row.label || row.path,
  allowedRoles: allowedRoles.map(normalizeCode).filter(Boolean),
  active: row.active !== false,
});

const ensureRbacTables = async () => {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.rbac_roles (
        id              SERIAL PRIMARY KEY,
        code            VARCHAR(64)  NOT NULL UNIQUE,
        name            VARCHAR(255) NOT NULL,
        description     TEXT         NOT NULL DEFAULT '',
        active          BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at      DATE         NOT NULL DEFAULT CURRENT_DATE
      );

      CREATE TABLE IF NOT EXISTS public.rbac_users (
        id              SERIAL PRIMARY KEY,
        login_userid    VARCHAR(64),
        username        VARCHAR(255) NOT NULL UNIQUE,
        full_name       VARCHAR(255) NOT NULL DEFAULT '',
        email           VARCHAR(255) NOT NULL DEFAULT '',
        phone           VARCHAR(64)  NOT NULL DEFAULT '',
        designation     VARCHAR(255) NOT NULL DEFAULT '',
        district        VARCHAR(128) NOT NULL DEFAULT 'HQ',
        active          BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public.rbac_user_roles (
        user_id         INTEGER      NOT NULL REFERENCES public.rbac_users(id) ON DELETE CASCADE,
        role_code       VARCHAR(64)  NOT NULL REFERENCES public.rbac_roles(code) ON UPDATE CASCADE ON DELETE CASCADE,
        PRIMARY KEY (user_id, role_code)
      );

      CREATE TABLE IF NOT EXISTS public.rbac_routes (
        id              SERIAL PRIMARY KEY,
        path            VARCHAR(255) NOT NULL UNIQUE,
        label           VARCHAR(255) NOT NULL,
        active          BOOLEAN      NOT NULL DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS public.rbac_route_roles (
        route_id        INTEGER      NOT NULL REFERENCES public.rbac_routes(id) ON DELETE CASCADE,
        role_code       VARCHAR(64)  NOT NULL REFERENCES public.rbac_roles(code) ON UPDATE CASCADE ON DELETE CASCADE,
        PRIMARY KEY (route_id, role_code)
      );
    `);

    const roleCount = await client.query(`SELECT COUNT(*)::int AS n FROM public.rbac_roles`);
    if (!roleCount.rows[0].n) {
      for (const role of DEFAULT_ROLES) {
        await client.query(
          `INSERT INTO public.rbac_roles (code, name, description, active, created_at)
           VALUES ($1, $2, $3, TRUE, $4::date)
           ON CONFLICT (code) DO NOTHING`,
          [role.code, role.name, role.description, role.createdAt]
        );
      }
    }

    const routeCount = await client.query(`SELECT COUNT(*)::int AS n FROM public.rbac_routes`);
    if (!routeCount.rows[0].n) {
      for (const route of DEFAULT_ROUTES) {
        const inserted = await client.query(
          `INSERT INTO public.rbac_routes (path, label, active)
           VALUES ($1, $2, TRUE)
           ON CONFLICT (path) DO UPDATE SET label = EXCLUDED.label
           RETURNING id`,
          [route.path, route.label]
        );
        const routeId = inserted.rows[0].id;
        for (const code of route.allowedRoles) {
          await client.query(
            `INSERT INTO public.rbac_route_roles (route_id, role_code)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [routeId, code]
          );
        }
      }
    }

    const userCount = await client.query(`SELECT COUNT(*)::int AS n FROM public.rbac_users`);
    if (!userCount.rows[0].n) {
      await importLoginUsers();
    }
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
};

const importLoginUsers = async () => {
  const loginRows = await client.query(
    `SELECT userid, name, username, mcorhq, status
     FROM public.login
     WHERE userid IS NOT NULL
       AND LOWER(TRIM(userid)) <> 'userid'
       AND username IS NOT NULL
       AND TRIM(username) <> ''
       AND LOWER(TRIM(username)) <> 'username'
     ORDER BY userid`
  );

  for (const row of loginRows.rows) {
    const username = String(row.username).trim();
    const role = normalizeCode(row.mcorhq) || "public";
    const email = username.includes("@") ? username : "";
    const active = row.status == null || Number(row.status) === 1;

    // Ensure role exists for non-seed codes (e.g. rmc)
    if (role) {
      await client.query(
        `INSERT INTO public.rbac_roles (code, name, description, active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (code) DO NOTHING`,
        [role, role.toUpperCase(), `Imported role ${role}`]
      );
    }

    const inserted = await client.query(
      `INSERT INTO public.rbac_users
         (login_userid, username, full_name, email, phone, designation, district, active)
       VALUES ($1, $2, $3, $4, '', '', $5, $6)
       ON CONFLICT (username) DO NOTHING
       RETURNING id`,
      [
        String(row.userid),
        username,
        row.name || username,
        email,
        "HQ",
        active,
      ]
    );
    if (!inserted.rows.length) continue;
    await client.query(
      `INSERT INTO public.rbac_user_roles (user_id, role_code)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [inserted.rows[0].id, role]
    );
  }
};

const listRoles = async () => {
  const result = await client.query(
    `SELECT id, code, name, description, active, created_at::text AS created_at
     FROM public.rbac_roles
     ORDER BY id`
  );
  return result.rows.map(serializeRole);
};

const getRoleById = async (id) => {
  const result = await client.query(
    `SELECT id, code, name, description, active, created_at::text AS created_at
     FROM public.rbac_roles WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? serializeRole(result.rows[0]) : null;
};

const countUsersForRole = async (code) => {
  const result = await client.query(
    `SELECT COUNT(*)::int AS n FROM public.rbac_user_roles WHERE role_code = $1`,
    [normalizeCode(code)]
  );
  return result.rows[0].n;
};

const getUserRoleCodes = async (userId) => {
  const result = await client.query(
    `SELECT role_code FROM public.rbac_user_roles WHERE user_id = $1 ORDER BY role_code`,
    [userId]
  );
  return result.rows.map((r) => normalizeCode(r.role_code));
};

const listUsers = async () => {
  const users = await client.query(
    `SELECT id, login_userid, username, full_name, email, phone, designation, district, active
     FROM public.rbac_users
     ORDER BY id`
  );
  const roles = await client.query(
    `SELECT user_id, role_code FROM public.rbac_user_roles ORDER BY user_id, role_code`
  );
  const byUser = new Map();
  for (const row of roles.rows) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push(normalizeCode(row.role_code));
  }
  return users.rows.map((u) => serializeUser(u, byUser.get(u.id) || []));
};

const getUserById = async (id) => {
  const result = await client.query(
    `SELECT id, login_userid, username, full_name, email, phone, designation, district, active
     FROM public.rbac_users WHERE id = $1`,
    [id]
  );
  if (!result.rows.length) return null;
  const roleCodes = await getUserRoleCodes(id);
  return serializeUser(result.rows[0], roleCodes);
};

const setUserRoles = async (userId, roleCodes) => {
  const codes = Array.from(
    new Set((roleCodes || []).map(normalizeCode).filter(Boolean))
  );
  await client.query(`DELETE FROM public.rbac_user_roles WHERE user_id = $1`, [userId]);
  for (const code of codes) {
    const exists = await client.query(
      `SELECT 1 FROM public.rbac_roles WHERE code = $1 LIMIT 1`,
      [code]
    );
    if (!exists.rows.length) {
      const err = new Error(`Unknown role code: ${code}`);
      err.status = 400;
      throw err;
    }
    await client.query(
      `INSERT INTO public.rbac_user_roles (user_id, role_code) VALUES ($1, $2)`,
      [userId, code]
    );
  }
  return codes;
};

const nextLoginUserid = async () => {
  const result = await client.query(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(userid, '[^0-9]', '', 'g'), '')::bigint), 0) + 1 AS next_id
     FROM public.login
     WHERE userid ~ '^[0-9]+$'`
  );
  return String(result.rows[0].next_id);
};

const primaryRole = (roleCodes) => normalizeCode(roleCodes?.[0]) || "public";

const syncLoginUser = async ({
  loginUserid,
  username,
  fullName,
  password,
  roleCodes,
  active,
}) => {
  const mcorhq = primaryRole(roleCodes);
  const status = active === false ? 0 : 1;
  let userid = loginUserid ? String(loginUserid) : null;

  if (userid) {
    const existing = await client.query(
      `SELECT userid FROM public.login WHERE userid = $1 LIMIT 1`,
      [userid]
    );
    if (!existing.rows.length) userid = null;
  }

  if (!userid) {
    const byUsername = await client.query(
      `SELECT userid FROM public.login WHERE username = $1 LIMIT 1`,
      [username]
    );
    if (byUsername.rows.length) userid = String(byUsername.rows[0].userid);
  }

  if (userid) {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await client.query(
        `UPDATE public.login
         SET name = $2, username = $3, password = $4, mcorhq = $5, status = $6
         WHERE userid = $1`,
        [userid, fullName || username, username, hash, mcorhq, status]
      );
    } else {
      await client.query(
        `UPDATE public.login
         SET name = $2, username = $3, mcorhq = $4, status = $5
         WHERE userid = $1`,
        [userid, fullName || username, username, mcorhq, status]
      );
    }
    return userid;
  }

  if (!password) {
    const err = new Error("Password is required when creating a login account");
    err.status = 400;
    throw err;
  }

  userid = await nextLoginUserid();
  const hash = await bcrypt.hash(password, 10);
  await client.query(
    `INSERT INTO public.login (userid, name, username, password, mcorhq, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userid, fullName || username, username, hash, mcorhq, status]
  );
  return userid;
};

const deactivateLoginUser = async (loginUserid, username) => {
  if (loginUserid) {
    await client.query(`UPDATE public.login SET status = 0 WHERE userid = $1`, [
      String(loginUserid),
    ]);
  }
  if (username) {
    await client.query(`UPDATE public.login SET status = 0 WHERE username = $1`, [
      username,
    ]);
  }
};

const listRoutes = async () => {
  const routes = await client.query(
    `SELECT id, path, label, active FROM public.rbac_routes ORDER BY id`
  );
  const links = await client.query(
    `SELECT route_id, role_code FROM public.rbac_route_roles ORDER BY route_id, role_code`
  );
  const byRoute = new Map();
  for (const row of links.rows) {
    if (!byRoute.has(row.route_id)) byRoute.set(row.route_id, []);
    byRoute.get(row.route_id).push(normalizeCode(row.role_code));
  }
  return routes.rows.map((r) => serializeRoute(r, byRoute.get(r.id) || []));
};

const getRouteById = async (id) => {
  const result = await client.query(
    `SELECT id, path, label, active FROM public.rbac_routes WHERE id = $1`,
    [id]
  );
  if (!result.rows.length) return null;
  const links = await client.query(
    `SELECT role_code FROM public.rbac_route_roles WHERE route_id = $1 ORDER BY role_code`,
    [id]
  );
  return serializeRoute(
    result.rows[0],
    links.rows.map((r) => r.role_code)
  );
};

const setRouteRoles = async (routeId, allowedRoles) => {
  const codes = Array.from(
    new Set((allowedRoles || []).map(normalizeCode).filter(Boolean))
  );
  await client.query(`DELETE FROM public.rbac_route_roles WHERE route_id = $1`, [
    routeId,
  ]);
  for (const code of codes) {
    const exists = await client.query(
      `SELECT 1 FROM public.rbac_roles WHERE code = $1 LIMIT 1`,
      [code]
    );
    if (!exists.rows.length) continue;
    await client.query(
      `INSERT INTO public.rbac_route_roles (route_id, role_code) VALUES ($1, $2)`,
      [routeId, code]
    );
  }
  return codes;
};

const replaceAllRoutes = async (routes) => {
  const incoming = Array.isArray(routes) ? routes : [];
  const existing = await client.query(`SELECT id FROM public.rbac_routes`);
  const keepIds = new Set(
    incoming.map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0)
  );

  for (const row of existing.rows) {
    if (!keepIds.has(Number(row.id))) {
      await client.query(`DELETE FROM public.rbac_routes WHERE id = $1`, [row.id]);
    }
  }

  const result = [];
  for (const route of incoming) {
    const path = normalizePath(route.path);
    const label = String(route.label || path).trim() || path;
    const active = route.active !== false;
    const allowedRoles = route.allowedRoles || [];
    let id = Number(route.id);

    if (Number.isFinite(id) && id > 0) {
      const updated = await client.query(
        `UPDATE public.rbac_routes
         SET path = $2, label = $3, active = $4
         WHERE id = $1
         RETURNING id, path, label, active`,
        [id, path, label, active]
      );
      if (updated.rows.length) {
        await setRouteRoles(id, allowedRoles);
        result.push(serializeRoute(updated.rows[0], allowedRoles.map(normalizeCode)));
        continue;
      }
    }

    const inserted = await client.query(
      `INSERT INTO public.rbac_routes (path, label, active)
       VALUES ($1, $2, $3)
       ON CONFLICT (path) DO UPDATE
         SET label = EXCLUDED.label, active = EXCLUDED.active
       RETURNING id, path, label, active`,
      [path, label, active]
    );
    id = inserted.rows[0].id;
    await setRouteRoles(id, allowedRoles);
    result.push(serializeRoute(inserted.rows[0], allowedRoles.map(normalizeCode)));
  }

  return result.sort((a, b) => a.id - b.id);
};

const allowedPathsForRole = async (role) => {
  const code = normalizeCode(role);
  const result = await client.query(
    `SELECT r.path
     FROM public.rbac_routes r
     JOIN public.rbac_route_roles rr ON rr.route_id = r.id
     WHERE r.active = TRUE AND rr.role_code = $1
     ORDER BY r.path`,
    [code]
  );
  return result.rows.map((r) => normalizePath(r.path));
};

module.exports = {
  REGIONS,
  DEFAULT_ROLES,
  DEFAULT_ROUTES,
  normalizeCode,
  normalizePath,
  uniqueRoleCode,
  serializeRole,
  serializeUser,
  serializeRoute,
  ensureRbacTables,
  listRoles,
  getRoleById,
  countUsersForRole,
  listUsers,
  getUserById,
  getUserRoleCodes,
  setUserRoles,
  syncLoginUser,
  deactivateLoginUser,
  listRoutes,
  getRouteById,
  setRouteRoles,
  replaceAllRoutes,
  allowedPathsForRole,
};
