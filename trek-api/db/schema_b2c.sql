-- B2C Schema for Assign adaptive learning system
-- Run this in Supabase SQL Editor after the base schema

-- Topics a student has started
CREATE TABLE IF NOT EXISTS topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge components (nodes in the KC graph for a topic)
CREATE TABLE IF NOT EXISTS knowledge_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    prerequisites UUID[] DEFAULT '{}',
    order_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BKT student model state — one row per (user, KC)
-- This is the proprietary asset. Never delete rows, only update.
CREATE TABLE IF NOT EXISTS student_kc_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    kc_id UUID REFERENCES knowledge_components(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
    -- BKT params
    p_learned FLOAT NOT NULL DEFAULT 0.0,
    p_l0 FLOAT NOT NULL DEFAULT 0.1,
    p_transit FLOAT NOT NULL DEFAULT 0.10,
    p_slip FLOAT NOT NULL DEFAULT 0.10,
    p_guess FLOAT NOT NULL DEFAULT 0.20,
    -- Status
    status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'in_progress', 'mastered', 'flagged', 'force_advanced')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_score FLOAT,
    -- Flags
    flag_type TEXT CHECK (flag_type IN ('struggling', 'misconception', 'strong', NULL)),
    flag_reason TEXT,
    -- Spaced repetition
    sm2_easiness FLOAT NOT NULL DEFAULT 2.5,
    sm2_interval INTEGER NOT NULL DEFAULT 1,
    sm2_repetitions INTEGER NOT NULL DEFAULT 0,
    sm2_next_review TIMESTAMPTZ,
    -- Ebbinghaus
    last_studied_at TIMESTAMPTZ,
    decay_factor FLOAT NOT NULL DEFAULT 1.0,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, kc_id)
);

-- Every explanation attempt — never delete
CREATE TABLE IF NOT EXISTS interaction_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    kc_id UUID REFERENCES knowledge_components(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    explanation_text TEXT NOT NULL,
    score_core_idea FLOAT,
    score_reasoning FLOAT,
    score_own_words FLOAT,
    score_edge_awareness FLOAT,
    weighted_score FLOAT,
    bkt_before FLOAT,
    bkt_after FLOAT,
    passed BOOLEAN,
    force_advanced BOOLEAN DEFAULT FALSE,
    quality_label TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated notes per KC
CREATE TABLE IF NOT EXISTS kc_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    kc_id UUID REFERENCES knowledge_components(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'complete'
        CHECK (status IN ('in_progress', 'complete')),
    concept_name TEXT NOT NULL,
    summary TEXT NOT NULL,
    key_points JSONB NOT NULL,
    student_analogy TEXT,
    watch_out TEXT,
    full_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, kc_id)
);

-- B2C chat history per (user, topic, KC)
CREATE TABLE IF NOT EXISTS b2c_chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
    kc_id UUID REFERENCES knowledge_components(id),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    turn_index INTEGER NOT NULL,
    is_summary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Semantic memory (analogies and examples that worked)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS semantic_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    kc_id UUID REFERENCES knowledge_components(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(384),
    memory_type TEXT CHECK (memory_type IN ('analogy', 'example', 'misconception')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS semantic_memory_embedding_idx
    ON semantic_memory USING ivfflat (embedding vector_cosine_ops);

-- RLS policies
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_kc_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE kc_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2c_chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own topics" ON topics FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own kc state" ON student_kc_state FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own logs" ON interaction_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own kc notes" ON kc_notes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own b2c chat" ON b2c_chat_history FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own memory" ON semantic_memory FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own kcs" ON knowledge_components FOR ALL
    USING (topic_id IN (SELECT id FROM topics WHERE user_id = auth.uid()));
