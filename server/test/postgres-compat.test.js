const assert = require('assert');
const pg = require('../config/database-postgres');

const convert = (sql, params = []) => pg.convertSQLiteToPostgres(sql, params);

assert.strictEqual(convert("SELECT date('now') AS d"), 'SELECT CURRENT_DATE AS d');
assert.strictEqual(
  convert("SELECT date('now', '+30 day') AS d"),
  "SELECT (CURRENT_DATE + INTERVAL '+30 day') AS d"
);
assert.strictEqual(
  convert("SELECT date(?, '+7 day') AS d", ['2026-01-01']),
  "SELECT (CAST($1 AS DATE) + INTERVAL '+7 day') AS d"
);
assert.strictEqual(convert('SELECT datetime("now") AS d'), 'SELECT NOW() AS d');
assert.strictEqual(
  convert("SELECT CAST(strftime('%m', s.date_of_birth) AS INTEGER) = ?", [10]),
  'SELECT CAST(EXTRACT(MONTH FROM s.date_of_birth) AS INTEGER) = $1'
);
assert.strictEqual(convert('BEGIN IMMEDIATE'), 'BEGIN');
assert.strictEqual(
  convert('ALTER TABLE users ADD COLUMN nickname TEXT'),
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname TEXT'
);
assert.strictEqual(
  convert('ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname TEXT'),
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname TEXT'
);
assert.ok(convert("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").includes('information_schema.tables'));
assert.ok(convert('INSERT OR IGNORE INTO users (email) VALUES (?)', ['a@b.c']).includes('ON CONFLICT DO NOTHING'));

console.log('postgres compatibility checks passed');
