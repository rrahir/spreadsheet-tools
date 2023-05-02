import subprocess
import re
import sys
import platform


def check_git_version():
    cmd = [
        "git",
        "--version",
    ]
    git_version_string = subprocess.check_output(cmd).decode("utf-8")
    git_version = re.findall("(\d+\.\d+(?:\.\d+)?)", git_version_string)[0]
    [major, minor, _] = git_version.split(".")

    if (int(major) * 10000 + int(minor)) < 20022:
        sys.exit(
            "This script runs on git version >= 2.22."
            "Please update your git install and/or consult https://github.com/rrahir/spreadsheet-tools#readme"
        )


def check_platform():
    # tODORAR to test on windaube instances
    # make it windows friendly and then remove this check
    if platform.system() not in ["Darwin", "Linux"]:
        sys.exit(
            "This script currently only works on unix-bases OS."
            "Please run the script in WSL.and/or consult https://github.com/rrahir/spreadsheet-tools#readme"
        )


def check_python_version():
    py_version = sys.version_info
    if py_version.major == 3 and py_version.minor < 7 or py_version.major < 3:
        sys.exit(
            "This script requires python 3.7+."
            "Please consult https://github.com/rrahir/spreadsheet-tools#readme"
        )


def check_versions():
    check_platform()
    check_git_version()
    check_python_version()


versions = check_versions()
