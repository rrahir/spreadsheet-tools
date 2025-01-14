import configparser
import subprocess

from utils import pushd

VERBOSE = True


def set_verbose(verbose: bool):
    global VERBOSE
    VERBOSE = verbose


def get_verbose() -> bool:
    global VERBOSE
    return VERBOSE


# { branch prefix (stable release): [version, filepath in enterprise]}
# TODO: find another way to get the version to ordinate them
spreadsheet_odoo_versions = {
    "16.0": ["odoo", "16.0", "addons/spreadsheet/static/src/o_spreadsheet/", "o_spreadsheet.js"],
    "17.0": ["odoo", "17.0", "addons/spreadsheet/static/src/o_spreadsheet/", "o_spreadsheet.js"],
    "saas-17.2": ["odoo", "saas-17.2", "addons/spreadsheet/static/src/o_spreadsheet/", "o_spreadsheet.js"],
    "saas-17.4": ["odoo", "saas-17.4", "addons/spreadsheet/static/src/o_spreadsheet/", "o_spreadsheet.js"],
    "18.0": ["odoo", "18.0", "addons/spreadsheet/static/src/o_spreadsheet/", "o_spreadsheet.js"],
    "saas-18.1": ["odoo", "saas-18.1", "addons/spreadsheet/static/src/o_spreadsheet/", "o_spreadsheet.js"],
    "master": ["odoo", "master", "addons/spreadsheet/static/src/o_spreadsheet/", "o_spreadsheet.esm.js"],
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


def get_version_info(branch: str) -> "tuple[str, str]":
    for version in spreadsheet_odoo_versions:
        if branch.startswith(version):
            return spreadsheet_odoo_versions[version]
    print("wrong prefix in o_spreadsheet branch. Please change it")
    exit(1)




## dropped versions
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
    # "saas-16.1": ["odoo", "saas-16.1", "addons/spreadsheet/static/src/o_spreadsheet/"],
    # "saas-16.2": ["odoo", "saas-16.2", "addons/spreadsheet/static/src/o_spreadsheet/"],
    #     "15.0": [
    #     "enterprise",
    #     "15.0",
    #     "documents_spreadsheet/static/src/js/o_spreadsheet/",
    #     "o_spreadsheet.js",
    # ],
# }