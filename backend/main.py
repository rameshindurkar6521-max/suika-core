from fastapi import FastAPI

from api.v1.chat import router as chat_router

app = FastAPI(
    title="Suika Core",
    version="0.1.0"
)

app.include_router(
    chat_router,
    prefix="/api/v1"
)


@app.get("/")
async def root():

    return {
        "name": "Suika",
        "status": "online"
    }
