"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, Split, X } from "lucide-react";
import { saveMeasurement, type MeasurementFormState } from "@/app/actions/measurements";
import { Button, Field, inputClass } from "@/components/ui";
import { formatA1 } from "@/lib/documents";
import { formatBRL, itemAmount, lineShare, parseDecimalBR, round2, suggestLine } from "@/lib/measurements";

/** Revisão disponível para o BM, já serializável (datas em ISO). */
export interface MeasurementFormRow {
  revisionId: string;
  projectId: string;
  projectName: string;
  osNumber: string | null;
  documentNumber: string | null;
  documentName: string;
  revisionName: string;
  revisionStatusLabel: string;
  /** Rascunho sem pacote: ainda não entregue, não entra no BM. */
  inProduction: boolean;
  issuedAt: string | null;
  sheetFormat: string | null;
  sheetCount: number;
  a1Eq: number | null;
  a1Price: number | null;
  billable: boolean;
  remainingPercent: number;
  measuredPercent: number;
  /** Especialista da revisão ou responsável do documento. */
  defaultAssignee: string | null;
}

/**
 * Linha de formato do BM: o que o usuário ajusta antes de gravar. Uma
 * revisão pode ter várias linhas — documento dividido entre projetistas,
 * cada um com as suas folhas.
 */
export interface FormatLine {
  key: string;
  revisionId: string;
  /** Folhas medidas nesta linha (até as do documento). */
  sheets: string;
  percent: string;
  price: string;
  /** Data de execução (envio ao contratante), em AAAA-MM-DD. */
  date: string;
  /** Projetista/pessoa a quem as folhas vão. */
  assignee: string;
}

export interface OtherDraft {
  description: string;
  qty: string;
  unit: string;
  price: string;
}

const small = inputClass + " py-1 text-sm";
const BLANK_OTHER: OtherDraft = { description: "", qty: "1", unit: "vb", price: "" };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando..." : label}
    </Button>
  );
}

let seqKey = 0;
const newKey = () => `n${Date.now().toString(36)}${(seqKey++).toString(36)}`;
const br = (n: number) => String(n).replace(".", ",");

function sheetsOf(l: FormatLine): number {
  const n = Number(l.sheets);
  return Number.isFinite(n) ? n : 0;
}

/** Fatia (em %) que as linhas do formulário tiram do documento. */
function formShare(lines: FormatLine[], docSheets: number): number {
  return lines.reduce((a, l) => a + lineShare(parseDecimalBR(l.percent) ?? 0, sheetsOf(l), docSheets), 0);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(iso));
}

/**
 * Montagem do BM: escolha das revisões do cliente (com % medido e valor do
 * A1 editáveis por linha) e lançamentos avulsos em "Outros". O total é
 * calculado aqui só para conferência; o servidor recalcula e valida tudo.
 */
export function MeasurementForm({
  clientId,
  clientName,
  orgIssuer,
  rows,
  assignees,
  defaults,
  initialLines = [],
  initialOthers = [],
  submitLabel,
}: {
  clientId: string;
  clientName: string;
  /** Emissor padrão do workspace, mostrado como sugestão nos campos do BM. */
  orgIssuer: { name: string; taxId: string | null };
  rows: MeasurementFormRow[];
  /** Nomes sugeridos para "Projetista" (usuários + pessoas já indicadas). */
  assignees: string[];
  defaults: {
    measurementId?: string;
    number: string;
    issuerName: string;
    issuerTaxId: string;
    periodLabel: string;
    periodStart: string;
    periodEnd: string;
    issuedAt: string;
    notes: string;
  };
  initialLines?: FormatLine[];
  initialOthers?: OtherDraft[];
  submitLabel: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState<MeasurementFormState, FormData>(saveMeasurement, {});
  useEffect(() => {
    if (state.ok && state.measurementId) router.push(`/measurements/${state.measurementId}`);
  }, [state.ok, state.measurementId, state.at, router]);

  const [lines, setLines] = useState<FormatLine[]>(initialLines);
  const [others, setOthers] = useState<OtherDraft[]>(initialOthers);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [query, setQuery] = useState("");

  const byRev = useMemo(() => {
    const map = new Map<string, FormatLine[]>();
    for (const l of lines) {
      if (!map.has(l.revisionId)) map.set(l.revisionId, []);
      map.get(l.revisionId)!.push(l);
    }
    return map;
  }, [lines]);

  const visible = rows.filter((r) => {
    if (byRev.has(r.revisionId)) return true;
    if (onlyOpen && (!r.billable || r.remainingPercent <= 0)) return false;
    if (query) {
      const q = query.toLowerCase();
      return [r.documentNumber, r.documentName, r.projectName, r.osNumber].some((v) => v?.toLowerCase().includes(q));
    }
    return true;
  });

  const groups = useMemo(() => {
    const map = new Map<string, MeasurementFormRow[]>();
    for (const r of visible) {
      const k = r.projectId;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.values()];
  }, [visible]);

  function lineFor(r: MeasurementFormRow, sheets: number, percent: number, assignee: string): FormatLine {
    return {
      key: newKey(),
      revisionId: r.revisionId,
      sheets: String(sheets),
      percent: br(percent),
      price: r.a1Price != null ? br(r.a1Price) : "",
      date: r.issuedAt ? r.issuedAt.slice(0, 10) : "",
      assignee,
    };
  }

  function toggle(r: MeasurementFormRow) {
    setLines((prev) => {
      if (prev.some((l) => l.revisionId === r.revisionId)) return prev.filter((l) => l.revisionId !== r.revisionId);
      const s = suggestLine(r.sheetCount, r.remainingPercent);
      return [...prev, lineFor(r, s.sheets, s.percent, r.defaultAssignee ?? "")];
    });
  }

  /**
   * Divide o documento: se ainda há saldo, a linha nova leva o que sobra;
   * senão tira metade das folhas da última linha (doc de 1 folha: metade do %).
   */
  function split(r: MeasurementFormRow) {
    setLines((prev) => {
      const mine = prev.filter((l) => l.revisionId === r.revisionId);
      const last = mine[mine.length - 1];
      if (!last) return prev;
      const rest = r.remainingPercent - formShare(mine, r.sheetCount);
      let updated = last;
      let added: FormatLine;
      if (rest > 0.01) {
        const s = suggestLine(r.sheetCount, rest);
        added = lineFor(r, s.sheets, s.percent, "");
      } else if (sheetsOf(last) > 1) {
        const n = sheetsOf(last);
        const half = Math.floor(n / 2);
        updated = { ...last, sheets: String(n - half) };
        added = { ...lineFor(r, half, parseDecimalBR(last.percent) ?? 100, ""), price: last.price, date: last.date };
      } else {
        const pct = parseDecimalBR(last.percent) ?? 100;
        const a = round2(pct / 2);
        updated = { ...last, percent: br(round2(pct - a)) };
        added = { ...lineFor(r, sheetsOf(last) || 1, a, ""), price: last.price, date: last.date };
      }
      const out: FormatLine[] = [];
      for (const l of prev) {
        out.push(l.key === last.key ? updated : l);
        if (l.key === last.key) out.push(added);
      }
      return out;
    });
  }

  function patch(key: string, change: Partial<FormatLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...change } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const rowById = useMemo(() => new Map(rows.map((r) => [r.revisionId, r])), [rows]);

  function lineValue(l: FormatLine, r: MeasurementFormRow): number | null {
    if (r.a1Eq == null || !r.sheetCount) return null;
    const a1 = (r.a1Eq / r.sheetCount) * sheetsOf(l);
    return itemAmount(a1, parseDecimalBR(l.percent) ?? 0, parseDecimalBR(l.price) ?? 0);
  }

  const totals = useMemo(() => {
    let a1 = 0;
    let formats = 0;
    for (const l of lines) {
      const r = rowById.get(l.revisionId);
      if (!r || r.a1Eq == null || !r.sheetCount) continue;
      const pct = parseDecimalBR(l.percent) ?? 0;
      const lineA1 = (r.a1Eq / r.sheetCount) * sheetsOf(l);
      a1 += lineA1 * (pct / 100);
      formats += itemAmount(lineA1, pct, parseDecimalBR(l.price) ?? 0);
    }
    const otherTotal = others.reduce(
      (acc, o) => acc + itemAmount(parseDecimalBR(o.qty) ?? 0, 100, parseDecimalBR(o.price) ?? 0),
      0,
    );
    return { a1, formats: round2(formats), others: round2(otherTotal), total: round2(formats + otherTotal) };
  }, [lines, rowById, others]);

  return (
    <form action={action} className="space-y-6">
      <datalist id="measurement-assignees">
        {assignees.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {defaults.measurementId ? <input type="hidden" name="measurementId" value={defaults.measurementId} /> : null}
      <input type="hidden" name="clientId" value={clientId} />

      <div className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-3">
        <Field label="Cliente">
          <input value={clientName} readOnly className={inputClass + " bg-canvas"} />
        </Field>
        <Field label="Número do BM" hint="A revisão (R00, R01...) é controlada à parte.">
          <input name="number" required defaultValue={defaults.number} className={inputClass} />
        </Field>
        <Field label="Data de emissão">
          <input name="issuedAt" type="date" required defaultValue={defaults.issuedAt} className={inputClass} />
        </Field>
        <Field label="Período (texto do BM)">
          <input
            name="periodLabel"
            required
            defaultValue={defaults.periodLabel}
            placeholder="MEDIÇÃO OUT-NOV 2026"
            className={inputClass}
          />
        </Field>
        <Field label="Início do período">
          <input name="periodStart" type="date" defaultValue={defaults.periodStart} className={inputClass} />
        </Field>
        <Field label="Fim do período">
          <input name="periodEnd" type="date" defaultValue={defaults.periodEnd} className={inputClass} />
        </Field>
        <Field
          label="Emissor (razão social)"
          hint={`Em branco: ${orgIssuer.name}, o padrão do workspace.`}
        >
          <input
            name="issuerName"
            defaultValue={defaults.issuerName}
            placeholder={orgIssuer.name}
            className={inputClass}
          />
        </Field>
        <Field label="CPF/CNPJ do emissor" hint="Só vale com a razão social preenchida ao lado.">
          <input
            name="issuerTaxId"
            defaultValue={defaults.issuerTaxId}
            placeholder={orgIssuer.taxId ?? "—"}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-3">
          <Field label="Observações (saem no BM)">
            <input name="notes" defaultValue={defaults.notes} className={inputClass} />
          </Field>
        </div>
      </div>

      <section className="rounded-lg border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Documentos (formatos)</h2>
            <p className="text-xs text-ink-faint">
              Valor = A1 equivalente das folhas medidas × % × valor do A1. Reduza as folhas para cobrar menos que o
              documento inteiro, ou use <b>Dividir</b> para repartir um doc casado entre projetistas — cada linha com
              as suas folhas e a sua pessoa (o BM do contratante junta as linhas de novo). A data de execução é a do
              envio ao contratante; quando o documento foi cadastrado sem ela, digite aqui. Revisões seguintes à
              primeira só são medíveis quando marcadas como mudança de escopo acordada.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar documento ou projeto"
              className={small + " w-56"}
            />
            <label className="flex items-center gap-1.5 text-xs text-ink-soft">
              <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
              só com saldo a medir
            </label>
          </div>
        </div>

        {groups.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-faint">
            Nenhum documento com saldo a medir nos projetos deste cliente.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left text-xs uppercase tracking-wider text-ink-faint">
                <tr>
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2">Documento</th>
                  <th className="px-3 py-2">Rev.</th>
                  <th className="w-32 px-3 py-2">Data exec.</th>
                  <th className="px-3 py-2">Formato</th>
                  <th className="px-3 py-2 text-right">Já medido</th>
                  <th className="w-20 px-3 py-2 text-right">Folhas</th>
                  <th className="w-20 px-3 py-2 text-right">%</th>
                  <th className="w-28 px-3 py-2 text-right">Valor A1</th>
                  <th className="w-44 px-3 py-2">Projetista</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="w-20 px-2 py-2" />
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g[0].projectId} className="border-t border-line">
                  <tr className="bg-canvas/60">
                    <td colSpan={12} className="px-3 py-1.5 text-xs font-semibold text-ink-soft">
                      {g[0].osNumber ? `OS ${g[0].osNumber} · ` : ""}
                      {g[0].projectName}
                      {g[0].a1Price == null ? (
                        <span className="ml-2 font-normal text-orange-700">sem valor do A1 no projeto</span>
                      ) : null}
                    </td>
                  </tr>
                  {g.map((r) => {
                    const mine = byRev.get(r.revisionId) ?? [];
                    const on = mine.length > 0;
                    const disabled = !on && (!r.billable || r.remainingPercent <= 0 || r.a1Eq == null);
                    const share = on ? formShare(mine, r.sheetCount) : 0;
                    const over = on && share > r.remainingPercent + 0.01;
                    const sheetsUsed = mine.reduce((a, l) => a + sheetsOf(l), 0);
                    const docCells = (
                      <>
                        <td className="px-3 py-1.5 align-top">
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={disabled}
                            onChange={() => toggle(r)}
                            aria-label={`Medir ${r.documentNumber ?? r.documentName}`}
                          />
                        </td>
                        <td className="px-3 py-1.5 align-top">
                          <span className="font-mono text-xs">{r.documentNumber ?? "s/ nº"}</span>
                          <span className="block text-xs text-ink-soft">{r.documentName}</span>
                          {r.inProduction && !on ? (
                            <span className="text-[11px] text-orange-700">em produção — mede depois de emitido</span>
                          ) : !r.billable ? (
                            <span className="text-[11px] text-orange-700">revisão sem mudança de escopo acordada</span>
                          ) : r.a1Eq == null ? (
                            <span className="text-[11px] text-orange-700">sem formato cadastrado</span>
                          ) : null}
                          {over ? (
                            <span className="block text-[11px] text-red-700">
                              linhas somam {br(round2(share))}% do documento; saldo {br(r.remainingPercent)}%
                            </span>
                          ) : mine.length > 1 ? (
                            <span className="block text-[11px] text-ink-faint">
                              dividido em {mine.length} · {sheetsUsed} de {r.sheetCount} folhas
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5 align-top font-mono text-xs">
                          {r.revisionName}
                          <span className="block font-sans text-[11px] text-ink-faint">{r.revisionStatusLabel}</span>
                        </td>
                      </>
                    );
                    const infoCells = (
                      <>
                        <td className="px-3 py-1.5 align-top text-xs">
                          {r.sheetFormat ? `${r.sheetCount} × ${r.sheetFormat}` : "—"}
                          {r.a1Eq != null ? (
                            <span className="block text-[11px] text-ink-faint">{formatA1(r.a1Eq)} A1 eq</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5 text-right align-top tabular-nums text-xs">
                          {r.measuredPercent > 0 ? `${formatA1(r.measuredPercent)}%` : "—"}
                        </td>
                      </>
                    );
                    if (!on) {
                      return (
                        <tr key={r.revisionId} className={"border-t border-line" + (disabled ? " text-ink-faint" : "")}>
                          {docCells}
                          <td className="px-3 py-1.5 align-top text-xs">{fmtDate(r.issuedAt)}</td>
                          {infoCells}
                          <td colSpan={6} />
                        </tr>
                      );
                    }
                    return mine.map((l, idx) => {
                      const value = lineValue(l, r);
                      const badSheets = !Number.isInteger(sheetsOf(l)) || sheetsOf(l) < 1 || sheetsOf(l) > r.sheetCount;
                      return (
                        <tr key={l.key} className={idx > 0 ? "bg-canvas/30" : "border-t border-line"}>
                          {idx === 0 ? (
                            docCells
                          ) : (
                            <>
                              <td />
                              <td className="px-3 py-1.5 text-[11px] text-ink-faint" colSpan={2}>
                                ↳ mesma revisão, outra parte
                              </td>
                            </>
                          )}
                          <td className="px-3 py-1.5 align-top text-xs">
                            <input type="hidden" name="lineRevisionId" value={r.revisionId} />
                            <input
                              type="date"
                              name="lineDate"
                              value={l.date}
                              onChange={(e) => patch(l.key, { date: e.target.value })}
                              className={small + (l.date ? "" : " border-orange-300")}
                            />
                          </td>
                          {idx === 0 ? infoCells : <td colSpan={2} />}
                          <td className="px-3 py-1.5 align-top">
                            <input
                              name="lineSheets"
                              value={l.sheets}
                              onChange={(e) => patch(l.key, { sheets: e.target.value.replace(/\D/g, "") })}
                              inputMode="numeric"
                              title={`Folhas desta linha (o documento tem ${r.sheetCount})`}
                              className={small + " text-right" + (badSheets ? " border-red-400" : "")}
                            />
                          </td>
                          <td className="px-3 py-1.5 align-top">
                            <input
                              name="linePct"
                              value={l.percent}
                              onChange={(e) => patch(l.key, { percent: e.target.value })}
                              inputMode="decimal"
                              className={small + " text-right"}
                            />
                          </td>
                          <td className="px-3 py-1.5 align-top">
                            <input
                              name="linePrice"
                              value={l.price}
                              onChange={(e) => patch(l.key, { price: e.target.value })}
                              inputMode="decimal"
                              className={small + " text-right"}
                            />
                          </td>
                          <td className="px-3 py-1.5 align-top">
                            <input
                              name="lineAssignee"
                              value={l.assignee}
                              onChange={(e) => patch(l.key, { assignee: e.target.value })}
                              list="measurement-assignees"
                              onFocus={(e) => e.currentTarget.select()}
                              placeholder="Quem fez"
                              className={small}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right align-top tabular-nums">
                            {value != null ? formatBRL(value) : ""}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 align-top">
                            {idx === mine.length - 1 ? (
                              <button
                                type="button"
                                onClick={() => split(r)}
                                title="Dividir as folhas com outro projetista"
                                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                              >
                                <Split size={13} /> Dividir
                              </button>
                            ) : null}
                            {mine.length > 1 ? (
                              <button
                                type="button"
                                aria-label="Remover esta parte"
                                onClick={() => removeLine(l.key)}
                                className="ml-1 align-middle text-ink-faint hover:text-red-600"
                              >
                                <X size={14} />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Outros</h2>
            <p className="text-xs text-ink-faint">Serviços fora de formato: HH, visita de campo, valor fixo.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => setOthers((o) => [...o, { ...BLANK_OTHER }])}>
            <Plus size={14} /> Adicionar
          </Button>
        </div>
        {others.length === 0 ? (
          <p className="text-xs text-ink-faint">Nenhum item.</p>
        ) : (
          <div className="space-y-2">
            {others.map((o, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_70px_120px_110px_32px] items-center gap-2">
                <input
                  name="otherDescription"
                  value={o.description}
                  placeholder="Descrição"
                  onChange={(e) => setOthers((l) => l.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                  className={small}
                />
                <input
                  name="otherQty"
                  value={o.qty}
                  inputMode="decimal"
                  placeholder="Qtd."
                  onChange={(e) => setOthers((l) => l.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
                  className={small + " text-right"}
                />
                <input
                  name="otherUnit"
                  value={o.unit}
                  placeholder="un"
                  onChange={(e) => setOthers((l) => l.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))}
                  className={small}
                />
                <input
                  name="otherPrice"
                  value={o.price}
                  inputMode="decimal"
                  placeholder="R$ unitário"
                  onChange={(e) => setOthers((l) => l.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                  className={small + " text-right"}
                />
                <span className="text-right text-sm tabular-nums">
                  {formatBRL(itemAmount(parseDecimalBR(o.qty) ?? 0, 100, parseDecimalBR(o.price) ?? 0))}
                </span>
                <button
                  type="button"
                  aria-label="Remover"
                  onClick={() => setOthers((l) => l.filter((_, j) => j !== i))}
                  className="text-ink-faint hover:text-red-600"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-surface px-5 py-3 shadow-sm">
        <div className="flex flex-wrap gap-6 text-sm">
          <span>
            <span className="text-ink-faint">A1 eq medido </span>
            <b className="tabular-nums">{formatA1(Math.round(totals.a1 * 10000) / 10000)}</b>
          </span>
          <span>
            <span className="text-ink-faint">Formatos </span>
            <b className="tabular-nums">{formatBRL(totals.formats)}</b>
          </span>
          <span>
            <span className="text-ink-faint">Outros </span>
            <b className="tabular-nums">{formatBRL(totals.others)}</b>
          </span>
          <span>
            <span className="text-ink-faint">Total </span>
            <b className="tabular-nums text-accent">{formatBRL(totals.total)}</b>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
          <Submit label={submitLabel} />
        </div>
      </div>
    </form>
  );
}
