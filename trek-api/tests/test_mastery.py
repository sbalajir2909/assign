import asyncio
import sys
sys.path.append(".")
from agents.mastery_validator_agent import validate_mastery

async def test():
    print("Mastery validator test\n")
    print("=" * 50)

    concept = {
        "id": "collaborative_filtering",
        "title": "Collaborative Filtering",
        "description": "A method of making recommendations based on user behavior patterns",
        "complexity": 0.7,
    }

    conversation = [
        {"role": "assistant", "content": "okay so collaborative filtering — what do you think it means?"},
        {"role": "user", "content": "it's like when netflix recommends stuff?"},
        {"role": "assistant", "content": "right direction. but how does it actually decide what to recommend?"},
    ]

    # Test 1: Weak explanation
    print("Test 1 — weak explanation (attempt 1)")
    result = await validate_mastery(
        concept=concept,
        conversation=conversation,
        learner_explanation="it looks at what you watched and recommends similar things",
        attempt_number=1,
    )
    print(f"  Verdict: {result['verdict']}")
    print(f"  Score: {result['score']}")
    print(f"  Gap: {result['gap']}\n")

    # Test 2: Strong explanation
    print("Test 2 — strong explanation (attempt 1)")
    result2 = await validate_mastery(
        concept=concept,
        conversation=conversation,
        learner_explanation="""collaborative filtering works by finding users who have similar 
        behavior patterns to you — like if we both rated the same 10 movies similarly, 
        the system assumes we have similar taste and recommends things I liked that you haven't seen yet. 
        it doesn't need to know anything about the content itself, just the patterns in user behavior. 
        the limitation is it struggles with new users who have no history — that's the cold start problem.""",
        attempt_number=1,
    )
    print(f"  Verdict: {result2['verdict']}")
    print(f"  Score: {result2['score']}")
    print(f"  Gap: {result2['gap']}\n")

    # Test 3: Force advance on attempt 3
    print("Test 3 — force advance (attempt 3)")
    result3 = await validate_mastery(
        concept=concept,
        conversation=conversation,
        learner_explanation="i still don't really get it",
        attempt_number=3,
    )
    print(f"  Verdict: {result3['verdict']}")
    print(f"  Forced advance: {result3['forced_advance']}")
    print(f"  Flag for recall: {result3['flag_for_recall']}")

asyncio.run(test())