const client = require("../connection");
const rbac = require("../utils/rbac");

const withRbac = (handler) => async (req, res) => {
  try {
    await rbac.ensureRbacTables();
    return await handler(req, res);
  } catch (err) {
    console.error("[RBAC]", err);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};

const parseRoleCodes = (body = {}) => {
  if (Array.isArray(body.roleCodes)) return body.roleCodes;
  if (body.roleCode) return [body.roleCode];
  return [];
};

// ── Roles ─────────────────────────────────────────────────

exports.listRoles = withRbac(async (_req, res) => {
  const data = await rbac.listRoles();
  res.json({ success: true, data });
});

exports.createRole = withRbac(async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) {
    return res.status(400).json({ success: false, message: "name is required" });
  }
  const description = String(req.body?.description || "").trim();
  const active = req.body?.active !== false;
  const code = req.body?.code
    ? rbac.normalizeCode(req.body.code)
    : await rbac.uniqueRoleCode(name);

  const existing = await client.query(
    `SELECT id FROM public.rbac_roles WHERE code = $1 LIMIT 1`,
    [code]
  );
  if (existing.rows.length) {
    return res.status(409).json({ success: false, message: `Role code "${code}" already exists` });
  }

  const createdAt = new Date().toISOString().slice(0, 10);
  const result = await client.query(
    `INSERT INTO public.rbac_roles (code, name, description, active, created_at)
     VALUES ($1, $2, $3, $4, $5::date)
     RETURNING id, code, name, description, active, created_at::text AS created_at`,
    [code, name, description, active, createdAt]
  );
  res.status(201).json({ success: true, data: rbac.serializeRole(result.rows[0]) });
});

exports.updateRole = withRbac(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await rbac.getRoleById(id);
  if (!existing) {
    return res.status(404).json({ success: false, message: "Role not found" });
  }

  const name = req.body?.name != null ? String(req.body.name).trim() : existing.name;
  if (!name) {
    return res.status(400).json({ success: false, message: "name is required" });
  }
  const description =
    req.body?.description != null
      ? String(req.body.description).trim()
      : existing.description;
  const active = req.body?.active != null ? !!req.body.active : existing.active;

  const result = await client.query(
    `UPDATE public.rbac_roles
     SET name = $2, description = $3, active = $4
     WHERE id = $1
     RETURNING id, code, name, description, active, created_at::text AS created_at`,
    [id, name, description, active]
  );
  res.json({ success: true, data: rbac.serializeRole(result.rows[0]) });
});

exports.deleteRole = withRbac(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await rbac.getRoleById(id);
  if (!existing) {
    return res.status(404).json({ success: false, message: "Role not found" });
  }

  const userCount = await rbac.countUsersForRole(existing.code);
  if (userCount > 0) {
    return res.status(409).json({
      success: false,
      message: `"${existing.name}" is assigned to ${userCount} user${userCount === 1 ? "" : "s"}. Reassign them before deleting this role.`,
    });
  }

  await client.query(`DELETE FROM public.rbac_route_roles WHERE role_code = $1`, [
    existing.code,
  ]);
  await client.query(`DELETE FROM public.rbac_roles WHERE id = $1`, [id]);
  res.json({ success: true, message: "Role deleted" });
});

// ── Users ─────────────────────────────────────────────────

exports.listUsers = withRbac(async (_req, res) => {
  const data = await rbac.listUsers();
  res.json({ success: true, data });
});

exports.createUser = withRbac(async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const fullName = String(req.body?.fullName || req.body?.full_name || "").trim();
  const password = String(req.body?.password || "");
  const email = String(req.body?.email || "").trim();
  const phone = String(req.body?.phone || "").trim();
  const designation = String(req.body?.designation || "").trim();
  const active = req.body?.active !== false;
  const roleCodes = parseRoleCodes(req.body).map(rbac.normalizeCode).filter(Boolean);

  if (!username || username.length < 4) {
    return res.status(400).json({ success: false, message: "username must be at least 4 characters" });
  }
  if (!fullName || fullName.length < 3) {
    return res.status(400).json({ success: false, message: "fullName must be at least 3 characters" });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ success: false, message: "password must be at least 8 characters" });
  }
  if (!roleCodes.length) {
    return res.status(400).json({ success: false, message: "roleCode or roleCodes is required" });
  }

  const taken = await client.query(
    `SELECT id FROM public.rbac_users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
    [username]
  );
  if (taken.rows.length) {
    return res.status(409).json({ success: false, message: "That username is already in use." });
  }

  const loginTaken = await client.query(
    `SELECT userid FROM public.login WHERE LOWER(username) = LOWER($1) LIMIT 1`,
    [username]
  );
  if (loginTaken.rows.length) {
    return res.status(409).json({
      success: false,
      message: "That username already exists in login accounts.",
    });
  }

  const loginUserid = await rbac.syncLoginUser({
    username,
    fullName,
    password,
    roleCodes,
    active,
  });

  const inserted = await client.query(
    `INSERT INTO public.rbac_users
       (login_userid, username, full_name, email, phone, designation, district, active)
     VALUES ($1, $2, $3, $4, $5, $6, '', $7)
     RETURNING id, login_userid, username, full_name, email, phone, designation, active`,
    [loginUserid, username, fullName, email, phone, designation, active]
  );

  const codes = await rbac.setUserRoles(inserted.rows[0].id, roleCodes);
  res.status(201).json({
    success: true,
    data: rbac.serializeUser(inserted.rows[0], codes),
  });
});

exports.updateUser = withRbac(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await rbac.getUserById(id);
  if (!existing) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  const username =
    req.body?.username != null
      ? String(req.body.username).trim()
      : existing.username;
  const fullName =
    req.body?.fullName != null || req.body?.full_name != null
      ? String(req.body.fullName ?? req.body.full_name).trim()
      : existing.fullName;
  const email =
    req.body?.email != null ? String(req.body.email).trim() : existing.email;
  const phone =
    req.body?.phone != null ? String(req.body.phone).trim() : existing.phone;
  const designation =
    req.body?.designation != null
      ? String(req.body.designation).trim()
      : existing.designation;
  const active =
    req.body?.active != null ? !!req.body.active : existing.active;
  const password = req.body?.password ? String(req.body.password) : "";

  if (!username || username.length < 4) {
    return res.status(400).json({ success: false, message: "username must be at least 4 characters" });
  }
  if (!fullName || fullName.length < 3) {
    return res.status(400).json({ success: false, message: "fullName must be at least 3 characters" });
  }

  const taken = await client.query(
    `SELECT id FROM public.rbac_users
     WHERE LOWER(username) = LOWER($1) AND id <> $2 LIMIT 1`,
    [username, id]
  );
  if (taken.rows.length) {
    return res.status(409).json({ success: false, message: "That username is already in use." });
  }

  let roleCodes = existing.roleCodes;
  const incomingRoles = parseRoleCodes(req.body);
  if (incomingRoles.length) {
    roleCodes = await rbac.setUserRoles(id, incomingRoles);
  }

  const loginUserid = await rbac.syncLoginUser({
    loginUserid: existing.loginUserid,
    username,
    fullName,
    password: password || undefined,
    roleCodes,
    active,
  });

  const updated = await client.query(
    `UPDATE public.rbac_users
     SET login_userid = $2,
         username = $3,
         full_name = $4,
         email = $5,
         phone = $6,
         designation = $7,
         active = $8
     WHERE id = $1
     RETURNING id, login_userid, username, full_name, email, phone, designation, active`,
    [id, loginUserid, username, fullName, email, phone, designation, active]
  );

  res.json({
    success: true,
    data: rbac.serializeUser(updated.rows[0], roleCodes),
  });
});

exports.setUserRoles = withRbac(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await rbac.getUserById(id);
  if (!existing) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  const roleCodes = parseRoleCodes(req.body);
  const codes = await rbac.setUserRoles(id, roleCodes);

  await rbac.syncLoginUser({
    loginUserid: existing.loginUserid,
    username: existing.username,
    fullName: existing.fullName,
    roleCodes: codes,
    active: existing.active,
  });

  const user = await rbac.getUserById(id);
  res.json({ success: true, data: user });
});

exports.deleteUser = withRbac(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await rbac.getUserById(id);
  if (!existing) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  await rbac.deactivateLoginUser(existing.loginUserid, existing.username);
  await client.query(`DELETE FROM public.rbac_users WHERE id = $1`, [id]);
  res.json({ success: true, message: "User deleted" });
});

// ── Routes / matrix ───────────────────────────────────────

exports.listRoutes = withRbac(async (_req, res) => {
  const data = await rbac.listRoutes();
  res.json({ success: true, data });
});

exports.replaceRoutes = withRbac(async (req, res) => {
  const routes = Array.isArray(req.body) ? req.body : req.body?.routes;
  if (!Array.isArray(routes)) {
    return res.status(400).json({
      success: false,
      message: "Body must be an array of routes or { routes: [...] }",
    });
  }
  const data = await rbac.replaceAllRoutes(routes);
  res.json({ success: true, data });
});

exports.createRoute = withRbac(async (req, res) => {
  const path = rbac.normalizePath(req.body?.path);
  const label = String(req.body?.label || path).trim();
  const active = req.body?.active !== false;
  const allowedRoles = (req.body?.allowedRoles || []).map(rbac.normalizeCode);

  if (!path || path === "/") {
    return res.status(400).json({ success: false, message: "path is required" });
  }
  if (!label) {
    return res.status(400).json({ success: false, message: "label is required" });
  }

  const dup = await client.query(
    `SELECT id FROM public.rbac_routes WHERE path = $1 LIMIT 1`,
    [path]
  );
  if (dup.rows.length) {
    return res.status(409).json({ success: false, message: "A route with this path already exists." });
  }

  const inserted = await client.query(
    `INSERT INTO public.rbac_routes (path, label, active)
     VALUES ($1, $2, $3)
     RETURNING id, path, label, active`,
    [path, label, active]
  );
  await rbac.setRouteRoles(inserted.rows[0].id, allowedRoles);
  res.status(201).json({
    success: true,
    data: rbac.serializeRoute(inserted.rows[0], allowedRoles),
  });
});

exports.updateRoute = withRbac(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await rbac.getRouteById(id);
  if (!existing) {
    return res.status(404).json({ success: false, message: "Route not found" });
  }

  const path =
    req.body?.path != null ? rbac.normalizePath(req.body.path) : existing.path;
  const label =
    req.body?.label != null
      ? String(req.body.label).trim()
      : existing.label;
  const active =
    req.body?.active != null ? !!req.body.active : existing.active;

  if (!path || path === "/") {
    return res.status(400).json({ success: false, message: "path is required" });
  }

  const dup = await client.query(
    `SELECT id FROM public.rbac_routes WHERE path = $1 AND id <> $2 LIMIT 1`,
    [path, id]
  );
  if (dup.rows.length) {
    return res.status(409).json({ success: false, message: "A route with this path already exists." });
  }

  const updated = await client.query(
    `UPDATE public.rbac_routes
     SET path = $2, label = $3, active = $4
     WHERE id = $1
     RETURNING id, path, label, active`,
    [id, path, label, active]
  );

  let allowedRoles = existing.allowedRoles;
  if (Array.isArray(req.body?.allowedRoles)) {
    allowedRoles = await rbac.setRouteRoles(id, req.body.allowedRoles);
  }

  res.json({
    success: true,
    data: rbac.serializeRoute(updated.rows[0], allowedRoles),
  });
});

exports.deleteRoute = withRbac(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await rbac.getRouteById(id);
  if (!existing) {
    return res.status(404).json({ success: false, message: "Route not found" });
  }
  await client.query(`DELETE FROM public.rbac_routes WHERE id = $1`, [id]);
  res.json({ success: true, message: "Route deleted" });
});

exports.setRoleRoutes = withRbac(async (req, res) => {
  const code = rbac.normalizeCode(req.params.code);
  const role = (await rbac.listRoles()).find((r) => r.code === code);
  if (!role) {
    return res.status(404).json({ success: false, message: "Role not found" });
  }

  const routeIds = Array.isArray(req.body?.routeIds)
    ? req.body.routeIds.map(Number).filter((n) => Number.isFinite(n))
    : null;
  const mode = String(req.body?.mode || "replace").toLowerCase(); // replace | assign | remove

  const routes = await rbac.listRoutes();

  if (mode === "assign" && routeIds) {
    for (const route of routes) {
      if (!routeIds.includes(route.id)) continue;
      if (route.allowedRoles.includes(code)) continue;
      await rbac.setRouteRoles(route.id, [...route.allowedRoles, code]);
    }
  } else if (mode === "remove" && routeIds) {
    for (const route of routes) {
      if (!routeIds.includes(route.id)) continue;
      await rbac.setRouteRoles(
        route.id,
        route.allowedRoles.filter((c) => c !== code)
      );
    }
  } else if (routeIds) {
    // replace: only these routes should have the role
    for (const route of routes) {
      const has = route.allowedRoles.includes(code);
      const want = routeIds.includes(route.id);
      if (has === want) continue;
      const next = want
        ? [...route.allowedRoles, code]
        : route.allowedRoles.filter((c) => c !== code);
      await rbac.setRouteRoles(route.id, next);
    }
  } else {
    return res.status(400).json({
      success: false,
      message: "routeIds array is required",
    });
  }

  const data = await rbac.listRoutes();
  res.json({ success: true, data });
});

exports.getAllowedRoutes = withRbac(async (req, res) => {
  const role = rbac.normalizeCode(
    req.query.role || req.body?.mcorhq_type || req.body?.role
  );
  if (!role) {
    return res.status(400).json({
      success: false,
      message: "role / mcorhq_type is required",
    });
  }
  const allowedRoutes = await rbac.allowedPathsForRole(role);
  res.json({
    success: true,
    mcorhq_type: role,
    allowedRoutes,
    count: allowedRoutes.length,
  });
});

exports.resetRoutes = withRbac(async (_req, res) => {
  await client.query(`DELETE FROM public.rbac_route_roles`);
  await client.query(`DELETE FROM public.rbac_routes`);
  // Re-seed defaults via ensure flags: temporarily clear count by re-inserting
  for (const route of rbac.DEFAULT_ROUTES) {
    const inserted = await client.query(
      `INSERT INTO public.rbac_routes (path, label, active)
       VALUES ($1, $2, TRUE)
       RETURNING id`,
      [route.path, route.label]
    );
    await rbac.setRouteRoles(inserted.rows[0].id, route.allowedRoles);
  }
  const data = await rbac.listRoutes();
  res.json({ success: true, data });
});
