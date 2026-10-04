CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY,
  offer_number text,
  client_name text,
  product_names text,
  grand_total numeric,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offers_client_name_idx ON offers (lower(client_name));
CREATE INDEX IF NOT EXISTS offers_offer_number_idx ON offers (lower(offer_number));
CREATE INDEX IF NOT EXISTS offers_created_at_idx ON offers (created_at DESC);
