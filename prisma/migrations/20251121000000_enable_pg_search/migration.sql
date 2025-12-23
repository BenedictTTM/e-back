-- Manually enable extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS btree_gin;
-- Concatenated text for trigram
-- Note: We use a regular column + trigger because GENERATED columns have strict immutability requirements
-- that can be tricky with text functions in some Postgres versions/configs.
ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "searchText" text;
-- Weighted search vector
ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "searchVector" tsvector;
-- Function to update search columns
CREATE OR REPLACE FUNCTION product_search_update() RETURNS trigger AS $$ BEGIN -- Update searchText
    NEW."searchText" := coalesce(NEW."title", '') || ' ' || coalesce(NEW."category", '') || ' ' || coalesce(array_to_string(NEW."tags", ' '), '') || ' ' || coalesce(NEW."condition", '') || ' ' || coalesce(NEW."description", '');
-- Update searchVector
NEW."searchVector" := setweight(
    to_tsvector('english', coalesce(NEW."title", '')),
    'A'
) || setweight(
    to_tsvector(
        'english',
        coalesce(array_to_string(NEW."tags", ' '), '')
    ),
    'B'
) || setweight(
    to_tsvector('english', coalesce(NEW."category", '')),
    'B'
) || setweight(
    to_tsvector('english', coalesce(NEW."condition", '')),
    'C'
) || setweight(
    to_tsvector('english', coalesce(NEW."description", '')),
    'D'
);
RETURN NEW;
END $$ LANGUAGE plpgsql;
-- Trigger to update search columns
DROP TRIGGER IF EXISTS product_search_update ON "Product";
CREATE TRIGGER product_search_update BEFORE
INSERT
    OR
UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION product_search_update();
-- Update existing rows to populate the new columns
UPDATE "Product"
SET "id" = "id";
-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_product_search_vector ON "Product" USING GIN ("searchVector");
-- Trigram similarity index
CREATE INDEX IF NOT EXISTS idx_product_search_trigram ON "Product" USING GIN ("searchText" gin_trgm_ops);
-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_product_active_search ON "Product" ("isActive", "isSold", "createdAt" DESC)
WHERE "isActive" = true
    AND "isSold" = false;