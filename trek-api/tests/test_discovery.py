import asyncio
import sys
from agents.discovery_agent import run_discovery

async def test():
    print("Discovery agent test — simulating a conversation\n")
    print("=" * 50)

    conversation = []

    # Simulate 6 turns of conversation
    test_inputs = [
        "I want to learn machine learning",
        "I want to be able to build a recommendation system and deploy it",
        "I've used Python for about a year, done some data analysis with pandas",
        "I know what a function is and I've used loops and lists",
        "I have about 3 weeks, maybe 2 hours a day",
        "I need it for a project at work, my team wants to add recommendations to our app",
    ]

    for user_input in test_inputs:
        conversation.append({"role": "user", "content": user_input})

        result = await run_discovery(conversation)

        print(f"User: {user_input}")
        print(f"Assign: {result['reply']}\n")

        conversation.append({"role": "assistant", "content": result["reply"]})

        if result["discovery_complete"]:
            print("=" * 50)
            print("DISCOVERY COMPLETE")
            print(f"Learner profile: {result['learner_profile']}")
            break

asyncio.run(test())