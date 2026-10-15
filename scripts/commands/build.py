# Will build o_spreasheet, checkout the corresponding odoo local branch and copy the build
# No commit
# no new branch
import os
import configparser

from helpers import run_build, copy_build, check_remote_alignment
from shared import get_spreadsheet_branch, get_version_info
from utils import pushd


def build(config: configparser.ConfigParser):
    check_remote_alignment()
    spreadsheet_path = config["spreadsheet"]["repo_path"]
    spreadsheet_branch = get_spreadsheet_branch(config)
    version_info = get_version_info(spreadsheet_branch)
    with pushd(spreadsheet_path):
        repo_path = config[version_info.repo]["repo_path"]
        full_path = os.path.join(repo_path, version_info.rel_path)
        run_build(config)
        copy_build(config, version_info.lib_file_name, full_path, version_info.stylesheet, version_info.copy_types)
