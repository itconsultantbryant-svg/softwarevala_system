-- Preserve full lifecycle transition context without rewriting historical rows.
ALTER TABLE marketing_agent_status_history ADD COLUMN previous_status TEXT;
ALTER TABLE marketing_agent_status_history ADD COLUMN supporting_document TEXT;
ALTER TABLE marketing_agent_status_history ADD COLUMN remarks TEXT;
CREATE INDEX IF NOT EXISTS idx_agent_status_history_agent_created ON marketing_agent_status_history(agent_id, created_at);
