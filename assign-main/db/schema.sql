-- =============================================================================
-- ASSIGN — COMPLETE DATABASE SCHEMA
-- =============================================================================
-- How to use:
--   Supabase (hosted):  paste into Dashboard → SQL Editor → Run
--   Local Docker:       automatically applied via docker-compose on first start
-- =============================================================================


-- ── Extensions ────────────────────────────────────────────────────────────────

create extension if not exists vector;
create extension if not exists "uuid-ossp";


-- =============================================================================
-- TABLE 1: roadmaps
-- One row per Trek course a user starts.
-- =============================================================================

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

  created_at              timestamptz not null default now(),
  last_studied            timestamptz not null default now()
);

create index if not exists idx_roadmaps_user_id
  on roadmaps(user_id);

create index if not exists idx_roadmaps_last_studied
  on roadmaps(user_id, last_studied desc);


-- =============================================================================
-- TABLE 2: concept_materials
-- LLM-generated summary for each mastered concept.
-- One row per (roadmap, concept_index) pair.
-- =============================================================================

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


-- =============================================================================
-- TABLE 3: chat_messages
-- Every single message in every conversation, per user + roadmap + concept.
-- Primary source for RAG teaching highlights and conversation analytics.
-- =============================================================================

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


-- =============================================================================
-- TABLE 4: user_learning_profiles
-- One row per user. Built dynamically from LLM analysis after each concept
-- is mastered. Injected into every teaching prompt to personalise teaching.
-- =============================================================================

create table if not exists user_learning_profiles (
  user_id                 uuid        primary key,

  -- visual | example_driven | theory_first | analogy_based | hands_on
  learning_style          text        not null default 'unknown',

  -- fast | steady | needs_repetition
  pace                    text        not null default 'steady',

  -- Analogy types that previously worked for this user
  -- e.g. ["sticky note analogy", "recipe analogy"]
  effective_analogy_types text[]      not null default '{}',

  -- Wrong beliefs found and corrected during past sessions
  misconceptions          text[]      not null default '{}',

  -- Sub-topics the user demonstrably already knew before being taught
  strong_areas            text[]      not null default '{}',

  -- Sub-topics the user repeatedly struggled with across sessions
  weak_areas              text[]      not null default '{}',

  updated_at              timestamptz not null default now()
);


-- =============================================================================
-- TABLE 5: concept_rag_chunks
-- 384-dimensional embeddings of mastered concept summaries, mental models,
-- common mistakes, and teaching moments.
-- Queried at chat time via cosine similarity to inject relevant prior context.
-- =============================================================================

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

  -- 384-dim vector produced by all-MiniLM-L6-v2
  embedding       vector(384),

  created_at      timestamptz not null default now()
);

create index if not exists idx_rag_chunks_user
  on concept_rag_chunks(user_id);

-- IVFFlat cosine similarity index
-- Tip: create this after inserting 500+ rows for best performance.
-- For early dev the sequential scan is fine — drop and recreate this later.
create index if not exists idx_rag_chunks_embedding
  on concept_rag_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);


-- =============================================================================
-- FUNCTION: match_concept_chunks
-- Cosine similarity search scoped to a single user.
-- Called from the Python RAG service via: supabase.rpc("match_concept_chunks")
-- =============================================================================

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
-- ROW LEVEL SECURITY
-- Applied when frontend uses the anon key (client-side).
-- Python backend uses the service key — bypasses RLS entirely.
-- =============================================================================

alter table roadmaps               enable row level security;
alter table concept_materials      enable row level security;
alter table chat_messages          enable row level security;
alter table user_learning_profiles enable row level security;
alter table concept_rag_chunks     enable row level security;

-- Each user can only see and modify their own rows.

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
