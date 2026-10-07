const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const QRCode = require('qrcode');
const db = require('../config/database');
const { authenticateToken } = require('../utils/auth');
const { logAction } = require('../utils/audit');
const svc = require('../utils/marketingAgentService');

const router = express.Router();
const syncLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sync requests' }
});

function textValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return null;
}

function jsonText(value) {
  if (value == null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function buildPdf(lines) {
  const commands = lines.slice(0, 42).map((line, index) => {
    const safe = String(line).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    return `BT /F1 10 Tf 48 ${760 - index * 16} Td (${safe}) Tj ET`;
  }).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

function fail(res, error, label) {
  console.error(label, error);
  res.status(500).json({ error: label });
}

async function ownAgent(user) {
  if (!user) return null;
  return db.get('SELECT * FROM marketing_agents WHERE user_id = ?', [user.id]);
}

async function canSeeAgent(user, agent) {
  if (svc.hasPermission(user, 'marketing_agent.view')) return true;
  const mine = await ownAgent(user);
  return !!(mine && agent && mine.id === agent.id);
}

router.get('/permissions', authenticateToken, async (req, res) => {
  const keys = [
    'marketing_agent.applications.view', 'marketing_agent.applications.review',
    'marketing_agent.interviews.manage', 'marketing_agent.select',
    'marketing_agent.onboarding.manage', 'marketing_agent.activate',
    'marketing_agent.view', 'marketing_agent.edit', 'marketing_agent.suspend',
    'marketing_agent.terminate', 'lead.view', 'lead.manage', 'lead.assign',
    'commission.view', 'commission.calculate', 'commission.review',
    'commission.approve', 'commission.pay', 'commission.reverse',
    'reports.view', 'reports.export'
  ];
  const granted = {};
  keys.forEach((key) => { granted[key] = svc.hasPermission(req.user, key); });
  const agent = await ownAgent(req.user);
  res.json({ permissions: granted, ownAgentId: agent ? agent.id : null });
});

router.post('/sync/applications', syncLimiter, async (req, res) => {
  try {
    if (!svc.verifySyncKey(req.get('x-marketing-sync-key'))) {
      return res.status(401).json({ error: 'Unauthorized integration' });
    }
    const payload = req.body || {};
    const fullName = textValue(payload.full_name, payload.fullName, payload.name);
    if (!fullName) return res.status(400).json({ error: 'Applicant name is required' });
    const referenceKey = textValue(payload.reference, payload.applicationReference, payload.application_reference);
    const externalId = textValue(payload.external_id, payload.externalId, referenceKey);
    if (referenceKey || externalId) {
      const existing = await db.get(
        `SELECT reference FROM marketing_agent_applications
         WHERE reference = ? OR external_id = ? OR (? IS NOT NULL AND reference = ?)`,
        [referenceKey, externalId, externalId, externalId]
      );
      if (existing) {
        return res.json({ success: true, applicationReference: existing.reference, syncStatus: 'ALREADY_SYNCED' });
      }
    }
    const reference = referenceKey && referenceKey.startsWith('SVL-MA-APP-')
      ? referenceKey
      : await svc.nextApplicationReference();
    const email = textValue(payload.email);
    const phone = svc.normalizePhone(textValue(payload.phone));
    const whatsapp = svc.normalizePhone(textValue(payload.whatsapp, payload.whatsApp));
    let duplicateFlag = null;
    if (email || phone || whatsapp) {
      const possible = await db.get(
        `SELECT id FROM marketing_agent_applications
         WHERE (? != '' AND lower(email) = lower(?))
            OR (? != '' AND replace(replace(phone,' ',''),'-','') = ?)
            OR (? != '' AND replace(replace(whatsapp,' ',''),'-','') = ?)
         LIMIT 1`,
        [email || '', email || '', phone, phone, whatsapp, whatsapp]
      );
      if (possible) duplicateFlag = 'POSSIBLE_DUPLICATE_APPLICANT';
    }
    const result = await db.run(
      `INSERT INTO marketing_agent_applications (
        reference, external_id, full_name, phone, whatsapp, email, county, city,
        professional_status, occupation, organization, education, background, experience,
        network_sectors, preferred_sectors, network_description, outreach_channels,
        scenario_responses, availability, training_availability, reporting_willingness,
        conflict_disclosure, cv_reference, submitted_at, utm_source, utm_medium,
        utm_campaign, utm_content, source, status, duplicate_flag, integration_source, synced_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'NEW', ?, 'APPLICATION_PORTAL', CURRENT_TIMESTAMP)`,
      [
        reference, externalId || reference, fullName,
        textValue(payload.phone), textValue(payload.whatsapp, payload.whatsApp), email,
        textValue(payload.county), textValue(payload.city, payload.area, payload.general_area),
        textValue(payload.professional_status, payload.professionalStatus),
        textValue(payload.occupation), textValue(payload.organization),
        textValue(payload.education), textValue(payload.background, payload.professional_background),
        textValue(payload.experience),
        textValue(payload.network_sectors, payload.networkSectors),
        textValue(payload.preferred_sectors, payload.preferredSectors),
        textValue(payload.network_description, payload.networkDescription),
        textValue(payload.outreach_channels, payload.outreachChannels, payload.outreach_methods),
        jsonText(payload.scenario_responses || payload.scenarioResponses),
        textValue(payload.availability), textValue(payload.training_availability, payload.trainingAvailability),
        textValue(payload.reporting_willingness, payload.reportingWillingness),
        textValue(payload.conflict_disclosure, payload.conflictDisclosure),
        textValue(payload.cv_reference, payload.cvReference, payload.document_reference),
        textValue(payload.submitted_at, payload.submittedAt) || new Date().toISOString(),
        textValue(payload.utm_source, payload.utmSource),
        textValue(payload.utm_medium, payload.utmMedium),
        textValue(payload.utm_campaign, payload.utmCampaign),
        textValue(payload.utm_content, payload.utmContent),
        textValue(payload.source) || 'APPLICATION_PORTAL',
        duplicateFlag
      ]
    );
    await svc.notifyRole(['Admin', 'DepartmentHead'], 'New marketing agent application', `${fullName} submitted ${reference}`, '/marketing/applications');
    await logAction(null, 'MARKETING_APPLICATION_SYNCED', 'marketing_agents', result.lastID, { reference, source: 'APPLICATION_PORTAL' }, req);
    res.status(201).json({ success: true, applicationReference: reference, syncStatus: 'SYNCED', duplicateFlag });
  } catch (error) {
    fail(res, error, 'Failed to sync application');
  }
});

router.post('/sync/leads', syncLimiter, async (req, res) => {
  try {
    if (!svc.verifySyncKey(req.get('x-marketing-sync-key'))) {
      return res.status(401).json({ error: 'Unauthorized integration' });
    }
    const payload = req.body || {};
    const externalId = textValue(payload.external_id, payload.externalId, payload.lead_number, payload.leadNumber);
    const incomingNumber = textValue(payload.lead_number, payload.leadNumber);
    if (incomingNumber || externalId) {
      const existing = await db.get(
        'SELECT lead_number, attribution_status FROM sales_leads WHERE lead_number = ? OR external_id = ?',
        [incomingNumber || externalId, externalId || incomingNumber]
      );
      if (existing) {
        return res.json({
          success: true,
          leadNumber: existing.lead_number,
          syncStatus: 'ALREADY_SYNCED',
          attributionStatus: existing.attribution_status || null
        });
      }
    }
    const refCode = textValue(payload.referral_agent_code, payload.ref, payload.agent_code, payload.agentCode) || '';
    let agent = refCode ? await db.get('SELECT * FROM marketing_agents WHERE agent_code = ?', [refCode]) : null;
    let attributionStatus = 'NONE';
    let attributionNote = null;
    if (refCode) {
      const eligible = agent && agent.status === 'ACTIVE' && agent.referral_eligible;
      if (!eligible) {
        attributionStatus = 'REVIEW';
        attributionNote = agent
          ? `Referral ${refCode} is ${agent.status} and was not credited`
          : `Unknown referral ${refCode} was not credited`;
        agent = null;
      } else {
        attributionStatus = 'ATTRIBUTED';
      }
    }
    const leadNumber = incomingNumber || await svc.nextLeadNumber();
    const phone = svc.normalizePhone(textValue(payload.phone));
    const email = (textValue(payload.email) || '').toLowerCase();
    const company = textValue(payload.company_name, payload.company, payload.organization) || '';
    let duplicateFlag = null;
    if (email || phone || company) {
      const dup = await db.get(
        `SELECT id FROM sales_leads
         WHERE (? != '' AND lower(email) = ?)
            OR (? != '' AND replace(replace(phone,' ',''),'-','') = ?)
            OR (? != '' AND lower(company_name) = lower(?))
         LIMIT 1`,
        [email, email, phone, phone, company, company]
      );
      if (dup) duplicateFlag = 'POSSIBLE_DUPLICATE';
    }
    const result = await db.run(
      `INSERT INTO sales_leads (
        lead_number, external_id, company_name, contact_name, phone, whatsapp, email,
        location, industry, services_interested, business_challenge, budget_range,
        source, utm_source, utm_medium, utm_campaign, referral_agent_id, referral_agent_code,
        status, duplicate_flag, attribution_status, attribution_note, submitted_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'NEW', ?, ?, ?, ?)`,
      [
        leadNumber, externalId || leadNumber, company || null,
        textValue(payload.contact_name, payload.contact, payload.name),
        textValue(payload.phone), textValue(payload.whatsapp, payload.whatsApp), textValue(payload.email),
        textValue(payload.location), textValue(payload.industry),
        textValue(payload.services_interested, payload.service),
        textValue(payload.business_challenge, payload.challenge),
        textValue(payload.budget_range), textValue(payload.source) || 'softwarevalalib.app',
        textValue(payload.utm_source, payload.utmSource),
        textValue(payload.utm_medium, payload.utmMedium),
        textValue(payload.utm_campaign, payload.utmCampaign),
        agent ? agent.id : null, agent ? agent.agent_code : null, duplicateFlag,
        attributionStatus, attributionNote, textValue(payload.submitted_at, payload.submittedAt)
      ]
    );
    await db.run(
      `INSERT INTO sales_lead_activities (lead_id, action, to_status, notes) VALUES (?, 'created', 'NEW', ?)`,
      [result.lastID, attributionNote || (agent ? `Attributed to ${agent.agent_code}` : 'No referral agent')]
    );
    await logAction(null, 'lead_sync', 'sales_leads', result.lastID, { leadNumber, attributionStatus }, req);
    if (agent) {
      await svc.notifyRole(['Admin', 'DepartmentHead', 'Staff'], 'New agent lead', `${leadNumber} attributed to ${agent.agent_code}`, `/marketing/leads/${result.lastID}`);
    } else if (attributionStatus === 'REVIEW') {
      await svc.notifyRole(['Admin', 'DepartmentHead'], 'Lead attribution needs review', `${leadNumber}: ${attributionNote}`, `/marketing/leads/${result.lastID}`);
    }
    res.status(201).json({ success: true, leadNumber, syncStatus: 'SYNCED', attributionStatus, attributionNote, duplicateFlag });
  } catch (error) {
    fail(res, error, 'Failed to sync lead');
  }
});

router.get('/applications/stats', authenticateToken, svc.requirePerm('marketing_agent.applications.view'), async (req, res) => {
  try {
    const counts = await db.all(
      `SELECT status, COUNT(*) AS count FROM marketing_agent_applications GROUP BY status`
    );
    const byDate = await db.all(
      `SELECT date(COALESCE(submitted_at, created_at)) AS day, COUNT(*) AS count
       FROM marketing_agent_applications GROUP BY day ORDER BY day`
    );
    const byCounty = await db.all(
      `SELECT COALESCE(county, 'Unknown') AS label, COUNT(*) AS count FROM marketing_agent_applications GROUP BY county`
    );
    const bySector = await db.all(
      `SELECT COALESCE(preferred_sectors, 'Unspecified') AS label, COUNT(*) AS count FROM marketing_agent_applications GROUP BY preferred_sectors`
    );
    const byStatusProf = await db.all(
      `SELECT COALESCE(professional_status, 'Unspecified') AS label, COUNT(*) AS count FROM marketing_agent_applications GROUP BY professional_status`
    );
    const bySource = await db.all(
      `SELECT COALESCE(source, 'Unknown') AS label, COUNT(*) AS count FROM marketing_agent_applications GROUP BY source`
    );
    const map = Object.fromEntries(counts.map((row) => [row.status, row.count]));
    res.json({
      cards: {
        total: counts.reduce((sum, row) => sum + row.count, 0),
        new: map.NEW || 0,
        underReview: map.UNDER_REVIEW || 0,
        shortlisted: map.SHORTLISTED || 0,
        interviewScheduled: map.INTERVIEW_SCHEDULED || 0,
        interviewed: map.INTERVIEWED || 0,
        selected: (map.SELECTED || 0) + (map.ONBOARDING || 0),
        waitlisted: map.WAITLISTED || 0,
        notSelected: map.NOT_SELECTED || 0
      },
      byDate, byCounty, bySector, byProfessionalStatus: byStatusProf, bySource
    });
  } catch (error) {
    fail(res, error, 'Failed to load application stats');
  }
});

router.get('/applications', authenticateToken, svc.requirePerm('marketing_agent.applications.view'), async (req, res) => {
  try {
    const { status, county, sector, professional_status, source, reviewer, search, from, to, min_score, max_score, sort = 'submitted_at', dir = 'DESC', page = 1, limit = 25 } = req.query;
    const where = ['1=1'];
    const params = [];
    if (status) { where.push('a.status = ?'); params.push(status); }
    if (county) { where.push('a.county = ?'); params.push(county); }
    if (sector) { where.push('a.preferred_sectors LIKE ?'); params.push(`%${sector}%`); }
    if (professional_status) { where.push('a.professional_status = ?'); params.push(professional_status); }
    if (source) { where.push('a.source = ?'); params.push(source); }
    if (reviewer) { where.push('a.reviewer_id = ?'); params.push(reviewer); }
    if (from) { where.push('date(COALESCE(a.submitted_at, a.created_at)) >= date(?)'); params.push(from); }
    if (to) { where.push('date(COALESCE(a.submitted_at, a.created_at)) <= date(?)'); params.push(to); }
    if (min_score) { where.push('a.screening_total >= ?'); params.push(Number(min_score)); }
    if (max_score) { where.push('a.screening_total <= ?'); params.push(Number(max_score)); }
    if (search) {
      where.push('(a.reference LIKE ? OR a.full_name LIKE ? OR a.email LIKE ? OR a.phone LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const allowedSort = ['submitted_at', 'full_name', 'status', 'screening_total', 'county', 'reference'];
    const sortCol = allowedSort.includes(sort) ? sort : 'submitted_at';
    const direction = String(dir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const totalRow = await db.get(`SELECT COUNT(*) AS c FROM marketing_agent_applications a WHERE ${where.join(' AND ')}`, params);
    const rows = await db.all(
      `SELECT a.*, u.name AS reviewer_name
       FROM marketing_agent_applications a
       LEFT JOIN users u ON u.id = a.reviewer_id
       WHERE ${where.join(' AND ')}
       ORDER BY a.${sortCol} ${direction}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (pageNum - 1) * pageSize]
    );
    res.json({ applications: rows, total: totalRow ? totalRow.c : 0, page: pageNum, limit: pageSize });
  } catch (error) {
    fail(res, error, 'Failed to list applications');
  }
});

router.get('/applications/export', authenticateToken, svc.requirePerm('reports.export'), async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT reference, full_name, phone, email, county, professional_status, preferred_sectors, source,
              submitted_at, screening_total, status
       FROM marketing_agent_applications ORDER BY submitted_at DESC`
    );
    const header = Object.keys(rows[0] || { reference: '' });
    const csv = [header.join(','), ...rows.map((row) => header.map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="marketing-agent-applications.csv"');
    res.send(csv);
  } catch (error) {
    fail(res, error, 'Failed to export applications');
  }
});

router.get('/applications/:id', authenticateToken, svc.requirePerm('marketing_agent.applications.view'), async (req, res) => {
  try {
    const application = await db.get(
      `SELECT a.*, u.name AS reviewer_name FROM marketing_agent_applications a
       LEFT JOIN users u ON u.id = a.reviewer_id WHERE a.id = ?`,
      [req.params.id]
    );
    if (!application) return res.status(404).json({ error: 'Application not found' });
    const screening = await db.all(
      `SELECT s.*, u.name AS reviewer_name FROM marketing_agent_screening_scores s
       LEFT JOIN users u ON u.id = s.reviewer_id WHERE s.application_id = ? ORDER BY s.created_at DESC`,
      [application.id]
    );
    const interviews = await db.all(
      `SELECT i.*, u.name AS interviewer_name FROM marketing_agent_interviews i
       LEFT JOIN users u ON u.id = i.interviewer_id WHERE i.application_id = ? ORDER BY i.interview_date DESC`,
      [application.id]
    );
    const interviewScores = interviews.length
      ? await db.all(
        `SELECT * FROM marketing_agent_interview_scores WHERE interview_id IN (${interviews.map(() => '?').join(',')}) ORDER BY created_at DESC`,
        interviews.map((row) => row.id)
      )
      : [];
    const notes = await db.all(
      `SELECT n.*, u.name AS author_name FROM marketing_agent_notes n
       LEFT JOIN users u ON u.id = n.author_id WHERE n.application_id = ? ORDER BY n.created_at DESC`,
      [application.id]
    );
    const documents = await db.all('SELECT id, category, version, file_name, issue_date, signature_status, verification_status, created_at FROM marketing_agent_documents WHERE application_id = ?', [application.id]);
    const audits = await db.all(
      `SELECT a.action, a.details, a.created_at, u.name AS actor_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.module = 'marketing_agents' AND a.record_id = ? ORDER BY a.created_at ASC`,
      [application.id]
    );
    const linkedAgent = await db.get('SELECT id, agent_code, activation_date, status FROM marketing_agents WHERE application_id = ?', [application.id]);
    const timeline = [
      { event: 'Application Submitted', timestamp: application.submitted_at || application.created_at, actor: application.source, notes: application.reference }
    ];
    screening.slice().reverse().forEach((row) => timeline.push({ event: 'Screening Completed', timestamp: row.created_at, actor: row.reviewer_name, notes: `${row.total}/100` }));
    interviews.slice().reverse().forEach((row) => {
      timeline.push({ event: row.status === 'RESCHEDULED' ? 'Interview Rescheduled' : 'Interview Scheduled', timestamp: row.created_at, actor: row.interviewer_name, notes: `${row.interview_date || ''} ${row.interview_time || ''} ${row.format || ''}` });
      if (row.status === 'COMPLETED') timeline.push({ event: 'Interview Completed', timestamp: row.updated_at || row.created_at, actor: row.interviewer_name, notes: row.status });
    });
    const statusEvent = {
      UNDER_REVIEW: 'Review Started', SHORTLISTED: 'Shortlisted', WAITLISTED: 'Waitlisted',
      NOT_SELECTED: 'Not Selected', WITHDRAWN: 'Withdrawn', SELECTED: 'Selected', ONBOARDING: 'Onboarding Started'
    };
    if (statusEvent[application.status]) timeline.push({ event: statusEvent[application.status], timestamp: application.updated_at, actor: application.reviewer_name, notes: application.status });
    if (linkedAgent) {
      timeline.push({ event: 'Onboarding Started', timestamp: linkedAgent.activation_date || application.updated_at, actor: null, notes: 'Onboarding record created' });
      if (linkedAgent.agent_code) timeline.push({ event: 'Agent Activated', timestamp: linkedAgent.activation_date, actor: null, notes: linkedAgent.agent_code });
    }
    audits.forEach((row) => timeline.push({ event: row.action, timestamp: row.created_at, actor: row.actor_name, notes: row.details }));
    res.json({ application, screening, interviews, interviewScores, notes, documents, timeline, screeningMax: svc.SCREENING_MAX, interviewMax: svc.INTERVIEW_MAX });
  } catch (error) {
    fail(res, error, 'Failed to load application');
  }
});

router.post('/applications/:id/reviewer', authenticateToken, svc.requirePerm('marketing_agent.applications.review'), async (req, res) => {
  try {
    const ids = req.body.ids || [req.params.id];
    const reviewerId = req.body.reviewer_id;
    for (const id of ids) {
      await db.run('UPDATE marketing_agent_applications SET reviewer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [reviewerId || null, id]);
      await logAction(req.user.id, 'assign_reviewer', 'marketing_agents', id, { reviewerId }, req);
    }
    if (reviewerId) {
      await db.run(
        `INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, 'Application assigned', 'You were assigned marketing agent applications to review.', 'info', '/marketing/applications')`,
        [reviewerId]
      );
    }
    res.json({ updated: ids.length });
  } catch (error) {
    fail(res, error, 'Failed to assign reviewer');
  }
});

router.post('/applications/:id/status', authenticateToken, svc.requirePerm('marketing_agent.applications.review'), [
  body('status').isIn(svc.APPLICATION_STATUSES)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!req.body.confirm) return res.status(400).json({ error: 'Confirmation is required for status changes' });
    const application = await db.get('SELECT * FROM marketing_agent_applications WHERE id = ?', [req.params.id]);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    const next = req.body.status;
    if (['SELECTED', 'ONBOARDING'].includes(next) && !svc.hasPermission(req.user, 'marketing_agent.select')) {
      return res.status(403).json({ error: 'Selection requires management permission' });
    }
    await db.run('UPDATE marketing_agent_applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [next === 'SELECTED' ? 'ONBOARDING' : next, application.id]);
    if (next === 'SELECTED' || next === 'ONBOARDING') {
      const existingAgent = await db.get('SELECT id FROM marketing_agents WHERE application_id = ?', [application.id]);
      if (!existingAgent) {
        const created = await db.run(
          `INSERT INTO marketing_agents (application_id, full_name, phone, whatsapp, email, county, city, status, referral_eligible)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'ONBOARDING', 0)`,
          [application.id, application.full_name, application.phone, application.whatsapp, application.email, application.county, application.city]
        );
        await svc.seedOnboarding(created.lastID);
        await db.run(
          `INSERT INTO marketing_agent_status_history (agent_id, status, effective_date, reason, approved_by) VALUES (?, 'ONBOARDING', date('now'), 'Selected for onboarding', ?)`,
          [created.lastID, req.user.id]
        );
      }
    }
    await logAction(req.user.id, 'application_status', 'marketing_agents', application.id, { from: application.status, to: next }, req);
    res.json({ status: next === 'SELECTED' ? 'ONBOARDING' : next });
  } catch (error) {
    fail(res, error, 'Failed to update application status');
  }
});

router.post('/applications/:id/screening', authenticateToken, svc.requirePerm('marketing_agent.applications.review'), async (req, res) => {
  try {
    const scores = svc.scoreScreening(req.body);
    const result = await db.run(
      `INSERT INTO marketing_agent_screening_scores
       (application_id, reviewer_id, communication, network, sales_ability, technology, reliability, integrity, total, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, req.user.id, scores.communication, scores.network, scores.sales_ability, scores.technology, scores.reliability, scores.integrity, scores.total, req.body.notes || null]
    );
    await db.run('UPDATE marketing_agent_applications SET screening_total = ?, status = CASE WHEN status = \'NEW\' THEN \'UNDER_REVIEW\' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [scores.total, req.params.id]);
    await logAction(req.user.id, 'screening_score', 'marketing_agents', req.params.id, { total: scores.total, band: svc.screeningBand(scores.total) }, req);
    res.status(201).json({ id: result.lastID, ...scores, band: svc.screeningBand(scores.total) });
  } catch (error) {
    fail(res, error, 'Failed to save screening score');
  }
});

router.post('/applications/:id/interviews', authenticateToken, svc.requirePerm('marketing_agent.interviews.manage'), async (req, res) => {
  try {
    const result = await db.run(
      `INSERT INTO marketing_agent_interviews
       (application_id, interview_date, interview_time, timezone, format, location, meeting_link, interviewer_id, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id, req.body.interview_date || null, req.body.interview_time || null,
        req.body.timezone || 'Africa/Monrovia', req.body.format || 'Phone', req.body.location || null,
        req.body.meeting_link || null, req.body.interviewer_id || req.user.id, req.body.notes || null,
        req.body.status || 'SCHEDULED'
      ]
    );
    await db.run(`UPDATE marketing_agent_applications SET status = 'INTERVIEW_SCHEDULED', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('SHORTLISTED', 'UNDER_REVIEW', 'NEW')`, [req.params.id]);
    const interviewerId = req.body.interviewer_id || req.user.id;
    await db.run(
      `INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, 'Interview scheduled', 'A marketing agent interview was scheduled.', 'info', ?)`,
      [interviewerId, `/marketing/applications/${req.params.id}`]
    );
    await logAction(req.user.id, 'schedule_interview', 'marketing_agents', req.params.id, req.body, req);
    res.status(201).json({ id: result.lastID });
  } catch (error) {
    fail(res, error, 'Failed to schedule interview');
  }
});

router.post('/interviews/:id/score', authenticateToken, svc.requirePerm('marketing_agent.interviews.manage'), async (req, res) => {
  try {
    const scores = svc.scoreInterview(req.body);
    const allowed = ['STRONGLY_RECOMMEND', 'RECOMMEND', 'CONSIDER', 'DO_NOT_RECOMMEND'];
    const recommendation = allowed.includes(req.body.recommendation) ? req.body.recommendation : null;
    const result = await db.run(
      `INSERT INTO marketing_agent_interview_scores
       (interview_id, interviewer_id, communication, mindset, prospecting, judgment, professionalism, availability, total, strengths, concerns, notes, recommendation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, req.user.id, scores.communication, scores.mindset, scores.prospecting, scores.judgment, scores.professionalism, scores.availability, scores.total, req.body.strengths || null, req.body.concerns || null, req.body.notes || null, recommendation]
    );
    await db.run(`UPDATE marketing_agent_interviews SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    const interview = await db.get('SELECT application_id FROM marketing_agent_interviews WHERE id = ?', [req.params.id]);
    if (interview) {
      await db.run(`UPDATE marketing_agent_applications SET status = 'INTERVIEWED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [interview.application_id]);
      await logAction(req.user.id, 'interview_score', 'marketing_agents', interview.application_id, { total: scores.total, recommendation }, req);
    }
    res.status(201).json({ id: result.lastID, ...scores, recommendation });
  } catch (error) {
    fail(res, error, 'Failed to save interview score');
  }
});

router.post('/applications/:id/notes', authenticateToken, svc.requirePerm('marketing_agent.applications.review'), async (req, res) => {
  try {
    if (!req.body.body) return res.status(400).json({ error: 'Note is required' });
    const result = await db.run(
      'INSERT INTO marketing_agent_notes (application_id, author_id, body) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, req.body.body]
    );
    res.status(201).json({ id: result.lastID });
  } catch (error) {
    fail(res, error, 'Failed to save note');
  }
});

router.get('/agents', authenticateToken, async (req, res) => {
  try {
    const mine = await ownAgent(req.user);
    if (!svc.hasPermission(req.user, 'marketing_agent.view')) {
      if (!mine) return res.status(403).json({ error: 'Insufficient permissions' });
      return res.json({ agents: [mine] });
    }
    const { status, search } = req.query;
    const where = ['1=1'];
    const params = [];
    if (status) { where.push('a.status = ?'); params.push(status); }
    if (search) {
      where.push('(a.full_name LIKE ? OR a.agent_code LIKE ? OR a.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const agents = await db.all(
      `SELECT a.*, u.name AS supervisor_name FROM marketing_agents a
       LEFT JOIN users u ON u.id = a.supervisor_id
       WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC`,
      params
    );
    res.json({ agents });
  } catch (error) {
    fail(res, error, 'Failed to list agents');
  }
});

router.get('/agents/:id', authenticateToken, async (req, res) => {
  try {
    const agent = await db.get(
      `SELECT a.*, u.name AS supervisor_name FROM marketing_agents a
       LEFT JOIN users u ON u.id = a.supervisor_id WHERE a.id = ?`,
      [req.params.id]
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!(await canSeeAgent(req.user, agent))) return res.status(403).json({ error: 'Insufficient permissions' });
    const onboarding = await db.all('SELECT * FROM marketing_agent_onboarding_items WHERE agent_id = ? ORDER BY id', [agent.id]);
    const documents = await db.all('SELECT id, category, version, file_name, issue_date, acknowledged_date, signature_status, verification_status, created_at FROM marketing_agent_documents WHERE agent_id = ?', [agent.id]);
    const notes = await db.all('SELECT n.*, u.name AS author_name FROM marketing_agent_notes n LEFT JOIN users u ON u.id = n.author_id WHERE n.agent_id = ? ORDER BY n.created_at DESC', [agent.id]);
    const history = await db.all('SELECT h.*, u.name AS approver_name FROM marketing_agent_status_history h LEFT JOIN users u ON u.id = h.approved_by WHERE h.agent_id = ? ORDER BY h.created_at DESC', [agent.id]);
    const leads = await db.all('SELECT id, lead_number, company_name, status, created_at FROM sales_leads WHERE referral_agent_id = ? ORDER BY created_at DESC', [agent.id]);
    const commissions = svc.hasPermission(req.user, 'commission.view') || (await ownAgent(req.user))?.id === agent.id
      ? await db.all('SELECT * FROM commissions WHERE agent_id = ? ORDER BY created_at DESC', [agent.id])
      : [];
    res.json({
      agent,
      referralUrl: agent.agent_code ? svc.referralUrl(agent.agent_code) : null,
      onboarding,
      documents,
      notes,
      history,
      leads,
      commissions
    });
  } catch (error) {
    fail(res, error, 'Failed to load agent');
  }
});

router.get('/agents/:id/referral-qr', authenticateToken, async (req, res) => {
  try {
    const agent = await db.get('SELECT * FROM marketing_agents WHERE id = ?', [req.params.id]);
    if (!agent || !agent.agent_code) return res.status(404).json({ error: 'Active agent code required' });
    if (!(await canSeeAgent(req.user, agent))) return res.status(403).json({ error: 'Insufficient permissions' });
    const dataUrl = await QRCode.toDataURL(svc.referralUrl(agent.agent_code), { margin: 1, width: 280 });
    res.json({ dataUrl, url: svc.referralUrl(agent.agent_code) });
  } catch (error) {
    fail(res, error, 'Failed to generate referral QR');
  }
});

router.post('/agents/:id/onboarding/:itemId', authenticateToken, svc.requirePerm('marketing_agent.onboarding.manage'), async (req, res) => {
  try {
    const status = req.body.status;
    if (!['NOT_STARTED', 'PENDING', 'COMPLETED', 'WAIVED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid onboarding status' });
    }
    if (status === 'WAIVED' && (!req.body.reason || !svc.hasPermission(req.user, 'marketing_agent.activate'))) {
      return res.status(400).json({ error: 'A waiver requires an authorized approver and a reason' });
    }
    await db.run(
      `UPDATE marketing_agent_onboarding_items
       SET status = ?, completed_by = ?, completed_at = CASE WHEN ? IN ('COMPLETED','WAIVED') THEN CURRENT_TIMESTAMP ELSE NULL END,
           notes = ?, waived_by = CASE WHEN ? = 'WAIVED' THEN ? ELSE NULL END, waive_reason = ?
       WHERE id = ? AND agent_id = ?`,
      [status, req.user.id, status, req.body.notes || null, status, req.user.id, req.body.reason || null, req.params.itemId, req.params.id]
    );
    await logAction(req.user.id, 'onboarding_item', 'marketing_agents', req.params.id, { itemId: req.params.itemId, status }, req);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error, 'Failed to update onboarding item');
  }
});

router.post('/agents/:id/activate', authenticateToken, svc.requirePerm('marketing_agent.activate'), async (req, res) => {
  try {
    if (!req.body.confirm) return res.status(400).json({ error: 'Confirmation is required' });
    const agent = await db.get('SELECT * FROM marketing_agents WHERE id = ?', [req.params.id]);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (agent.agent_code) return res.status(409).json({ error: 'Agent ID already issued and cannot be regenerated', agent_code: agent.agent_code });
    if (!(await svc.onboardingComplete(agent.id))) {
      return res.status(400).json({ error: 'Mandatory onboarding items must be completed or waived before activation' });
    }
    const agentCode = await svc.nextAgentCode();
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 90);
    await db.run(
      `UPDATE marketing_agents
       SET agent_code = ?, status = 'ACTIVE', referral_eligible = 1, activation_date = date('now'),
           engagement_start_date = date('now'), engagement_end_date = ?, contract_end_date = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND agent_code IS NULL`,
      [agentCode, end.toISOString().slice(0, 10), end.toISOString().slice(0, 10), agent.id]
    );
    await db.run(
      `INSERT INTO marketing_agent_status_history (agent_id, status, effective_date, reason, approved_by) VALUES (?, 'ACTIVE', date('now'), 'Activated after onboarding', ?)`,
      [agent.id, req.user.id]
    );
    await logAction(req.user.id, 'activate_agent', 'marketing_agents', agent.id, { agentCode }, req);
    await svc.notifyRole(['Admin', 'DepartmentHead'], 'Marketing agent activated', `${agent.full_name} is ${agentCode}`, `/marketing/agents/${agent.id}`);
    res.json({ agent_code: agentCode, referralUrl: svc.referralUrl(agentCode) });
  } catch (error) {
    fail(res, error, 'Failed to activate agent');
  }
});

router.post('/agents/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status, reason, effective_date, confirm } = req.body;
    if (!confirm) return res.status(400).json({ error: 'Confirmation is required' });
    if (!['INACTIVE', 'SUSPENDED', 'TERMINATED', 'EXPIRED', 'ACTIVE'].includes(status)) {
      return res.status(400).json({ error: 'Invalid agent status' });
    }
    if (status === 'TERMINATED' && !svc.hasPermission(req.user, 'marketing_agent.terminate')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    if (['SUSPENDED', 'INACTIVE', 'EXPIRED', 'ACTIVE'].includes(status) && !svc.hasPermission(req.user, 'marketing_agent.suspend')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    if (!reason) return res.status(400).json({ error: 'A reason is required' });
    const eligible = status === 'ACTIVE' ? 1 : 0;
    await db.run(
      `UPDATE marketing_agents SET status = ?, referral_eligible = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, eligible, req.params.id]
    );
    await db.run(
      `INSERT INTO marketing_agent_status_history (agent_id, status, effective_date, reason, approved_by) VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, status, effective_date || new Date().toISOString().slice(0, 10), reason, req.user.id]
    );
    await logAction(req.user.id, 'agent_status', 'marketing_agents', req.params.id, { status, reason }, req);
    res.json({ status });
  } catch (error) {
    fail(res, error, 'Failed to update agent status');
  }
});

router.post('/agents/:id/documents', authenticateToken, svc.requirePerm('marketing_agent.onboarding.manage'), async (req, res) => {
  try {
    const result = await db.run(
      `INSERT INTO marketing_agent_documents
       (agent_id, category, version, file_name, file_path, issue_date, acknowledged_date, signature_status, verification_status, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id, req.body.category || 'Other', req.body.version || null, req.body.file_name || null,
        req.body.file_path || null, req.body.issue_date || null, req.body.acknowledged_date || null,
        req.body.signature_status || 'UNSIGNED', req.body.verification_status || 'PENDING', req.user.id
      ]
    );
    res.status(201).json({ id: result.lastID });
  } catch (error) {
    fail(res, error, 'Failed to record document');
  }
});

router.get('/leads', authenticateToken, svc.requirePerm('lead.view'), async (req, res) => {
  try {
    const { status, search } = req.query;
    const where = ['1=1'];
    const params = [];
    if (status) { where.push('l.status = ?'); params.push(status); }
    if (search) {
      where.push('(l.lead_number LIKE ? OR l.company_name LIKE ? OR l.contact_name LIKE ? OR l.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const leads = await db.all(
      `SELECT l.*, a.agent_code, a.full_name AS agent_name, u.name AS staff_name
       FROM sales_leads l
       LEFT JOIN marketing_agents a ON a.id = l.referral_agent_id
       LEFT JOIN users u ON u.id = l.assigned_staff_id
       WHERE ${where.join(' AND ')}
       ORDER BY l.updated_at DESC`,
      params
    );
    res.json({ leads, statuses: svc.LEAD_STATUSES });
  } catch (error) {
    fail(res, error, 'Failed to list leads');
  }
});

router.get('/leads/:id', authenticateToken, svc.requirePerm('lead.view'), async (req, res) => {
  try {
    const lead = await db.get(
      `SELECT l.*, a.agent_code, a.full_name AS agent_name, u.name AS staff_name
       FROM sales_leads l
       LEFT JOIN marketing_agents a ON a.id = l.referral_agent_id
       LEFT JOIN users u ON u.id = l.assigned_staff_id
       WHERE l.id = ?`,
      [req.params.id]
    );
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const activities = await db.all('SELECT act.*, u.name AS actor_name FROM sales_lead_activities act LEFT JOIN users u ON u.id = act.actor_id WHERE act.lead_id = ? ORDER BY act.created_at DESC', [lead.id]);
    const proposals = await db.all('SELECT * FROM sales_proposals WHERE lead_id = ? ORDER BY created_at DESC', [lead.id]);
    const contracts = await db.all('SELECT * FROM sales_contracts WHERE lead_id = ? ORDER BY created_at DESC', [lead.id]);
    const payments = await db.all(
      `SELECT p.* FROM client_cash_payments p
       JOIN sales_contracts c ON c.id = p.contract_id
       WHERE c.lead_id = ? ORDER BY p.payment_date DESC`,
      [lead.id]
    );
    res.json({ lead, activities, proposals, contracts, payments });
  } catch (error) {
    fail(res, error, 'Failed to load lead');
  }
});

router.post('/leads', authenticateToken, svc.requirePerm('lead.manage'), async (req, res) => {
  try {
    const leadNumber = await svc.nextLeadNumber();
    let agentId = null;
    let agentCode = null;
    if (req.body.referral_agent_code) {
      const agent = await db.get('SELECT * FROM marketing_agents WHERE agent_code = ?', [req.body.referral_agent_code]);
      if (!agent) return res.status(422).json({ error: 'Unknown referral agent' });
      agentId = agent.id;
      agentCode = agent.agent_code;
    }
    const result = await db.run(
      `INSERT INTO sales_leads (
        lead_number, company_name, contact_name, phone, whatsapp, email, location, industry,
        services_interested, business_challenge, budget_range, source, referral_agent_id, referral_agent_code,
        assigned_staff_id, priority, status, next_follow_up
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'NEW', ?)`,
      [
        leadNumber, req.body.company_name || null, req.body.contact_name || null, req.body.phone || null,
        req.body.whatsapp || null, req.body.email || null, req.body.location || null, req.body.industry || null,
        req.body.services_interested || null, req.body.business_challenge || null, req.body.budget_range || null,
        req.body.source || 'internal', agentId, agentCode, req.body.assigned_staff_id || null,
        req.body.priority || 'NORMAL', req.body.next_follow_up || null
      ]
    );
    await db.run(`INSERT INTO sales_lead_activities (lead_id, actor_id, action, to_status) VALUES (?, ?, 'created', 'NEW')`, [result.lastID, req.user.id]);
    res.status(201).json({ id: result.lastID, lead_number: leadNumber });
  } catch (error) {
    fail(res, error, 'Failed to create lead');
  }
});

router.post('/leads/:id/status', authenticateToken, svc.requirePerm('lead.manage'), async (req, res) => {
  try {
    const lead = await db.get('SELECT * FROM sales_leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!svc.LEAD_STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Invalid lead status' });
    if (req.body.status === 'LOST' && !req.body.lost_reason) return res.status(400).json({ error: 'A lost reason is required' });
    await db.run(
      `UPDATE sales_leads SET status = ?, lost_reason = COALESCE(?, lost_reason), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.body.status, req.body.lost_reason || null, lead.id]
    );
    await db.run(
      `INSERT INTO sales_lead_activities (lead_id, actor_id, action, from_status, to_status, notes) VALUES (?, ?, 'status_change', ?, ?, ?)`,
      [lead.id, req.user.id, lead.status, req.body.status, req.body.lost_reason || null]
    );
    if (req.body.status === 'WON' && req.body.create_client && !lead.client_id) {
      const clientCode = `SVL-CL-${Date.now()}`;
      const created = await db.run(
        `INSERT INTO clients (client_id, company_name, status) VALUES (?, ?, 'Active')`,
        [clientCode, lead.company_name || lead.contact_name || lead.lead_number]
      );
      await db.run('UPDATE sales_leads SET client_id = ? WHERE id = ?', [created.lastID, lead.id]);
    }
    await logAction(req.user.id, 'lead_status', 'sales_leads', lead.id, { from: lead.status, to: req.body.status }, req);
    res.json({ status: req.body.status });
  } catch (error) {
    fail(res, error, 'Failed to update lead');
  }
});

router.post('/leads/:id/assign', authenticateToken, svc.requirePerm('lead.assign'), async (req, res) => {
  try {
    const lead = await db.get('SELECT referral_agent_id, referral_agent_code FROM sales_leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    await db.run(
      `UPDATE sales_leads SET assigned_staff_id = ?, referral_agent_id = ?, referral_agent_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.body.assigned_staff_id || null, lead.referral_agent_id, lead.referral_agent_code, req.params.id]
    );
    await db.run(
      `INSERT INTO sales_lead_activities (lead_id, actor_id, action, notes) VALUES (?, ?, 'assign_staff', ?)`,
      [req.params.id, req.user.id, `Assigned staff ${req.body.assigned_staff_id || 'none'}`]
    );
    res.json({ ok: true, referral_agent_id: lead.referral_agent_id });
  } catch (error) {
    fail(res, error, 'Failed to assign lead');
  }
});

router.post('/leads/:id/duplicate-decision', authenticateToken, svc.requirePerm('lead.manage'), async (req, res) => {
  try {
    const decision = req.body.decision;
    if (!['KEEP_SEPARATE', 'LINK', 'REJECT_DUPLICATE'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid duplicate decision' });
    }
    if (decision === 'LINK') {
      if (!req.body.related_lead_id) return res.status(400).json({ error: 'Related lead is required' });
      await db.run(
        `INSERT INTO sales_lead_links (lead_id, related_lead_id, link_type, decided_by) VALUES (?, ?, 'LINK', ?)`,
        [req.params.id, req.body.related_lead_id, req.user.id]
      );
    }
    const flag = decision === 'KEEP_SEPARATE' ? null : decision;
    await db.run('UPDATE sales_leads SET duplicate_flag = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [flag, req.params.id]);
    await logAction(req.user.id, 'lead_duplicate_decision', 'sales_leads', req.params.id, req.body, req);
    res.json({ decision });
  } catch (error) {
    fail(res, error, 'Failed to record duplicate decision');
  }
});

router.post('/proposals', authenticateToken, svc.requirePerm('lead.manage'), async (req, res) => {
  try {
    const lead = req.body.lead_id ? await db.get('SELECT * FROM sales_leads WHERE id = ?', [req.body.lead_id]) : null;
    const number = await svc.nextProposalNumber();
    const result = await db.run(
      `INSERT INTO sales_proposals
       (proposal_number, lead_id, client_id, referral_agent_id, prepared_by, services, value, currency, status, expiry_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)`,
      [
        number, lead ? lead.id : null, lead ? lead.client_id : (req.body.client_id || null),
        lead ? lead.referral_agent_id : null, req.user.id, req.body.services || null,
        req.body.value || null, req.body.currency || 'USD', req.body.expiry_date || null, req.body.notes || null
      ]
    );
    res.status(201).json({ id: result.lastID, proposal_number: number });
  } catch (error) {
    fail(res, error, 'Failed to create proposal');
  }
});

router.post('/proposals/:id/status', authenticateToken, svc.requirePerm('lead.assign'), async (req, res) => {
  try {
    const allowed = ['DRAFT', 'INTERNAL_REVIEW', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'REVISED'];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Invalid proposal status' });
    await db.run(
      `UPDATE sales_proposals SET status = ?, sent_date = CASE WHEN ? = 'SENT' THEN date('now') ELSE sent_date END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.body.status, req.body.status, req.params.id]
    );
    res.json({ status: req.body.status });
  } catch (error) {
    fail(res, error, 'Failed to update proposal');
  }
});

router.get('/contracts', authenticateToken, svc.requirePerm('lead.view'), async (req, res) => {
  try {
    const contracts = await db.all(
      `SELECT c.*, a.agent_code, cl.company_name, l.lead_number
       FROM sales_contracts c
       LEFT JOIN marketing_agents a ON a.id = c.referral_agent_id
       LEFT JOIN clients cl ON cl.id = c.client_id
       LEFT JOIN sales_leads l ON l.id = c.lead_id
       ORDER BY c.created_at DESC`
    );
    res.json({ contracts });
  } catch (error) {
    fail(res, error, 'Failed to list contracts');
  }
});

router.post('/contracts', authenticateToken, svc.requirePerm('lead.assign'), async (req, res) => {
  try {
    const lead = req.body.lead_id ? await db.get('SELECT * FROM sales_leads WHERE id = ?', [req.body.lead_id]) : null;
    const number = await svc.nextContractNumber();
    const result = await db.run(
      `INSERT INTO sales_contracts
       (contract_number, client_id, lead_id, referral_agent_id, contract_value, currency, signed_date, start_date, end_date, status, commission_eligible, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        number, req.body.client_id || (lead && lead.client_id) || null, lead ? lead.id : null,
        lead ? lead.referral_agent_id : (req.body.referral_agent_id || null),
        req.body.contract_value || null, req.body.currency || 'USD', req.body.signed_date || null,
        req.body.start_date || null, req.body.end_date || null, req.body.status || 'DRAFT',
        req.body.commission_eligible === false ? 0 : 1, req.body.notes || null
      ]
    );
    res.status(201).json({ id: result.lastID, contract_number: number });
  } catch (error) {
    fail(res, error, 'Failed to create contract');
  }
});

router.post('/payments', authenticateToken, svc.requirePerm('commission.calculate'), async (req, res) => {
  try {
    const number = await svc.nextPaymentNumber();
    const result = await db.run(
      `INSERT INTO client_cash_payments
       (payment_number, client_id, contract_id, invoice_reference, amount, currency, payment_date, method, status, reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      [
        number, req.body.client_id || null, req.body.contract_id || null, req.body.invoice_reference || null,
        req.body.amount, req.body.currency || 'USD', req.body.payment_date || null, req.body.method || null, req.body.reference || null
      ]
    );
    res.status(201).json({ id: result.lastID, payment_number: number });
  } catch (error) {
    fail(res, error, 'Failed to record payment');
  }
});

router.post('/payments/:id/verify', authenticateToken, svc.requirePerm('commission.review'), async (req, res) => {
  try {
    const payment = await db.get('SELECT * FROM client_cash_payments WHERE id = ?', [req.params.id]);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.status === 'VERIFIED') return res.status(409).json({ error: 'Payment is already verified' });
    await db.run(
      `UPDATE client_cash_payments SET status = 'VERIFIED', verified_by = ?, verified_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.user.id, payment.id]
    );
    const existing = await db.get('SELECT id FROM commissions WHERE payment_id = ?', [payment.id]);
    if (existing) return res.json({ verified: true, commission_id: existing.id, alreadyCalculated: true });
    const contract = payment.contract_id ? await db.get('SELECT * FROM sales_contracts WHERE id = ?', [payment.contract_id]) : null;
    if (!contract || !contract.referral_agent_id || !contract.commission_eligible) {
      await logAction(req.user.id, 'verify_payment', 'client_cash_payments', payment.id, { commission: 'not_eligible' }, req);
      return res.json({ verified: true, commission: null });
    }
    const policy = await svc.findActivePolicy(payment.payment_date || new Date().toISOString().slice(0, 10));
    if (!policy) return res.status(409).json({ error: 'Payment verified, but no ACTIVE commission policy covers this date. Activate a policy before calculating commission.', verified: true });
    const tiers = await db.all('SELECT * FROM commission_policy_tiers WHERE policy_id = ?', [policy.id]);
    const rated = svc.rateForAmount(tiers, payment.amount);
    if (!rated) return res.status(409).json({ error: 'No commission tier matches this payment amount', verified: true });
    const number = await svc.nextCommissionNumber();
    const created = await db.run(
      `INSERT INTO commissions
       (commission_number, agent_id, lead_id, client_id, contract_id, payment_id, eligible_revenue, rate_percent, gross_commission, adjustment, final_commission, policy_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'CALCULATED')`,
      [
        number, contract.referral_agent_id, contract.lead_id, contract.client_id, contract.id, payment.id,
        payment.amount, rated.rate, rated.gross, rated.gross, policy.id
      ]
    );
    await logAction(req.user.id, 'calculate_commission', 'commissions', created.lastID, { number, policy: policy.policy_code }, req);
    res.json({ verified: true, commission_id: created.lastID, commission_number: number, final_commission: rated.gross });
  } catch (error) {
    fail(res, error, 'Failed to verify payment');
  }
});

router.get('/commissions', authenticateToken, async (req, res) => {
  try {
    const mine = await ownAgent(req.user);
    if (!svc.hasPermission(req.user, 'commission.view') && !mine) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const params = [];
    let agentFilter = '';
    if (!svc.hasPermission(req.user, 'commission.view') && mine) {
      agentFilter = 'WHERE c.agent_id = ?';
      params.push(mine.id);
    } else if (req.query.agent_id) {
      agentFilter = 'WHERE c.agent_id = ?';
      params.push(req.query.agent_id);
    }
    const rows = await db.all(
      `SELECT c.*, a.agent_code, a.full_name, p.policy_code, cl.company_name, sc.contract_number, pay.payment_number
       FROM commissions c
       JOIN marketing_agents a ON a.id = c.agent_id
       LEFT JOIN commission_policies p ON p.id = c.policy_id
       LEFT JOIN clients cl ON cl.id = c.client_id
       LEFT JOIN sales_contracts sc ON sc.id = c.contract_id
       LEFT JOIN client_cash_payments pay ON pay.id = c.payment_id
       ${agentFilter}
       ORDER BY c.created_at DESC`,
      params
    );
    res.json({ commissions: rows });
  } catch (error) {
    fail(res, error, 'Failed to list commissions');
  }
});

router.post('/commissions/:id/status', authenticateToken, async (req, res) => {
  try {
    const next = req.body.status;
    const needs = {
      UNDER_REVIEW: 'commission.review',
      APPROVED: 'commission.approve',
      PAYMENT_SCHEDULED: 'commission.pay',
      PAID: 'commission.pay',
      HELD: 'commission.review',
      CANCELLED: 'commission.reverse'
    };
    if (!needs[next] || !svc.hasPermission(req.user, needs[next])) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const commission = await db.get('SELECT * FROM commissions WHERE id = ?', [req.params.id]);
    if (!commission) return res.status(404).json({ error: 'Commission not found' });
    if (commission.status === 'PAID' && next !== 'PAID') {
      return res.status(400).json({ error: 'Paid commissions are changed only by an adjustment or reversal' });
    }
    await db.run(
      `UPDATE commissions SET status = ?,
        approved_by = CASE WHEN ? = 'APPROVED' THEN ? ELSE approved_by END,
        approved_at = CASE WHEN ? = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE approved_at END,
        paid_at = CASE WHEN ? = 'PAID' THEN CURRENT_TIMESTAMP ELSE paid_at END,
        payment_reference = COALESCE(?, payment_reference),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [next, next, req.user.id, next, next, req.body.payment_reference || null, commission.id]
    );
    await logAction(req.user.id, 'commission_status', 'commissions', commission.id, { from: commission.status, to: next }, req);
    res.json({ status: next });
  } catch (error) {
    fail(res, error, 'Failed to update commission');
  }
});

router.post('/commissions/:id/adjustments', authenticateToken, svc.requirePerm('commission.reverse'), async (req, res) => {
  try {
    const commission = await db.get('SELECT * FROM commissions WHERE id = ?', [req.params.id]);
    if (!commission) return res.status(404).json({ error: 'Commission not found' });
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || !req.body.reason) return res.status(400).json({ error: 'Amount and reason are required' });
    await db.run(
      `INSERT INTO commission_adjustments (commission_id, adjustment_type, amount, reason, approved_by) VALUES (?, ?, ?, ?, ?)`,
      [commission.id, req.body.adjustment_type || 'REVERSAL', amount, req.body.reason, req.user.id]
    );
    const nextFinal = Math.round((Number(commission.final_commission) + amount) * 100) / 100;
    await db.run(
      `UPDATE commissions SET adjustment = adjustment + ?, final_commission = ?, status = CASE WHEN ? < 0 THEN 'REVERSED' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [amount, nextFinal, amount, commission.id]
    );
    await logAction(req.user.id, 'commission_adjustment', 'commissions', commission.id, { amount, reason: req.body.reason }, req);
    res.status(201).json({ final_commission: nextFinal });
  } catch (error) {
    fail(res, error, 'Failed to record adjustment');
  }
});

router.get('/policies', authenticateToken, svc.requirePerm('commission.view'), async (req, res) => {
  try {
    const policies = await db.all('SELECT * FROM commission_policies ORDER BY created_at DESC');
    const tiers = await db.all('SELECT * FROM commission_policy_tiers ORDER BY sort_order');
    res.json({ policies, tiers });
  } catch (error) {
    fail(res, error, 'Failed to load policies');
  }
});

router.post('/policies/:id/activate', authenticateToken, svc.requirePerm('commission.approve'), async (req, res) => {
  try {
    if (!req.body.confirm) return res.status(400).json({ error: 'Confirmation is required' });
    await db.run(`UPDATE commission_policies SET status = 'RETIRED' WHERE status = 'ACTIVE'`);
    await db.run(`UPDATE commission_policies SET status = 'ACTIVE' WHERE id = ?`, [req.params.id]);
    await logAction(req.user.id, 'activate_commission_policy', 'commission_policies', req.params.id, {}, req);
    res.json({ status: 'ACTIVE' });
  } catch (error) {
    fail(res, error, 'Failed to activate policy');
  }
});

router.get('/reports/overview', authenticateToken, svc.requirePerm('reports.view'), async (req, res) => {
  try {
    const applications = await db.get('SELECT COUNT(*) AS c FROM marketing_agent_applications');
    const selected = await db.get(`SELECT COUNT(*) AS c FROM marketing_agent_applications WHERE status IN ('SELECTED','ONBOARDING')`);
    const activeAgents = await db.get(`SELECT COUNT(*) AS c FROM marketing_agents WHERE status = 'ACTIVE'`);
    const leads = await db.get('SELECT COUNT(*) AS c FROM sales_leads');
    const qualified = await db.get(`SELECT COUNT(*) AS c FROM sales_leads WHERE status IN ('QUALIFIED','MEETING_SCHEDULED','PROPOSAL_PREPARATION','PROPOSAL_SENT','NEGOTIATION','WON')`);
    const meetings = await db.get(`SELECT COUNT(*) AS c FROM sales_leads WHERE status = 'MEETING_SCHEDULED'`);
    const proposals = await db.get('SELECT COUNT(*) AS c FROM sales_proposals');
    const contracts = await db.get(`SELECT COUNT(*) AS c FROM sales_contracts WHERE status IN ('ACTIVE','COMPLETED')`);
    const collected = await db.get(`SELECT COALESCE(SUM(amount),0) AS total FROM client_cash_payments WHERE status = 'VERIFIED'`);
    const earned = await db.get(`SELECT COALESCE(SUM(final_commission),0) AS total FROM commissions WHERE status NOT IN ('CANCELLED')`);
    const paid = await db.get(`SELECT COALESCE(SUM(final_commission),0) AS total FROM commissions WHERE status = 'PAID'`);
    const sectors = await db.all(`SELECT COALESCE(industry,'Unspecified') AS label, COUNT(*) AS count FROM sales_leads GROUP BY industry`);
    const channels = await db.all(`SELECT COALESCE(source,'Unknown') AS label, COUNT(*) AS count FROM marketing_agent_applications GROUP BY source`);
    const overdue = await db.all(`SELECT id, lead_number, company_name, next_follow_up FROM sales_leads WHERE next_follow_up IS NOT NULL AND date(next_follow_up) < date('now') AND status NOT IN ('WON','LOST')`);
    const expiring = await db.all(
      `SELECT id, full_name, agent_code, engagement_end_date FROM marketing_agents
       WHERE status = 'ACTIVE' AND engagement_end_date IS NOT NULL
         AND date(engagement_end_date) <= date('now', '+30 day')`
    );
    const awaitingReview = await db.get(`SELECT COUNT(*) AS c FROM marketing_agent_applications WHERE status IN ('NEW','UNDER_REVIEW')`);
    const shortlisted = await db.get(`SELECT COUNT(*) AS c FROM marketing_agent_applications WHERE status = 'SHORTLISTED'`);
    const newLeads = await db.get(`SELECT COUNT(*) AS c FROM sales_leads WHERE status = 'NEW'`);
    const won = await db.get(`SELECT COUNT(*) AS c FROM sales_leads WHERE status = 'WON'`);
    const commissionPending = await db.get(`SELECT COALESCE(SUM(final_commission),0) AS total FROM commissions WHERE status IN ('CALCULATED','UNDER_REVIEW','APPROVED','PAYMENT_SCHEDULED','HELD')`);
    const pipeline = await db.all(`SELECT status AS label, COUNT(*) AS count FROM sales_leads GROUP BY status`);
    const byAgent = await db.all(`SELECT COALESCE(a.agent_code,'Unattributed') AS label, COUNT(l.id) AS count FROM sales_leads l LEFT JOIN marketing_agents a ON a.id = l.referral_agent_id GROUP BY a.agent_code`);
    const applicationTrend = await db.all(`SELECT date(COALESCE(submitted_at, created_at)) AS label, COUNT(*) AS count FROM marketing_agent_applications GROUP BY label ORDER BY label`);
    const revenueByAgent = await db.all(`SELECT COALESCE(a.agent_code,'Unattributed') AS label, COALESCE(SUM(pay.amount),0) AS count FROM marketing_agents a LEFT JOIN sales_contracts c ON c.referral_agent_id = a.id LEFT JOIN client_cash_payments pay ON pay.contract_id = c.id AND pay.status = 'VERIFIED' GROUP BY a.id`);
    const commissionTrend = await db.all(`SELECT substr(created_at,1,7) AS label, COALESCE(SUM(final_commission),0) AS count FROM commissions GROUP BY label`);
    const awaitingList = await db.all(`SELECT id, reference, full_name, status FROM marketing_agent_applications WHERE status IN ('NEW','UNDER_REVIEW') ORDER BY submitted_at DESC LIMIT 8`);
    const interviewsToday = await db.all(`SELECT i.id, i.interview_time, a.full_name FROM marketing_agent_interviews i JOIN marketing_agent_applications a ON a.id = i.application_id WHERE date(i.interview_date) = date('now') AND i.status = 'SCHEDULED'`);
    const pendingCommissions = await db.all(`SELECT id, commission_number, final_commission, status FROM commissions WHERE status IN ('CALCULATED','UNDER_REVIEW') ORDER BY created_at DESC LIMIT 8`);
    const today = new Date();
    const activeForAlerts = await db.all(`SELECT id, full_name, agent_code, engagement_end_date FROM marketing_agents WHERE status = 'ACTIVE' AND engagement_end_date IS NOT NULL`);
    for (const agent of activeForAlerts) {
      const days = Math.ceil((new Date(agent.engagement_end_date) - today) / 86400000);
      const window = days <= 0 ? 'expired' : days <= 7 ? '7' : days <= 14 ? '14' : days <= 30 ? '30' : null;
      if (!window) continue;
      await alertOnce(`engagement-${agent.id}-${agent.engagement_end_date}-${window}`, ['Admin', 'DepartmentHead'], 'Agent engagement date', `${agent.agent_code || agent.full_name} engagement ${window === 'expired' ? 'has ended' : `ends in ${window} days`}`, `/marketing/agents/${agent.id}`);
    }
    res.json({
      applications: applications.c, selected: selected.c, activeAgents: activeAgents.c,
      leads: leads.c, qualified: qualified.c, meetings: meetings.c, proposals: proposals.c,
      contracts: contracts.c, collected: collected.total, earned: earned.total, paid: paid.total,
      awaitingReview: awaitingReview.c, shortlisted: shortlisted.c, newLeads: newLeads.c, won: won.c,
      commissionPending: commissionPending.total,
      sectors, channels, overdue, expiring, pipeline, byAgent, applicationTrend, revenueByAgent, commissionTrend,
      awaitingList, interviewsToday, pendingCommissions
    });
  } catch (error) {
    fail(res, error, 'Failed to load marketing report');
  }
});

router.get('/agents/:id/statement', authenticateToken, async (req, res) => {
  try {
    const agent = await db.get('SELECT * FROM marketing_agents WHERE id = ?', [req.params.id]);
    if (!agent || !(await canSeeAgent(req.user, agent))) return res.status(403).json({ error: 'Insufficient permissions' });
    const rows = await db.all(
      `SELECT c.created_at, c.commission_number, c.eligible_revenue, c.rate_percent, c.final_commission, c.status, c.payment_reference
       FROM commissions c WHERE c.agent_id = ? ORDER BY c.created_at`,
      [agent.id]
    );
    const summary = rows.reduce((acc, row) => {
      acc.earned += Number(row.final_commission) || 0;
      if (row.status === 'PAID') acc.paid += Number(row.final_commission) || 0;
      return acc;
    }, { earned: 0, paid: 0 });
    summary.outstanding = summary.earned - summary.paid;
    res.json({
      agent: { full_name: agent.full_name, agent_code: agent.agent_code },
      rows, summary
    });
  } catch (error) {
    fail(res, error, 'Failed to build statement');
  }
});

router.post('/agents/:id/weekly-reports', authenticateToken, async (req, res) => {
  try {
    const mine = await ownAgent(req.user);
    if (!svc.hasPermission(req.user, 'marketing_agent.edit') && (!mine || String(mine.id) !== String(req.params.id))) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    await db.run(
      `INSERT INTO agent_weekly_reports
       (agent_id, week_start, prospects_researched, contacts_made, meaningful_conversations, qualified_leads, meetings, challenges, market_feedback, support_needed, next_week_plan, submitted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(agent_id, week_start) DO UPDATE SET
         prospects_researched = excluded.prospects_researched,
         contacts_made = excluded.contacts_made,
         meaningful_conversations = excluded.meaningful_conversations,
         qualified_leads = excluded.qualified_leads,
         meetings = excluded.meetings,
         challenges = excluded.challenges,
         market_feedback = excluded.market_feedback,
         support_needed = excluded.support_needed,
         next_week_plan = excluded.next_week_plan`,
      [
        req.params.id, req.body.week_start, req.body.prospects_researched || 0, req.body.contacts_made || 0,
        req.body.meaningful_conversations || 0, req.body.qualified_leads || 0, req.body.meetings || 0,
        req.body.challenges || null, req.body.market_feedback || null, req.body.support_needed || null,
        req.body.next_week_plan || null, req.user.id
      ]
    );
    res.status(201).json({ ok: true });
  } catch (error) {
    fail(res, error, 'Failed to save weekly report');
  }
});

router.post('/agents/:id/reviews', authenticateToken, svc.requirePerm('marketing_agent.edit'), async (req, res) => {
  try {
    const result = await db.run(
      `INSERT INTO agent_performance_reviews
       (agent_id, period_label, prospecting, lead_quality, conversion_contribution, follow_up, reporting, conduct, product_knowledge, crm_compliance, revenue_contribution, strengths, improvements, manager_comments, recommendation, reviewer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id, req.body.period_label || null, req.body.prospecting || null, req.body.lead_quality || null,
        req.body.conversion_contribution || null, req.body.follow_up || null, req.body.reporting || null,
        req.body.conduct || null, req.body.product_knowledge || null, req.body.crm_compliance || null,
        req.body.revenue_contribution || null, req.body.strengths || null, req.body.improvements || null,
        req.body.manager_comments || null, req.body.recommendation || null, req.user.id
      ]
    );
    res.status(201).json({ id: result.lastID });
  } catch (error) {
    fail(res, error, 'Failed to save review');
  }
});

router.get('/targets', authenticateToken, svc.requirePerm('reports.view'), async (req, res) => {
  try {
    const targets = await db.all('SELECT * FROM agent_target_settings ORDER BY id');
    res.json({ targets });
  } catch (error) {
    fail(res, error, 'Failed to load targets');
  }
});

async function alertOnce(key, roles, title, message, link) {
  const inserted = await db.run('INSERT OR IGNORE INTO marketing_alert_log (alert_key) VALUES (?)', [key]);
  if (!inserted.changes) return;
  await svc.notifyRole(roles, title, message, link);
}

router.get('/weekly-reports', authenticateToken, svc.requirePerm('reports.view'), async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT r.*, a.full_name, a.agent_code FROM agent_weekly_reports r
       JOIN marketing_agents a ON a.id = r.agent_id
       ORDER BY r.week_start DESC`
    );
    res.json({ reports: rows });
  } catch (error) {
    fail(res, error, 'Failed to list weekly reports');
  }
});

router.get('/weekly-reports/prefill', authenticateToken, svc.requirePerm('reports.view'), async (req, res) => {
  try {
    const start = req.query.week_start;
    const agentId = req.query.agent_id;
    if (!start || !agentId) return res.status(400).json({ error: 'agent_id and week_start are required' });
    const leads = await db.get(
      `SELECT COUNT(*) AS c FROM sales_leads WHERE referral_agent_id = ? AND date(created_at) >= date(?) AND date(created_at) < date(?, '+7 day')`,
      [agentId, start, start]
    );
    const qualified = await db.get(
      `SELECT COUNT(*) AS c FROM sales_leads WHERE referral_agent_id = ? AND status IN ('QUALIFIED','MEETING_SCHEDULED','PROPOSAL_PREPARATION','PROPOSAL_SENT','NEGOTIATION','WON') AND date(created_at) >= date(?) AND date(created_at) < date(?, '+7 day')`,
      [agentId, start, start]
    );
    const meetings = await db.get(
      `SELECT COUNT(*) AS c FROM sales_leads WHERE referral_agent_id = ? AND status = 'MEETING_SCHEDULED' AND date(updated_at) >= date(?) AND date(updated_at) < date(?, '+7 day')`,
      [agentId, start, start]
    );
    res.json({
      qualified_leads: qualified ? qualified.c : 0,
      meetings: meetings ? meetings.c : 0,
      prospects_researched: leads ? leads.c : 0
    });
  } catch (error) {
    fail(res, error, 'Failed to prefill weekly report');
  }
});

router.get('/performance', authenticateToken, svc.requirePerm('reports.view'), async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT a.id, a.full_name, a.agent_code, a.status, a.engagement_end_date,
        (SELECT COUNT(*) FROM sales_leads l WHERE l.referral_agent_id = a.id AND l.status IN ('QUALIFIED','MEETING_SCHEDULED','PROPOSAL_PREPARATION','PROPOSAL_SENT','NEGOTIATION','WON')) AS qualified_leads,
        (SELECT COUNT(*) FROM sales_leads l WHERE l.referral_agent_id = a.id AND l.status = 'MEETING_SCHEDULED') AS meetings,
        (SELECT COUNT(*) FROM sales_proposals p WHERE p.referral_agent_id = a.id) AS proposals,
        (SELECT COUNT(*) FROM sales_contracts c WHERE c.referral_agent_id = a.id AND c.status IN ('ACTIVE','COMPLETED')) AS contracts_won,
        (SELECT COALESCE(SUM(pay.amount),0) FROM client_cash_payments pay JOIN sales_contracts c ON c.id = pay.contract_id WHERE c.referral_agent_id = a.id AND pay.status = 'VERIFIED') AS cash_collected,
        (SELECT COALESCE(SUM(cm.final_commission),0) FROM commissions cm WHERE cm.agent_id = a.id AND cm.status != 'CANCELLED') AS commission_earned,
        (SELECT COUNT(*) FROM sales_leads l WHERE l.referral_agent_id = a.id) AS lead_count,
        (SELECT COUNT(*) FROM agent_weekly_reports r WHERE r.agent_id = a.id) AS reports_submitted,
        (SELECT recommendation FROM agent_performance_reviews rv WHERE rv.agent_id = a.id ORDER BY rv.created_at DESC LIMIT 1) AS review_status
       FROM marketing_agents a
       WHERE a.agent_code IS NOT NULL
       ORDER BY a.full_name`
    );
    const performance = rows.map((row) => ({
      ...row,
      conversion_rate: row.lead_count ? Math.round((row.contracts_won / row.lead_count) * 1000) / 10 : 0
    }));
    res.json({ performance });
  } catch (error) {
    fail(res, error, 'Failed to load performance');
  }
});

router.get('/reports/center', authenticateToken, svc.requirePerm('reports.view'), async (req, res) => {
  try {
    const report = req.query.report || 'lead_conversion';
    const queries = {
      lead_conversion: `SELECT status AS label, COUNT(*) AS count FROM sales_leads GROUP BY status`,
      lead_source: `SELECT COALESCE(source,'Unknown') AS label, COUNT(*) AS count FROM sales_leads GROUP BY source`,
      sector: `SELECT COALESCE(industry,'Unspecified') AS label, COUNT(*) AS count FROM sales_leads GROUP BY industry`,
      agent_revenue: `SELECT a.agent_code AS label, COALESCE(SUM(pay.amount),0) AS count FROM marketing_agents a LEFT JOIN sales_contracts c ON c.referral_agent_id = a.id LEFT JOIN client_cash_payments pay ON pay.contract_id = c.id AND pay.status = 'VERIFIED' GROUP BY a.id`,
      commission: `SELECT status AS label, COALESCE(SUM(final_commission),0) AS count FROM commissions GROUP BY status`,
      outstanding_commission: `SELECT a.agent_code AS label, COALESCE(SUM(c.final_commission),0) AS count FROM commissions c JOIN marketing_agents a ON a.id = c.agent_id WHERE c.status NOT IN ('PAID','CANCELLED') GROUP BY a.id`,
      engagement: `SELECT COALESCE(agent_code, full_name) AS label, engagement_end_date AS count FROM marketing_agents WHERE status = 'ACTIVE'`
    };
    const rows = await db.all(queries[report] || queries.lead_conversion);
    res.json({ report, rows });
  } catch (error) {
    fail(res, error, 'Failed to load report');
  }
});

router.get('/reports/export', authenticateToken, svc.requirePerm('reports.export'), async (req, res) => {
  try {
    const report = req.query.report || 'lead_conversion';
    const queries = {
      lead_conversion: `SELECT status AS label, COUNT(*) AS count FROM sales_leads GROUP BY status`,
      lead_source: `SELECT COALESCE(source,'Unknown') AS label, COUNT(*) AS count FROM sales_leads GROUP BY source`,
      sector: `SELECT COALESCE(industry,'Unspecified') AS label, COUNT(*) AS count FROM sales_leads GROUP BY industry`,
      commission: `SELECT status AS label, COALESCE(SUM(final_commission),0) AS count FROM commissions GROUP BY status`,
      engagement: `SELECT COALESCE(agent_code, full_name) AS label, engagement_end_date AS count FROM marketing_agents WHERE status = 'ACTIVE'`
    };
    const rows = await db.all(queries[report] || queries.lead_conversion);
    const csv = ['label,count', ...rows.map((row) => `"${String(row.label ?? '').replace(/"/g, '""')}",${row.count ?? ''}`)].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${report}.csv"`);
    res.send(csv);
  } catch (error) {
    fail(res, error, 'Failed to export report');
  }
});

router.get('/agents/:id/statement.pdf', authenticateToken, async (req, res) => {
  try {
    const agent = await db.get('SELECT * FROM marketing_agents WHERE id = ?', [req.params.id]);
    if (!agent || !(await canSeeAgent(req.user, agent))) return res.status(403).json({ error: 'Insufficient permissions' });
    const from = req.query.from || '2000-01-01';
    const to = req.query.to || '2999-12-31';
    const rows = await db.all(
      `SELECT c.created_at, c.commission_number, c.eligible_revenue, c.rate_percent, c.adjustment, c.final_commission, c.status, cl.company_name, pay.payment_number
       FROM commissions c
       LEFT JOIN clients cl ON cl.id = c.client_id
       LEFT JOIN client_cash_payments pay ON pay.id = c.payment_id
       WHERE c.agent_id = ? AND date(c.created_at) >= date(?) AND date(c.created_at) <= date(?)
       ORDER BY c.created_at`,
      [agent.id, from, to]
    );
    let earned = 0;
    let adjustments = 0;
    let paid = 0;
    const lines = [
      'Software Vala Liberia',
      'Marketing Agent Commission Statement',
      `Statement number: SVL-STMT-${agent.id}-${from}`,
      `Agent: ${agent.full_name}`,
      `Agent ID: ${agent.agent_code || 'Not activated'}`,
      `Period: ${from} to ${to}`,
      ''
    ];
    rows.forEach((row) => {
      earned += Number(row.final_commission) || 0;
      adjustments += Number(row.adjustment) || 0;
      if (row.status === 'PAID') paid += Number(row.final_commission) || 0;
      lines.push(`${String(row.created_at).slice(0, 10)} ${row.company_name || row.commission_number} pay ${row.payment_number || '-'} rev ${row.eligible_revenue} rate ${row.rate_percent}% comm ${row.final_commission} adj ${row.adjustment} ${row.status}`);
    });
    if (!rows.length) lines.push('No commission records in this period.');
    lines.push('');
    lines.push(`Commission earned: ${earned.toFixed(2)}`);
    lines.push(`Adjustments: ${adjustments.toFixed(2)}`);
    lines.push(`Paid: ${paid.toFixed(2)}`);
    lines.push(`Outstanding: ${(earned - paid).toFixed(2)}`);
    lines.push(`Software Vala Liberia generated ${new Date().toISOString()}`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${agent.agent_code || 'agent'}-commission-statement.pdf"`);
    res.send(buildPdf(lines));
  } catch (error) {
    fail(res, error, 'Failed to build statement PDF');
  }
});

router.post('/agents/:id/engagement', authenticateToken, svc.requirePerm('marketing_agent.suspend'), async (req, res) => {
  try {
    const action = req.body.action;
    if (!req.body.confirm) return res.status(400).json({ error: 'Confirmation is required' });
    const agent = await db.get('SELECT * FROM marketing_agents WHERE id = ?', [req.params.id]);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (action === 'RENEW' || action === 'EXTEND') {
      const days = action === 'EXTEND' ? Number(req.body.days || 90) : 90;
      const base = agent.engagement_end_date ? new Date(agent.engagement_end_date) : new Date();
      base.setDate(base.getDate() + days);
      const next = base.toISOString().slice(0, 10);
      await db.run('UPDATE marketing_agents SET engagement_end_date = ?, contract_end_date = ?, status = \'ACTIVE\', referral_eligible = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [next, next, agent.id]);
    } else if (action === 'ALLOW_TO_EXPIRE') {
      await db.run(`UPDATE marketing_agents SET status = 'EXPIRED', referral_eligible = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [agent.id]);
    } else if (action === 'SUSPEND') {
      await db.run(`UPDATE marketing_agents SET status = 'SUSPENDED', referral_eligible = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [agent.id]);
    } else if (action === 'TERMINATE') {
      if (!svc.hasPermission(req.user, 'marketing_agent.terminate')) return res.status(403).json({ error: 'Insufficient permissions' });
      await db.run(`UPDATE marketing_agents SET status = 'TERMINATED', referral_eligible = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [agent.id]);
    } else {
      return res.status(400).json({ error: 'Invalid engagement action' });
    }
    await db.run(
      `INSERT INTO marketing_agent_status_history (agent_id, status, effective_date, reason, approved_by) VALUES (?, ?, date('now'), ?, ?)`,
      [agent.id, action, req.body.reason || action, req.user.id]
    );
    await logAction(req.user.id, 'engagement_decision', 'marketing_agents', agent.id, { action }, req);
    res.json({ action });
  } catch (error) {
    fail(res, error, 'Failed to update engagement');
  }
});

router.put('/targets/:key', authenticateToken, svc.requirePerm('marketing_agent.edit'), async (req, res) => {
  try {
    await db.run(
      `UPDATE agent_target_settings SET target_value = ?, notes = COALESCE(?, notes), updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE metric_key = ?`,
      [req.body.target_value, req.body.notes || null, req.user.id, req.params.key]
    );
    res.json({ ok: true });
  } catch (error) {
    fail(res, error, 'Failed to update target');
  }
});

module.exports = router;
