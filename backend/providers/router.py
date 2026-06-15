from providers.ollama import ask_ollama


async def generate_response(
    prompt: str
):

    print("\nROUTER: FORCED qwen3:8b\n")

    return await ask_ollama(
        prompt,
        model="qwen3:8b"
    )