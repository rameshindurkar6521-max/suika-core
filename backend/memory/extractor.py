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

{{"remember":true,"key":"fact_name","value":"fact_value"}}

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

            if not data.get(
                "remember"
            ):
                return

            key = data.get(
                "key",
                ""
            ).strip()

            value = str(
                data.get(
                    "value",
                    ""
                )
            ).strip()

            if (
                not key
                or not value
                or key.lower() == "fact"
                or value.lower() == "string"
            ):
                print(
                    "\nMEMORY REJECTED: INVALID DATA\n"
                )
                return

            profile.save_fact(
                key,
                value
            )

            print(
                f"\nMEMORY SAVED: "
                f"{key} = {value}"
            )

        except Exception as e:

            print(
                "\nMEMORY ERROR:\n",
                str(e)
            )