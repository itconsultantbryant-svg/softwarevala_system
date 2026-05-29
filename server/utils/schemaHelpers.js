/**
 * Helpers for idempotent schema migrations (SQLite + PostgreSQL).
 */

function isIgnorableSchemaError(err) {
  const msg = ((err && err.message) || '').toLowerCase();
  return (
    msg.includes('duplicate column') ||
    msg.includes('already exists') ||
    msg.includes('42701') ||
    msg.includes('no such table: information_schema')
  );
}

/**
 * @param {object} db - database module
 * @param {string} tableName - allowlisted table name only
 */
async function getTableColumnNames(db, tableName) {
  const safe = /^[a-z_][a-z0-9_]*$/i.test(tableName);
  if (!safe) return [];

  if (process.env.DATABASE_URL) {
    try {
      const rows = await db.all(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ?`,
        [tableName]
      );
      return rows.map((r) => r.column_name || r.COLUMN_NAME).filter(Boolean);
    } catch (e) {
      if (!isIgnorableSchemaError(e)) {
        console.warn(`Could not read columns for ${tableName}:`, e.message);
      }
      return [];
    }
  }

  try {
    const rows = await db.all(`PRAGMA table_info(${tableName})`);
    return rows.map((r) => r.name).filter(Boolean);
  } catch (e) {
    console.warn(`PRAGMA table_info(${tableName}) failed:`, e.message);
    return [];
  }
}

async function addColumnIfMissing(db, tableName, columnName, sqlDefinition) {
  const columns = await getTableColumnNames(db, tableName);
  if (columns.includes(columnName)) return false;
  try {
    await db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlDefinition}`);
    return true;
  } catch (e) {
    if (!isIgnorableSchemaError(e)) throw e;
    return false;
  }
}

module.exports = {
  isIgnorableSchemaError,
  getTableColumnNames,
  addColumnIfMissing
};
