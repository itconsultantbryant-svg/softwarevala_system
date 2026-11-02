-- Login monitoring and lockout controls for all accounts, including agents.
ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN lockout_until DATETIME;

CREATE TABLE IF NOT EXISTS auth_login_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  login_identifier TEXT,
  success INTEGER NOT NULL DEFAULT 0,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_login_activity_user_created ON auth_login_activity(user_id, created_at);
