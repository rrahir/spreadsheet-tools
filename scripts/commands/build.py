# Will build o_spreasheet, checkout thecorresponding odoo local branch and copy the build
# No commit
# no new branch
import os
import configparser

from helpers import run_build, copy_build
from shared import get_spreadsheet_branch, get_version_info
from utils import pushd


def build(config: configparser.ConfigParser):
    spreadsheet_path = config["spreadsheet"]["repo_path"]
    spreadsheet_branch = get_spreadsheet_branch(config)
    [repo, _, rel_path, lib_file_name] = get_version_info(spreadsheet_branch)
    with pushd(spreadsheet_path):
        repo_path = config[repo]["repo_path"]
        full_path = os.path.join(repo_path, rel_path)
        run_build(config)
        copy_build(config, lib_file_name, full_path)
