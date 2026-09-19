import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMppXml, planFromMpp } from "../lib/parse-mpp.ts";

const task = (uid, level, name, o = {}) => `
<Task><UID>${uid}</UID><Name>${name}</Name><OutlineLevel>${level}</OutlineLevel>
<Start>${o.start ?? "2026-03-02"}T09:00:00</Start><Finish>${o.finish ?? "2026-03-10"}T18:00:00</Finish>
<Milestone>${o.ms ? 1 : 0}</Milestone><Summary>${o.sum ? 1 : 0}</Summary>
<PercentComplete>${o.pct ?? 0}</PercentComplete>
<PredecessorLink><PredecessorUID>1</PredecessorUID><Start>1999-01-01T00:00:00</Start></PredecessorLink>
${o.base ? `<Baseline><Number>0</Number><Start>${o.base[0]}T09:00:00</Start><Finish>${o.base[1]}T18:00:00</Finish></Baseline>` : ""}
</Task>`;

const XML = `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><Title>Obra X</Title><Tasks>
${task(1, 1, "OBRA X", { sum: 1 })}
${task(2, 2, "Fundação &amp; Blocos", { sum: 1 })}
${task(3, 3, "Escavação", { start: "2026-03-02", finish: "2026-03-05", pct: 40, base: ["2026-02-20", "2026-03-01"] })}
${task(4, 3, "Encontro 1", { sum: 1 })}
${task(5, 4, "Imprimação")}
${task(6, 4, "Imprimação")}
${task(7, 2, "Drenagem", { sum: 1 })}
${task(8, 3, "Imprimação", { pct: 100 })}
${task(9, 2, "Administração local", { start: "2026-03-01", finish: "2027-03-26" })}
${task(10, 2, "Termo de recebimento", { start: "2027-05-31", finish: "2027-05-31" })}
</Tasks></Project>`;

test("lê tarefas, decodifica entidades e ignora tags de blocos aninhados", () => {
  const { projectName, tasks } = parseMppXml(XML);
  assert.equal(projectName, "Obra X");
  assert.equal(tasks.length, 10);
  assert.equal(tasks[1].name, "Fundação & Blocos");
  assert.equal(tasks[2].start, "2026-03-02");
  assert.equal(tasks[2].baselineFinish, "2026-03-01");
  assert.equal(tasks[2].percentComplete, 40);
});

test("nível 2 vira marco; resumos intermediários viram prefixo do nome", () => {
  const plan = planFromMpp(parseMppXml(XML).tasks);
  assert.deepEqual(plan.markers.map((m) => m.name), ["Fundação & Blocos", "Drenagem", "Termo de recebimento"]);
  const names = plan.tasks.map((t) => [t.parent, t.name]);
  assert.deepEqual(names, [
    ["Fundação & Blocos", "Escavação"],
    ["Fundação & Blocos", "Encontro 1 › Imprimação"],
    ["Fundação & Blocos", "Encontro 1 › Imprimação (2)"],
    ["Drenagem", "Imprimação"],
    [null, "Administração local"],
  ]);
});

test("por padrão as datas atuais são a linha de base; avanço define o status", () => {
  const t = planFromMpp(parseMppXml(XML).tasks).tasks;
  assert.equal(t[0].plannedDate.toISOString().slice(0, 10), "2026-03-05");
  assert.equal(t[0].forecastDate, null);
  assert.equal(t[0].status, "IN_PROGRESS");
  assert.equal(t[0].progress, 40);
  assert.equal(t[3].status, "DONE");
});

test("--linha-base-mpp: planejado = baseline 0, previsto = datas atuais", () => {
  const t = planFromMpp(parseMppXml(XML).tasks, { useMppBaseline: true }).tasks;
  assert.equal(t[0].startDate.toISOString().slice(0, 10), "2026-02-20");
  assert.equal(t[0].plannedDate.toISOString().slice(0, 10), "2026-03-01");
  assert.equal(t[0].forecastDate.toISOString().slice(0, 10), "2026-03-05");
});
