-- ─────────────────────────────────────────────────────────────────
-- Run this in Supabase SQL Editor to create the two new tables
-- ─────────────────────────────────────────────────────────────────

-- 1. chat_history: stores every message per concept per user
CREATE TABLE IF NOT EXISTS chat_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    roadmap_id  UUID NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
    concept_id  INTEGER NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_history_roadmap_concept
    ON chat_history (roadmap_id, concept_id, created_at);

-- 2. teaching_snapshots: stores the key teaching moment per concept per user
--    One active row per (user_id, concept_id) — upserted when concept is mastered
CREATE TABLE IF NOT EXISTS teaching_snapshots (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    roadmap_id        UUID NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
    concept_id        INTEGER NOT NULL,
    concept_title     TEXT NOT NULL,
    example_used      TEXT NOT NULL DEFAULT '',
    analogy_used      TEXT NOT NULL DEFAULT '',
    teaching_strategy TEXT NOT NULL DEFAULT 'gap_fill',
    mastered          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teaching_snapshots_user_concept
    ON teaching_snapshots (user_id, concept_id);

-- 3. Enable Row Level Security (users can only see their own data)
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own chat history"
    ON chat_history FOR ALL
    USING (auth.uid() = user_id);

CREATE POLICY "Users see own snapshots"
    ON teaching_snapshots FOR ALL
    USING (auth.uid() = user_id);
