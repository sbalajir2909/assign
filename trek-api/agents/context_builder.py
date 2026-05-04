"""
Context builder — assembles the 700-token context window for every LLM call.

On resume, the note for that KC IS the context. This is intentional.

Priority order (700 token budget, strict):
1. Student's KC state for current module (BKT score, attempt count, flags) — ~50 tokens
2. Generated note for current KC (if resuming) — ~200 tokens
3. Last 3 conversation turns verbatim — ~200 tokens
4. Compressed session summary (older turns) — ~150 tokens
5. Relevant semantic memory (analogies that worked) — ~100 tokens
"""

from utils.embeddings import embed_text
from db.client import supabase

TOKEN_BUDGET = 700

try:
    import tiktoken
    _enc = tiktoken.get_encoding("cl100k_base")
    def count_tokens(text: str) -> int:
        return len(_enc.encode(text))
except ImportError:
    # Rough approximation if tiktoken not available
    def count_tokens(text: str) -> int:
        return len(text) // 4


async def build_context(state: dict) -> dict:
    """
    Assembles the context_window list from state + DB lookups.
    Returns {"context_window": [...messages...]}.
    """
    messages = []
    tokens_used = 0

    kc_id = state.get("current_kc_id")
    user_id = state.get("user_id")
    kc = None
    if kc_id and state.get("kc_graph"):
        kc = next((k for k in state["kc_graph"] if k.id == kc_id), None)

    # 1. KC state snapshot (~50 tokens, always included)
    if kc:
        flags = [
            f["flag_type"]
            for f in state.get("flags_this_session", [])
            if f["kc_id"] == kc_id
        ]
        kc_status = (
            f"[Student state for '{kc.title}']\n"
            f"Mastery: {state.get('bkt_state', {}).get(kc_id, 0.0):.0%}\n"
            f"Attempt: {state.get('current_attempt_number', 1)} of 4\n"
            f"Flags: {flags or 'none'}"
        )
        messages.append({"role": "system", "content": kc_status})
        tokens_used += count_tokens(kc_status)

    # 2. Existing note for this KC (resume context — ~200 tokens)
    # Only load on first attempt (resuming, not re-attempting)
    if kc_id and state.get("current_attempt_number", 1) == 1:
        try:
            note_result = await supabase.table("kc_notes") \
                .select("full_text") \
                .eq("user_id", user_id) \
                .eq("kc_id", kc_id) \
                .maybe_single() \
                .execute()
            if note_result.data:
                note_text = f"[Previous note for this concept]\n{note_result.data['full_text']}"
                t = count_tokens(note_text)
                if tokens_used + t <= TOKEN_BUDGET - 300:
                    messages.append({"role": "system", "content": note_text})
                    tokens_used += t
        except Exception as e:
            print(f"[context_builder] Failed to load note: {e}")

    # 3. Last 3 conversation turns verbatim (~200 tokens)
    recent = state.get("recent_turns", [])[-3:]
    for turn in recent:
        t = count_tokens(turn.get("content", ""))
        if tokens_used + t <= TOKEN_BUDGET - 100:
            messages.append(turn)
            tokens_used += t

    # 4. Session summary (~150 tokens)
    summary = state.get("session_summary")
    if summary:
        t = count_tokens(summary)
        if tokens_used + t <= TOKEN_BUDGET - 50:
            messages.insert(1, {
                "role": "system",
                "content": f"[Session summary]\n{summary}"
            })
            tokens_used += t

    # 5. Semantic memory — analogies that worked (~100 tokens)
    if kc_id and tokens_used < TOKEN_BUDGET - 50:
        try:
            mem_result = await supabase.table("semantic_memory") \
                .select("content, memory_type") \
                .eq("user_id", user_id) \
                .eq("kc_id", kc_id) \
                .eq("memory_type", "analogy") \
                .limit(2) \
                .execute()
            if mem_result.data:
                analogies = "\n".join(f"- {m['content']}" for m in mem_result.data)
                mem_text = f"[Analogies this student responds to]\n{analogies}"
                t = count_tokens(mem_text)
                if tokens_used + t <= TOKEN_BUDGET:
                    messages.append({"role": "system", "content": mem_text})
        except Exception as e:
            print(f"[context_builder] Failed to load semantic memory: {e}")

    # 6. RAG retrieval — semantically similar prior teaching moments from
    #    concept_rag_chunks, written after each KC mastery by notes_generator.
    #    Returned as a separate list; the teaching agent injects it before its
    #    system prompt so it does not compete with the 700-token context budget.
    retrieved_context: list[str] = []
    if kc and user_id:
        try:
            query_text = f"{kc.title}: {kc.description}" if kc.description else kc.title
            query_vec = await embed_text(query_text)
            rag_result = await supabase.rpc("match_concept_chunks", {
                "query_embedding": query_vec,
                "match_user_id": user_id,
                "match_threshold": 0.72,
                "match_count": 4,
            }).execute()
            if rag_result.data:
                retrieved_context = [row["content"] for row in rag_result.data]
                print(f"[context_builder] RAG: {len(retrieved_context)} chunk(s) retrieved for '{kc.title}'")
        except Exception as e:
            print(f"[context_builder] RAG lookup failed for '{getattr(kc, 'title', '?')}': {e}")

    return {"context_window": messages, "retrieved_context": retrieved_context}
