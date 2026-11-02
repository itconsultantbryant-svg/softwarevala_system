-- Additive freelance marketing agent portal extension.
-- Existing recruitment, CRM, payment and commission records remain authoritative.

ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN last_login_at DATETIME;
ALTER TABLE users ADD COLUMN last_login_ip TEXT;

ALTER TABLE marketing_agents ADD COLUMN onboarding_approved_by INTEGER;
ALTER TABLE marketing_agents ADD COLUMN onboarding_approved_at DATETIME;
ALTER TABLE marketing_agents ADD COLUMN account_provisioned_at DATETIME;

ALTER TABLE clients ADD COLUMN contact_person TEXT;
ALTER TABLE clients ADD COLUMN contact_phone TEXT;
ALTER TABLE clients ADD COLUMN contact_email TEXT;
ALTER TABLE clients ADD COLUMN county TEXT;
ALTER TABLE clients ADD COLUMN city TEXT;
ALTER TABLE clients ADD COLUMN website TEXT;
ALTER TABLE clients ADD COLUMN industry TEXT;
ALTER TABLE clients ADD COLUMN originating_agent_id INTEGER;

CREATE TABLE IF NOT EXISTS marketing_agent_onboarding_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  session_date DATE NOT NULL,
  start_time TEXT,
  end_time TEXT,
  venue TEXT,
  meeting_link TEXT,
  facilitators TEXT,
  materials TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS marketing_agent_onboarding_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  attendance_status TEXT NOT NULL DEFAULT 'INVITED',
  assessment_score REAL,
  completion_status TEXT NOT NULL DEFAULT 'PENDING',
  remarks TEXT,
  UNIQUE(session_id, agent_id),
  FOREIGN KEY (session_id) REFERENCES marketing_agent_onboarding_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES marketing_agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_wallet_ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_reference TEXT UNIQUE NOT NULL,
  agent_id INTEGER NOT NULL,
  commission_id INTEGER,
  payout_request_id INTEGER,
  transaction_type TEXT NOT NULL,
  balance_bucket TEXT NOT NULL DEFAULT 'PENDING',
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES marketing_agents(id) ON DELETE RESTRICT,
  FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS agent_payout_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_reference TEXT UNIQUE NOT NULL,
  agent_id INTEGER NOT NULL,
  requested_amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_method TEXT NOT NULL,
  payment_account_details TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  reviewed_by INTEGER,
  reviewed_at DATETIME,
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES marketing_agents(id) ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE agent_weekly_reports ADD COLUMN status TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE agent_weekly_reports ADD COLUMN submitted_at DATETIME;
ALTER TABLE agent_weekly_reports ADD COLUMN revision_number INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_weekly_reports ADD COLUMN summary TEXT;
ALTER TABLE agent_weekly_reports ADD COLUMN achievements TEXT;
ALTER TABLE agent_weekly_reports ADD COLUMN attachment_reference TEXT;

CREATE TABLE IF NOT EXISTS agent_weekly_report_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  reviewer_id INTEGER NOT NULL,
  score REAL,
  rating TEXT,
  feedback TEXT,
  recommendations TEXT,
  internal_notes TEXT,
  judgment TEXT,
  published_at DATETIME,
  acknowledged_at DATETIME,
  agent_response TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES agent_weekly_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS agent_monthly_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  report_month TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  reflection TEXT,
  action_plan TEXT,
  status TEXT NOT NULL DEFAULT 'GENERATED',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_id, report_month),
  FOREIGN KEY (agent_id) REFERENCES marketing_agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_target_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  metric_key TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  period TEXT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  assigned_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES marketing_agents(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_wallet_agent_created ON agent_wallet_ledger_entries(agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_payout_agent_status ON agent_payout_requests(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_reports_month ON agent_monthly_reports(agent_id, report_month);
CREATE INDEX IF NOT EXISTS idx_sales_leads_agent_created ON sales_leads(referral_agent_id, created_at);

INSERT OR IGNORE INTO marketing_agent_onboarding_sessions
  (id, title, description, session_date, start_time, end_time, venue, facilitators, status)
VALUES
  (1, 'SVL Freelance Marketing Agent Onboarding and Training', 'Initial freelance marketing agent onboarding and training session. Augustine N Nimely attends remotely.', '2026-11-06', '10:00', '14:00', 'Software Vala Liberia Office, ELWA Junction, opposite Exclusive Supermarket, Montserrado County, Liberia', 'Software Vala Liberia', 'SCHEDULED');
