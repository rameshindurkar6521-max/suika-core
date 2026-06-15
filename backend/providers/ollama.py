import ollama


async def ask_ollama(
    prompt: str,
    model: str = "qwen3:8b"
):

    print(f"\nOLLAMA CALLING MODEL: {model}\n")

    response = ollama.chat(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are Suika. "
                    "Respond directly. "
                    "Do not reveal reasoning. "
                    "Do not expose chain of thought."
                )
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        options={
            "num_predict": 512
        }
    )

    print("\nOLLAMA RESPONSE RECEIVED\n")

    return response["message"]["content"]