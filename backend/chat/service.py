from chat.schemas import ChatRequest, ChatResponse


class ChatService:

    async def process_message(
        self,
        request: ChatRequest
    ) -> ChatResponse:

        user_message = request.message

        return ChatResponse(
            response=f"Hello Siddhu. You said: {user_message}",
            conversation_id=request.conversation_id
        )


chat_service = ChatService()
