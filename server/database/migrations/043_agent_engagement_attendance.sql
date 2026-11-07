-- Freelance agents may work remotely, so engagement attendance is separate
-- from office-only staff attendance and supports multiple engagements per day.
CREATE TABLE IF NOT EXISTS marketing_agent_engagement_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  engagement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  check_out_at DATETIME,
  check_in_note TEXT,
  check_out_note TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES marketing_agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_engagement_attendance_agent_date ON marketing_agent_engagement_attendance(agent_id, engagement_date);
CREATE INDEX IF NOT EXISTS idx_agent_engagement_attendance_open ON marketing_agent_engagement_attendance(status, check_in_at);
