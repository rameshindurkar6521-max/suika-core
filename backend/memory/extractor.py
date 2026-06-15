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
Return ONLY valid JSON.

Schema:

{{"remember":true,"key":"fact","value":"value"}}

or

{{"remember":false}}

Message:

{message}
"""

        try:

            response = await ask_ollama(
                prompt,
                model="qwen3:8b",
                num_predict=16
            )

            print(
                "\nMEMORY RAW RESPONSE:\n",
                response
            )

            cleaned = (
                response
                .replace("```json", "")
                .replace("```", "")
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