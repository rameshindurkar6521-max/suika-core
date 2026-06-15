import time
import ollama


async def ask_ollama(
    prompt: str,
    model: str = "qwen3:8b",
    num_predict: int = 64
):

    print(
        f"\nOLLAMA CALLING MODEL: {model}\n"
    )

    start = time.time()

    response = ollama.chat(
        model=model,
        think=False,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are Suika.\n"
                    "Answer directly.\n"
                    "Never reveal reasoning.\n"
                    "Keep answers concise."
                )
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        options={
            "num_predict": num_predict,
            "temperature": 0.7
        }
    )

    duration = time.time() - start

    print(
        f"\nMODEL={model} TIME={duration:.2f}s\n"
    )

    print(
        "\nOLLAMA RESPONSE RECEIVED\n"
    )

    return response["message"]["content"]