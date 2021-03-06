import configparser
import subprocess

from utils import pushd

# { branch prefix (stable release): [version, filepath in enterprise]}
spreadsheet_odoo_versions = {
    "14.0": ["14.0", "documents_spreadsheet/static/src/js/o-spreadsheet/"],
    "15.0": ["15.0", "documents_spreadsheet/static/src/js/o_spreadsheet/"],
    "saas-15.2": ["saas-15.2", "documents_spreadsheet_bundle/static/src/o_spreadsheet/"],
    "saas-15.3": ["saas-15.3", "documents_spreadsheet_bundle/static/src/o_spreadsheet/"],
    "saas-15.4": ["saas-15.4", "documents_spreadsheet/static/src/bundle/o_spreadsheet/"],
    "master": ["master", "spreadsheet/static/src/o_spreadsheet/"]
}

def get_spreadsheet_branch(config:configparser.ConfigParser) -> str:
    # git branch --show-current
    # as of git 2.22
    try:
        with pushd(config["spreadsheet"]["repo_path"]):
            branch = subprocess.check_output(
                ['git', 'branch', '--show-current'])
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
