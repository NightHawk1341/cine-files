-- Add thumbnail_url column to media table for image variant support (INFRA-4)
ALTER TABLE "media" ADD COLUMN "thumbnail_url" TEXT;
