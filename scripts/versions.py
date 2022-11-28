import subprocess
import re


def check_git_version():
    cmd = [
        "git",
        "--version",
    ]
    git_version_string = subprocess.check_output(cmd).decode("utf-8")
    git_version = re.findall("(\d+\.\d+(?:\.\d+)?)", git_version_string)[0]
    [major, minor, _] = git_version.split(".")

    if (int(major) * 10000 + int(minor)) < 20022:
        raise Exception(
            "This script runs on git version >= 2.22. Please update your git intall."
        )


def check_versions():
    check_git_version()


versions = check_versions()
