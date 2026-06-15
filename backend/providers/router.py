from providers.ollama import ask_ollama


async def generate_response(
    prompt: str
):

    return await ask_ollama(
        prompt=prompt,
        model="qwen3:8b"
    )