ALTER TABLE marketing_agent_applications ADD COLUMN duplicate_flag TEXT;
ALTER TABLE marketing_agent_applications ADD COLUMN integration_source TEXT;
ALTER TABLE marketing_agent_applications ADD COLUMN synced_at DATETIME;
ALTER TABLE sales_leads ADD COLUMN attribution_status TEXT;
ALTER TABLE sales_leads ADD COLUMN attribution_note TEXT;
ALTER TABLE sales_leads ADD COLUMN submitted_at DATETIME;

CREATE TABLE IF NOT EXISTS marketing_alert_log (
    alert_key TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
