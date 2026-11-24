-- Additive. Not applied by this change.
-- Feedback on AIR is stored inside air_web_chat.payload (jsonb), which already
-- accepts it. This column is optional and is not written by the function until
-- this migration has been applied. Do not deploy the function in a way that
-- inserts this column before then.

alter table if exists air_web_chat
  add column if not exists air_feedback jsonb;
