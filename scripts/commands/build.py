# Will build o_spreasheet, checkout the corresponding odoo local branch and copy the build
# No commit
# no new branch
import configparser
import os

from helpers import check_remote_alignment, copy_build, run_build
from shared import get_spreadsheet_branch, get_version_info
from utils import pushd

from .check_odoo_sync import warn_odoo_sync


def build(config: configparser.ConfigParser):
    check_remote_alignment()
    warn_odoo_sync(config)
    spreadsheet_path = config["spreadsheet"]["repo_path"]
    spreadsheet_branch = get_spreadsheet_branch(config)
    version_info = get_version_info(spreadsheet_branch)
    with pushd(spreadsheet_path):
        repo_path = config[version_info.repo]["repo_path"]
        full_path = os.path.join(repo_path, version_info.rel_path)
        run_build(config)
        copy_build(config, version_info.lib_file_name, full_path, version_info.stylesheet, version_info.copy_types)
