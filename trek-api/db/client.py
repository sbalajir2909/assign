"""
Database client — async Supabase wrapper + optional Redis.

Usage:
    from db.client import supabase, redis_client

    result = await supabase.table("notes").select("*").eq("user_id", uid).execute()
    data = result.data
"""

import os
import asyncio
from dotenv import load_dotenv

load_dotenv()


# ── Async Supabase wrapper ────────────────────────────────────────────────────

class _AsyncQuery:
    """Wraps a postgrest-py query builder, making execute() awaitable."""

    def __init__(self, builder):
        self._b = builder

    # Builder methods — each returns a new _AsyncQuery so they chain
    def select(self, *a, **kw):   return _AsyncQuery(self._b.select(*a, **kw))
    def insert(self, *a, **kw):   return _AsyncQuery(self._b.insert(*a, **kw))
    def upsert(self, *a, **kw):   return _AsyncQuery(self._b.upsert(*a, **kw))
    def update(self, *a, **kw):   return _AsyncQuery(self._b.update(*a, **kw))
    def delete(self):             return _AsyncQuery(self._b.delete())
    def eq(self, *a, **kw):       return _AsyncQuery(self._b.eq(*a, **kw))
    def neq(self, *a, **kw):      return _AsyncQuery(self._b.neq(*a, **kw))
    def order(self, *a, **kw):    return _AsyncQuery(self._b.order(*a, **kw))
    def limit(self, n):           return _AsyncQuery(self._b.limit(n))
    def maybe_single(self):       return _AsyncQuery(self._b.maybe_single())
    def single(self):             return _AsyncQuery(self._b.single())

    # on_conflict is a kwarg for upsert — handled above via upsert(**kw)

    async def execute(self):
        return await asyncio.to_thread(self._b.execute)


class _AsyncSupabase:
    """Lazy async wrapper around the sync Supabase client."""

    def __init__(self):
        self._client = None

    def _get(self):
        if self._client is None:
            from supabase import create_client
            url = (
                os.environ.get("SUPABASE_URL")
                or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
            )
            key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
            self._client = create_client(url, key)
        return self._client

    def table(self, name: str) -> _AsyncQuery:
        return _AsyncQuery(self._get().table(name))


supabase = _AsyncSupabase()


# ── Redis client (optional — Upstash) ────────────────────────────────────────

redis_client = None

try:
    from upstash_redis import Redis as _UpstashRedis
    _redis_url = os.environ.get("REDIS_URL", "")
    _redis_token = os.environ.get("REDIS_TOKEN", "")
    if _redis_url and _redis_token:
        redis_client = _UpstashRedis(url=_redis_url, token=_redis_token)
except ImportError:
    pass
