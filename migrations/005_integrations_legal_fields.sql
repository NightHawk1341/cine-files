-- Add legal compliance fields to integrations table
-- Required for direct ad sales under Federal Law 38-FZ (Article 18.1)

ALTER TABLE "integrations"
  ADD COLUMN "erid"              VARCHAR(50),
  ADD COLUMN "advertiser_name"   VARCHAR(300),
  ADD COLUMN "advertiser_url"    TEXT,
  ADD COLUMN "contract_number"   VARCHAR(100),
  ADD COLUMN "contract_date"     DATE,
  ADD COLUMN "revenue_amount"    NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN "revenue_currency"  VARCHAR(3) DEFAULT 'RUB',
  ADD COLUMN "ord_reported_at"   TIMESTAMPTZ;

-- Index for filtering unreported campaigns (monthly reporting)
CREATE INDEX "integrations_ord_reported_at_idx" ON "integrations"("ord_reported_at");

COMMENT ON COLUMN "integrations"."erid" IS 'ERID token from ОРД operator, required by law for all paid placements';
COMMENT ON COLUMN "integrations"."advertiser_name" IS 'Legal name of the advertiser, displayed on the ad per 38-FZ';
COMMENT ON COLUMN "integrations"."ord_reported_at" IS 'Last date impression data was submitted to ОРД';
