import { test } from "node:test";
import assert from "node:assert/strict";
import { projectVisibility, canWrite } from "../lib/visibility.ts";
import { safeBlobName, blobPrefix, formatBytes, isBlobPathnameFor, baseContentType } from "../lib/files.ts";

const u = (role) => ({ id: "u1", role, organizationId: "org1" });

test("ADMIN e MANAGER veem a organização inteira", () => {
  for (const role of ["ADMIN", "MANAGER"]) {
    assert.deepEqual(projectVisibility(u(role)), { organizationId: "org1" });
  }
});

test("ESPECIALISTA e EXECUTIVO só veem projetos com vínculo", () => {
  for (const role of ["SPECIALIST", "EXECUTIVE"]) {
    const where = projectVisibility(u(role));
    assert.equal(where.organizationId, "org1");
    assert.ok(Array.isArray(where.OR) && where.OR.length >= 4);
    const json = JSON.stringify(where.OR);
    for (const needle of ["managerId", "members", "assigneeId", "ownerId", "responsibleId", "signalRequests"]) {
      assert.ok(json.includes(needle), needle);
    }
    // Sempre o id do próprio usuário — nunca uma condição sem dono.
    assert.ok(json.includes('"u1"'));
  }
});

test("o filtro de organização nunca some", () => {
  for (const role of ["ADMIN", "MANAGER", "SPECIALIST", "EXECUTIVE"]) {
    assert.equal(projectVisibility(u(role)).organizationId, "org1");
  }
});

test("Executivo não grava", () => {
  assert.equal(canWrite({ role: "EXECUTIVE" }), false);
  for (const role of ["ADMIN", "MANAGER", "SPECIALIST"]) assert.equal(canWrite({ role }), true);
});

test("safeBlobName tira acento, espaço e símbolo", () => {
  assert.equal(safeBlobName("Ordem de Serviço nº 42946/2026.pdf"), "Ordem-de-Servico-n-42946-2026.pdf");
  assert.equal(safeBlobName("../../etc/passwd"), "etc-passwd");
  assert.equal(safeBlobName("###"), "arquivo");
});

test("blobPrefix isola por projeto", () => {
  assert.equal(blobPrefix("abc"), "projetos/abc/");
  assert.ok(!"projetos/abcd/x.pdf".startsWith(blobPrefix("abc")));
});

test("formatBytes", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2 * 1024 * 1024), "2.0 MB");
});

test("isBlobPathnameFor recusa traversal, subpasta e outro projeto", () => {
  assert.equal(isBlobPathnameFor("p1", "projetos/p1/os-42.pdf"), true);
  assert.equal(isBlobPathnameFor("p1", "projetos/p1/../p2/x.pdf"), false);
  assert.equal(isBlobPathnameFor("p1", "projetos/p1/sub/x.pdf"), false);
  assert.equal(isBlobPathnameFor("p1", "projetos/p2/x.pdf"), false);
  assert.equal(isBlobPathnameFor("p1", "projetos/p1/"), false);
});

test("baseContentType tira parâmetros", () => {
  assert.equal(baseContentType("text/plain; charset=utf-8"), "text/plain");
  assert.equal(baseContentType("Application/PDF"), "application/pdf");
});
