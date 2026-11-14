"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { saveMeasurement, type MeasurementFormState } from "@/app/actions/measurements";
import { Button, Field, inputClass } from "@/components/ui";
import { formatA1 } from "@/lib/documents";
import { formatBRL, itemAmount, parseDecimalBR, round2 } from "@/lib/measurements";

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
  issuedAt: string | null;
  sheetFormat: string | null;
  sheetCount: number;
  a1Eq: number | null;
  a1Price: number | null;
  billable: boolean;
  remainingPercent: number;
  measuredPercent: number;
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
  rows,
  defaults,
  initialSelection = {},
  initialOthers = [],
  submitLabel,
}: {
  clientId: string;
  clientName: string;
  rows: MeasurementFormRow[];
  defaults: {
    measurementId?: string;
    number: string;
    periodLabel: string;
    periodStart: string;
    periodEnd: string;
    issuedAt: string;
    notes: string;
  };
  initialSelection?: Record<string, { percent: string; price: string }>;
  initialOthers?: OtherDraft[];
  submitLabel: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState<MeasurementFormState, FormData>(saveMeasurement, {});
  useEffect(() => {
    if (state.ok && state.measurementId) router.push(`/measurements/${state.measurementId}`);
  }, [state.ok, state.measurementId, state.at, router]);

  const [selected, setSelected] = useState<Record<string, { percent: string; price: string }>>(initialSelection);
  const [others, setOthers] = useState<OtherDraft[]>(initialOthers);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [query, setQuery] = useState("");

  const visible = rows.filter((r) => {
    if (selected[r.revisionId]) return true;
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

  function toggle(r: MeasurementFormRow) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[r.revisionId]) delete next[r.revisionId];
      else
        next[r.revisionId] = {
          percent: String(r.remainingPercent).replace(".", ","),
          price: r.a1Price != null ? String(r.a1Price).replace(".", ",") : "",
        };
      return next;
    });
  }

  const totals = useMemo(() => {
    let a1 = 0;
    let formats = 0;
    for (const r of rows) {
      const s = selected[r.revisionId];
      if (!s || r.a1Eq == null) continue;
      const pct = parseDecimalBR(s.percent) ?? 0;
      const price = parseDecimalBR(s.price) ?? 0;
      a1 += r.a1Eq * (pct / 100);
      formats += itemAmount(r.a1Eq, pct, price);
    }
    const otherTotal = others.reduce(
      (acc, o) => acc + itemAmount(parseDecimalBR(o.qty) ?? 0, 100, parseDecimalBR(o.price) ?? 0),
      0,
    );
    return { a1, formats: round2(formats), others: round2(otherTotal), total: round2(formats + otherTotal) };
  }, [rows, selected, others]);

  return (
    <form action={action} className="space-y-6">
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
              Valor = A1 equivalente × % medido × valor do A1. Revisões seguintes à primeira só aparecem como medíveis
              quando marcadas como mudança de escopo acordada.
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
                  <th className="px-3 py-2">Emissão</th>
                  <th className="px-3 py-2">Formato</th>
                  <th className="px-3 py-2 text-right">A1 eq</th>
                  <th className="px-3 py-2 text-right">Já medido</th>
                  <th className="w-24 px-3 py-2 text-right">% neste BM</th>
                  <th className="w-28 px-3 py-2 text-right">Valor A1</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g[0].projectId} className="border-t border-line">
                  <tr className="bg-canvas/60">
                    <td colSpan={10} className="px-3 py-1.5 text-xs font-semibold text-ink-soft">
                      {g[0].osNumber ? `OS ${g[0].osNumber} · ` : ""}
                      {g[0].projectName}
                      {g[0].a1Price == null ? (
                        <span className="ml-2 font-normal text-orange-700">sem valor do A1 no projeto</span>
                      ) : null}
                    </td>
                  </tr>
                  {g.map((r) => {
                    const s = selected[r.revisionId];
                    const disabled = !s && (!r.billable || r.remainingPercent <= 0 || r.a1Eq == null);
                    const value =
                      s && r.a1Eq != null
                        ? itemAmount(r.a1Eq, parseDecimalBR(s.percent) ?? 0, parseDecimalBR(s.price) ?? 0)
                        : null;
                    return (
                      <tr key={r.revisionId} className={disabled ? "text-ink-faint" : ""}>
                        <td className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            name="revisionId"
                            value={r.revisionId}
                            checked={!!s}
                            disabled={disabled}
                            onChange={() => toggle(r)}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="font-mono text-xs">{r.documentNumber ?? "s/ nº"}</span>
                          <span className="block text-xs text-ink-soft">{r.documentName}</span>
                          {!r.billable ? (
                            <span className="text-[11px] text-orange-700">revisão sem mudança de escopo acordada</span>
                          ) : r.a1Eq == null ? (
                            <span className="text-[11px] text-orange-700">sem formato cadastrado</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs">
                          {r.revisionName}
                          <span className="block font-sans text-[11px] text-ink-faint">{r.revisionStatusLabel}</span>
                        </td>
                        <td className="px-3 py-1.5 text-xs">{fmtDate(r.issuedAt)}</td>
                        <td className="px-3 py-1.5 text-xs">
                          {r.sheetFormat ? `${r.sheetCount} × ${r.sheetFormat}` : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.a1Eq != null ? formatA1(r.a1Eq) : "—"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-xs">
                          {r.measuredPercent > 0 ? `${formatA1(r.measuredPercent)}%` : "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          {s ? (
                            <input
                              name={`pct_${r.revisionId}`}
                              value={s.percent}
                              onChange={(e) =>
                                setSelected((p) => ({ ...p, [r.revisionId]: { ...s, percent: e.target.value } }))
                              }
                              inputMode="decimal"
                              className={small + " text-right"}
                            />
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5">
                          {s ? (
                            <input
                              name={`price_${r.revisionId}`}
                              value={s.price}
                              onChange={(e) =>
                                setSelected((p) => ({ ...p, [r.revisionId]: { ...s, price: e.target.value } }))
                              }
                              inputMode="decimal"
                              className={small + " text-right"}
                            />
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{value != null ? formatBRL(value) : ""}</td>
                      </tr>
                    );
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
