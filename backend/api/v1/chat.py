from fastapi import APIRouter
from models.chat import ChatRequest, ChatResponse
from chat.service import ChatService

router = APIRouter()

service = ChatService()


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):

    reply = await service.generate_reply(
        request.message
    )

    return ChatResponse(
        reply=reply
    )