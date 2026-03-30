import asyncio
import sys
sys.path.append(".")
from agents.visualizer_agent import run_visualizer

async def test():
    print("Visualizer agent test\n")
    print("=" * 50)

    # Test 1: Process concept — should get Mermaid
    concept_process = {
        "id": "collaborative_filtering",
        "title": "Collaborative Filtering",
        "description": "A recommendation method that finds users with similar behavior and recommends what they liked",
        "why_needed": "Core algorithm behind recommendation systems",
        "complexity": 0.7,
        "requires_live_data": False,
    }

    conversation = [
        {"role": "assistant", "content": "okay so collaborative filtering — the core idea is finding users who behave like you"},
        {"role": "user", "content": "how does it actually find similar users?"},
        {"role": "assistant", "content": "it builds a matrix of users vs items, then finds rows that look similar"},
    ]

    print("Test 1 — collaborative filtering (expect Mermaid flowchart)")
    result1 = await run_visualizer(concept_process, conversation)
    print(f"  Should visualize: {result1['should_visualize']}")
    print(f"  Visual type: {result1['visual_type']}")
    print(f"  Subtype: {result1['visual_subtype']}")
    print(f"  Confidence: {result1['confidence']}")
    print(f"  Reason: {result1['reason']}")
    if result1["code"]:
        print(f"  Code preview: {result1['code'][:100]}...")
    print()

    # Test 2: Abstract spatial concept — should get SVG
    concept_spatial = {
        "id": "neural_network_layers",
        "title": "Neural Network Layers",
        "description": "Stacked layers of neurons where each layer transforms the input from the previous layer",
        "why_needed": "Understanding layer structure is fundamental to deep learning",
        "complexity": 0.8,
        "requires_live_data": False,
    }

    print("Test 2 — neural network layers (expect SVG illustration)")
    result2 = await run_visualizer(concept_spatial, conversation)
    print(f"  Should visualize: {result2['should_visualize']}")
    print(f"  Visual type: {result2['visual_type']}")
    print(f"  Confidence: {result2['confidence']}")
    if result2["code"]:
        print(f"  Code preview: {result2['code'][:100]}...")
    print()

    # Test 3: Philosophical concept — should abstain
    concept_opinion = {
        "id": "why_ml_matters",
        "title": "Why Machine Learning Matters",
        "description": "The importance and impact of machine learning in modern technology",
        "why_needed": "Context for the learner",
        "complexity": 0.2,
        "requires_live_data": False,
    }

    print("Test 3 — philosophical concept (expect no visual)")
    result3 = await run_visualizer(concept_opinion, conversation)
    print(f"  Should visualize: {result3['should_visualize']}")
    print(f"  Reason: {result3['reason']}")

asyncio.run(test())