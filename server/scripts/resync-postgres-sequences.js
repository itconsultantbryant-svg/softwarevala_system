const db = require('../config/database');

const isSafeIdentifier = (value) => /^[A-Za-z0-9_]+$/.test(value);
const isSafeSequence = (value) => /^[A-Za-z0-9_\.]+$/.test(value);

async function resyncPostgresSequences() {
  try {
    await db.connect();

    if (!db.pool) {
      console.log('PostgreSQL is not configured. No sequences to resync.');
      await db.close();
      return;
    }

    const tables = await db.all(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    );

    let updated = 0;
    let skipped = 0;

    for (const table of tables) {
      const tableName = table.tablename;
      if (!isSafeIdentifier(tableName)) {
        skipped += 1;
        continue;
      }

      const sequenceRow = await db.get(
        'SELECT pg_get_serial_sequence(?, ?) AS seq',
        [tableName, 'id']
      );
      const sequenceName = sequenceRow && sequenceRow.seq;

      if (!sequenceName || !isSafeSequence(sequenceName)) {
        skipped += 1;
        continue;
      }

      await db.get(
        `SELECT setval(?::regclass, (SELECT COALESCE(MAX(id), 1) FROM "${tableName}"))`,
        [sequenceName]
      );
      updated += 1;
    }

    console.log('\n✅ Sequence resync complete');
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);

    await db.close();
  } catch (error) {
    console.error('❌ Sequence resync failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    await db.close();
    process.exit(1);
  }
}

resyncPostgresSequences()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
