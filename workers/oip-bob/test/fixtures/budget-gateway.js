// Test-only ingress. Production index.js never exposes ledger endpoints.
export { BobBudget } from '../../src/budget.js';
export default {
  fetch(request, env) {
    return env.BOB_BUDGET.get(env.BOB_BUDGET.idFromName('bob-production-budget-v1')).fetch(request);
  },
};
