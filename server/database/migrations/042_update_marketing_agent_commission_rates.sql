-- Current marketing-agent commission schedule. Existing commission records
-- retain their stored rate and final amount. These tiers apply to new verified
-- payments only.
UPDATE commission_policy_tiers
SET min_amount = 1, max_amount = 500, rate_percent = 15, bonus_note = NULL, sort_order = 1
WHERE policy_id = (SELECT id FROM commission_policies WHERE policy_code = 'SVL-COMM-2026-V1')
  AND sort_order = 1;

UPDATE commission_policy_tiers
SET min_amount = 500.01, max_amount = 4999.99, rate_percent = 20, bonus_note = NULL, sort_order = 2
WHERE policy_id = (SELECT id FROM commission_policies WHERE policy_code = 'SVL-COMM-2026-V1')
  AND sort_order = 2;

DELETE FROM commission_policy_tiers
WHERE policy_id = (SELECT id FROM commission_policies WHERE policy_code = 'SVL-COMM-2026-V1')
  AND sort_order > 3;

UPDATE commission_policy_tiers
SET min_amount = 5000, max_amount = NULL, rate_percent = 30, bonus_note = NULL, sort_order = 3
WHERE policy_id = (SELECT id FROM commission_policies WHERE policy_code = 'SVL-COMM-2026-V1')
  AND sort_order = 3;

UPDATE commission_policies SET status = 'RETIRED' WHERE status = 'ACTIVE' AND policy_code <> 'SVL-COMM-2026-V1';
UPDATE commission_policies
SET status = 'ACTIVE',
    notes = '15% for $1–$500, 20% for $500.01–$4,999.99, and 30% for $5,000 and above. Existing commissions retain their recorded rate and amount.'
WHERE policy_code = 'SVL-COMM-2026-V1';
