const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Check if PostgreSQL is configured
const USE_POSTGRESQL = !!process.env.DATABASE_URL;

// Use absolute path resolution to ensure consistency
// Always use the root database/pms.db to avoid data loss
const DB_PATH = process.env.DB_PATH 
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, '../../database/pms.db');

// Log the resolved database path for debugging
if (!USE_POSTGRESQL) {
  console.log('Database path resolved to:', DB_PATH);
  console.log('Using SQLite database (for PostgreSQL, set DATABASE_URL environment variable)');
} else {
  console.log('Using PostgreSQL database (DATABASE_URL detected)');
}

class Database {
  constructor() {
    this.db = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      // Ensure database directory exists
      const dbDir = path.dirname(DB_PATH);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log('Created database directory:', dbDir);
      }

      this.db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          console.error('Database connection error:', err.message);
          console.error('Database path:', DB_PATH);
          reject(err);
        } else {
          console.log('Connected to SQLite database:', DB_PATH);
          // Enable foreign keys
          this.db.run('PRAGMA foreign_keys = ON');
          
          // Enable WAL mode for better concurrency and data persistence
          this.db.run('PRAGMA journal_mode = WAL', (walErr) => {
            if (walErr) {
              console.warn('Warning: Could not enable WAL mode:', walErr.message);
            } else {
              console.log('✓ WAL mode enabled for better data persistence');
            }
          });
          
          // Set synchronous mode to NORMAL for better performance (still safe with WAL)
          this.db.run('PRAGMA synchronous = NORMAL', (syncErr) => {
            if (syncErr) {
              console.warn('Warning: Could not set synchronous mode:', syncErr.message);
            } else {
              console.log('✓ Synchronous mode set to NORMAL for optimal performance');
            }
          });
          
          // Set busy timeout to handle locked database situations (increased to 10 seconds)
          this.db.run('PRAGMA busy_timeout = 10000', (timeoutErr) => {
            if (timeoutErr) {
              console.warn('Warning: Could not set busy timeout:', timeoutErr.message);
            } else {
              console.log('✓ Busy timeout set to 10 seconds');
            }
          });
          
          // Ensure immediate writes
          this.db.run('PRAGMA cache_size = -64000', (cacheErr) => {
            if (cacheErr) {
              console.warn('Warning: Could not set cache size:', cacheErr.message);
            }
          });
          
          // Force a checkpoint on connection to ensure data is persisted
          this.db.run('PRAGMA wal_checkpoint(TRUNCATE)', (checkpointErr) => {
            if (checkpointErr && !checkpointErr.message.includes('database is locked')) {
              console.warn('Initial checkpoint warning:', checkpointErr.message);
            } else {
              console.log('✓ Initial WAL checkpoint completed - data persisted');
            }
          });
          
          resolve(this.db);
        }
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        // Perform a final WAL checkpoint to ensure all data is written to disk
        this.db.run('PRAGMA wal_checkpoint(TRUNCATE)', (checkpointErr) => {
          if (checkpointErr && !checkpointErr.message.includes('database is locked')) {
            console.warn('Final checkpoint warning:', checkpointErr.message);
          } else {
            console.log('✓ Final WAL checkpoint completed');
          }
          // Close the database connection
          this.db.close((err) => {
            if (err) {
              console.error('Error closing database:', err.message);
              reject(err);
            } else {
              console.log('Database connection closed gracefully');
              this.db = null;
              resolve();
            }
          });
        });
      } else {
        resolve();
      }
    });
  }

  // Execute a query and return all rows
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          // If table doesn't exist, return empty array instead of error
          if (err.message && err.message.includes('no such table')) {
            console.warn(`Table may not exist yet: ${err.message}`);
            console.warn(`Query: ${sql.substring(0, 100)}...`);
            resolve([]);
          } else {
            console.error('Database all() error:', err.message);
            reject(err);
          }
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Execute a query and return first row
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }
      this.db.get(sql, params, (err, row) => {
        if (err) {
          // If table doesn't exist, return null instead of error
          if (err.message && err.message.includes('no such table')) {
            console.warn(`Table may not exist yet: ${err.message}`);
            console.warn(`Query: ${sql.substring(0, 100)}...`);
            resolve(null);
          } else {
            console.error('Database get() error:', err.message);
            reject(err);
          }
        } else {
          resolve(row);
        }
      });
    });
  }

  // Execute a query (INSERT, UPDATE, DELETE)
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }
      const dbInstance = this.db; // Capture db instance for use in callback
      this.db.run(sql, params, function(err) {
        if (err) {
          const msg = (err.message || '').toLowerCase();
          const isIdempotentSchema =
            msg.includes('duplicate column') ||
            msg.includes('already exists');
          if (!isIdempotentSchema) {
            console.error('Database run error:', err.message);
            console.error('SQL:', sql.substring(0, 200));
            console.error('Params:', params);
            console.error('Error code:', err.code);
          }
          reject(err);
        } else {
          // Force immediate checkpoint for critical operations to ensure data persistence
          // This ensures data is written to disk immediately for important operations
          if (sql.trim().toUpperCase().startsWith('INSERT') || sql.trim().toUpperCase().startsWith('UPDATE')) {
            // Use setImmediate to checkpoint asynchronously without blocking
            setImmediate(() => {
              if (dbInstance) {
                dbInstance.run('PRAGMA wal_checkpoint(PASSIVE)', (checkpointErr) => {
                  if (checkpointErr && !checkpointErr.message.includes('database is locked')) {
                    console.warn('Checkpoint warning after write:', checkpointErr.message);
                  }
                });
              }
            });
          }
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }
}

// Export appropriate database instance
let dbInstance;

if (USE_POSTGRESQL) {
  // Use PostgreSQL if DATABASE_URL is set
  try {
    const PostgreSQLDatabase = require('./database-postgres');
    dbInstance = PostgreSQLDatabase;
    console.log('✓ PostgreSQL database module loaded');
    
    // Test connection and fallback to SQLite if it fails
    dbInstance.connect().catch((error) => {
      console.error('\n❌ PostgreSQL connection failed!');
      console.error('Error:', error.message);
      console.error('\n⚠️  Falling back to SQLite for now.');
      console.error('⚠️  Note: Data will NOT persist on Render free tier with SQLite.');
      console.error('⚠️  Please fix DATABASE_URL and redeploy to use PostgreSQL.\n');
      
      // Fallback to SQLite
      dbInstance = new Database();
      console.log('Using SQLite database as fallback');
    });
  } catch (error) {
    console.error('Failed to load PostgreSQL module:', error.message);
    console.error('Falling back to SQLite. Make sure pg package is installed: npm install pg');
    dbInstance = new Database();
  }
} else {
  // Use SQLite for local development
  dbInstance = new Database();
}

module.exports = dbInstance;

