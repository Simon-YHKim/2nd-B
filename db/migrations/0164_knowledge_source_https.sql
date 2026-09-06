-- PROVISIONAL 0164: renumber before integration if another security branch has
-- already claimed this migration number.
--
-- Stored knowledge_sources links are rendered as external links. RLS permits
-- authenticated users to submit and update their own rows, so an application
-- check alone cannot protect every writer. These CHECK constraints immediately
-- reject malformed new/updated DOI and URL values, including direct REST writes.
--
-- Both constraints are intentionally NOT VALID: repository seeds were audited
-- (346 HTTPS literals and 334 DOI literals), but the live database was not
-- accessed from this change. Existing rows stay readable and the application
-- independently hides unsafe legacy targets. Audit live rows before a later
-- numbered migration marks both constraints valid.

ALTER TABLE public.knowledge_sources
  DROP CONSTRAINT IF EXISTS ks_doi_canonical,
  DROP CONSTRAINT IF EXISTS ks_url_https_only;

ALTER TABLE public.knowledge_sources
  ADD CONSTRAINT ks_doi_canonical
  CHECK (
    doi IS NULL
    OR (
      char_length(doi) BETWEEN 7 AND 255
      AND doi !~ '[[:cntrl:][:space:]]'
      AND doi ~ '^10\.[0-9]{4,9}/[-._;()/:A-Za-z0-9]+$'
      AND position('//' in doi) = 0
      AND doi !~ '(^|/)[.]{1,2}(/|$)'
    )
  ) NOT VALID,
  ADD CONSTRAINT ks_url_https_only
  CHECK (
    url IS NULL
    OR (
      char_length(url) BETWEEN 1 AND 2048
      AND url = btrim(url)
      AND url !~ '[[:cntrl:][:space:]]'
      AND url ~* '^https://[^/?#]+([/?#]|$)'
      AND lower(substring(url from 1 for 8)) = 'https://'
      AND position(E'\\' in url) = 0
      AND url !~* '%(0[0-9a-f]|1[0-9a-f]|5c|7f|8[0-9a-f]|9[0-9a-f])'
      AND position(
        '@' in split_part(split_part(split_part(substring(url from 9), '/', 1), '?', 1), '#', 1)
      ) = 0
      AND split_part(split_part(split_part(substring(url from 9), '/', 1), '?', 1), '#', 1)
        ~ '^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$'
    )
  ) NOT VALID;
