import json


class ProfileStore:

    def get_profile(self):

        with open(
            "memory/profile.json",
            "r"
        ) as f:

            return json.load(f)