import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isTaskOverdue,
  scheduleHealth,
  projectProgress,
  currentStage,
  normalizeTaskUpdate,
  relativeDueLabel,
  isProjectWritable,
  validateParentLink,
  leafTasks,
  rollupMilestone,
  buildDeadlineChange,
} from "../lib/tasks.ts";

const NOW = new Date("2026-09-17T15:00:00Z");
const d = (s) => new Date(s + "T00:00:00Z");
const task = (over = {}) => ({
  kind: "TASK",
  status: "IN_PROGRESS",
  progress: 50,
  startDate: null,
  plannedDate: null,
  forecastDate: null,
  actualDate: null,
  ...over,
});

test("atrasada usa a previsão antes da linha de base e ignora concluídas", () => {
  assert.equal(isTaskOverdue(task({ plannedDate: d("2026-09-10") }), NOW), true);
  assert.equal(
    isTaskOverdue(task({ plannedDate: d("2026-09-10"), forecastDate: d("2026-09-30") }), NOW),
    false,
  );
  assert.equal(isTaskOverdue(task({ plannedDate: d("2026-09-17") }), NOW), false, "vence hoje não é atraso");
  assert.equal(isTaskOverdue(task({ status: "DONE", plannedDate: d("2026-09-01") }), NOW), false);
});

test("saúde de cronograma: atrasado domina, deslize gera atenção", () => {
  assert.equal(scheduleHealth([], NOW), "NO_DATA");
  assert.equal(scheduleHealth([task({ plannedDate: d("2026-12-01"), progress: 10 })], NOW), "ON_TRACK");
  assert.equal(
    scheduleHealth([task({ plannedDate: d("2026-12-01"), forecastDate: d("2026-12-10") })], NOW),
    "WATCH",
  );
  assert.equal(
    scheduleHealth(
      [task({ plannedDate: d("2026-12-01") }), task({ plannedDate: d("2026-09-01") })],
      NOW,
    ),
    "LATE",
  );
  assert.equal(scheduleHealth([task({ plannedDate: d("2026-09-20"), progress: 10 })], NOW), "WATCH");
});

test("avanço pondera por duração e marco pesa pouco", () => {
  const long = task({ startDate: d("2026-09-01"), plannedDate: d("2026-10-01"), progress: 50 });
  const marco = task({ kind: "MILESTONE", status: "NOT_STARTED", progress: 0, plannedDate: d("2026-10-01") });
  const p = projectProgress([long, marco]);
  assert.ok(p >= 45 && p <= 50, `esperado perto de 50, veio ${p}`);
  assert.equal(projectProgress([]), null);
  assert.equal(projectProgress([task({ status: "DONE", progress: 10 })]), 100);
});

test("etapa atual prefere tarefa em andamento", () => {
  const a = { ...task({ status: "NOT_STARTED", plannedDate: d("2026-09-18") }), name: "A" };
  const b = { ...task({ status: "IN_PROGRESS", plannedDate: d("2026-10-18") }), name: "B" };
  assert.equal(currentStage([a, b]).name, "B");
  assert.equal(currentStage([{ ...task({ status: "DONE" }), name: "C" }]), null);
});

test("concluir fecha em 100% com data real; reabrir limpa", () => {
  const done = normalizeTaskUpdate(
    { kind: "TASK", status: "DONE", progress: 40, startDate: null, actualDate: null },
    NOW,
  );
  assert.equal(done.progress, 100);
  assert.equal(done.actualDate.toISOString(), "2026-09-17T00:00:00.000Z");

  const reopened = normalizeTaskUpdate(
    { kind: "TASK", status: "IN_PROGRESS", progress: 100, startDate: null, actualDate: d("2026-09-01") },
    NOW,
  );
  assert.equal(reopened.actualDate, null);
  assert.equal(reopened.progress, 99);

  const marco = normalizeTaskUpdate(
    { kind: "MILESTONE", status: "IN_PROGRESS", progress: 60, startDate: d("2026-09-01"), actualDate: null },
    NOW,
  );
  assert.equal(marco.startDate, null);
  assert.equal(marco.progress, 0);
});

test("rótulo relativo e projeto somente leitura", () => {
  assert.equal(relativeDueLabel(d("2026-09-17"), NOW), "Hoje");
  assert.equal(relativeDueLabel(d("2026-09-18"), NOW), "Amanhã");
  assert.equal(isProjectWritable("ACTIVE"), true);
  assert.equal(isProjectWritable("PAUSED"), false);
  assert.equal(isProjectWritable("CLOSED"), false);
});

test("vínculo tarefa→marco: só tarefa tem pai, só marco é pai, mesmo projeto, sem 3º nível", () => {
  const proj = "p1";
  assert.equal(
    validateParentLink({ projectId: proj, kind: "TASK" }, { id: "m1", projectId: proj, kind: "MILESTONE" }),
    null,
  );
  assert.match(
    validateParentLink({ projectId: proj, kind: "MILESTONE" }, { id: "m1", projectId: proj, kind: "MILESTONE" }),
    /Só tarefa/,
  );
  assert.match(
    validateParentLink({ projectId: proj, kind: "TASK" }, { id: "t1", projectId: proj, kind: "TASK" }),
    /não é um marco/,
  );
  assert.match(
    validateParentLink({ projectId: proj, kind: "TASK" }, { id: "m1", projectId: "p2", kind: "MILESTONE" }),
    /mesmo projeto/,
  );
  assert.match(
    validateParentLink(
      { projectId: proj, kind: "TASK" },
      { id: "m1", projectId: proj, kind: "MILESTONE", parentId: "m0" },
    ),
    /dentro de outro marco/,
  );
  assert.equal(validateParentLink({ projectId: proj, kind: "TASK" }, null), null);
});

test("folhas do projeto excluem marco com filhas, mantêm marco isolado e todas as tarefas", () => {
  const rows = [
    { id: "m1", parentId: null },
    { id: "t1", parentId: "m1" },
    { id: "t2", parentId: "m1" },
    { id: "m2", parentId: null },
    { id: "t3", parentId: null },
  ];
  const ids = leafTasks(rows).map((r) => r.id);
  assert.deepEqual(ids.sort(), ["m2", "t1", "t2", "t3"]);
});

test("rollup do marco: status e prazo vêm das filhas, real só quando todas concluídas", () => {
  const open = rollupMilestone([
    task({ status: "IN_PROGRESS", progress: 40, plannedDate: d("2026-09-20"), forecastDate: d("2026-09-25") }),
    task({ status: "NOT_STARTED", progress: 0, plannedDate: d("2026-09-28") }),
  ]);
  assert.equal(open.status, "IN_PROGRESS");
  assert.equal(open.actualDate, null);
  assert.equal(open.forecastDate.toISOString(), d("2026-09-28").toISOString());

  const blocked = rollupMilestone([task({ status: "BLOCKED" }), task({ status: "DONE", progress: 100 })]);
  assert.equal(blocked.status, "BLOCKED");

  const done = rollupMilestone([
    task({ status: "DONE", progress: 100, actualDate: d("2026-09-10") }),
    task({ status: "DONE", progress: 100, actualDate: d("2026-09-15") }),
  ]);
  assert.equal(done.status, "DONE");
  assert.equal(done.progress, 100);
  assert.equal(done.actualDate.toISOString(), d("2026-09-15").toISOString());

  assert.deepEqual(rollupMilestone([]), {
    status: "NOT_STARTED",
    progress: 0,
    forecastDate: null,
    actualDate: null,
  });
});

test("histórico de reprogramação só grava quando havia prazo anterior e ele mudou", () => {
  assert.equal(buildDeadlineChange(null, d("2026-09-20")), null, "primeira gravação não é reprogramação");
  assert.equal(buildDeadlineChange(d("2026-09-20"), d("2026-09-20")), null, "sem mudança não grava");
  assert.equal(buildDeadlineChange(d("2026-09-20"), null), null, "sem novo prazo não grava");
  assert.deepEqual(buildDeadlineChange(d("2026-09-20"), d("2026-09-25")), {
    fromDate: d("2026-09-20"),
    toDate: d("2026-09-25"),
  });
});

/* ------------------------- status Cancelada ------------------------- */

import { isTaskOpen, isPackageType, PACKAGE_TYPE } from "../lib/tasks.ts";

test("Cancelada não é aberta nem atrasa", () => {
  const t = task({ status: "CANCELLED", plannedDate: d("2026-01-01") });
  assert.equal(isTaskOpen(t), false);
  assert.equal(isTaskOverdue(t, NOW), false);
});

test("projectProgress ignora tarefas canceladas", () => {
  const p = projectProgress([
    task({ status: "DONE", progress: 100 }),
    task({ status: "CANCELLED", progress: 0 }),
  ]);
  assert.equal(p, 100);
  assert.equal(projectProgress([task({ status: "CANCELLED" })]), null);
});

test("rollup do marco: filhas canceladas saem; todas canceladas = marco Cancelado", () => {
  const r = rollupMilestone([
    task({ status: "DONE", progress: 100, plannedDate: d("2026-09-01"), actualDate: d("2026-09-02") }),
    task({ status: "CANCELLED", plannedDate: d("2026-12-01") }),
  ]);
  assert.equal(r.status, "DONE");
  assert.equal(r.forecastDate.toISOString().slice(0, 10), "2026-09-01");
  assert.equal(rollupMilestone([task({ status: "CANCELLED" })]).status, "CANCELLED");
});

test("isPackageType", () => {
  assert.equal(isPackageType(PACKAGE_TYPE), true);
  assert.equal(isPackageType("Engenharia"), false);
  assert.equal(isPackageType(null), false);
});
