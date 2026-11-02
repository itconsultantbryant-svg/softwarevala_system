const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../utils/auth');
const { logAction } = require('../utils/audit');
const svc = require('../utils/marketingAgentService');

const router = express.Router();

async function agentContext(req, res, next) {
  if (!req.user || String(req.user.role).toLowerCase() !== 'freelancemarketingagent') {
    return res.status(403).json({ error: 'Freelance Marketing Agent access is required' });
  }
  const agent = await db.get('SELECT * FROM marketing_agents WHERE user_id = ?', [req.user.id]);
  if (!agent) return res.status(403).json({ error: 'No agent profile is linked to this account' });
  if (agent.status !== 'ACTIVE') return res.status(403).json({ error: 'This agent account is not active' });
  req.agent = agent;
  next();
}

router.use(authenticateToken, agentContext);

function money(value) { return Math.round((Number(value) || 0) * 100) / 100; }
function requestRef(agentId) { return `SVL-PO-${agentId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`; }

router.get('/me', async (req, res) => {
  const onboarding = await db.all('SELECT item_key, label, status, completed_at, notes FROM marketing_agent_onboarding_items WHERE agent_id = ? ORDER BY id', [req.agent.id]);
  res.json({ agent: req.agent, onboarding });
});

router.get('/dashboard', async (req, res) => {
  try {
    const id = req.agent.id;
    const [leadStats, revenue, wallet, recent, report, targets] = await Promise.all([
      db.get(`SELECT COUNT(*) total_leads,
        SUM(CASE WHEN status IN ('QUALIFIED','MEETING_SCHEDULED','PROPOSAL_PREPARATION','PROPOSAL_SENT','NEGOTIATION','WON') THEN 1 ELSE 0 END) qualified_leads,
        SUM(CASE WHEN status = 'WON' THEN 1 ELSE 0 END) converted_clients,
        SUM(CASE WHEN next_follow_up IS NOT NULL AND date(next_follow_up) <= date('now') AND status NOT IN ('WON','LOST') THEN 1 ELSE 0 END) pending_followups
        FROM sales_leads WHERE referral_agent_id = ?`, [id]),
      db.get(`SELECT COALESCE(SUM(p.amount),0) AS verified_revenue FROM client_cash_payments p JOIN sales_contracts c ON c.id = p.contract_id WHERE c.referral_agent_id = ? AND p.status = 'VERIFIED'`, [id]),
      db.get(`SELECT
          COALESCE(SUM(CASE WHEN balance_bucket = 'AVAILABLE' THEN amount ELSE 0 END),0) available_balance,
          COALESCE(SUM(CASE WHEN balance_bucket = 'PENDING' THEN amount ELSE 0 END),0) pending_commission,
          COALESCE(SUM(amount),0) total_earned
        FROM agent_wallet_ledger_entries WHERE agent_id = ?`, [id]),
      db.all('SELECT entry_reference, transaction_type, balance_bucket, amount, currency, description, created_at FROM agent_wallet_ledger_entries WHERE agent_id = ? ORDER BY created_at DESC LIMIT 5', [id]),
      db.get(`SELECT status, week_start, submitted_at FROM agent_weekly_reports WHERE agent_id = ? ORDER BY week_start DESC LIMIT 1`, [id]),
      db.all(`SELECT metric_key, target_value, period FROM agent_target_assignments WHERE agent_id = ? AND date(effective_from) <= date('now') AND (effective_to IS NULL OR date(effective_to) >= date('now'))`, [id])
    ]);
    const total = Number(leadStats?.total_leads || 0);
    res.json({
      metrics: { ...leadStats, verified_revenue: money(revenue?.verified_revenue), conversion_rate: total ? money((Number(leadStats.converted_clients || 0) / total) * 100) : 0 },
      wallet: { available_balance: money(wallet?.available_balance), pending_commission: money(wallet?.pending_commission), total_earned: money(wallet?.total_earned), recent },
      weeklyReport: report || null, targets
    });
  } catch (error) { res.status(500).json({ error: 'Failed to load agent dashboard' }); }
});

router.get('/leads', async (req, res) => {
  const leads = await db.all('SELECT * FROM sales_leads WHERE referral_agent_id = ? ORDER BY updated_at DESC', [req.agent.id]);
  res.json({ leads });
});

router.post('/leads', [
  body('company_name').trim().notEmpty(), body('contact_name').optional().trim(), body('email').optional().isEmail()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const phone = svc.normalizePhone(req.body.phone);
    const company = req.body.company_name.trim();
    const duplicate = await db.get(`SELECT id, lead_number, referral_agent_id FROM sales_leads
      WHERE (? <> '' AND lower(email) = ?) OR (? <> '' AND replace(replace(phone,' ',''),'-','') = ?) OR lower(company_name) = lower(?) LIMIT 1`, [email, email, phone, phone, company]);
    const leadNumber = await svc.nextLeadNumber();
    const duplicateFlag = duplicate ? 'POSSIBLE_DUPLICATE' : null;
    const attributionStatus = duplicate && duplicate.referral_agent_id !== req.agent.id ? 'REVIEW' : 'ATTRIBUTED';
    const result = await db.run(`INSERT INTO sales_leads
      (lead_number, company_name, contact_name, phone, whatsapp, email, location, industry, services_interested, business_challenge, budget_range, source, referral_agent_id, referral_agent_code, status, duplicate_flag, attribution_status, attribution_note, next_follow_up)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGENT_PORTAL', ?, ?, 'NEW', ?, ?, ?, ?)`,
      [leadNumber, company, req.body.contact_name || null, req.body.phone || null, req.body.whatsapp || null, email || null,
        req.body.location || null, req.body.industry || null, req.body.services_interested || null, req.body.business_challenge || req.body.notes || null,
        req.body.budget_range || null, req.agent.id, req.agent.agent_code, duplicateFlag, attributionStatus,
        duplicate ? `Possible duplicate of ${duplicate.lead_number}; ownership retained pending review.` : null, req.body.next_follow_up || null]);
    await db.run(`INSERT INTO sales_lead_activities (lead_id, actor_id, action, to_status, notes) VALUES (?, ?, 'agent_registered', 'NEW', ?)`, [result.lastID, req.user.id, req.body.notes || 'Registered through agent portal']);
    await db.run(`INSERT INTO client_attributions (lead_id, agent_id, attribution_status, notes) VALUES (?, ?, ?, ?)`, [result.lastID, req.agent.id, attributionStatus, duplicate ? 'Automated duplicate check requires management review.' : 'Originating agent portal submission']);
    await db.run(`INSERT INTO client_journey_events (lead_id, agent_id, stage, notes, follow_up_date, responsible_user_id) VALUES (?, ?, 'LEAD_REGISTERED', ?, ?, ?)`, [result.lastID, req.agent.id, req.body.notes || null, req.body.next_follow_up || null, req.user.id]);
    await svc.notifyRole(['Admin', 'DepartmentHead'], duplicate ? 'Agent lead needs duplicate review' : 'New agent lead', `${req.agent.full_name} registered ${leadNumber}`, `/marketing/leads/${result.lastID}`);
    await logAction(req.user.id, 'agent_lead_registered', 'sales_leads', result.lastID, { leadNumber, attributionStatus }, req);
    res.status(201).json({ id: result.lastID, lead_number: leadNumber, duplicate: !!duplicate, attribution_status: attributionStatus });
  } catch (error) { res.status(500).json({ error: 'Failed to register lead' }); }
});

router.post('/leads/:id/journey', [body('stage').trim().notEmpty()], async (req, res) => {
  const lead = await db.get('SELECT * FROM sales_leads WHERE id = ? AND referral_agent_id = ?', [req.params.id, req.agent.id]);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const allowed = svc.LEAD_STATUSES;
  if (!allowed.includes(req.body.stage)) return res.status(400).json({ error: 'Invalid client journey stage' });
  await db.run('UPDATE sales_leads SET status = ?, next_follow_up = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.body.stage, req.body.follow_up_date || lead.next_follow_up, lead.id]);
  await db.run(`INSERT INTO sales_lead_activities (lead_id, actor_id, action, from_status, to_status, notes) VALUES (?, ?, 'journey_update', ?, ?, ?)`, [lead.id, req.user.id, lead.status, req.body.stage, req.body.notes || null]);
  await db.run(`INSERT INTO client_journey_events (lead_id, client_id, agent_id, stage, notes, next_action, follow_up_date, responsible_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [lead.id, lead.client_id || null, req.agent.id, req.body.stage, req.body.notes || null, req.body.next_action || null, req.body.follow_up_date || null, req.user.id]);
  await logAction(req.user.id, 'agent_journey_update', 'sales_leads', lead.id, { from: lead.status, to: req.body.stage }, req);
  res.json({ status: req.body.stage });
});

router.get('/leads/:id/journey', async (req, res) => {
  const lead = await db.get('SELECT id FROM sales_leads WHERE id = ? AND referral_agent_id = ?', [req.params.id, req.agent.id]);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const events = await db.all(`SELECT event_date, stage, notes, next_action, follow_up_date FROM client_journey_events WHERE lead_id = ? ORDER BY event_date DESC`, [lead.id]);
  res.json({ events });
});

router.get('/wallet', async (req, res) => {
  const [entries, requests] = await Promise.all([
    db.all('SELECT * FROM agent_wallet_ledger_entries WHERE agent_id = ? ORDER BY created_at DESC', [req.agent.id]),
    db.all('SELECT id, request_reference, requested_amount, currency, payment_method, status, created_at, reviewed_at, paid_at FROM agent_payout_requests WHERE agent_id = ? ORDER BY created_at DESC', [req.agent.id])
  ]);
  const summary = entries.reduce((value, entry) => {
    value.total_earned += Number(entry.amount) || 0;
    if (entry.balance_bucket === 'AVAILABLE') value.available_balance += Number(entry.amount) || 0;
    if (entry.balance_bucket === 'PENDING') value.pending_commission += Number(entry.amount) || 0;
    return value;
  }, { available_balance: 0, pending_commission: 0, total_earned: 0 });
  res.json({ summary: Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, money(v)])), entries, payoutRequests: requests });
});

router.post('/payout-requests', [body('amount').isFloat({ gt: 0 }), body('payment_method').trim().notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const balance = await db.get("SELECT COALESCE(SUM(CASE WHEN balance_bucket = 'AVAILABLE' THEN amount ELSE 0 END),0) AS amount FROM agent_wallet_ledger_entries WHERE agent_id = ?", [req.agent.id]);
  if (money(balance.amount) < money(req.body.amount)) return res.status(400).json({ error: 'Requested amount exceeds your available wallet balance' });
  const ref = requestRef(req.agent.id);
  const result = await db.run(`INSERT INTO agent_payout_requests (request_reference, agent_id, requested_amount, currency, payment_method, payment_account_details, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`, [ref, req.agent.id, money(req.body.amount), req.body.currency || 'USD', req.body.payment_method, req.body.payment_account_details || null, req.body.notes || null]);
  await svc.notifyRole(['Admin', 'DepartmentHead'], 'Agent payout request', `${req.agent.full_name} submitted ${ref}`, '/marketing/commissions');
  await logAction(req.user.id, 'agent_payout_requested', 'agent_payout_requests', result.lastID, { ref }, req);
  res.status(201).json({ id: result.lastID, request_reference: ref });
});

router.get('/reports/weekly', async (req, res) => {
  const reports = await db.all(`SELECT r.*, rv.score, rv.rating, rv.feedback, rv.recommendations, rv.published_at
    FROM agent_weekly_reports r LEFT JOIN agent_weekly_report_reviews rv ON rv.report_id = r.id
    WHERE r.agent_id = ? ORDER BY r.week_start DESC`, [req.agent.id]);
  res.json({ reports });
});

router.post('/reports/weekly', async (req, res) => {
  const week = req.body.week_start;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week || '')) return res.status(400).json({ error: 'A reporting week start date is required' });
  const existing = await db.get('SELECT id, status FROM agent_weekly_reports WHERE agent_id = ? AND week_start = ?', [req.agent.id, week]);
  if (existing && ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(existing.status)) return res.status(409).json({ error: 'This submitted report is locked until management requests a revision' });
  const status = req.body.submit ? 'SUBMITTED' : 'DRAFT';
  await db.run(`INSERT INTO agent_weekly_reports (agent_id, week_start, prospects_researched, contacts_made, meaningful_conversations, qualified_leads, meetings, challenges, market_feedback, support_needed, next_week_plan, summary, achievements, status, submitted_at, submitted_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'SUBMITTED' THEN CURRENT_TIMESTAMP ELSE NULL END, ?)
    ON CONFLICT(agent_id, week_start) DO UPDATE SET prospects_researched=excluded.prospects_researched, contacts_made=excluded.contacts_made, meaningful_conversations=excluded.meaningful_conversations, qualified_leads=excluded.qualified_leads, meetings=excluded.meetings, challenges=excluded.challenges, market_feedback=excluded.market_feedback, support_needed=excluded.support_needed, next_week_plan=excluded.next_week_plan, summary=excluded.summary, achievements=excluded.achievements, status=excluded.status, submitted_at=CASE WHEN excluded.status='SUBMITTED' THEN CURRENT_TIMESTAMP ELSE agent_weekly_reports.submitted_at END, revision_number=agent_weekly_reports.revision_number + CASE WHEN agent_weekly_reports.status='REVISION_REQUESTED' THEN 1 ELSE 0 END`,
    [req.agent.id, week, req.body.prospects_researched || 0, req.body.contacts_made || 0, req.body.meaningful_conversations || 0, req.body.qualified_leads || 0, req.body.meetings || 0, req.body.challenges || null, req.body.market_feedback || null, req.body.support_needed || null, req.body.next_week_plan || null, req.body.summary || null, req.body.achievements || null, status, status, req.user.id]);
  if (status === 'SUBMITTED') await svc.notifyRole(['Admin', 'DepartmentHead'], 'Weekly agent report submitted', `${req.agent.full_name} submitted the week beginning ${week}`, '/marketing/weekly-reports');
  res.status(201).json({ status });
});

router.post('/reports/weekly/:id/acknowledge', async (req, res) => {
  const report = await db.get('SELECT id FROM agent_weekly_reports WHERE id = ? AND agent_id = ?', [req.params.id, req.agent.id]);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  const review = await db.get('SELECT id FROM agent_weekly_report_reviews WHERE report_id = ? AND published_at IS NOT NULL ORDER BY created_at DESC LIMIT 1', [report.id]);
  if (!review) return res.status(409).json({ error: 'There is no published review to acknowledge' });
  await db.run('UPDATE agent_weekly_report_reviews SET acknowledged_at = CURRENT_TIMESTAMP, agent_response = ? WHERE id = ?', [req.body.response || null, review.id]);
  await logAction(req.user.id, 'agent_review_acknowledged', 'agent_weekly_report_reviews', review.id, {}, req);
  res.json({ ok: true });
});

router.get('/targets', async (req, res) => {
  const assigned = await db.all(`SELECT metric_key, target_value, period, effective_from, effective_to FROM agent_target_assignments
    WHERE agent_id = ? ORDER BY effective_from DESC`, [req.agent.id]);
  const defaults = await db.all('SELECT metric_key, label, target_value, period FROM agent_target_settings ORDER BY id');
  res.json({ assigned, defaults });
});

router.get('/reports/monthly', async (req, res) => {
  const reports = await db.all('SELECT * FROM agent_monthly_reports WHERE agent_id = ? ORDER BY report_month DESC', [req.agent.id]);
  res.json({ reports: reports.map((row) => ({ ...row, snapshot: JSON.parse(row.snapshot || '{}') })) });
});

router.post('/reports/monthly/:month/compile', async (req, res) => {
  const month = req.params.month;
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Month must be YYYY-MM' });
  const start = `${month}-01`;
  try {
    const [leads, conversions, revenue, commissions, weekly] = await Promise.all([
      db.get(`SELECT COUNT(*) total_leads, SUM(CASE WHEN status IN ('QUALIFIED','MEETING_SCHEDULED','PROPOSAL_PREPARATION','PROPOSAL_SENT','NEGOTIATION','WON') THEN 1 ELSE 0 END) qualified_leads FROM sales_leads WHERE referral_agent_id = ? AND date(created_at) >= date(?) AND date(created_at) < date(?, '+1 month')`, [req.agent.id, start, start]),
      db.get(`SELECT COUNT(*) count FROM sales_leads WHERE referral_agent_id = ? AND status = 'WON' AND date(updated_at) >= date(?) AND date(updated_at) < date(?, '+1 month')`, [req.agent.id, start, start]),
      db.get(`SELECT COALESCE(SUM(p.amount),0) amount FROM client_cash_payments p JOIN sales_contracts c ON c.id = p.contract_id WHERE c.referral_agent_id = ? AND p.status = 'VERIFIED' AND date(p.verified_at) >= date(?) AND date(p.verified_at) < date(?, '+1 month')`, [req.agent.id, start, start]),
      db.get(`SELECT COALESCE(SUM(final_commission),0) earned, COALESCE(SUM(CASE WHEN status = 'PAID' THEN final_commission ELSE 0 END),0) paid FROM commissions WHERE agent_id = ? AND date(created_at) >= date(?) AND date(created_at) < date(?, '+1 month')`, [req.agent.id, start, start]),
      db.get(`SELECT COALESCE(SUM(prospects_researched),0) prospects, COALESCE(SUM(contacts_made),0) contacts, COALESCE(SUM(meetings),0) meetings FROM agent_weekly_reports WHERE agent_id = ? AND date(week_start) >= date(?) AND date(week_start) < date(?, '+1 month')`, [req.agent.id, start, start])
    ]);
    const snapshot = { month, prospects_researched: Number(weekly?.prospects || 0), contacts_made: Number(weekly?.contacts || 0), meetings: Number(weekly?.meetings || 0), total_leads: Number(leads?.total_leads || 0), qualified_leads: Number(leads?.qualified_leads || 0), clients_converted: Number(conversions?.count || 0), verified_revenue: money(revenue?.amount), commission_earned: money(commissions?.earned), commission_paid: money(commissions?.paid) };
    await db.run(`INSERT INTO agent_monthly_reports (agent_id, report_month, snapshot, status) VALUES (?, ?, ?, 'GENERATED') ON CONFLICT(agent_id, report_month) DO UPDATE SET snapshot = excluded.snapshot, updated_at = CURRENT_TIMESTAMP`, [req.agent.id, month, JSON.stringify(snapshot)]);
    res.json({ report_month: month, snapshot });
  } catch (error) { res.status(500).json({ error: 'Failed to compile monthly report' }); }
});

router.post('/reports/monthly/:id/reflection', async (req, res) => {
  const report = await db.get('SELECT id FROM agent_monthly_reports WHERE id = ? AND agent_id = ?', [req.params.id, req.agent.id]);
  if (!report) return res.status(404).json({ error: 'Monthly report not found' });
  await db.run(`UPDATE agent_monthly_reports SET reflection = ?, action_plan = ?, status = 'SUBMITTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.body.reflection || null, req.body.action_plan || null, report.id]);
  await svc.notifyRole(['Admin', 'DepartmentHead'], 'Monthly agent report submitted', `${req.agent.full_name} submitted their monthly reflection`, '/marketing/reports');
  res.json({ ok: true });
});

module.exports = router;
