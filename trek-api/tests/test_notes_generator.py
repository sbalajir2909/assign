from agents.notes_generator import _extract_analogy_candidates, _normalize_key_points


def test_extract_analogy_candidates_finds_analogy_sentences():
    text = "A variable is like a labeled box for a value. It stores data. Think of scope as a room with boundaries."
    candidates = _extract_analogy_candidates(text)
    assert candidates == [
        "A variable is like a labeled box for a value.",
        "Think of scope as a room with boundaries.",
    ]


def test_normalize_key_points_coerces_strings_and_objects():
    items = [
        {"point": "Variables store values.", "example": "x = 3"},
        "Functions bundle behavior.",
    ]
    assert _normalize_key_points(items) == [
        {"point": "Variables store values.", "example": "x = 3"},
        {"point": "Functions bundle behavior.", "example": ""},
    ]
