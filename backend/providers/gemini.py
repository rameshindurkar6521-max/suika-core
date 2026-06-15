import os

from dotenv import load_dotenv
import google.generativeai as genai


load_dotenv()

genai.configure(
    api_key=os.getenv(
        "GEMINI_API_KEY"
    )
)

model = genai.GenerativeModel(
    "gemini-2.5-flash"
)


async def ask_gemini(
    prompt: str
):

    try:

        response = model.generate_content(
            prompt
        )

        return response.text

    except Exception as e:

        print(
            "\nGEMINI ERROR:\n",
            str(e)
        )

        return (
            "Suika is temporarily unavailable because "
            "the Gemini API quota has been exhausted."
        )