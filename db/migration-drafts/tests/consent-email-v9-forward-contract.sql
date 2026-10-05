-- Run after numbered migrations through 0210 (or the polascope draft) in a disposable local DB.
-- email-v4~v7 and service-v1/v2 clients continue after service-v4 is added.
-- 공지형·재동의 없음. The numbered CI step runs the regression against promoted 0215
-- without this draft replay.
BEGIN;
\ir ../UNNUMBERED_consent_email_v9_20261006.sql
COMMIT;

\ir ../../tests/consent_email_v9_20261006_regression.sql
