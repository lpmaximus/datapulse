import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveWorkspaceRole,
  defaultWorkspaceId,
  needsWorkspaceChoice,
  safeNext,
} from "../lib/workspaces.ts";

const base = {
  homeOrganizationId: "mrs",
  homeRole: "MANAGER",
  isSuperAdmin: false,
  memberships: [],
};

test("origem: papel do próprio usuário; sem acesso a outras organizações", () => {
  assert.equal(resolveWorkspaceRole(base, "mrs"), "MANAGER");
  assert.equal(resolveWorkspaceRole(base, "idg"), null);
});

test("membership dá o papel daquele workspace", () => {
  const a = { ...base, memberships: [{ organizationId: "idg", role: "EXECUTIVE" }] };
  assert.equal(resolveWorkspaceRole(a, "idg"), "EXECUTIVE");
  assert.equal(resolveWorkspaceRole(a, "mrs"), "MANAGER");
});

test("superadmin é ADMIN em qualquer workspace", () => {
  const a = { ...base, isSuperAdmin: true };
  assert.equal(resolveWorkspaceRole(a, "mrs"), "ADMIN");
  assert.equal(resolveWorkspaceRole(a, "idg"), "ADMIN");
});

test("default: um único acesso segue direto; vários ou superadmin escolhem", () => {
  assert.equal(defaultWorkspaceId(base), "mrs");
  assert.equal(
    defaultWorkspaceId({ ...base, memberships: [{ organizationId: "idg", role: "ADMIN" }] }),
    null,
  );
  assert.equal(defaultWorkspaceId({ ...base, isSuperAdmin: true }), null);
});

test("seleção obrigatória", () => {
  assert.equal(needsWorkspaceChoice(false, 1), false);
  assert.equal(needsWorkspaceChoice(false, 2), true);
  assert.equal(needsWorkspaceChoice(true, 1), true);
});

test("safeNext bloqueia destinos externos", () => {
  assert.equal(safeNext("/projects"), "/projects");
  assert.equal(safeNext("//evil.com"), "/");
  assert.equal(safeNext("https://evil.com"), "/");
  assert.equal(safeNext(null), "/");
});
