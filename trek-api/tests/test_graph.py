import pytest
from unittest.mock import patch, MagicMock
from graph.graph import _route, _after_teaching


def test_route_discovery():
    assert _route({"phase": "discovery"}) == "discovery"


def test_route_generation():
    assert _route({"phase": "generation"}) == "curriculum"


def test_route_planning():
    assert _route({"phase": "planning"}) == "planner"


def test_route_learning():
    assert _route({"phase": "learning"}) == "teaching"


def test_route_memory_save():
    assert _route({"phase": "memory_save"}) == "memory_save"


def test_after_teaching_mastered():
    assert _after_teaching({"concept_mastered": True}) == "memory_save"


def test_after_teaching_not_mastered():
    assert _after_teaching({"concept_mastered": False}) == "end"
