const { Pool, types } = require('pg');
require('dotenv').config();

// Preserve the value shapes the application was built around with SQLite:
// COUNT()/SUM() come back as numbers and dates/timestamps as strings.
types.setTypeParser(20, (value) => parseInt(value, 10)); // int8 / COUNT()
types.setTypeParser(1700, (value) => parseFloat(value)); // numeric / money
types.setTypeParser(1082, (value) => value); // date
types.setTypeParser(1083, (value) => value); // time
types.setTypeParser(1114, (value) => value); // timestamp without time zone
types.setTypeParser(1184, (value) => value); // timestamp with time zone

// PostgreSQL Database Connection
class PostgreSQLDatabase {
  constructor() {
    this.pool = null;
  }

  connect() {
    if (this.pool) {
      return Promise.resolve(this.pool);
    }

    return new Promise((resolve, reject) => {
      if (!process.env.DATABASE_URL) {
        reject(new Error('DATABASE_URL environment variable is not set'));
        return;
      }

      try {
        // Parse and validate the connection string
        let connectionString = process.env.DATABASE_URL.trim();
        
        // Validate URL format
        if (!connectionString.startsWith('postgresql://') && !connectionString.startsWith('postgres://')) {
          console.error('\n❌ Invalid DATABASE_URL format!');
          console.error('URL must start with postgresql:// or postgres://');
          reject(new Error('Invalid DATABASE_URL format. Must start with postgresql://'));
          return;
        }
        
        // Parse URL to validate components
        try {
          const url = new URL(connectionString);
          if (!url.hostname || url.hostname === 'base' || url.hostname.length < 3) {
            console.error('\n❌ Invalid DATABASE_URL hostname!');
            console.error('Hostname is missing or invalid:', url.hostname);
            console.error('Copy the Neon connection string from the project dashboard.');
            console.error('It should look like: postgresql://user:pass@ep-xxxx.region.aws.neon.tech/dbname?sslmode=require');
            reject(new Error('Invalid DATABASE_URL hostname. Check that you copied the complete Neon connection string.'));
            return;
          }
          
          console.log('✓ DATABASE_URL format validated');
          console.log('  Hostname:', url.hostname);
          console.log('  Database:', url.pathname.replace('/', ''));
        } catch (urlError) {
          console.error('\n❌ Failed to parse DATABASE_URL!');
          console.error('Error:', urlError.message);
          console.error('Make sure the URL is complete and properly formatted');
          reject(new Error('Invalid DATABASE_URL format: ' + urlError.message));
          return;
        }
        
        // node-postgres does not implement channel binding; Neon includes it on some strings.
        connectionString = connectionString
          .replace(/([?&])channel_binding=[^&]*/g, '$1')
          .replace(/\?&/g, '?')
          .replace(/[?&]$/, '');

        const localDatabase = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
        this.pool = new Pool({
          connectionString: connectionString,
          ssl: localDatabase ? false : { rejectUnauthorized: false },
          max: 10, // Enough concurrency without holding Neon compute open
          idleTimeoutMillis: 10000, // Recycle idle sockets before Neon drops them
          connectionTimeoutMillis: 15000,
          keepAlive: true,
          keepAliveInitialDelayMillis: 10000,
          application_name: 'softwarevala-api',
          query_timeout: 60000,
          statement_timeout: 60000
        });

        // Never let an idle client error crash the API (Neon can drop idle sockets).
        this.pool.on('error', (err) => {
          console.error('[PostgreSQL] idle client error:', err.code || '', err.message);
        });

        // Test connection with retry logic
        const testConnection = async (retries = 3) => {
          try {
            const result = await this._query('SELECT NOW() AS now');
            console.log('✓ Connected to PostgreSQL database');
            console.log('✓ Database time:', result.rows[0].now);
            resolve(this.pool);
          } catch (err) {
            console.error('PostgreSQL connection error:', err.message);
            console.error('Error code:', err.code);

            // Provide helpful error messages
            if (err.code === 'ENETUNREACH' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'EADDRNOTAVAIL') {
              console.error('\n❌ PostgreSQL Connection Failed!');
              console.error('Error code:', err.code);
              console.error('Error message:', err.message);
              console.error('\n📋 Common Issues & Solutions:');
              console.error('1. ❌ DATABASE_URL is malformed or incomplete');
              console.error('   ✅ Fix: Copy the Neon connection string for softwarevala-management');
              console.error('   ✅ It should look like: postgresql://user:pass@ep-xxxx.region.aws.neon.tech/softwarevala?sslmode=require');
              console.error('');
              console.error('2. ❌ URL was truncated or partially copied');
              console.error('   ✅ Fix: Include the user, password, host, database name, and sslmode=require');
              console.error('');
              console.error('3. ❌ Neon compute is suspended or the project was paused');
              console.error('   ✅ Fix: Open the Neon project. The first connection wakes the database.\n');
            }

            if (retries > 0 && this._isTransient(err)) {
              console.log(`Retrying connection... (${retries} attempts remaining)`);
              setTimeout(() => testConnection(retries - 1), 2000);
            } else {
              reject(err);
            }
          }
        };
        
        testConnection();
      } catch (error) {
        console.error('PostgreSQL initialization error:', error.message);
        reject(error);
      }
    });
  }

  _isTransient(error) {
    if (!error) return false;
    const code = String(error.code || '');
    if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EADDRNOTAVAIL', 'ENETUNREACH', 'EPIPE', '57P01', '57P02', '57P03'].includes(code)) {
      return true;
    }
    return /connection terminated|connection reset|timeout exceeded when trying to connect|server closed the connection/i.test(String(error.message || ''));
  }

  async _query(text, params = []) {
    if (!this.pool) throw new Error('Database not connected');
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.pool.query(text, params);
      } catch (error) {
        lastError = error;
        if (!this._isTransient(error) || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  async ping() {
    await this._query('SELECT 1');
    return true;
  }

  close() {
    return new Promise((resolve) => {
      if (this.pool) {
        this.pool.end(() => {
          console.log('PostgreSQL connection pool closed');
          this.pool = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // Execute a query and return all rows
  async all(sql, params = []) {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    try {
      // Convert SQLite syntax to PostgreSQL
      const pgSql = this.convertSQLiteToPostgres(sql, params);
      const result = await this._query(pgSql, params);
      return result.rows;
    } catch (err) {
      // If table doesn't exist, return empty array instead of error
      if (err.message && err.message.includes('does not exist')) {
        console.warn(`Table may not exist yet: ${err.message}`);
        console.warn(`Query: ${sql.substring(0, 100)}...`);
        return [];
      }
      console.error('Database all() error:', err.message);
      throw err;
    }
  }

  // Execute a query and return first row
  async get(sql, params = []) {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    try {
      const pgSql = this.convertSQLiteToPostgres(sql);
      const result = await this._query(pgSql, params);
      return result.rows[0] || null;
    } catch (err) {
      // If table doesn't exist, return null instead of error
      if (err.message && err.message.includes('does not exist')) {
        console.warn(`Table may not exist yet: ${err.message}`);
        console.warn(`Query: ${sql.substring(0, 100)}...`);
        return null;
      }
      console.error('Database get() error:', err.message);
      throw err;
    }
  }

  // Execute a query (INSERT, UPDATE, DELETE)
  async run(sql, params = []) {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    const resyncSequenceIfNeeded = async (error, pgSqlText, sqlParams) => {
      const message = error && error.message ? error.message : '';
      if (!message.includes('duplicate key value violates unique constraint')) {
        return null;
      }

      const constraintMatch = message.match(/unique constraint "([^"]+)"/i);
      const constraintName = constraintMatch ? constraintMatch[1] : null;
      if (!constraintName || !constraintName.endsWith('_pkey')) {
        return null;
      }

      const insertMatch = pgSqlText.match(/INSERT\s+INTO\s+([A-Za-z0-9_]+)/i);
      const insertTable = insertMatch ? insertMatch[1] : null;
      if (!insertTable || !/^[A-Za-z0-9_]+$/.test(insertTable)) {
        return null;
      }

      const constraintTable = constraintName.replace(/_pkey$/i, '');
      const tableName = /^[A-Za-z0-9_]+$/.test(constraintTable) ? constraintTable : insertTable;
      const tableToSync = insertTable;

      try {
        await this._query(
          `SELECT setval(pg_get_serial_sequence('${tableToSync}', 'id'), (SELECT COALESCE(MAX(id), 1) FROM ${tableToSync}))`
        );
      } catch (syncErr) {
        // Fallback: handle renamed-table constraints (e.g., users_new_pkey on users table)
        if (tableName !== tableToSync) {
          try {
            await this._query(
              `SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), (SELECT COALESCE(MAX(id), 1) FROM ${tableName}))`
            );
          } catch (fallbackErr) {
            console.error(`❌ Failed to sync sequence for ${tableToSync}/${tableName}:`, fallbackErr.message);
            return null;
          }
        } else {
          console.error(`❌ Failed to sync sequence for ${tableToSync}:`, syncErr.message);
          return null;
        }
      }

      try {
        return await this._query(pgSqlText, sqlParams);
      } catch (retryErr) {
        return null;
      }
    };

    try {
      const pgSql = this.convertSQLiteToPostgres(sql, params);
      
      // Log converted SQL only when DEBUG_SQL=1 (avoid log spam in production)
      if (process.env.DEBUG_SQL === '1' && (sql.toUpperCase().includes('CREATE TABLE') || sql.toUpperCase().includes('INSERT'))) {
        console.log('📝 Original SQL (first 150):', sql.substring(0, 150));
        console.log('📝 Converted SQL (first 150):', pgSql.substring(0, 150));
      }
      
      const result = await this._query(pgSql, params);
      
      // Return format compatible with SQLite
      // For INSERT statements, PostgreSQL returns the inserted row via RETURNING clause
      let lastID = null;
      if (result.rows && result.rows.length > 0) {
        // Try to get id from returned row (PostgreSQL returns via RETURNING)
        lastID = result.rows[0].id || result.rows[0].ID || null;
      }
      
      return {
        lastID: lastID,
        changes: result.rowCount || 0
      };
    } catch (err) {
      const pgSql = this.convertSQLiteToPostgres(sql, params);
      const retryResult = await resyncSequenceIfNeeded(err, pgSql, params);
      if (retryResult) {
        let lastID = null;
        if (retryResult.rows && retryResult.rows.length > 0) {
          lastID = retryResult.rows[0].id || retryResult.rows[0].ID || null;
        }
        return {
          lastID: lastID,
          changes: retryResult.rowCount || 0
        };
      }
      console.error('❌ Database run() error:', err.message);
      if (process.env.DEBUG_SQL === '1') {
        console.error('📝 Original SQL (first 200):', sql.substring(0, 200));
        console.error('📝 Converted SQL (first 200):', this.convertSQLiteToPostgres(sql, params).substring(0, 200));
        console.error('📝 Params:', params);
      }
      throw err;
    }
  }

  // Convert SQLite syntax to PostgreSQL
  convertSQLiteToPostgres(sql, params = []) {
    let pgSql = sql.trim();
    
    // Skip empty statements
    if (!pgSql || pgSql.length < 10) {
      return pgSql;
    }

    // Convert sqlite_master queries FIRST (before parameter conversion)
    // This needs to happen before parameter conversion so we can handle ? placeholders correctly
    if (pgSql.includes('sqlite_master')) {
      // Convert: SELECT name FROM sqlite_master WHERE type='table' AND name=?
      if (pgSql.includes("type='table'") || pgSql.includes('type=\'table\'')) {
        // Check if there's a parameter placeholder (?)
        if (pgSql.includes('name=?')) {
          // Count how many ? placeholders exist before this point to determine the parameter number
          const beforeName = pgSql.substring(0, pgSql.indexOf('name=?'));
          const paramCount = (beforeName.match(/\?/g) || []).length;
          const paramNum = paramCount + 1;
          // Use parameter placeholder - will be converted to $1, $2, etc. later
          pgSql = `SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $${paramNum}`;
        } else {
          // Extract table name if it's a literal value
          const nameMatch = pgSql.match(/name\s*=\s*['"]?(\w+)['"]?/i);
          if (nameMatch) {
            const tableName = nameMatch[1];
            pgSql = `SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tableName}'`;
          } else {
            // Get all tables
            pgSql = `SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public'`;
          }
        }
        return pgSql;
      }
    }

    // Convert SQLite parameter placeholders (?) to PostgreSQL ($1, $2, etc.)
    // This must be done AFTER sqlite_master conversion
    if (pgSql.includes('?')) {
      let paramIndex = 1;
      pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
    }

    // SQLite date/time helpers → PostgreSQL equivalents.
    // Keep relative-interval forms first so date('now', '+N day') is not
    // mistaken for the generic date(expression, '+N day') form.
    const unitMap = {
      day: 'day', days: 'day',
      week: 'week', weeks: 'week',
      month: 'month', months: 'month',
      year: 'year', years: 'year'
    };
    const relative = (_match, amount, unit) =>
      `(CURRENT_DATE + INTERVAL '${amount} ${unitMap[String(unit).toLowerCase()]}')`;

    pgSql = pgSql.replace(
      /date\(\s*'now'\s*,\s*'([+-]?\d+)\s*(day|days|week|weeks|month|months|year|years)'\s*\)/gi,
      relative
    );
    pgSql = pgSql.replace(
      /date\(\s*"now"\s*,\s*'([+-]?\d+)\s*(day|days|week|weeks|month|months|year|years)'\s*\)/gi,
      relative
    );
    pgSql = pgSql.replace(
      /date\(\s*(\$[0-9]+|'[^']*'|[A-Za-z_][\w.]*)\s*,\s*'([+-]?\d+)\s*(day|days|week|weeks|month|months|year|years)'\s*\)/gi,
      (_match, expression, amount, unit) =>
        `(CAST(${expression} AS DATE) + INTERVAL '${amount} ${unitMap[String(unit).toLowerCase()]}')`
    );
    pgSql = pgSql.replace(/\bdate\(\s*'now'\s*\)/gi, 'CURRENT_DATE');
    pgSql = pgSql.replace(/\bdate\(\s*"now"\s*\)/gi, 'CURRENT_DATE');
    pgSql = pgSql.replace(/\bdatetime\(\s*'now'\s*\)/gi, 'NOW()');
    pgSql = pgSql.replace(/\bdatetime\(\s*"now"\s*\)/gi, 'NOW()');
    pgSql = pgSql.replace(/\btime\(\s*'now'\s*\)/gi, 'LOCALTIME');
    pgSql = pgSql.replace(/\btime\(\s*"now"\s*\)/gi, 'LOCALTIME');

    const strftimeParts = {
      Y: 'YEAR', m: 'MONTH', d: 'DAY',
      H: 'HOUR', M: 'MINUTE', S: 'SECOND'
    };
    pgSql = pgSql.replace(
      /strftime\(\s*'%([YmdHMS])'\s*,\s*([^)]+)\)/gi,
      (_match, token, expression) => `EXTRACT(${strftimeParts[token] || strftimeParts[token.toUpperCase()] || 'YEAR'} FROM ${expression})`
    );
    pgSql = pgSql.replace(
      /strftime\(\s*'%Y-%m'\s*,\s*([^)]+)\)/gi,
      (_match, expression) => `to_char(${expression}, 'YYYY-MM')`
    );

    // SQLite-only transaction modifier; plain BEGIN is valid PostgreSQL.
    pgSql = pgSql.replace(/\bBEGIN\s+IMMEDIATE\b/gi, 'BEGIN');

    // PostgreSQL supports IF NOT EXISTS for ADD COLUMN, so startup migrations
    // can rerun safely without relying on error handling.
    pgSql = pgSql.replace(
      /(\bALTER\s+TABLE\s+[\w".]+\s+ADD\s+COLUMN\s+)(?!IF\s+NOT\s+EXISTS\b)/gi,
      '$1IF NOT EXISTS '
    );

    // Convert PRAGMA table_info to PostgreSQL
    if (pgSql.includes('PRAGMA table_info')) {
      const tableName = pgSql.match(/table_info\(['"]?(\w+)['"]?\)/i)?.[1];
      if (tableName) {
        pgSql = `SELECT column_name as name, data_type as type, is_nullable, column_default as dflt_value 
                 FROM information_schema.columns 
                 WHERE table_name = '${tableName}' AND table_schema = 'public'`;
        return pgSql;
      }
    }

    // Skip other PRAGMA statements (they're SQLite-specific)
    if (pgSql.toUpperCase().startsWith('PRAGMA')) {
      return 'SELECT 1 WHERE 1=0'; // Return empty result
    }

    // Convert INSERT OR IGNORE to INSERT ... ON CONFLICT DO NOTHING
    if (pgSql.toUpperCase().includes('INSERT OR IGNORE')) {
      pgSql = pgSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
      if (!/ON CONFLICT/i.test(pgSql)) {
        pgSql = pgSql.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
      }
    }

    // Convert INTEGER PRIMARY KEY AUTOINCREMENT to SERIAL PRIMARY KEY
    // PostgreSQL doesn't support AUTOINCREMENT - use SERIAL instead
    // Must handle patterns in correct order
    
    // Pattern 1: id INTEGER PRIMARY KEY AUTOINCREMENT -> id SERIAL PRIMARY KEY
    // This must come first to match the full pattern with column name
    pgSql = pgSql.replace(/(\w+)\s+INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, '$1 SERIAL PRIMARY KEY');
    
    // Pattern 2: INTEGER PRIMARY KEY AUTOINCREMENT (without column name) -> SERIAL PRIMARY KEY
    pgSql = pgSql.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
    
    // Pattern 3: Remove any remaining standalone AUTOINCREMENT keywords
    // PostgreSQL uses SERIAL or sequences, not AUTOINCREMENT
    pgSql = pgSql.replace(/\s+AUTOINCREMENT\b/gi, '');

    // Convert DATETIME to TIMESTAMP
    pgSql = pgSql.replace(/\bDATETIME\b/gi, 'TIMESTAMP');

    // Convert BOOLEAN DEFAULT 0/1 to BOOLEAN DEFAULT false/true
    pgSql = pgSql.replace(/BOOLEAN\s+DEFAULT\s+0\b/gi, 'BOOLEAN DEFAULT false');
    pgSql = pgSql.replace(/BOOLEAN\s+DEFAULT\s+1\b/gi, 'BOOLEAN DEFAULT true');

    // Convert INTEGER DEFAULT 0/1 for boolean-like columns to BOOLEAN
    // This is more complex, so we'll handle it case by case if needed

    // Convert CURRENT_TIMESTAMP to NOW() (but not in DEFAULT CURRENT_TIMESTAMP which becomes DEFAULT NOW())
    pgSql = pgSql.replace(/\bCURRENT_TIMESTAMP\b/gi, 'NOW()');
    
    // Convert CURRENT_DATE to CURRENT_DATE (PostgreSQL supports this)
    // No change needed

    // Convert SQLite square bracket column names [references] to PostgreSQL double quotes "references"
    // This handles reserved keyword escaping differences between SQLite and PostgreSQL
    pgSql = pgSql.replace(/\[references\]/gi, '"references"');
    pgSql = pgSql.replace(/\[(\w+)\]/g, '"$1"'); // Convert any other [column] to "column"

    // Handle RETURNING clause for INSERT (PostgreSQL feature)
    // Only add if not already present and if it's an INSERT statement
    if (pgSql.toUpperCase().includes('INSERT INTO') && 
        !pgSql.toUpperCase().includes('RETURNING') &&
        !pgSql.toUpperCase().includes('ON CONFLICT')) {
      const insertMatch = pgSql.match(/INSERT\s+INTO\s+(\w+)/i);
      if (insertMatch && pgSql.toUpperCase().includes('VALUES')) {
        // Add RETURNING id at the end (before semicolon if present)
        if (pgSql.endsWith(';')) {
          pgSql = pgSql.slice(0, -1) + ' RETURNING id;';
        } else {
          pgSql += ' RETURNING id';
        }
      }
    }

    return pgSql;
  }
}

module.exports = new PostgreSQLDatabase();

