'use strict';

// Artificial protocol fixtures. These are not snapshots of a signed-in personal account.
const sessionReset = '2026-11-16T05:00:00Z';
const weeklyReset = '2026-11-20T18:00:00Z';
function personalUsage(plan = 'pro', format = 'legacy', extraUsage) {
    const rate_limits =
        format === 'legacy'
            ? {
                  five_hour: { utilization: 0, resets_at: sessionReset },
                  seven_day: { utilization: 42, resets_at: weeklyReset },
                  seven_day_opus: { utilization: 18, resets_at: weeklyReset },
                  seven_day_sonnet: { utilization: 7, resets_at: weeklyReset },
                  seven_day_oauth_apps: { utilization: null, resets_at: null }
              }
            : {
                  limits: [
                      { kind: 'session', percent: 0, resets_at: sessionReset },
                      { kind: 'weekly', percent: 42, resets_at: weeklyReset },
                      {
                          kind: 'weekly_scoped',
                          percent: 18,
                          resets_at: weeklyReset,
                          scope: { model: { id: 'opus', display_name: 'Opus' } }
                      },
                      {
                          kind: 'weekly_scoped',
                          percent: 7,
                          resets_at: weeklyReset,
                          scope: { model: { id: 'sonnet', display_name: 'Sonnet' } }
                      }
                  ]
              };
    if (extraUsage) rate_limits.extra_usage = extraUsage;
    return { subscription_type: plan, rate_limits_available: true, rate_limits };
}
const extraUsage = {
    used_credits: 321,
    monthly_limit: 5000,
    currency: 'USD',
    decimal_places: 2,
    is_enabled: true
};
module.exports = { personalUsage, extraUsage, sessionReset, weeklyReset };
