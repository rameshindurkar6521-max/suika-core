import json
import os


class MemoryStore:

    FILE_PATH = "memory/memories.json"

    def __init__(self):

        if not os.path.exists(self.FILE_PATH):

            with open(self.FILE_PATH, "w") as f:

                json.dump(
                    {"messages": []},
                    f
                )

    def save(
        self,
        role,
        content
    ):

        data = self._load()

        data["messages"].append(
            {
                "role": role,
                "content": content
            }
        )

        self._save(data)

    def recent(
        self,
        limit=10
    ):

        data = self._load()

        return data["messages"][-limit:]

    def _load(self):

        with open(
            self.FILE_PATH,
            "r"
        ) as f:

            return json.load(f)

    def _save(
        self,
        data
    ):

        with open(
            self.FILE_PATH,
            "w"
        ) as f:

            json.dump(
                data,
                f,
                indent=2
            )