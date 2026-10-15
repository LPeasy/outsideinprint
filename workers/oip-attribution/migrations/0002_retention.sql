-- Minimal lifecycle summaries survive detail expiry only while the provider record exists.
ALTER TABLE subscribers ADD COLUMN acquisition_accepted_at TEXT;
ALTER TABLE subscribers ADD COLUMN unsubscribe_cycle INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscribers ADD COLUMN last_undated_unsubscribe_cycle INTEGER NOT NULL DEFAULT -1;
ALTER TABLE subscribers ADD COLUMN last_known_unsubscribe_at TEXT;
UPDATE subscribers SET acquisition_accepted_at=(SELECT accepted_at FROM signups
  WHERE signup_ref=subscribers.acquisition_signup_ref AND is_new=1) WHERE is_baseline=0;
UPDATE subscribers SET unsubscribe_cycle=1 WHERE status='unsubscribed';
UPDATE subscribers SET last_known_unsubscribe_at=(SELECT MAX(occurred_at) FROM lifecycle_events
  WHERE subscriber_id=subscribers.subscriber_id AND type='unsubscribed' AND event_time_known=1);
UPDATE subscribers SET last_undated_unsubscribe_cycle=unsubscribe_cycle WHERE EXISTS
  (SELECT 1 FROM lifecycle_events WHERE subscriber_id=subscribers.subscriber_id AND type='unsubscribed' AND event_time_known=0);
CREATE TABLE subscriber_week_facts (
  subscriber_id TEXT NOT NULL REFERENCES subscribers(subscriber_id) ON DELETE CASCADE,
  week_start TEXT NOT NULL, unsubscribed INTEGER NOT NULL DEFAULT 0,
  unsubscribe_unknown INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(subscriber_id,week_start)
);
CREATE TABLE historical_aggregates (
  week_start TEXT NOT NULL, campaign_code TEXT NOT NULL, metric TEXT NOT NULL,
  value INTEGER NOT NULL CHECK(value>=0),
  PRIMARY KEY(week_start,campaign_code,metric)
);
CREATE TRIGGER lifecycle_unsubscribe_marker AFTER INSERT ON lifecycle_events
WHEN NEW.type='unsubscribed'
BEGIN
  UPDATE subscribers SET
    last_known_unsubscribe_at=CASE WHEN NEW.event_time_known=1
      THEN MAX(COALESCE(last_known_unsubscribe_at,''),NEW.occurred_at) ELSE last_known_unsubscribe_at END,
    last_undated_unsubscribe_cycle=CASE WHEN NEW.event_time_known=0
      THEN unsubscribe_cycle ELSE last_undated_unsubscribe_cycle END
  WHERE subscriber_id=NEW.subscriber_id;
END;
