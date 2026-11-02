const assert = require('assert');
const agentApiBoundary = require('../middleware/agentApiBoundary');
const { generateToken } = require('../utils/auth');

function invoke(path) {
  const token = generateToken({ id: 91, email: 'agent@example.test', username: 'agent', name: 'Agent', role: 'FreelanceMarketingAgent', session_version: 1 });
  const req = { path, headers: { authorization: `Bearer ${token}` } };
  let nextCalled = false;
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  agentApiBoundary(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

const blocked = invoke('/marketing-agents/leads');
assert.strictEqual(blocked.nextCalled, false);
assert.strictEqual(blocked.res.statusCode, 403);

const agentPortal = invoke('/agent/dashboard');
assert.strictEqual(agentPortal.nextCalled, true);

const ownNotifications = invoke('/notifications/unread-count');
assert.strictEqual(ownNotifications.nextCalled, true);

console.log('agent API boundary checks passed');
