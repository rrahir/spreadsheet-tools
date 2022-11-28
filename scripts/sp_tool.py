#!/usr/bin/python3

# packages
import os
import sys
import pprint
import webbrowser

from docopt import docopt

from commands import list_pr, update, push, release, build
from shared import set_verbose
from versions import check_versions
from config import get_config

pp = pprint.PrettyPrinter(depth=30)


def loader() -> dict:
    check_versions()
    return {"config": get_config()}


def main():
    """
    Spreadsheet tools
    =================

    Usage:
        sp_tool update [-s]
        sp_tool push [-l | -s]
        sp_tool list-pr
        sp_tool build
        sp_tool release
        sp_tool process
        sp_tool (-h | --help | --version )

    Options:
        -h --help   Show this screen
        --version   Show version
        -l          commit locally (don't push on remote)
        -s          silent mode

    """
    arguments = docopt(main.__doc__, version="0.1.0")

    # LOADER
    config = loader()["config"]
    if arguments["--version"]:
        print(f"Version {arguments['version']}")
        exit(0)

    if arguments["-s"]:
        set_verbose(False)

    if arguments["list-pr"]:
        list_pr(config)
        exit(0)

    if arguments["update"]:
        update(config)
        exit(0)

    if arguments["push"]:
        push(
            config,
            arguments["-l"],
        )
        exit(0)

    if arguments["process"]:
        # redirect user to doc in a .md
        webbrowser.open(
            "https://github.com/rrahir/spreadsheet-tools/blob/master/doc/workflow.md",
            new=2,
        )
        exit(0)

    if arguments["release"]:
        release(config)
        exit(0)

    if arguments["build"]:
        build(config)
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
