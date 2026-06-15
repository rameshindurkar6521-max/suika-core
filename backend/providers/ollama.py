import ollama


async def ask_ollama(
    prompt: str,
    model: str = "qwen3:8b"
):

    response = ollama.chat(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are Suika, a helpful AI assistant. "
                    "Respond directly and do not expose your reasoning."
                )
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    return response["message"]["content"]