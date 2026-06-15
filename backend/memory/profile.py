import json


class ProfileStore:

    FILE_PATH = "memory/profile.json"

    def get_profile(self):

        with open(
            self.FILE_PATH,
            "r"
        ) as f:

            return json.load(f)

    def save_fact(
        self,
        key,
        value
    ):

        profile = self.get_profile()

        profile[key] = value

        with open(
            self.FILE_PATH,
            "w"
        ) as f:

            json.dump(
                profile,
                f,
                indent=2
            )