import json

from providers.ollama import ask_ollama
from memory.profile import ProfileStore


profile = ProfileStore()


class MemoryExtractor:

    async def process(
        self,
        message: str
    ):

        prompt = f"""
You are a memory extraction engine.

Determine whether the user's message contains a
long-term personal fact that should be remembered.

Return ONLY valid JSON.

Do not explain.
Do not think aloud.
Do not wrap JSON in markdown.

Examples:

{{
    "remember": true,
    "key": "project",
    "value": "FRIDAY V2"
}}

{{
    "remember": true,
    "key": "career_goal",
    "value": "AI Engineer"
}}

{{
    "remember": false
}}

User Message:

{message}
"""

        try:

            response = await ask_ollama(
                prompt,
                model="qwen3:8b"
            )

            print(
                "\nMEMORY RAW RESPONSE:\n",
                response
            )

            cleaned = (
                response
                .replace(
                    "```json",
                    ""
                )
                .replace(
                    "```",
                    ""
                )
                .strip()
            )

            data = json.loads(
                cleaned
            )

            print(
                "\nMEMORY PARSED:\n",
                data
            )

            if data.get(
                "remember"
            ):

                profile.save_fact(
                    data["key"],
                    data["value"]
                )

                print(
                    f"\nMEMORY SAVED: "
                    f"{data['key']} = {data['value']}"
                )

        except Exception as e:

            print(
                "\nMEMORY ERROR:\n",
                str(e)
            )