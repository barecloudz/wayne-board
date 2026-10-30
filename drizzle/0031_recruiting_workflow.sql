ALTER TABLE prospects
  ADD COLUMN medical_card_passed       text NOT NULL DEFAULT 'pending',
  ADD COLUMN road_test_proposed_date   timestamp,
  ADD COLUMN road_test_confirmed_date  timestamp,
  ADD COLUMN road_test_manager_note    text,
  ADD COLUMN discontinued_reason       text;

CREATE TABLE prospect_notifications (
  id               serial PRIMARY KEY,
  organization_id  integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prospect_id      integer NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  prospect_name    text NOT NULL,
  type             text NOT NULL,
  created_at       timestamp DEFAULT now()
);

CREATE TABLE notification_dismissals (
  notification_id  integer NOT NULL REFERENCES prospect_notifications(id) ON DELETE CASCADE,
  driver_id        text NOT NULL,
  dismissed_at     timestamp DEFAULT now(),
  PRIMARY KEY (notification_id, driver_id)
);
