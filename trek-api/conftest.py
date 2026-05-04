import sys
import os

# Make trek-api/ importable as a package root (e.g. "from graph.b2c_state import ...")
sys.path.insert(0, os.path.dirname(__file__))

# The integration test scripts in tests/ call asyncio.run() at module level and
# hit live APIs (Groq, Tavily).  Exclude them from unit-test collection so that
# `pytest` can run without API keys and without making external calls.
collect_ignore = [
    "tests/test_curriculum.py",
    "tests/test_discovery.py",
]
