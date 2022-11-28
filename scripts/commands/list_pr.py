import configparser
from helpers import get_existing_prs


def list_pr(config: configparser.ConfigParser):
    PRs = get_existing_prs(config)
    if PRs:
        print("\nPending Enterprise PRs:")
        print(
            "\n".join(
                [f"\t{version} - {url}" for [version, url] in PRs.items()]
            )
        )
    else:
        print("\nThere are no open pull requests...")
