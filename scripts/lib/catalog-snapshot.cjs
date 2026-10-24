// Keep every pg_proc/pg_trigger column in the comparison. Only the failure
// report is bounded; never attach full snapshots as Error actual/expected.
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

function rowsByOid(rows, kind) {
  if (rows !== null && !Array.isArray(rows)) throw new Error(`Invalid ${kind} snapshot`);
  const result = new Map();
  for (const row of rows ?? []) {
    if (!row || !/^\d+$/.test(String(row.oid)) || result.has(String(row.oid))) {
      throw new Error(`Invalid or duplicate ${kind} OID`);
    }
    result.set(String(row.oid), row);
  }
  return result;
}

function brief(value) {
  if (value === undefined) return '<absent>';
  const json = JSON.stringify(value);
  if (json.length <= 80) return json;
  return `<${typeof value} chars=${json.length} sha256=${createHash('sha256').update(json).digest('hex').slice(0, 16)}>`;
}

function assertCatalogSnapshotUnchanged(actual, expected, label = 'existing routines or triggers changed') {
  if (actual === expected) return;
  // JSON.parse's native error can include the input. Do not leak it into CI.
  let before; let after;
  try { before = JSON.parse(expected); after = JSON.parse(actual); }
  catch { throw new Error(`${label}: invalid catalog JSON`); }
  for (const snapshot of [before, after]) {
    if (!snapshot || !isDeepStrictEqual(Object.keys(snapshot).sort(), ['routines', 'triggers'])) {
      throw new Error(`${label}: invalid catalog collections`);
    }
  }
  const lines = []; let changed = 0; let omitted = 0; let characters = 0;
  for (const kind of ['routines', 'triggers']) {
    const oldRows = rowsByOid(before[kind], kind);
    const newRows = rowsByOid(after[kind], kind);
    const oids = [...new Set([...oldRows.keys(), ...newRows.keys()])].sort((a, b) => Number(a) - Number(b));
    if (oldRows.size === 0 && newRows.size === 0 && !isDeepStrictEqual(before[kind], after[kind])) {
      changed++;
      lines.push(`${kind}: empty collection representation changed`);
    }
    for (const oid of oids) {
      const oldRow = oldRows.get(oid); const newRow = newRows.get(oid);
      if (isDeepStrictEqual(oldRow, newRow)) continue;
      changed++;
      const row = newRow ?? oldRow;
      const name = row.proname ?? row.tgname;
      const columns = [...new Set([...Object.keys(oldRow ?? {}), ...Object.keys(newRow ?? {})])]
        .filter(key => !isDeepStrictEqual(oldRow?.[key], newRow?.[key])).sort();
      const status = !oldRow ? 'added' : !newRow ? 'removed' : 'changed';
      const line = `${kind} oid=${oid} name=${brief(name)} ${status} columns=[${columns.join(',')}]`;
      // Added/deleted rows need identity + column names, not their entire values.
      const values = status === 'changed' ? columns.map(key =>
        `  ${key}: ${brief(oldRow[key])} -> ${brief(newRow[key])}`).join('\n') : '';
      const detail = `${line}${values ? `\n${values}` : ''}`;
      if (characters + detail.length > 12000) { omitted++; continue; }
      characters += detail.length;
      lines.push(detail);
    }
  }
  if (changed) {
    if (omitted) lines.push(`${omitted} more changed objects omitted (report limit 12000 characters)`);
    throw new Error(`${label}: ${changed} changed catalog object(s)\n${lines.join('\n')}`);
  }
}

module.exports = { assertCatalogSnapshotUnchanged };
