const crypto = require('crypto');
const db = require('../config/database');

const SCREENING_MAX = {
  communication: 25,
  network: 20,
  sales_ability: 20,
  technology: 15,
  reliability: 10,
  integrity: 10
};

const INTERVIEW_MAX = {
  communication: 20,
  mindset: 20,
  prospecting: 20,
  judgment: 15,
  professionalism: 15,
  availability: 10
};

const ONBOARDING_ITEMS = [
  ['identity_verified', 'Identity/contact information verified'],
  ['tor_issued', 'TOR issued'],
  ['tor_acknowledged', 'TOR acknowledged'],
  ['commission_policy_issued', 'Commission Policy issued'],
  ['commission_policy_acknowledged', 'Commission Policy acknowledged'],
  ['agreement_issued', 'Agent Agreement issued'],
  ['agreement_signed', 'Agent Agreement signed'],
  ['confidentiality_acknowledged', 'Confidentiality/data rules acknowledged'],
  ['training_day_1', 'Training Day 1 completed'],
  ['training_day_2', 'Training Day 2 completed'],
  ['sales_assessment', 'Sales assessment passed'],
  ['lead_procedure', 'Lead-registration procedure demonstrated'],
  ['commission_explained', 'Commission procedure explained'],
  ['payment_rules', 'Payment rules explained'],
  ['brand_rules', 'Brand rules explained'],
  ['reporting_explained', 'Reporting requirements explained'],
  ['payment_method', 'Approved payment method recorded'],
  ['final_approval', 'Final management approval']
];

const APPLICATION_STATUSES = [
  'NEW', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'INTERVIEWED',
  'SELECTED', 'ONBOARDING', 'WAITLISTED', 'NOT_SELECTED'
];

const LEAD_STATUSES = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'MEETING_SCHEDULED', 'PROPOSAL_PREPARATION',
  'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST', 'FOLLOW_UP'
];

function hasPermission(user, permission) {
  if (!user) return false;
  const role = user.role;
  const admin = role === 'Admin';
  const management = admin || role === 'DepartmentHead';
  const sales = management || role === 'Staff';
  const finance = admin || role === 'DepartmentHead';
  const map = {
    'marketing_agent.applications.view': sales,
    'marketing_agent.applications.review': management,
    'marketing_agent.interviews.manage': management,
    'marketing_agent.select': management,
    'marketing_agent.onboarding.manage': management,
    'marketing_agent.activate': admin,
    'marketing_agent.view': sales,
    'marketing_agent.edit': management,
    'marketing_agent.suspend': admin || role === 'DepartmentHead',
    'marketing_agent.terminate': admin,
    'lead.view': sales,
    'lead.manage': sales,
    'lead.assign': management,
    'commission.view': sales,
    'commission.calculate': finance,
    'commission.review': finance,
    'commission.approve': finance,
    'commission.pay': admin,
    'commission.reverse': admin,
    'reports.view': sales,
    'reports.export': management
  };
  return !!map[permission];
}

function requirePerm(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

function clampScore(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, n);
}

function scoreScreening(input) {
  const scores = {};
  let total = 0;
  Object.entries(SCREENING_MAX).forEach(([key, max]) => {
    scores[key] = clampScore(input[key], max);
    total += scores[key];
  });
  return { ...scores, total };
}

function scoreInterview(input) {
  const scores = {};
  let total = 0;
  Object.entries(INTERVIEW_MAX).forEach(([key, max]) => {
    scores[key] = clampScore(input[key], max);
    total += scores[key];
  });
  return { ...scores, total };
}

function screeningBand(total) {
  if (total >= 80) return 'Strong shortlist consideration';
  if (total >= 65) return 'Review / possible shortlist';
  if (total >= 50) return 'Secondary review';
  return 'Normally not shortlisted';
}

function rateForAmount(tiers, amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  const sorted = [...tiers].sort((a, b) => a.sort_order - b.sort_order || a.min_amount - b.min_amount);
  const tier = sorted.find((t) => value >= Number(t.min_amount) && (t.max_amount == null || value <= Number(t.max_amount)));
  if (!tier) return null;
  const rate = Number(tier.rate_percent);
  const gross = Math.round(value * rate) / 100;
  return { rate, gross: Math.round(gross * 100) / 100, tierId: tier.id };
}

function verifySyncKey(headerValue) {
  const expected = process.env.MARKETING_SYNC_SECRET || '';
  if (!expected || !headerValue) return false;
  const a = Buffer.from(String(headerValue));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function nextSequence(seqKey) {
  await db.run('BEGIN IMMEDIATE');
  try {
    const row = await db.get('SELECT next_number FROM marketing_id_sequences WHERE seq_key = ?', [seqKey]);
    if (!row) {
      await db.run('INSERT INTO marketing_id_sequences (seq_key, next_number) VALUES (?, 2)', [seqKey]);
      await db.run('COMMIT');
      return 1;
    }
    await db.run('UPDATE marketing_id_sequences SET next_number = next_number + 1 WHERE seq_key = ?', [seqKey]);
    await db.run('COMMIT');
    return row.next_number;
  } catch (error) {
    try { await db.run('ROLLBACK'); } catch (e) { /* ignore */ }
    throw error;
  }
}

function yearKey(prefix) {
  return `${prefix}_${new Date().getFullYear()}`;
}

async function nextApplicationReference() {
  const n = await nextSequence(yearKey('application'));
  return `SVL-MA-APP-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`;
}

async function nextAgentCode() {
  const n = await nextSequence('agent');
  return `SVL-MA-${String(n).padStart(4, '0')}`;
}

async function nextLeadNumber() {
  const n = await nextSequence(yearKey('lead'));
  return `SVL-LD-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`;
}

async function nextCommissionNumber() {
  const n = await nextSequence(yearKey('commission'));
  return `SVL-COM-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`;
}

async function nextContractNumber() {
  const n = await nextSequence(yearKey('contract'));
  return `SVL-CT-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`;
}

async function nextProposalNumber() {
  const n = await nextSequence(yearKey('proposal'));
  return `SVL-PR-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`;
}

async function nextPaymentNumber() {
  const n = await nextSequence(yearKey('payment'));
  return `SVL-PAY-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`;
}

function referralUrl(agentCode) {
  const base = (process.env.PUBLIC_SITE_URL || 'https://softwarevalalib.app').replace(/\/$/, '');
  return `${base}/consultation?ref=${encodeURIComponent(agentCode)}`;
}

async function notifyRole(roles, title, message, link) {
  const placeholders = roles.map(() => '?').join(',');
  const users = await db.all(
    `SELECT id FROM users WHERE role IN (${placeholders}) AND is_active = 1`,
    roles
  );
  for (const user of users) {
    await db.run(
      `INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, 'info', ?)`,
      [user.id, title, message, link || null]
    );
  }
}

async function seedOnboarding(agentId) {
  for (const [key, label] of ONBOARDING_ITEMS) {
    await db.run(
      `INSERT OR IGNORE INTO marketing_agent_onboarding_items (agent_id, item_key, label, status) VALUES (?, ?, ?, 'NOT_STARTED')`,
      [agentId, key, label]
    );
  }
}

async function onboardingComplete(agentId) {
  const pending = await db.get(
    `SELECT COUNT(*) AS c FROM marketing_agent_onboarding_items
     WHERE agent_id = ? AND status NOT IN ('COMPLETED', 'WAIVED')`,
    [agentId]
  );
  return !pending || Number(pending.c) === 0;
}

async function findActivePolicy(onDate) {
  return db.get(
    `SELECT * FROM commission_policies
     WHERE status = 'ACTIVE'
       AND (effective_from IS NULL OR date(effective_from) <= date(?))
       AND (effective_to IS NULL OR date(effective_to) >= date(?))
     ORDER BY effective_from DESC LIMIT 1`,
    [onDate, onDate]
  );
}

function normalizePhone(value) {
  return String(value || '').replace(/[^\d+]/g, '');
}

module.exports = {
  SCREENING_MAX,
  INTERVIEW_MAX,
  ONBOARDING_ITEMS,
  APPLICATION_STATUSES,
  LEAD_STATUSES,
  hasPermission,
  requirePerm,
  scoreScreening,
  scoreInterview,
  screeningBand,
  rateForAmount,
  verifySyncKey,
  nextApplicationReference,
  nextAgentCode,
  nextLeadNumber,
  nextCommissionNumber,
  nextContractNumber,
  nextProposalNumber,
  nextPaymentNumber,
  referralUrl,
  notifyRole,
  seedOnboarding,
  onboardingComplete,
  findActivePolicy,
  normalizePhone
};
