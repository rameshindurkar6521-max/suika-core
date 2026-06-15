from providers.gemini import ask_gemini


async def ask_model(
    prompt: str,
    provider: str = "gemini"
):

    if provider == "gemini":

        return await ask_gemini(
            prompt
        )

    raise Exception(
        f"Unknown provider: {provider}"
    )