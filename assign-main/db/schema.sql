-- =============================================================================
-- ASSIGN — CANONICAL DATABASE SCHEMA
-- =============================================================================
-- Single file. Apply to a fresh Supabase instance via Dashboard → SQL Editor.
-- For existing instances: also run assign-main/db/migrations/001_add_roadmap_columns.sql
--
-- Table inventory:
--   Legacy / frontend (assign-main):
--     roadmaps, concept_materials, chat_messages,
--     user_learning_profiles, concept_rag_chunks
--   B2C adaptive pipeline (trek-api):
--     topics, knowledge_components, student_kc_state, interaction_log,
--     kc_notes, b2c_chat_history, semantic_memory
--   Legacy trek-api (preserved):
--     teaching_snapshots
-- =============================================================================


-- ── Extensions ────────────────────────────────────────────────────────────────

create extension if not exists vector;
create extension if not exists "uuid-ossp";


-- =============================================================================
-- LEGACY / FRONTEND TABLES  (used by assign-main Next.js app)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABLE: roadmaps
-- One row per Trek course a user starts.
-- sprint_plan / gist / validated_nodes are written by the trek-api curriculum
-- pipeline and read back by the frontend for course resumption.
-- -----------------------------------------------------------------------------

create table if not exists roadmaps (
  id                      uuid        primary key default gen_random_uuid(),
  user_id                 uuid        not null,

  topic                   text        not null,
  status                  text        not null default 'active'
                                        check (status in ('active', 'completed')),

  -- Full list of concept objects: [{id, title, why, subtopics, status, ...}]
  concepts                jsonb       not null default '[]',

  -- Index of the concept the user is currently on
  current_concept_index   integer     not null default 0,

  -- Rolling last-30-message snapshot used for session resume
  conversation_history    jsonb       not null default '[]',

  -- Legacy field kept for compatibility
  concept_summaries       jsonb       not null default '[]',

  -- Discovery answers: {topic, level, goal, time}
  learner_profile         jsonb,

  -- Sources scraped e.g. ["wikipedia", "stackoverflow", "github"]
  sources_hit             text[]      default '{}',

  total_minutes_estimated integer     default 0,

  -- B2C curriculum pipeline output — set by trek-api after curriculum build
  sprint_plan             jsonb,
  gist                    jsonb,
  validated_nodes         jsonb,

  created_at              timestamptz not null default now(),
  last_studied            timestamptz not null default now()
);

create index if not exists idx_roadmaps_user_id
  on roadmaps(user_id);

create index if not exists idx_roadmaps_last_studied
  on roadmaps(user_id, last_studied desc);


-- -----------------------------------------------------------------------------
-- TABLE: concept_materials
-- LLM-generated summary for each mastered concept.
-- One row per (roadmap, concept_index) pair.
-- -----------------------------------------------------------------------------

create table if not exists concept_materials (
  id                  uuid        primary key default gen_random_uuid(),
  roadmap_id          uuid        not null references roadmaps(id) on delete cascade,
  user_id             uuid        not null,

  concept_index       integer     not null,
  concept_title       text        not null,

  -- Three-paragraph summary written after mastery
  summary             text        not null default '',

  key_mental_models   text[]      default '{}',
  common_mistakes     text[]      default '{}',

  -- [{label: "Python Docs", url: "https://..."}]
  sources             jsonb       default '[]',

  -- User's own freeform notes
  user_notes          text        default '',

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (roadmap_id, concept_index)
);

create index if not exists idx_concept_materials_roadmap
  on concept_materials(roadmap_id);

create index if not exists idx_concept_materials_user
  on concept_materials(user_id);


-- -----------------------------------------------------------------------------
-- TABLE: chat_messages
-- Every single message in every conversation, per user + roadmap + concept.
-- Canonical name. The legacy trek-api "chat_history" table is not used by the
-- B2C pipeline (which uses b2c_chat_history) and is not carried forward.
-- -----------------------------------------------------------------------------

create table if not exists chat_messages (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null,
  roadmap_id      uuid        references roadmaps(id) on delete cascade,

  -- Which concept was being taught when this message was sent
  concept_index   integer     not null default 0,

  role            text        not null check (role in ('user', 'assistant')),
  content         text        not null,

  created_at      timestamptz not null default now()
);

create index if not exists idx_chat_messages_roadmap
  on chat_messages(roadmap_id, concept_index);

create index if not exists idx_chat_messages_user
  on chat_messages(user_id);

create index if not exists idx_chat_messages_time
  on chat_messages(roadmap_id, created_at asc);


-- -----------------------------------------------------------------------------
-- TABLE: user_learning_profiles
-- One row per user. Built dynamically from LLM analysis after each concept
-- is mastered. Injected into every teaching prompt to personalise teaching.
-- -----------------------------------------------------------------------------

create table if not exists user_learning_profiles (
  user_id                 uuid        primary key,

  -- visual | example_driven | theory_first | analogy_based | hands_on
  learning_style          text        not null default 'unknown',

  -- fast | steady | needs_repetition
  pace                    text        not null default 'steady',

  -- Analogy types that previously worked for this user
  effective_analogy_types text[]      not null default '{}',

  -- Wrong beliefs found and corrected during past sessions
  misconceptions          text[]      not null default '{}',

  -- Sub-topics the user demonstrably already knew before being taught
  strong_areas            text[]      not null default '{}',

  -- Sub-topics the user repeatedly struggled with across sessions
  weak_areas              text[]      not null default '{}',

  updated_at              timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- TABLE: concept_rag_chunks
-- 384-dimensional embeddings of mastered concept summaries, mental models,
-- common mistakes, and teaching moments.
-- Queried at chat time via cosine similarity to inject relevant prior context.
-- -----------------------------------------------------------------------------

create table if not exists concept_rag_chunks (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null,
  roadmap_id      uuid        references roadmaps(id) on delete cascade,

  concept_index   integer     not null,
  concept_title   text        not null,

  -- The actual text of this chunk
  content         text        not null,

  -- summary | mental_model | common_mistake | teaching_moment
  chunk_type      text,

  -- 384-dim vector produced by bge-small-en-v1.5 (normalized)
  embedding       vector(384),

  created_at      timestamptz not null default now()
);

create index if not exists idx_rag_chunks_user
  on concept_rag_chunks(user_id);

-- IVFFlat cosine similarity index.
-- Tip: create this after inserting 500+ rows for best performance.
-- For early dev the sequential scan is fine — drop and recreate this later.
create index if not exists idx_rag_chunks_embedding
  on concept_rag_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);


-- -----------------------------------------------------------------------------
-- FUNCTION: match_concept_chunks
-- Cosine similarity search scoped to a single user.
-- Called from Python RAG service via: supabase.rpc("match_concept_chunks")
-- Parameters: query_embedding vector(384), match_user_id uuid,
--             match_threshold float (default 0.72), match_count integer (default 4)
-- -----------------------------------------------------------------------------

create or replace function match_concept_chunks(
  query_embedding   vector(384),
  match_user_id     uuid,
  match_threshold   float    default 0.72,
  match_count       integer  default 4
)
returns table (
  concept_title   text,
  content         text,
  chunk_type      text,
  similarity      float
)
language plpgsql
as $$
begin
  return query
  select
    c.concept_title,
    c.content,
    c.chunk_type,
    1 - (c.embedding <=> query_embedding) as similarity
  from concept_rag_chunks c
  where
    c.user_id = match_user_id
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;


-- =============================================================================
-- B2C ADAPTIVE LEARNING TABLES  (used by trek-api B2C pipeline)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABLE: topics
-- One row per subject a student chooses to learn.
-- Written by b2c_discovery_agent.py.
-- -----------------------------------------------------------------------------

create table if not exists topics (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        references auth.users(id) on delete cascade,
  title      text        not null,
  status     text        not null default 'active'
               check (status in ('active', 'completed', 'paused')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


-- -----------------------------------------------------------------------------
-- TABLE: knowledge_components
-- Nodes in the KC graph for a topic. Written by b2c_curriculum_agent.py.
-- -----------------------------------------------------------------------------

create table if not exists knowledge_components (
  id            uuid        primary key default gen_random_uuid(),
  topic_id      uuid        references topics(id) on delete cascade,
  title         text        not null,
  description   text,
  prerequisites uuid[]      default '{}',
  order_index   integer     not null,
  created_at    timestamptz default now()
);


-- -----------------------------------------------------------------------------
-- TABLE: student_kc_state
-- BKT student model — one row per (user, KC). Never delete rows, only update.
-- Written and read by trek-api during teaching and mastery validation.
-- -----------------------------------------------------------------------------

create table if not exists student_kc_state (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        references auth.users(id) on delete cascade,
  kc_id               uuid        references knowledge_components(id) on delete cascade,
  topic_id            uuid        references topics(id) on delete cascade,

  -- BKT parameters
  p_learned           float       not null default 0.0,
  p_l0                float       not null default 0.1,
  p_transit           float       not null default 0.10,
  p_slip              float       not null default 0.10,
  p_guess             float       not null default 0.20,

  -- Status lifecycle
  status              text        not null default 'not_started'
                        check (status in
                          ('not_started', 'in_progress', 'mastered',
                           'flagged', 'force_advanced')),
  attempt_count       integer     not null default 0,
  last_attempt_score  float,

  -- Learner flags: set by mastery validator
  flag_type           text        check (flag_type in
                        ('struggling', 'misconception', 'strong')),
  flag_reason         text,

  -- SM-2 spaced repetition fields
  sm2_easiness        float       not null default 2.5,
  sm2_interval        integer     not null default 1,
  sm2_repetitions     integer     not null default 0,
  sm2_next_review     timestamptz,

  -- Ebbinghaus forgetting curve
  last_studied_at     timestamptz,
  decay_factor        float       not null default 1.0,

  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),

  unique (user_id, kc_id)
);


-- -----------------------------------------------------------------------------
-- TABLE: interaction_log
-- Every explanation attempt. Append-only — never delete.
-- Written by interaction_logger.py after every mastery validation call.
-- -----------------------------------------------------------------------------

create table if not exists interaction_log (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        references auth.users(id) on delete cascade,
  kc_id                 uuid        references knowledge_components(id) on delete cascade,
  topic_id              uuid        references topics(id) on delete cascade,

  attempt_number        integer     not null,
  explanation_text      text        not null,

  -- Rubric dimension scores (0.0–1.0)
  score_core_idea       float,
  score_reasoning       float,
  score_own_words       float,
  score_edge_awareness  float,
  weighted_score        float,

  -- BKT state before and after this attempt
  bkt_before            float,
  bkt_after             float,

  passed                boolean,
  force_advanced        boolean     default false,
  quality_label         text,

  created_at            timestamptz default now()
);


-- -----------------------------------------------------------------------------
-- TABLE: kc_notes
-- Generated study note per KC, written by notes_generator.py after mastery.
-- Read by context_builder.py on resume and by /api/b2c/notes/{user_id}.
-- Unique per (user, KC) — upserted on conflict.
-- -----------------------------------------------------------------------------

create table if not exists kc_notes (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        references auth.users(id) on delete cascade,
  kc_id           uuid        references knowledge_components(id) on delete cascade,
  topic_id        uuid        references topics(id) on delete cascade,

  status          text        not null default 'complete'
                    check (status in ('in_progress', 'complete')),
  concept_name    text        not null,
  summary         text        not null,
  key_points      jsonb       not null,
  student_analogy text,
  watch_out       text,

  -- Concatenated plain text used for context loading and semantic search
  full_text       text        not null,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),

  unique (user_id, kc_id)
);


-- -----------------------------------------------------------------------------
-- TABLE: b2c_chat_history
-- Every message in a B2C session, per (user, topic, KC).
-- Written by trek-api during teaching turns.
-- -----------------------------------------------------------------------------

create table if not exists b2c_chat_history (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users(id) on delete cascade,
  topic_id    uuid        references topics(id) on delete cascade,
  kc_id       uuid        references knowledge_components(id),

  role        text        not null check (role in ('user', 'assistant', 'system')),
  content     text        not null,
  turn_index  integer     not null,
  is_summary  boolean     default false,

  created_at  timestamptz default now()
);


-- -----------------------------------------------------------------------------
-- TABLE: semantic_memory
-- Analogies and examples that worked for this student, stored as embeddings.
-- Read by context_builder.py (memory_type = 'analogy') for context injection.
-- 384-dim vectors from bge-small-en-v1.5.
-- -----------------------------------------------------------------------------

create table if not exists semantic_memory (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users(id) on delete cascade,
  kc_id       uuid        references knowledge_components(id) on delete cascade,

  content     text        not null,
  embedding   vector(384),
  memory_type text        check (memory_type in ('analogy', 'example', 'misconception')),

  created_at  timestamptz default now()
);

create index if not exists semantic_memory_embedding_idx
  on semantic_memory
  using ivfflat (embedding vector_cosine_ops);


-- =============================================================================
-- LEGACY TREK-API TABLES  (preserved — not used by B2C pipeline)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABLE: teaching_snapshots
-- Key teaching moment per concept per user. One active row per (user, concept).
-- From the pre-B2C trek-api schema. Kept for compatibility during migration.
-- -----------------------------------------------------------------------------

create table if not exists teaching_snapshots (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  roadmap_id        uuid        not null references roadmaps(id) on delete cascade,
  concept_id        integer     not null,
  concept_title     text        not null,
  example_used      text        not null default '',
  analogy_used      text        not null default '',
  teaching_strategy text        not null default 'gap_fill',
  mastered          boolean     not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists idx_teaching_snapshots_user_concept
  on teaching_snapshots(user_id, concept_id);


-- =============================================================================
-- ROW LEVEL SECURITY
-- Applied when frontend uses the anon key (client-side requests).
-- trek-api uses SUPABASE_SERVICE_ROLE_KEY — bypasses RLS entirely.
-- =============================================================================

-- Enable RLS on every table

alter table roadmaps               enable row level security;
alter table concept_materials      enable row level security;
alter table chat_messages          enable row level security;
alter table user_learning_profiles enable row level security;
alter table concept_rag_chunks     enable row level security;
alter table topics                 enable row level security;
alter table knowledge_components   enable row level security;
alter table student_kc_state       enable row level security;
alter table interaction_log        enable row level security;
alter table kc_notes               enable row level security;
alter table b2c_chat_history       enable row level security;
alter table semantic_memory        enable row level security;
alter table teaching_snapshots     enable row level security;

-- Policies: each user can only see and modify their own rows.

create policy "users own their roadmaps"
  on roadmaps for all
  using (auth.uid() = user_id);

create policy "users own their materials"
  on concept_materials for all
  using (auth.uid() = user_id);

create policy "users own their messages"
  on chat_messages for all
  using (auth.uid() = user_id);

create policy "users own their profile"
  on user_learning_profiles for all
  using (auth.uid() = user_id);

create policy "users own their rag chunks"
  on concept_rag_chunks for all
  using (auth.uid() = user_id);

create policy "users own topics"
  on topics for all
  using (auth.uid() = user_id);

-- knowledge_components: access gated through topic ownership
create policy "users own kcs"
  on knowledge_components for all
  using (
    topic_id in (select id from topics where user_id = auth.uid())
  );

create policy "users own kc state"
  on student_kc_state for all
  using (auth.uid() = user_id);

create policy "users own interaction logs"
  on interaction_log for all
  using (auth.uid() = user_id);

create policy "users own kc notes"
  on kc_notes for all
  using (auth.uid() = user_id);

create policy "users own b2c chat"
  on b2c_chat_history for all
  using (auth.uid() = user_id);

create policy "users own semantic memory"
  on semantic_memory for all
  using (auth.uid() = user_id);

create policy "users own teaching snapshots"
  on teaching_snapshots for all
  using (auth.uid() = user_id);
