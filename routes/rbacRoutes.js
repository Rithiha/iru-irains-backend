const express = require("express");
const router = express.Router();
const {
  getRegions,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  listUsers,
  createUser,
  updateUser,
  setUserRoles,
  deleteUser,
  listRoutes,
  replaceRoutes,
  createRoute,
  updateRoute,
  deleteRoute,
  setRoleRoutes,
  getAllowedRoutes,
  resetRoutes,
} = require("../controllers/RbacController");

// Catalog helpers
router.get("/rbac/regions", getRegions);
router.get("/rbac/allowed-routes", getAllowedRoutes);
router.post("/rbac/allowed-routes", getAllowedRoutes);

// Roles
router.get("/rbac/roles", listRoles);
router.post("/rbac/roles", createRole);
router.put("/rbac/roles/:id", updateRole);
router.delete("/rbac/roles/:id", deleteRole);
router.put("/rbac/roles/:code/routes", setRoleRoutes);

// Users
router.get("/rbac/users", listUsers);
router.post("/rbac/users", createUser);
router.put("/rbac/users/:id", updateUser);
router.put("/rbac/users/:id/roles", setUserRoles);
router.delete("/rbac/users/:id", deleteUser);

// Routes / access matrix
router.get("/rbac/routes", listRoutes);
router.put("/rbac/routes", replaceRoutes);
router.post("/rbac/routes", createRoute);
router.post("/rbac/routes/reset", resetRoutes);
router.put("/rbac/routes/:id", updateRoute);
router.delete("/rbac/routes/:id", deleteRoute);

module.exports = router;
