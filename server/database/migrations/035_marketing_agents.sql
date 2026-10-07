-- Marketing Agent recruitment, CRM attribution, and versioned commissions.
-- Additive only. Does not alter or delete existing company records.

CREATE TABLE IF NOT EXISTS marketing_agent_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT UNIQUE NOT NULL,
    external_id TEXT UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    county TEXT,
    city TEXT,
    professional_status TEXT,
    occupation TEXT,
    organization TEXT,
    education TEXT,
    background TEXT,
    experience TEXT,
    network_sectors TEXT,
    preferred_sectors TEXT,
    network_description TEXT,
    outreach_channels TEXT,
    scenario_responses TEXT,
    availability TEXT,
    training_availability TEXT,
    reporting_willingness TEXT,
    conflict_disclosure TEXT,
    cv_reference TEXT,
    submitted_at DATETIME,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    source TEXT,
    status TEXT NOT NULL DEFAULT 'NEW',
    reviewer_id INTEGER,
    screening_total REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS marketing_agent_screening_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    reviewer_id INTEGER,
    communication INTEGER NOT NULL DEFAULT 0,
    network INTEGER NOT NULL DEFAULT 0,
    sales_ability INTEGER NOT NULL DEFAULT 0,
    technology INTEGER NOT NULL DEFAULT 0,
    reliability INTEGER NOT NULL DEFAULT 0,
    integrity INTEGER NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES marketing_agent_applications(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS marketing_agent_interviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    interview_date DATE,
    interview_time TEXT,
    timezone TEXT DEFAULT 'Africa/Monrovia',
    format TEXT,
    location TEXT,
    meeting_link TEXT,
    interviewer_id INTEGER,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'SCHEDULED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES marketing_agent_applications(id) ON DELETE CASCADE,
    FOREIGN KEY (interviewer_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS marketing_agent_interview_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    interview_id INTEGER NOT NULL,
    interviewer_id INTEGER,
    communication INTEGER NOT NULL DEFAULT 0,
    mindset INTEGER NOT NULL DEFAULT 0,
    prospecting INTEGER NOT NULL DEFAULT 0,
    judgment INTEGER NOT NULL DEFAULT 0,
    professionalism INTEGER NOT NULL DEFAULT 0,
    availability INTEGER NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    strengths TEXT,
    concerns TEXT,
    notes TEXT,
    recommendation TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (interview_id) REFERENCES marketing_agent_interviews(id) ON DELETE CASCADE,
    FOREIGN KEY (interviewer_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS marketing_agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER UNIQUE,
    user_id INTEGER UNIQUE,
    agent_code TEXT UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    county TEXT,
    city TEXT,
    photo_path TEXT,
    status TEXT NOT NULL DEFAULT 'ONBOARDING',
    supervisor_id INTEGER,
    activation_date DATE,
    engagement_start_date DATE,
    engagement_end_date DATE,
    contract_end_date DATE,
    referral_eligible INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES marketing_agent_applications(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS marketing_agent_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    effective_date DATE,
    reason TEXT,
    approved_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES marketing_agents(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS marketing_agent_onboarding_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    item_key TEXT NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NOT_STARTED',
    completed_by INTEGER,
    completed_at DATETIME,
    notes TEXT,
    document_id INTEGER,
    waived_by INTEGER,
    waive_reason TEXT,
    UNIQUE(agent_id, item_key),
    FOREIGN KEY (agent_id) REFERENCES marketing_agents(id) ON DELETE CASCADE,
    FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (waived_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS marketing_agent_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER,
    application_id INTEGER,
    category TEXT NOT NULL,
    version TEXT,
    file_name TEXT,
    file_path TEXT,
    issue_date DATE,
    acknowledged_date DATE,
    signature_status TEXT DEFAULT 'UNSIGNED',
    verification_status TEXT DEFAULT 'PENDING',
    uploaded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES marketing_agents(id) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES marketing_agent_applications(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS marketing_agent_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER,
    application_id INTEGER,
    author_id INTEGER,
    body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES marketing_agents(id) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES marketing_agent_applications(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS marketing_id_sequences (
    seq_key TEXT PRIMARY KEY,
    next_number INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO marketing_id_sequences (seq_key, next_number) VALUES ('agent', 1);
INSERT OR IGNORE INTO marketing_id_sequences (seq_key, next_number) VALUES ('application_2026', 1);
INSERT OR IGNORE INTO marketing_id_sequences (seq_key, next_number) VALUES ('lead_2026', 1);
INSERT OR IGNORE INTO marketing_id_sequences (seq_key, next_number) VALUES ('commission_2026', 1);
INSERT OR IGNORE INTO marketing_id_sequences (seq_key, next_number) VALUES ('contract_2026', 1);
INSERT OR IGNORE INTO marketing_id_sequences (seq_key, next_number) VALUES ('proposal_2026', 1);
INSERT OR IGNORE INTO marketing_id_sequences (seq_key, next_number) VALUES ('payment_2026', 1);

CREATE TABLE IF NOT EXISTS sales_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_number TEXT UNIQUE NOT NULL,
    external_id TEXT UNIQUE,
    company_name TEXT,
    contact_name TEXT,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    location TEXT,
    industry TEXT,
    services_interested TEXT,
    business_challenge TEXT,
    budget_range TEXT,
    source TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    referral_agent_id INTEGER,
    referral_agent_code TEXT,
    assigned_staff_id INTEGER,
    priority TEXT DEFAULT 'NORMAL',
    status TEXT NOT NULL DEFAULT 'NEW',
    lost_reason TEXT,
    next_follow_up DATE,
    duplicate_flag TEXT,
    client_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (referral_agent_id) REFERENCES marketing_agents(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_staff_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sales_lead_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    actor_id INTEGER,
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES sales_leads(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sales_lead_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    related_lead_id INTEGER NOT NULL,
    link_type TEXT NOT NULL,
    decided_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES sales_leads(id) ON DELETE CASCADE,
    FOREIGN KEY (related_lead_id) REFERENCES sales_leads(id) ON DELETE CASCADE,
    FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sales_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_number TEXT UNIQUE NOT NULL,
    lead_id INTEGER,
    client_id INTEGER,
    legacy_proposal_id INTEGER,
    referral_agent_id INTEGER,
    prepared_by INTEGER,
    services TEXT,
    value REAL,
    currency TEXT DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'DRAFT',
    sent_date DATE,
    expiry_date DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES sales_leads(id) ON DELETE SET NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    FOREIGN KEY (legacy_proposal_id) REFERENCES proposals(id) ON DELETE SET NULL,
    FOREIGN KEY (referral_agent_id) REFERENCES marketing_agents(id) ON DELETE SET NULL,
    FOREIGN KEY (prepared_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sales_contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_number TEXT UNIQUE NOT NULL,
    client_id INTEGER,
    lead_id INTEGER,
    referral_agent_id INTEGER,
    contract_value REAL,
    currency TEXT DEFAULT 'USD',
    signed_date DATE,
    start_date DATE,
    end_date DATE,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    commission_eligible INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    FOREIGN KEY (lead_id) REFERENCES sales_leads(id) ON DELETE SET NULL,
    FOREIGN KEY (referral_agent_id) REFERENCES marketing_agents(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS client_cash_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_number TEXT UNIQUE NOT NULL,
    client_id INTEGER,
    contract_id INTEGER,
    invoice_reference TEXT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    payment_date DATE,
    method TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    reference TEXT,
    verified_by INTEGER,
    verified_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    FOREIGN KEY (contract_id) REFERENCES sales_contracts(id) ON DELETE SET NULL,
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS commission_policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    policy_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    effective_from DATE,
    effective_to DATE,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    notes TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS commission_policy_tiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    policy_id INTEGER NOT NULL,
    min_amount REAL NOT NULL,
    max_amount REAL,
    rate_percent REAL NOT NULL,
    bonus_note TEXT,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (policy_id) REFERENCES commission_policies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recurring_commission_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    policy_id INTEGER,
    service_name TEXT NOT NULL,
    rate_percent REAL NOT NULL,
    duration_months INTEGER,
    start_condition TEXT,
    end_condition TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (policy_id) REFERENCES commission_policies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS commissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commission_number TEXT UNIQUE NOT NULL,
    agent_id INTEGER NOT NULL,
    lead_id INTEGER,
    client_id INTEGER,
    contract_id INTEGER,
    payment_id INTEGER UNIQUE,
    eligible_revenue REAL NOT NULL,
    rate_percent REAL NOT NULL,
    gross_commission REAL NOT NULL,
    adjustment REAL NOT NULL DEFAULT 0,
    final_commission REAL NOT NULL,
    policy_id INTEGER,
    status TEXT NOT NULL DEFAULT 'CALCULATED',
    approved_by INTEGER,
    approved_at DATETIME,
    paid_at DATETIME,
    payment_reference TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES marketing_agents(id) ON DELETE RESTRICT,
    FOREIGN KEY (lead_id) REFERENCES sales_leads(id) ON DELETE SET NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    FOREIGN KEY (contract_id) REFERENCES sales_contracts(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_id) REFERENCES client_cash_payments(id) ON DELETE RESTRICT,
    FOREIGN KEY (policy_id) REFERENCES commission_policies(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS commission_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commission_id INTEGER NOT NULL,
    adjustment_type TEXT NOT NULL,
    amount REAL NOT NULL,
    reason TEXT NOT NULL,
    original_payment_id INTEGER,
    approved_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE RESTRICT,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS commission_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commission_id INTEGER NOT NULL,
    agent_id INTEGER NOT NULL,
    split_percent REAL NOT NULL,
    reason TEXT,
    approved_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES marketing_agents(id) ON DELETE RESTRICT,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS agent_weekly_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    week_start DATE NOT NULL,
    prospects_researched INTEGER DEFAULT 0,
    contacts_made INTEGER DEFAULT 0,
    meaningful_conversations INTEGER DEFAULT 0,
    qualified_leads INTEGER DEFAULT 0,
    meetings INTEGER DEFAULT 0,
    challenges TEXT,
    market_feedback TEXT,
    support_needed TEXT,
    next_week_plan TEXT,
    submitted_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, week_start),
    FOREIGN KEY (agent_id) REFERENCES marketing_agents(id) ON DELETE CASCADE,
    FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS agent_performance_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    period_label TEXT,
    prospecting INTEGER,
    lead_quality INTEGER,
    conversion_contribution INTEGER,
    follow_up INTEGER,
    reporting INTEGER,
    conduct INTEGER,
    product_knowledge INTEGER,
    crm_compliance INTEGER,
    revenue_contribution INTEGER,
    strengths TEXT,
    improvements TEXT,
    manager_comments TEXT,
    recommendation TEXT,
    reviewer_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES marketing_agents(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS agent_target_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    target_value REAL NOT NULL,
    period TEXT NOT NULL,
    notes TEXT,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO agent_target_settings (metric_key, label, target_value, period, notes) VALUES
('prospects_researched', 'Researched prospects', 20, 'week', 'Coaching baseline, not a guaranteed outcome'),
('meaningful_conversations', 'Meaningful conversations', 10, 'week', 'Coaching baseline, not a guaranteed outcome'),
('qualified_leads', 'Qualified leads', 4, 'week', 'Coaching range 3-5 per week'),
('decision_meetings', 'Decision-maker meetings', 2, 'month', 'Coaching baseline, not a guaranteed outcome');

INSERT INTO commission_policies (policy_code, name, version, effective_from, status, notes)
SELECT 'SVL-COMM-2026-V1', 'Marketing Agent Commission 2026 V1', 'V1', '2026-01-01', 'DRAFT',
       'Proposed rates pending formal management approval. Historical calculations use the policy version stored on each commission.'
WHERE NOT EXISTS (SELECT 1 FROM commission_policies WHERE policy_code = 'SVL-COMM-2026-V1');

INSERT INTO commission_policy_tiers (policy_id, min_amount, max_amount, rate_percent, bonus_note, sort_order)
SELECT p.id, 1, 500, 10, NULL, 1 FROM commission_policies p
WHERE p.policy_code = 'SVL-COMM-2026-V1'
AND NOT EXISTS (SELECT 1 FROM commission_policy_tiers t WHERE t.policy_id = p.id);

INSERT INTO commission_policy_tiers (policy_id, min_amount, max_amount, rate_percent, bonus_note, sort_order)
SELECT p.id, 501, 1500, 12, NULL, 2 FROM commission_policies p
WHERE p.policy_code = 'SVL-COMM-2026-V1'
AND (SELECT COUNT(*) FROM commission_policy_tiers t WHERE t.policy_id = p.id) = 1;

INSERT INTO commission_policy_tiers (policy_id, min_amount, max_amount, rate_percent, bonus_note, sort_order)
SELECT p.id, 1501, 5000, 15, NULL, 3 FROM commission_policies p
WHERE p.policy_code = 'SVL-COMM-2026-V1'
AND (SELECT COUNT(*) FROM commission_policy_tiers t WHERE t.policy_id = p.id) = 2;

INSERT INTO commission_policy_tiers (policy_id, min_amount, max_amount, rate_percent, bonus_note, sort_order)
SELECT p.id, 5000.01, NULL, 15, 'Plus separately approved bonus where applicable', 4 FROM commission_policies p
WHERE p.policy_code = 'SVL-COMM-2026-V1'
AND (SELECT COUNT(*) FROM commission_policy_tiers t WHERE t.policy_id = p.id) = 3;

CREATE INDEX IF NOT EXISTS idx_ma_app_status ON marketing_agent_applications(status);
CREATE INDEX IF NOT EXISTS idx_ma_app_county ON marketing_agent_applications(county);
CREATE INDEX IF NOT EXISTS idx_sales_leads_status ON sales_leads(status);
CREATE INDEX IF NOT EXISTS idx_sales_leads_agent ON sales_leads(referral_agent_id);
CREATE INDEX IF NOT EXISTS idx_commissions_agent ON commissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
