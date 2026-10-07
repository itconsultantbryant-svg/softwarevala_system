const assert = require('assert');
const {
  scoreScreening,
  scoreInterview,
  screeningBand,
  rateForAmount,
  hasPermission
} = require('../utils/marketingAgentService');

const screening = scoreScreening({
  communication: 25,
  network: 20,
  sales_ability: 20,
  technology: 15,
  reliability: 10,
  integrity: 10
});
assert.strictEqual(screening.total, 100);
assert.strictEqual(scoreScreening({ communication: 40 }).communication, 25);
assert.strictEqual(screeningBand(82), 'Strong shortlist consideration');
assert.strictEqual(screeningBand(40), 'Normally not shortlisted');

const interview = scoreInterview({
  communication: 20, mindset: 20, prospecting: 20, judgment: 15, professionalism: 15, availability: 10
});
assert.strictEqual(interview.total, 100);

const tiers = [
  { id: 1, min_amount: 1, max_amount: 500, rate_percent: 10, sort_order: 1 },
  { id: 2, min_amount: 501, max_amount: 1500, rate_percent: 12, sort_order: 2 },
  { id: 3, min_amount: 1501, max_amount: 5000, rate_percent: 15, sort_order: 3 },
  { id: 4, min_amount: 5000.01, max_amount: null, rate_percent: 15, sort_order: 4 }
];
assert.strictEqual(rateForAmount(tiers, 800).rate, 12);
assert.strictEqual(rateForAmount(tiers, 800).gross, 96);
assert.strictEqual(rateForAmount(tiers, 0), null);
assert.strictEqual(hasPermission({ role: 'Staff' }, 'commission.approve'), false);
assert.strictEqual(hasPermission({ role: 'Admin' }, 'marketing_agent.activate'), true);
assert.strictEqual(hasPermission({ role: 'Staff' }, 'marketing_agent.activate'), false);

console.log('marketing agent rule checks passed');
