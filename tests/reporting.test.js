import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, createCsv, safeExternalUrl } from "../src/lib/reporting.js";

test("CSV exports quote multiline values and escape quotes", () => {
  assert.equal(csvCell('A "quoted"\nname'), '"A ""quoted""\nname"');
  assert.ok(createCsv([["Name", "Status"], ["Rotondwa", "done"]]).startsWith('\uFEFF"Name","Status"\r\n'));
});
test("CSV exports neutralize spreadsheet formula injection", () => {
  for (const value of ['=HYPERLINK("bad")', '+1+1', '-1+1', '@SUM(A1)', '  =1+1', '\t=1+1']) assert.ok(csvCell(value).startsWith('"\''));
});
test("resource links accept HTTPS without embedded credentials", () => {
  assert.equal(safeExternalUrl("https://example.com/docs"), "https://example.com/docs");
  for (const value of ["javascript:alert(1)", "data:text/html,test", "http://example.com", "https://user:password@example.com", "/relative", "invalid"]) assert.equal(safeExternalUrl(value), null);
});
