SELECT
  multiIf(empty(log_attributes['auth_audit_event.actor_id']), 'unknown_actor', log_attributes['auth_audit_event.actor_id'] = '__QA_TEST_USER_ID__', 'known_qa', 'other_account') AS cohort,
  count() AS retained_auth_audit_rows,
  countIf(empty(log_attributes['auth_audit_event.audit_log_id'])) AS rows_missing_audit_id,
  uniqExactIf(log_attributes['auth_audit_event.audit_log_id'], log_attributes['auth_audit_event.action'] = 'login' AND notEmpty(log_attributes['auth_audit_event.audit_log_id'])) AS recorded_login_events,
  uniqExactIf(log_attributes['auth_audit_event.actor_id'], log_attributes['auth_audit_event.action'] = 'login' AND notEmpty(log_attributes['auth_audit_event.actor_id'])) AS actors_with_recorded_login,
  uniqExactIf(log_attributes['auth_audit_event.audit_log_id'], log_attributes['auth_audit_event.action'] = 'user_signedup' AND notEmpty(log_attributes['auth_audit_event.audit_log_id'])) AS recorded_signup_events,
  countIf(log_attributes['auth_audit_event.action'] NOT IN ('login', 'user_signedup')) AS other_auth_event_rows
FROM logs
WHERE source = 'auth_audit_logs'
GROUP BY cohort
ORDER BY cohort
