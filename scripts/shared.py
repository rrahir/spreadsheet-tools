import configparser
import subprocess
from typing import NamedTuple

from utils import pushd

VERBOSE = True


def set_verbose(verbose: bool):
    global VERBOSE
    VERBOSE = verbose


def get_verbose() -> bool:
    global VERBOSE
    return VERBOSE


class VersionInfo(NamedTuple):
    version: str
    lib_file_name: str
    stylesheet: str  # "NO", "SCSS" or "CSS"
    copy_types: bool = False  # copy the types file (o_spreadsheet.d.ts) next to the lib
    repo: str = "odoo"
    rel_path: str = "addons/spreadsheet/static/src/o_spreadsheet/"


# { branch prefix (stable release): VersionInfo }
# TODO: find another way to get the version to ordinate them
spreadsheet_odoo_versions = {
    "17.0": VersionInfo(version="17.0", lib_file_name="o-spreadsheet.iife.js", stylesheet="NO"),
    "18.0": VersionInfo(version="18.0", lib_file_name="o-spreadsheet.esm.js", stylesheet="NO"),
    "19.0": VersionInfo(version="19.0", lib_file_name="o_spreadsheet.esm.js", stylesheet="SCSS"),
    "saas-19.1": VersionInfo(version="saas-19.1", lib_file_name="o_spreadsheet.esm.js", stylesheet="CSS"),
    "saas-19.2": VersionInfo(version="saas-19.2", lib_file_name="o_spreadsheet.esm.js", stylesheet="CSS"),
    "saas-19.3": VersionInfo(version="saas-19.3", lib_file_name="o_spreadsheet.esm.js", stylesheet="CSS"),
    "saas-19.4": VersionInfo(version="saas-19.4", lib_file_name="o_spreadsheet.esm.js", stylesheet="CSS"),
    "20.0": VersionInfo(version="20.0", lib_file_name="o_spreadsheet.esm.js", stylesheet="CSS"),
    "master": VersionInfo(version="master", lib_file_name="o_spreadsheet.esm.js", stylesheet="CSS"),
}

REPOS = ["enterprise", "spreadsheet", "odoo"]


def get_spreadsheet_branch(config: configparser.ConfigParser) -> str:
    # git branch --show-current
    # as of git 2.22
    try:
        with pushd(config["spreadsheet"]["repo_path"]):
            branch = subprocess.check_output(
                ["git", "branch", "--show-current"]
            )
            return branch.decode().strip()
    except Exception as e:
        print(f"Cannot get the branch for repo o-spreadsheet because {e}")
        exit(1)


def get_version_info(branch: str) -> VersionInfo:
    for version in spreadsheet_odoo_versions:
        if branch.startswith(version):
            return spreadsheet_odoo_versions[version]
    print("wrong prefix in o_spreadsheet branch. Please change it")
    exit(1)


# dropped versions
# spreadsheet_odoo_versions = {
    # "14.0": [
    #     "enterprise",
    #     "14.0",
    #     "documents_spreadsheet/static/src/js/o-spreadsheet/",
    # ],
    # "saas-15.2": [
    #     "enterprise",
    #     "saas-15.2",
    #     "documents_spreadsheet_bundle/static/src/o_spreadsheet/",
    # ],
    # "16.0": ["odoo", "16.0", "addons/spreadsheet/static/src/o_spreadsheet/", "o_spreadsheet.js", "NO"],
    # "saas-16.1": ["odoo", "saas-16.1", "addons/spreadsheet/static/src/o_spreadsheet/"],
    # "saas-16.2": ["odoo", "saas-16.2", "addons/spreadsheet/static/src/o_spreadsheet/"],
    #     "15.0": [
    #     "enterprise",
    #     "15.0",
    #     "documents_spreadsheet/static/src/js/o_spreadsheet/",
    #     "o_spreadsheet.js",
    # ],
    # "saas-17.2": ["odoo", "saas-17.2", "addons/spreadsheet/static/src/o_spreadsheet/", "o_spreadsheet.js", False],
    # "saas-17.4": ["odoo", "saas-17.4", "addons/spreadsheet/static/src/o_spreadsheet/", "o_spreadsheet.js", False],
    # "saas-18.1": ["odoo", "saas-18.1", "addons/spreadsheet/static/src/o_spreadsheet/", "o_spreadsheet.esm.js", False],
# }
