export function csvCell(value) {
  const text = String(value ?? "");
  const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function createCsv(rows) { return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n"); }
export function downloadCsv(name, rows) {
  const url = URL.createObjectURL(new Blob([createCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeExternalUrl(value) {
  try { const url = new URL(String(value)); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}
