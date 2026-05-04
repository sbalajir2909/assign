-- =============================================================================
-- Migration 001 — Add B2C curriculum columns to roadmaps
-- =============================================================================
-- Run this against an existing Supabase instance that already has the tables
-- created by the previous assign-main/db/schema.sql.
--
-- These columns are written by the trek-api curriculum pipeline after a
-- curriculum build completes and are read by the frontend for course resumption.
-- =============================================================================

alter table roadmaps
  add column if not exists sprint_plan     jsonb,
  add column if not exists gist            jsonb,
  add column if not exists validated_nodes jsonb;
