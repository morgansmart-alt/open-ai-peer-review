-- Two-decimal overall scores from round2.
-- Apply this file in the Supabase SQL editor. This pull request does not run it.
-- air_web_chat's only score columns are blind_score and defended_score.
-- Criterion scores stay inside the payload and are unchanged.
-- After this SQL is applied, redeploy supabase/functions/submit-web-chat.

alter table air_web_chat
  alter column blind_score type numeric(5,2) using blind_score::numeric(5,2),
  alter column defended_score type numeric(5,2) using defended_score::numeric(5,2);
