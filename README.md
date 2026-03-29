# Assign — AI Tutoring Platform

Assign is an AI-powered learning platform built around the Socratic method and Feynman technique. Instead of dumping information at the learner, it finds exactly what they don't know and teaches only that gap — through conversation.

---

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Learning Modes](#learning-modes)
- [Frontend Architecture](#frontend-architecture)
- [Backend Architecture (Trek API)](#backend-architecture-trek-api)
- [LangGraph Teaching Pipeline](#langgraph-teaching-pipeline)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [AI / LLM Stack](#ai--llm-stack)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)

---

## Overview

Assign has four learning modes:

| Mode | What it does |
|------|-------------|
| **Trek** | Full guided course — AI discovers your level, builds a roadmap, teaches concept by concept with memory |
| **Spark** | Quick exam/interview prep — find and fix gaps fast |
| **Recall** | Diagnostic — explain a topic back, AI finds exactly what broke down |
| **Build** | Pair programmer that never writes code for you — guides you to figure it out |

---

## Project Structure

```
assign-main/
├── assign-main/          # Next.js 16 frontend
│   ├── src/
│   │   ├── app/          # Pages + API routes (App Router)
│   │   │   ├── page.tsx              # Landing page
│   │   │   ├── dashboard/page.tsx    # User's courses
│   │   │   ├── trek/page.tsx         # Trek learning mode
│   │   │   ├── spark/page.tsx        # Spark mode
│   │   │   ├── recall/page.tsx       # Recall mode
│   │   │   ├── build/page.tsx        # Build mode
│   │   │   ├── login/page.tsx        # Auth
│   │   │   ├── auth/callback/        # Supabase OAuth callback
│   │   │   └── api/
│   │   │       ├── chat/route.ts     # Spark / Recall / Build chat
│   │   │       ├── trek/route.ts     # Trek full teaching pipeline
│   │   │       └── roadmap/route.ts  # Roadmap CRUD
│   │   ├── components/
│   │   │   ├── ChatPage.tsx          # Reusable chat UI
│   │   │   ├── navigation.tsx        # Top nav
│   │   │   └── sections/            # Landing page sections
│   │   └── lib/
│   │       └── supabase.ts           # Supabase client
│   ├── db/
│   │   └── schema.sql                # Full Supabase schema
│   └── lib/
│       └── supabase.ts               # Server-side Supabase client
│
├── trek-api/             # FastAPI + LangGraph backend (Trek deep mode)
│   ├── main.py           # FastAPI app + endpoints
│   ├── graph/
│   │   ├── graph.py      # LangGraph state machine
│   │   └── state.py      # TrekState TypedDict
│   ├── agents/
│   │   ├── discovery_agent.py    # Collects learner profile
│   │   ├── curriculum_agent.py   # Builds course roadmap
│   │   ├── planner_agent.py      # Decides teaching strategy
│   │   ├── teaching_agent.py     # Socratic tutor
│   │   └── memory_agent.py       # Loads + saves teaching memory
│   ├── db/
│   │   ├── supabase_client.py
│   │   ├── roadmaps.py
│   │   ├── chat_history.py
│   │   └── snapshots.py
│   ├── prompts/
│   │   ├── teacher.py
│   │   ├── planner.py
│   │   └── curriculum.py
│   ├── models/
│   │   └── schemas.py
│   └── requirements.txt
│
└── prompts/              # Prompt templates for frontend modes (loaded as .txt)
    ├── spark.txt
    ├── trek.txt
    ├── recall.txt
    └── build.txt
```

---

## Learning Modes

### Trek (Full Course Mode)
The most complex mode. The AI:
1. Asks 4 discovery questions to build a learner profile
2. Generates a 5–7 concept roadmap (via a scraper API or LLM fallback)
3. Teaches concept-by-concept using Socratic dialogue
4. Saves memory between sessions so it knows which examples/analogies it already used
5. Generates a full summary + mental models when a concept is mastered

### Spark (Quick Prep)
Single-topic, exam-mode. The AI immediately asks what you know, finds the gap, and fixes it — fast. No multi-concept flow.

### Recall (Diagnostic)
You explain a topic from scratch. The AI listens without interrupting, then targets exactly what you got wrong or skipped. Ends with a verdict: what's solid, what's shaky.

### Build (Pair Programming)
Never writes code. Asks questions to guide you toward the solution. Every few exchanges it asks you to explain your code in plain English — if you can't, you go back to basics.

---

## Frontend Architecture

**Stack:** Next.js 16 (App Router), Tailwind CSS v4, Framer Motion, Supabase Auth, Cloudflare AI

### Pages and Responsibilities

**`/trek/page.tsx`**
The most complex page. Manages the full Trek conversation state:
- `phase` — tracks which stage: `discovery → roadmap → gist → learning`
- `roadmapId` — Supabase ID of the current course
- `currentConceptIndex` — which concept is being taught
- `fullHistoryRef` — stores the entire message history, `visibleCount` controls how many are rendered (pagination: scroll to top loads 15 more)
- On resume: loads existing history from Supabase, filters out "welcome back!" messages to avoid duplicates
- Duplicate course guard: before creating a new roadmap, checks if an active one with the same topic already exists

**`/api/trek/route.ts`** — The full Trek pipeline in a single serverless function:

| Phase | What happens |
|-------|-------------|
| `discovery` | Returns one of 4 hardcoded questions sequentially |
| `generateRoadmap` | Calls scraper API, falls back to Cloudflare AI if scraper fails |
| `plan` | Cloudflare AI decides teaching strategy (gap_fill / analogy_first / example_driven / definition_heavy) |
| `learning` | Cloudflare AI runs Socratic tutor, detects `[CONCEPT_MASTERED]` token |
| `generateSummary` | Cloudflare AI produces 3-paragraph summary + mental models, saves to `concept_materials` table |

**`/api/chat/route.ts`** — Simpler chat handler for Spark/Recall/Build:
- Loads the correct prompt from `prompts/*.txt` based on `mode`
- Single Cloudflare AI call, returns `{ reply }`

**`/api/roadmap/route.ts`** — Roadmap CRUD:
- `GET ?id=` — fetches one roadmap with its concept materials
- `GET ?userId=` — fetches all roadmaps for the dashboard
- `POST` — creates a new roadmap
- `PATCH` — updates progress (current concept index, conversation history, status)

### Component Architecture

```
ChatPage.tsx           Reusable chat UI used by Spark, Recall, Build
navigation.tsx         Auth-aware nav — "Go to App" if logged in, "Get Early Access" if not
sections/hero.tsx      Animated hero with marquee strip of topic names
sections/reframe.tsx   Dark section with animated counters
sections/features.tsx  4 feature cards with live visuals
sections/demo.tsx      Animated chat demo
sections/gamification  XP + streak UI
sections/testimonials  3 testimonial cards
sections/cta.tsx       Email waitlist form
```

### Design System
- **Theme:** Brutalist light — warm off-white background (`hsl(40 14% 93%)`), hard black borders, offset shadows
- **Fonts:** Instrument Serif (headings), DM Mono (code/labels), Inter (body)
- **Shadow utilities:** `.brutalist-shadow`, `.brutalist-shadow-sm`, `.brutalist-shadow-lg`, `.brutalist-shadow-hover`
- **Colors:** CSS custom properties mapped to Tailwind via `@theme inline`

---

## Backend Architecture (Trek API)

The trek-api is a FastAPI service that runs the full LangGraph teaching pipeline. It is used when Trek is running in "deep mode" with full memory and state persistence. The Next.js frontend also has its own inline Trek implementation in `/api/trek/route.ts` for lighter usage.

**Stack:** FastAPI, LangGraph 0.3.5, LangChain-Groq, Supabase, PostgreSQL (via psycopg3)

### Agents

**`discovery_agent.py`**
Runs 4 sequential questions to build the learner profile:
1. What topic do you want to learn?
2. What's your current level?
3. What's the goal (understand / build / exam prep)?
4. How much time do you have?

Outputs a `learner_profile` dict stored in TrekState.

**`curriculum_agent.py`**
Calls the external scraper API (`assign-scraper-production.up.railway.app`) with the discovery answers. If the scraper fails or times out (30s), falls back to LLaMA 3.3-70B to generate the course as JSON:
```json
{
  "gist": { "emphasis": "...", "outcomes": [...], "prereqs": [...] },
  "concepts": [
    {
      "title": "...",
      "description": "...",
      "why": "...",
      "subtopics": [...],
      "estimatedMinutes": 20,
      "prereq": "...",
      "sources": [...]
    }
  ]
}
```

**`planner_agent.py`**
Given the current concept and learner profile, decides the teaching strategy:
- `gap_fill` — learner knows some of it, fill the missing piece
- `analogy_first` — abstract concept, start with an analogy
- `example_driven` — learner is practical, show concrete examples
- `definition_heavy` — learner is going for depth/exams

Also generates the opening question to surface what the learner already knows.

**`teaching_agent.py`**
The core Socratic tutor. Uses the TEACHER_SYSTEM prompt (see below). Detects `[CONCEPT_MASTERED]` in the response to know when to advance. Gets injected with:
- The learner profile
- The current concept title
- Past session context (examples/analogies already used)

**`memory_agent.py`**
Two-step system:
- `memory_load`: Detects which concept the user is asking about using keyword matching (80–90% of cases, instant) or LLM router (LLaMA 3.1-8b-instant for ambiguous messages). Loads the relevant teaching snapshot from Supabase.
- `memory_save`: After concept mastery, saves a snapshot (which example was used, which analogy, what strategy worked) and advances `current_concept_idx`.

### Teaching System Prompt Rules

The TEACHER_SYSTEM prompt enforces:

1. **Never explain everything upfront** — find the gap, teach only that
2. **Always end with a question** — make the learner explain something back
3. **Analogy consistency** — scan conversation history before responding; if you used "box" as an analogy for variables, keep using "box" — never switch mid-session
4. **Progression rule** — after 2 questions on the same sub-concept without a clean answer, briefly explain it directly and move forward; never ask a 3rd rephrasing of the same question
5. **`[CONCEPT_MASTERED]`** — output this token only when the learner has cleanly explained the full concept (not just one sub-part)
6. **Voice** — Gen Z friend, casual, direct, under 150 words per response

---

## LangGraph Teaching Pipeline

```
START
  |
  v
[phase router]
  |
  +-- discovery ---------> discovery_agent ---------> END
  |
  +-- generation --------> curriculum_agent --------> END
  |
  +-- gist (user reviews roadmap, approves or edits)
  |
  +-- planning ----------> planner_agent
  |                              |
  |                        memory_load_agent
  |                              |
  |                        teaching_agent
  |                              |
  |                    [concept_mastered?]
  |                       /          \
  |               memory_save        END
  |                   |
  |             (advance concept, loop back to planning)
  |
  +-- (repeat for each concept until all mastered)
```

**State persistence:** PostgreSQL checkpoint via `langgraph-checkpoint-postgres` — every state transition is saved to the database. This means sessions survive server restarts and can be resumed from any point.

**TrekState fields:**

```python
session_id: str
user_id: str
roadmap_id: Optional[str]
phase: Literal["discovery", "generation", "gist", "planning", "memory_load", "learning", "memory_save"]
discovery_step: int                # 0–3
topic: str
level: str                         # "never touched" | "heard of it" | "used it a bit"
goal: str                          # "understand" | "build" | "exam"
time: str
gist: dict                         # { emphasis, outcomes, prereqs }
concepts: list                     # [{ id, title, description, why, subtopics, estimatedMinutes, status }]
sources_hit: list
current_concept_idx: int
concept_mastered: bool
teaching_strategy: str             # gap_fill | analogy_first | example_driven | definition_heavy
opening_prompt: str
messages: list                     # current concept conversation
last_reply: str
past_snapshots: list               # [{ example_used, analogy_used, strategy, mastered }]
```

---

## API Reference

### Trek API (FastAPI — port 8000)

#### `POST /trek/session`
Creates a new Trek session and returns the first discovery question.
```json
// Request
{ "user_id": "uuid" }

// Response
{ "session_id": "uuid", "reply": "what topic do you want to understand end to end?", "phase": "discovery" }
```

#### `POST /trek/message`
Send a message and advance the graph.
```json
// Request
{
  "session_id": "uuid",
  "user_id": "uuid",
  "message": "I want to learn React hooks",
  "concepts": [...],       // optional, for gist edits
  "roadmap_id": "uuid"     // optional, for resuming
}

// Response
{
  "reply": "...",
  "phase": "discovery | generation | gist | learning",
  "discovery_step": 1,
  "roadmap_id": "uuid",
  "gist": { "emphasis": "...", "outcomes": [...], "prereqs": [...] },
  "concepts": [...],
  "sources_hit": [...],
  "concept_mastered": false,
  "current_concept_idx": 0,
  "opening_prompt": "..."
}
```

Special case: sending `"approve"` or `"start"` during the `gist` phase transitions to the `planning` phase and begins teaching.

#### `GET /trek/roadmap/{roadmap_id}`
Returns the saved roadmap.

#### `GET /trek/history/{roadmap_id}/concept/{concept_id}`
Returns chat history and teaching snapshot for a specific concept.

#### `PUT /trek/roadmap/{roadmap_id}/concepts`
Updates the concepts list (when user edits the roadmap during the gist phase).

#### `GET /health`
Health check.

---

### Next.js API Routes

#### `POST /api/trek`
Inline Trek pipeline (no separate backend needed). See phases table above.

#### `POST /api/chat`
```json
// Request
{ "mode": "spark | recall | build | trek", "messages": [...] }

// Response
{ "reply": "..." }
```

#### `GET /api/roadmap?userId={id}`
Returns all roadmaps for the dashboard.

#### `GET /api/roadmap?id={id}`
Returns one roadmap with all concept materials.

#### `POST /api/roadmap`
Creates a new roadmap. Body: `{ userId, topic, concepts, learnerProfile, sourcesHit, totalMinutes }`.

#### `PATCH /api/roadmap`
Updates roadmap progress. Body: `{ roadmapId, currentConceptIndex, conversationHistory, conceptSummaries, status, lastStudied }`.

---

## Database Schema

All tables are in Supabase (PostgreSQL). Row-Level Security is enabled on every table — users can only read and write their own rows.

### `roadmaps`
One row per Trek course. Created when the user approves the roadmap in the gist phase.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (pk) | Auto-generated |
| `user_id` | uuid | Supabase auth user |
| `topic` | text | e.g. "React Hooks" |
| `status` | text | `active` or `completed` |
| `concepts` | jsonb | Array of concept objects with title, description, why, subtopics, status |
| `current_concept_index` | integer | Which concept is currently being taught (0-based) |
| `conversation_history` | jsonb | Full message history across all concepts |
| `concept_summaries` | jsonb | Legacy — per-concept summaries (now in concept_materials) |
| `learner_profile` | jsonb | `{ topic, level, goal, time }` from discovery |
| `sources_hit` | text[] | URLs the scraper used to build the course |
| `total_minutes_estimated` | integer | Sum of estimatedMinutes across all concepts |
| `created_at` | timestamptz | |
| `last_studied` | timestamptz | Updated on every PATCH |

**Indexes:** `user_id`, `(user_id, last_studied DESC)`

---

### `concept_materials`
LLM-generated study materials for each mastered concept. Generated after the learner gives a clean explanation back.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (pk) | |
| `roadmap_id` | uuid (fk → roadmaps) | |
| `user_id` | uuid | |
| `concept_index` | integer | Position in the roadmap |
| `concept_title` | text | e.g. "useState and State Updates" |
| `summary` | text | 3 paragraphs: what it is, how it works, when to use it |
| `key_mental_models` | text[] | e.g. ["State is a snapshot, not a live reference"] |
| `common_mistakes` | text[] | e.g. ["Mutating state directly instead of calling setter"] |
| `sources` | jsonb | `[{ label, url }]` — official docs, Wikipedia, etc. |
| `user_notes` | text | User can add their own notes |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Unique constraint:** `(roadmap_id, concept_index)` — one material set per concept per course.

---

### `chat_messages`
Every single message in every conversation, stored individually.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (pk) | |
| `user_id` | uuid | |
| `roadmap_id` | uuid (fk → roadmaps) | |
| `concept_index` | integer | Which concept this message belongs to |
| `role` | text | `user` or `assistant` |
| `content` | text | Message text |
| `created_at` | timestamptz | |

**Indexes:** `(roadmap_id, concept_index)`, `user_id`, `(roadmap_id, created_at)`

---

### `user_learning_profiles`
One row per user. Built dynamically as the AI learns how this person learns best. Used to personalise future sessions.

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | uuid (pk) | |
| `learning_style` | text | `visual`, `example_driven`, `theory_first`, `analogy_based`, `hands_on` |
| `pace` | text | `fast`, `steady`, `needs_repetition` |
| `effective_analogy_types` | text[] | Types of analogies that worked for this learner |
| `misconceptions` | text[] | Known wrong beliefs to watch for |
| `strong_areas` | text[] | Topics already solid |
| `weak_areas` | text[] | Topics that need more focus |
| `updated_at` | timestamptz | |

---

### `concept_rag_chunks`
Vector embeddings of concept materials for RAG (retrieval-augmented generation). Used by the memory agent to retrieve relevant past teaching moments.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (pk) | |
| `user_id` | uuid | |
| `roadmap_id` | uuid (fk → roadmaps) | |
| `concept_index` | integer | |
| `concept_title` | text | |
| `content` | text | The chunk content |
| `chunk_type` | text | `summary`, `mental_model`, `common_mistake`, `teaching_moment` |
| `embedding` | vector(384) | 384-dimensional embedding |
| `created_at` | timestamptz | |

**Index:** IVFFlat index with cosine similarity operator (`vector_cosine_ops`) for fast nearest-neighbour search.

**Custom function:**
```sql
match_concept_chunks(
  query_embedding vector(384),
  match_user_id   uuid,
  match_threshold float DEFAULT 0.72,
  match_count     int   DEFAULT 4
)
```
Returns the top N chunks with cosine similarity above the threshold. Used by the memory agent to inject relevant past context before each teaching turn.

---

### Row-Level Security Policies

Every table has an RLS policy using `auth.uid()`:
- `SELECT` — `user_id = auth.uid()`
- `INSERT` — `user_id = auth.uid()`
- `UPDATE` — `user_id = auth.uid()`
- `DELETE` — `user_id = auth.uid()`

No row is visible to any user other than the one who created it.

---

## AI / LLM Stack

### Models Currently in Use

| Layer | Model ID | Used for |
|-------|----------|----------|
| Frontend chat (Spark/Recall/Build) | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | `/api/chat` |
| Frontend Trek pipeline | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | `/api/trek` (all phases) |
| Backend teaching agent | Groq `llama-3.3-70b-versatile` | trek-api teaching loop |
| Backend memory router | Groq `llama-3.1-8b-instant` | Fast concept detection in memory_load |
| Backend planning/summary | Groq `llama-3.3-70b-versatile` | Planner + summary generation |

Temperature settings:
- `0.7` — teaching / conversation (needs variety)
- `0.3` — planning / course generation / summary (needs consistency)

---

### All Available Cloudflare Workers AI Models

All models are called via:
```
POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{MODEL_ID}
```

#### Text Generation (Conversational)

| Model ID | Parameters | Speed | Best for |
|----------|-----------|-------|----------|
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 70B (fp8) | Fast | General chat, teaching — **currently used** |
| `@cf/meta/llama-3.1-70b-instruct` | 70B | Medium | High quality responses |
| `@cf/meta/llama-3.1-8b-instruct` | 8B | Very fast | Quick responses, memory routing |
| `@cf/meta/llama-3.2-3b-instruct` | 3B | Fastest | Ultra-low latency, simple tasks |
| `@cf/meta/llama-3.2-1b-instruct` | 1B | Fastest | Classification, routing |
| `@cf/mistral/mistral-7b-instruct-v0.2` | 7B | Fast | General purpose, instruction following |
| `@cf/google/gemma-7b-it` | 7B | Medium | Instruction tuned, good at structured output |
| `@cf/qwen/qwen1.5-14b-chat-awq` | 14B | Medium | Multilingual, strong reasoning |
| `@cf/qwen/qwen1.5-7b-chat-awq` | 7B | Fast | Multilingual chat |
| `@cf/microsoft/phi-2` | 2.7B | Very fast | Small but capable, good for simple Q&A |
| `@cf/tinyllama/tinyllama-1.1b-chat-v1.0` | 1.1B | Fastest | Edge devices, minimal latency |

#### Reasoning Models (Think before answering)

These models output a `<think>...</think>` block containing internal reasoning before the final answer. Strip the think block before showing to users.

| Model ID | Parameters | Speed | Best for |
|----------|-----------|-------|----------|
| `@cf/deepseek-ai/deepseek-r1-distill-llama-70b` | 70B | Slow | Complex problem solving, identifying learning gaps |
| `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` | 32B | Medium | Balanced reasoning + speed |

Example — stripping the think block:
```ts
const raw = data.result?.response || ''
const reply = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
```

#### Code Models

| Model ID | Parameters | Best for |
|----------|-----------|----------|
| `@hf/thebloke/deepseek-coder-6.7b-instruct-awq` | 6.7B | Code generation, code explanation |
| `@cf/defog/sqlcoder-7b-2` | 7B | Natural language to SQL |
| `@hf/thebloke/mistral-7b-instruct-v0.1-awq` | 7B | General coding + instruction |

#### Embedding Models (for RAG / Vector Search)

Used to generate vector embeddings for the `concept_rag_chunks` table.

| Model ID | Dimensions | Best for |
|----------|-----------|----------|
| `@cf/baai/bge-large-en-v1.5` | 1024 | Highest accuracy semantic search |
| `@cf/baai/bge-base-en-v1.5` | 768 | Balanced accuracy + speed |
| `@cf/baai/bge-small-en-v1.5` | 384 | Fast, good enough for most RAG — **schema uses this** |

Example embedding call:
```ts
const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/baai/bge-small-en-v1.5`,
  {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'what is a React hook?' })
  }
)
const data = await res.json()
// data.result.data[0] → Float32Array of 384 dimensions
```

#### Image Generation

| Model ID | Best for |
|----------|----------|
| `@cf/stabilityai/stable-diffusion-xl-base-1.0` | High quality images |
| `@cf/bytedance/stable-diffusion-xl-lightning` | Fast image generation |
| `@cf/lykon/dreamshaper-8-lcm` | Artistic / stylised images |

#### Speech (Text to Speech)

| Model ID | Best for |
|----------|----------|
| `@cf/myshell-ai/melotts` | Natural speech synthesis |

---

### Model Switching Guide

To swap the model used in the frontend, change `CF_MODEL` in either API route:

```ts
// assign-main/src/app/api/chat/route.ts
// assign-main/src/app/api/trek/route.ts

const CF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'  // change this line
```

Recommended swaps by use case:

| Goal | Recommended model |
|------|------------------|
| Better at finding learning gaps | `@cf/deepseek-ai/deepseek-r1-distill-llama-70b` |
| Faster responses | `@cf/meta/llama-3.1-8b-instruct` |
| Lower cost / free tier | `@cf/meta/llama-3.2-3b-instruct` |
| Code-focused (Build mode) | `@hf/thebloke/deepseek-coder-6.7b-instruct-awq` |

---

## Environment Variables

### assign-main/.env.local
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
```

### trek-api/.env
```
GROQ_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_CONNECTION_STRING=postgresql://postgres:[password]@[host]:5432/postgres
```

---

## Running Locally

### Frontend (Next.js)

```bash
cd assign-main
npm install
npm run dev
# runs on http://localhost:3000
```

### Backend (Trek API)

```bash
cd trek-api
python -m venv .venv
source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# runs on http://localhost:8000
```

### Database

Run `assign-main/db/schema.sql` in your Supabase SQL editor to create all tables, indexes, RLS policies, and the RAG match function.

Enable the `pgvector` extension in Supabase first:
```sql
create extension if not exists vector;
```
