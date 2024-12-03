import configparser
from helpers import print_msg, make_PR, get_spreadsheet_branch, get_version_info


def create_pr(config: configparser.ConfigParser):
    
    print_msg("Creating a PR in odoo/o-spreadsheet...")
    spreadsheet_path = config["spreadsheet"]["repo_path"]
    spreadsheet_branch = get_spreadsheet_branch(config)
    [_, version, _, _] = get_version_info(spreadsheet_branch)
    
    make_PR(spreadsheet_path,  version, {"stop": False, "auto": False})

