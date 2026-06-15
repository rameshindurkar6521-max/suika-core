from memory.store import MemoryStore
from memory.profile import ProfileStore


class MemoryManager:

    def __init__(self):

        self.memory = MemoryStore()
        self.profile = ProfileStore()

    def save_conversation(
        self,
        role,
        content
    ):

        self.memory.save(
            role,
            content
        )

    def recent_conversation(self):

        return self.memory.recent()

    def save_fact(
        self,
        key,
        value
    ):

        self.profile.save_fact(
            key,
            value
        )

    def get_profile(self):

        return self.profile.get_profile()