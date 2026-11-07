import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SHEET_FORMATS,
  SHEET_FORMAT_A1,
  a1Equivalent,
  formatA1,
  parseSheetCount,
  parseSheetFormat,
  sumA1Equivalent,
} from "../lib/documents.ts";

test("A1 equivalente de cada formato", () => {
  assert.deepEqual(SHEET_FORMATS, ["A4", "A3", "A2", "A1", "A0"]);
  assert.deepEqual(SHEET_FORMAT_A1, { A4: 0.125, A3: 0.25, A2: 0.5, A1: 1, A0: 2 });
  assert.equal(a1Equivalent("A3"), 0.25);
  assert.equal(a1Equivalent(null), null);
});

test("cada formato tem o dobro da área do anterior", () => {
  for (let i = 1; i < SHEET_FORMATS.length; i++) {
    assert.equal(SHEET_FORMAT_A1[SHEET_FORMATS[i]], 2 * SHEET_FORMAT_A1[SHEET_FORMATS[i - 1]]);
  }
});

test("lê o formato do formulário ou da planilha", () => {
  assert.equal(parseSheetFormat("a1"), "A1");
  assert.equal(parseSheetFormat(" A0 "), "A0");
  assert.equal(parseSheetFormat(""), null);
  assert.equal(parseSheetFormat("A5"), null);
  assert.equal(parseSheetFormat(undefined), null);
});

test("soma em A1 equivalente ignora quem não tem formato", () => {
  const r = sumA1Equivalent([
    { sheetFormat: "A0" },
    { sheetFormat: "A1" },
    { sheetFormat: "A4" },
    { sheetFormat: null },
    {},
  ]);
  assert.deepEqual(r, { total: 3.125, withFormat: 3, missing: 2 });
});

test("formato pt-BR sem zeros à direita", () => {
  assert.equal(formatA1(0.125), "0,125");
  assert.equal(formatA1(2), "2");
  assert.equal(formatA1(12.5), "12,5");
});

test("A1 equivalente multiplica pela quantidade de folhas", () => {
  assert.equal(a1Equivalent("A4", 12), 1.5);
  assert.equal(a1Equivalent("A1", 3), 3);
  assert.equal(a1Equivalent("A0", 0), 2); // quantidade inválida conta como 1
  const r = sumA1Equivalent([
    { sheetFormat: "A4", sheetCount: 12 },
    { sheetFormat: "A1", sheetCount: 1 },
    { sheetFormat: null, sheetCount: 5 },
  ]);
  assert.deepEqual(r, { total: 2.5, withFormat: 2, missing: 1 });
});

test("lê a quantidade de folhas do formulário", () => {
  assert.equal(parseSheetCount("12"), 12);
  assert.equal(parseSheetCount(""), 1);
  assert.equal(parseSheetCount("0"), 1);
  assert.equal(parseSheetCount("2.5"), 1);
  assert.equal(parseSheetCount("abc"), 1);
});
