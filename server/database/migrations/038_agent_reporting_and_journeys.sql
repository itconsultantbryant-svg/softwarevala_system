-- Structured CRM journey, attribution, review, and payout controls.

CREATE TABLE IF NOT EXISTS client_journey_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER,
  client_id INTEGER,
  agent_id INTEGER,
  stage TEXT NOT NULL,
  event_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  next_action TEXT,
  follow_up_date DATE,
  attachment_reference TEXT,
  responsible_user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES sales_leads(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (agent_id) REFERENCES marketing_agents(id) ON DELETE SET NULL,
  FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS client_attributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  attribution_status TEXT NOT NULL DEFAULT 'PENDING',
  original_submission_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at DATETIME,
  verified_by INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES sales_leads(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES marketing_agents(id) ON DELETE RESTRICT,
  FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_client_journey_lead_date ON client_journey_events(lead_id, event_date);
CREATE INDEX IF NOT EXISTS idx_client_attribution_lead ON client_attributions(lead_id);

CREATE TABLE IF NOT EXISTS agent_monthly_report_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  reviewer_id INTEGER NOT NULL,
  score REAL,
  rating TEXT,
  feedback TEXT,
  internal_notes TEXT,
  judgment TEXT,
  approved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES agent_monthly_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE RESTRICT
);
