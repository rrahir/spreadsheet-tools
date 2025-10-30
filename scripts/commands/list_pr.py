import configparser
from helpers import get_odoo_prs, print_msg


def list_pr(config: configparser.ConfigParser):
    PRs = get_odoo_prs(config)
    if PRs:
        print_msg("\nPending Odoo Community/Enterprise PRs:")
        print_msg(
            "\n".join(
                [f"\t{version} - <{url}>" for [version, url] in PRs.items()]
            ))
    else:
        print_msg("\nThere are no open pull requests...", "WARNING")
