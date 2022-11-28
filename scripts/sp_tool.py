#!/usr/bin/python3

# packages
import os
import sys
import pprint

from docopt import docopt

from commands import list_pr, update, push
from shared import set_verbose

pp = pprint.PrettyPrinter(depth=30)


def main():
    """
    Usage:
        sp_tool update [-s]
        sp_tool push [-l] [-s]
        sp_tool list-pr
        sp_tool process
        sp_tool (-h | --help | --version )
    Options:
        -l      commit locally (don't push on remote)
        -s      silent mode (not yet implemented)

    """
    arguments = docopt(main.__doc__, version="0.0.1@alpha")

    # LOADER
    from versions import versions
    from config import config

    if arguments["-s"]:
        set_verbose(False)

    if arguments["list-pr"]:
        list_pr(config)
        exit(0)

    if arguments["update"]:
        update(config)
        exit(0)

    if arguments["push"]:
        spreadsheet_path = config["spreadsheet"]["repo_path"]
        if not os.getcwd().startswith(spreadsheet_path):
            sys.exit(
                f"This command should be run from spreadsheet repository {spreadsheet_path}"
            )
        push(
            config,
            arguments["-l"],
        )
        exit(0)

    if arguments["process"]:
        # redirect user to doc in a .md
        print(
            "PLease consult https://github.com/odoo/o-spreadsheet/14.0/tree/doc/workflow.md"
        )
        exit(0)


if __name__ == "__main__":

    if os.getuid() == 0:
        sys.exit(
            """
===========================================================

 [bad habit] sp_tool cannot be run as root (ノಠ益ಠ)ノ彡┻━┻

===========================================================
"""
        )

    main()
