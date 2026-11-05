import { readFileSync } from "node:fs";
import { parseMppXml, planFromMpp, filterPlan } from "./lib/parse-mpp.ts";

function load(path) {
  const { tasks } = parseMppXml(readFileSync(path, "utf8"));
  return filterPlan(planFromMpp(tasks), ["Projetos"]);
}
const oldP = load("examples/Cronograma Viaduto Tereza Cristina Nova LB.mpp.xml");
const newP = load("examples/Cronograma Viaduto Tereza Cristina Nova LB 26.05.26 2026-09-17.mpp.xml");

console.log("ANTIGO:", oldP.markers.length, "marcos,", oldP.tasks.length, "tarefas");
console.log("NOVO:  ", newP.markers.length, "marcos,", newP.tasks.length, "tarefas");

const key = (t) => t.name;
const oldByName = new Map(oldP.tasks.map((t) => [key(t), t]));
const newByName = new Map(newP.tasks.map((t) => [key(t), t]));

const added = [...newByName.keys()].filter((k) => !oldByName.has(k));
const removed = [...oldByName.keys()].filter((k) => !newByName.has(k));
console.log("\nAdicionadas:", added.length);
for (const n of added) console.log("  + " + n);
console.log("\nRemovidas:", removed.length);
for (const n of removed) console.log("  - " + n);

const fmt = (d) => (d ? d.toISOString().slice(0, 10) : "—");
console.log("\nMudanças de prazo/avanço:");
let changed = 0;
for (const [n, o] of oldByName) {
  const nw = newByName.get(n);
  if (!nw) continue;
  const dateDiff = fmt(o.plannedDate) !== fmt(nw.plannedDate);
  const progDiff = o.progress !== nw.progress;
  if (dateDiff || progDiff) {
    changed++;
    console.log(`  ${n}: prazo ${fmt(o.plannedDate)} -> ${fmt(nw.plannedDate)} | avanço ${o.progress}% -> ${nw.progress}%`);
  }
}
console.log("Total tarefas com mudança:", changed, "de", oldByName.size, "em comum");
console.log("\nMarcos:");
for (const m of newP.markers) console.log(" ", m.name, fmt(m.plannedDate));
