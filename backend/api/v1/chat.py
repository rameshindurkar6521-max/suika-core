from fastapi import APIRouter

from chat.schemas import (
    ChatRequest,
    ChatResponse
)

from chat.service import chat_service

router = APIRouter()


@router.post(
    "/chat",
    response_model=ChatResponse
)
async def chat(
    request: ChatRequest
):

    return await chat_service.process_message(
        request
    )
  
