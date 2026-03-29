# PRD: Personalized RAG Learning System for assign — Trek Feature
**Version:** 1.0
**Date:** 2026-03-09
**Stack:** Next.js (frontend) + Python FastAPI (backend service) + Supabase (PostgreSQL + pgvector) + Groq LLM

---

## 1. Problem Statement

The current Trek feature teaches concepts using a stateless LLM — it has no memory of how a specific user learns, no storage of past explanations, and no way to retrieve previously taught material. Every session starts cold.

This means:
- If a user asks "wait, how did variables work again?" while learning functions, the LLM re-explains from scratch with no awareness of what analogy worked for that user before.
- The LLM does not adapt its teaching style based on the user's learning patterns.
- Conversations are stored only as a last-30-message snapshot in the roadmap row, not as queryable, searchable history.

---

## 2. Goal

Build a **Python-based backend service** that gives the Trek feature:

1. **Persistent chat storage** — every message per user per roadmap saved to PostgreSQL.
2. **User learning profile** — a dynamic profile built from conversations that captures how each user learns best.
3. **RAG on mastered concepts** — when a user references something they already learned, retrieve the stored explanation (tailored to *their* learning style) and inject it as context, instead of generating from scratch.

---

## 3. Architecture Overview

```
Next.js Frontend (existing)
        │
        │  HTTP (JSON)
        ▼
Python FastAPI Service  ◄──── NEW (replaces /api/trek and /api/chat logic)
        │
        ├── Groq API (LLM: llama-3.3-70b-versatile)
        ├── HuggingFace Inference API (embeddings: all-MiniLM-L6-v2, 384-dim)
        └── Supabase PostgreSQL
                ├── roadmaps (existing)
                ├── concept_materials (existing)
                ├── chat_messages (NEW)
                ├── user_learning_profiles (NEW)
                └── concept_rag_chunks (NEW, pgvector)
```

The Next.js frontend continues to own UI and auth. The Python service owns all LLM logic, RAG retrieval, chat persistence, and profile management. Next.js API routes (`/api/trek`, `/api/chat`) become thin proxies to the Python service, or the frontend calls the Python service directly.

---

## 4. Python Service: Endpoints

### `POST /trek/discovery`
Returns the next onboarding question.

**Request:**
```json
{ "question_index": 0 }
```
**Response:**
```json
{ "reply": "what topic do you want to understand end to end?", "next_index": 1 }
```

---

### `POST /trek/generate-course`
Takes discovery answers, calls scraper (existing Railway service) or LLM fallback, saves roadmap to DB, returns structured course.

**Request:**
```json
{
  "user_id": "uuid",
  "discovery_answers": {
    "topic": "Python",
    "level": "never touched it",
    "goal": "build something",
    "time": "1 hour a day for 2 weeks"
  }
}
```
**Response:**
```json
{
  "roadmap_id": "uuid",
  "course": {
    "gist": { "emphasis": "...", "outcomes": [...], "prereqs": [...] },
    "concepts": [
      {
        "id": 0,
        "title": "Variables & Data Types",
        "why": "...",
        "subtopics": ["int", "str", "list"],
        "estimated_minutes": 20,
        "prereq": null,
        "status": "locked"
      }
    ]
  },
  "sources_hit": ["wikipedia", "stackoverflow"]
}
```

---

### `POST /trek/chat`
Core teaching endpoint. Handles one message exchange in the learning phase.

- Fetches user learning profile from DB
- Embeds user message → searches `concept_rag_chunks` for semantic matches
- If RAG match found (cosine similarity > 0.72) → injects stored explanation as context
- Calls LLM with enriched system prompt
- Saves both user message and assistant reply to `chat_messages`
- Returns reply + `concept_mastered` flag

**Request:**
```json
{
  "user_id": "uuid",
  "roadmap_id": "uuid",
  "concept_index": 2,
  "concept_title": "Functions",
  "messages": [
    { "role": "user", "content": "wait can you remind me how variables work?" }
  ],
  "learner_profile": {
    "topic": "Python",
    "level": "beginner",
    "goal": "build something",
    "time": "1h/day"
  }
}
```

**Response:**
```json
{
  "reply": "yo so remember when we talked about variables — you got it when I used the sticky note analogy. a variable is just a sticky note with a name on it that holds a value. now functions are like a set of instructions you label and reuse...",
  "concept_mastered": false,
  "rag_used": true
}
```

**LLM System Prompt enrichment (internal):**
```
[TEACHER_SYSTEM prompt]

User's learning profile:
- Learning style: example_driven
- Pace: steady
- Analogies that worked: sticky note analogy for variables, recipe analogy for functions
- Known misconceptions: confused mutable vs immutable
- Weak areas: list indexing

[IF RAG HIT]
Context from what this user already learned (use this to connect concepts):
[Variables & Data Types - summary]: A variable is a named container...
[Variables & Data Types - mental_model]: Think of a variable like a sticky note...

Current concept: Functions
```

---

### `POST /trek/concept-mastered`
Called when LLM signals `[CONCEPT_MASTERED]`. Does three things in parallel:

1. Generates concept summary (existing logic)
2. Chunks + embeds the summary/mental models → stores in `concept_rag_chunks`
3. Extracts learning insights from conversation → upserts `user_learning_profiles`

**Request:**
```json
{
  "user_id": "uuid",
  "roadmap_id": "uuid",
  "concept_index": 0,
  "concept_title": "Variables & Data Types",
  "messages": [...last 20 messages...],
  "learner_profile": { ... }
}
```

**Response:**
```json
{
  "summary": {
    "summary": "3 paragraphs...",
    "key_mental_models": ["Variables are named containers...", "..."],
    "common_mistakes": ["Confusing = with ==", "..."],
    "sources": [{ "label": "Python Docs", "url": "https://..." }]
  },
  "profile_updated": true,
  "chunks_stored": 6
}
```

---

### `GET /trek/chat-history`
Returns paginated chat history for a roadmap.

**Query params:** `roadmap_id`, `concept_index` (optional), `limit`, `offset`

**Response:**
```json
{
  "messages": [
    { "role": "user", "content": "...", "created_at": "..." },
    { "role": "assistant", "content": "...", "created_at": "..." }
  ],
  "total": 84
}
```

---

### `GET /trek/user-profile`
Returns the current user learning profile.

**Query params:** `user_id`

**Response:**
```json
{
  "learning_style": "example_driven",
  "pace": "steady",
  "effective_analogy_types": ["sticky note analogy", "recipe analogy"],
  "misconceptions": ["confused = with =="],
  "strong_areas": ["variables", "basic syntax"],
  "weak_areas": ["list indexing", "scope"]
}
```

---

## 5. Database Schema (new tables)

### `chat_messages`
```sql
create table chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  roadmap_id  uuid references roadmaps(id) on delete cascade,
  concept_index integer default 0,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz default now()
);
create index on chat_messages(user_id, roadmap_id);
create index on chat_messages(roadmap_id, concept_index);
```

### `user_learning_profiles`
```sql
create table user_learning_profiles (
  user_id                 uuid primary key,
  learning_style          text default 'unknown',
  pace                    text default 'steady',
  effective_analogy_types text[] default '{}',
  misconceptions          text[] default '{}',
  strong_areas            text[] default '{}',
  weak_areas              text[] default '{}',
  updated_at              timestamptz default now()
);
```

### `concept_rag_chunks`
```sql
create extension if not exists vector;

create table concept_rag_chunks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  roadmap_id     uuid references roadmaps(id) on delete cascade,
  concept_index  integer not null,
  concept_title  text not null,
  content        text not null,
  chunk_type     text,   -- 'summary' | 'mental_model' | 'common_mistake' | 'teaching_moment'
  embedding      vector(384),
  created_at     timestamptz default now()
);
create index on concept_rag_chunks(user_id);
create index on concept_rag_chunks using ivfflat (embedding vector_cosine_ops);

-- Similarity search RPC
create or replace function match_concept_chunks(
  query_embedding  vector(384),
  match_user_id    uuid,
  match_threshold  float default 0.72,
  match_count      int   default 4
)
returns table (
  concept_title  text,
  content        text,
  chunk_type     text,
  similarity     float
)
language plpgsql as $$
begin
  return query
  select
    c.concept_title,
    c.content,
    c.chunk_type,
    1 - (c.embedding <=> query_embedding) as similarity
  from concept_rag_chunks c
  where c.user_id = match_user_id
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;
```

---

## 6. Python Service: File Structure

```
assign-backend/
├── main.py                  # FastAPI app entrypoint
├── requirements.txt
├── .env                     # GROQ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, HF_API_KEY
│
├── routers/
│   ├── trek.py              # All /trek/* endpoints
│   └── chat.py              # /chat (spark, recall, build modes)
│
├── services/
│   ├── llm.py               # Groq client wrapper, all system prompts
│   ├── embeddings.py        # HuggingFace all-MiniLM-L6-v2 embed()
│   ├── rag.py               # search_user_knowledge(), store_concept_chunks()
│   ├── profile.py           # extract_insights(), update_user_profile()
│   └── scraper.py           # calls existing Railway scraper
│
├── db/
│   ├── client.py            # Supabase client singleton
│   ├── messages.py          # save_message(), get_history()
│   ├── roadmaps.py          # create_roadmap(), update_roadmap()
│   └── profiles.py          # get_profile(), upsert_profile()
│
└── models/
    ├── trek.py              # Pydantic request/response models
    └── profile.py           # UserLearningProfile, RagChunk
```

---

## 7. Python Dependencies (`requirements.txt`)

```
fastapi==0.115.0
uvicorn==0.30.0
httpx==0.27.0
groq==0.12.0
supabase==2.9.0
pydantic==2.8.0
python-dotenv==1.0.1
```

---

## 8. RAG Flow (detail)

```
User sends message: "wait how did variables work again?"
              │
              ▼
embed(message)  →  [0.23, -0.11, ...]  (384-dim vector)
              │
              ▼
supabase.rpc('match_concept_chunks', {
  query_embedding: vector,
  match_user_id: user_id,
  match_threshold: 0.72,
  match_count: 4
})
              │
      ┌───────┴────────┐
  similarity > 0.72?   similarity < 0.72?
      │                      │
      ▼                      ▼
inject chunks         no RAG context
into system prompt    teach from scratch
      │
      ▼
LLM uses the SAME analogy that worked for this user
("remember the sticky note analogy we used?")
```

---

## 9. User Profile Update Flow (after concept mastered)

```
Conversation messages (last 20)
              │
              ▼
Groq LLM → extract insights:
{
  "learning_style": "example_driven",
  "pace": "steady",
  "effective_analogy_types": ["sticky note analogy"],
  "misconceptions": ["confused = with =="],
  "strong_areas": ["basic syntax"],
  "weak_areas": ["scope"]
}
              │
              ▼
Merge with existing profile (array union, no duplicates)
              │
              ▼
Upsert → user_learning_profiles
```

---

## 10. Environment Variables

| Variable | Where used |
|---|---|
| `GROQ_API_KEY` | LLM calls |
| `NEXT_PUBLIC_SUPABASE_URL` | DB client |
| `SUPABASE_SERVICE_KEY` | DB client (server-side, bypasses RLS) |
| `HUGGINGFACE_API_KEY` | Embeddings (free tier, huggingface.co) |
| `SCRAPER_URL` | Existing Railway scraper |

---

## 11. Frontend Changes (Next.js — minimal)

The existing trek page needs two small changes:

1. **Pass `user_id` and `concept_index`** in the `/trek/chat` request body (currently missing).
2. **Call `/trek/concept-mastered`** when `concept_mastered === true` (currently calls separate summary + persist endpoints).

Everything else — UI, auth, roadmap display, sidebar, notes — stays unchanged.

---

## 12. Acceptance Criteria

| # | Criteria |
|---|---|
| 1 | Every user message and assistant reply is saved to `chat_messages` with correct `user_id`, `roadmap_id`, `concept_index` |
| 2 | After a concept is mastered, `concept_rag_chunks` contains at least 3 rows (summary + mental models) with valid 384-dim embeddings |
| 3 | After a concept is mastered, `user_learning_profiles` is upserted with non-empty `learning_style` and `pace` |
| 4 | When a user asks about a previously mastered concept (e.g. "how did variables work?"), `rag_used: true` is returned and the reply references stored context |
| 5 | When no previously mastered concept is relevant, the LLM teaches from scratch without RAG injection |
| 6 | User profile is injected into every teaching prompt — LLM adapts analogies to the user's known effective styles |
| 7 | Python service returns responses under 1.5s for `/trek/chat` (excluding cold-start embedding model load) |
| 8 | All DB writes (chat, profile, chunks) are non-blocking — a DB failure does not break the chat response |

---

## 13. Out of Scope (v1)

- Real-time streaming responses
- Cross-user knowledge sharing
- Embedding model fine-tuning
- Notes-based RAG (user's own written notes as retrieval source)
- Multi-language support beyond English
