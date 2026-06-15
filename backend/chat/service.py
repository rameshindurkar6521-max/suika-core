from providers.router import generate_response

from memory.manager import MemoryManager
from memory.extractor import MemoryExtractor

from core.personality import SYSTEM_PERSONALITY


memory = MemoryManager()
extractor = MemoryExtractor()


class ChatService:

    async def generate_reply(
        self,
        message: str
    ):

        memory.save_conversation(
            "user",
            message
        )

        if len(message.strip()) > 20:

            await extractor.process(
                message
            )

        history = memory.recent_conversation()

        history = history[-3:]

        user_profile = memory.get_profile()

        memory_text = ""

        for item in history:

            memory_text += (
                f"{item['role']}: "
                f"{item['content']}\n"
            )

        prompt = f"""
{SYSTEM_PERSONALITY}

User Profile:

{user_profile}

Conversation History:

{memory_text}

User:
{message}

Suika:
"""

        print(
            f"\nPROMPT SIZE: {len(prompt)} chars\n"
        )

        reply = await generate_response(
            prompt
        )

        memory.save_conversation(
            "assistant",
            reply
        )

        return reply