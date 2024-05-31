#!/usr/bin/env python3

# packages
import os
import sys
import pprint
import webbrowser

from docopt import docopt

from commands import list_pr, update, push, release, build
from shared import set_verbose, spreadsheet_odoo_versions
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
        sp_tool release [-s] [-t | -e] [TARGET...]
        sp_tool update [-s] [-t | -e] [TARGET...]
        sp_tool build [-s]
        sp_tool push [-l -f -s]
        sp_tool list-pr
        sp_tool process
        sp_tool -h | --help | --version

    Options:
        -h --help   Show this screen
        --version   Show version
        -l          commit locally (don't push on remote)
        -s          silent mode
        -t          include branches
        -e          exclude branches

    """
    arguments = docopt(main.__doc__, version="0.1.1", options_first=False)
    # LOADER
    config = loader()["config"]
    # pre-process
    if arguments["-t"] and arguments["-e"]:
        sys.exit("Arguments -t and -e are mutually exclusive. Make a choice ;-)")

    if not len(arguments["TARGET"]) and (arguments["-e"] or arguments["-t"]):
        sys.exit("Please provide target versions")

    target_argument = [t.lower() for t in arguments["TARGET"]]
    if any(target not in spreadsheet_odoo_versions for target in target_argument):
        sys.exit("Some specified targets do not exist (anymore?)\n")

    if arguments["-e"]:
        targetted_versions = [v for v in spreadsheet_odoo_versions.keys() if v not in target_argument]
    elif len(target_argument):
        targetted_versions = [v for v in spreadsheet_odoo_versions.keys() if v in target_argument]
    else:
        targetted_versions = list(spreadsheet_odoo_versions.keys())

    if arguments["-s"]:
        set_verbose(False)

    # command handling
    if arguments["--version"]:
        print(f"Version {arguments['version']}")
        exit(0)

    if arguments["list-pr"]:
        list_pr(config)
        exit(0)

    if arguments["update"]:
        update(config, targetted_versions)
        exit(0)

    if arguments["push"]:
        push(
            config,
            arguments["-l"],
            arguments["-f"]
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
        release(config, targetted_versions)
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
