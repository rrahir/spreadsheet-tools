import os
import sys
import configparser
import subprocess
from const import CONFIG_FILE_PATH
from utils import (
    guess_enterprise_repo,
    guess_spreadsheet_repo,
    guess_odoo_repo,
    get_remote,
)
from shutil import which

CONFIG_KEYS = ["enterprise", "spreadsheet", "odoo"]


def get_config(path: str) -> configparser.ConfigParser:
    path = path or CONFIG_FILE_PATH
    if os.path.isfile(path):
        config = configparser.ConfigParser()
        config.read(path)

        if not all([key in config for key in CONFIG_KEYS]):
            raise Exception(
                f"Your config file is corrupted. Please fix it or delete it.\nPath: {path}"
            )
        return config
    elif path == CONFIG_FILE_PATH:
        return create_config()
    else:
        sys.exit(f"Config file not found at path: {path}")


def check_gh():
    if which("gh") is None:
        raise Exception(
            "Please configure github cli: https://github.com/cli/cli/blob/trunk/docs/install_linux.md"
        )
    try:
        subprocess.check_output(["gh", "auth", "status"])
    except Exception as e:
        raise Exception("Please login on github cli: run `gh auth login`")


def create_config() -> configparser.ConfigParser:
    config = configparser.ConfigParser()
    print("\n*** Configuring spreadsheet repository ***")
    print("------------------------------------------")
    spreadhseet_repo_path = guess_spreadsheet_repo()
    config["spreadsheet"] = {
        "repo_path": spreadhseet_repo_path,
        "remote": get_remote(spreadhseet_repo_path, "odoo/o-spreadsheet"),
    }

    print("\n*** Configuring odoo repository ***")
    print("-----------------------------------------")
    odoo_repo_path = guess_odoo_repo()
    config["odoo"] = {
        "repo_path": odoo_repo_path,
        "remote-dev": get_remote(odoo_repo_path, "odoo-dev/odoo"),
        "remote": get_remote(odoo_repo_path, "odoo/odoo"),
    }

    print("\n*** Configuring enterprise repository ***")
    print("-----------------------------------------")
    ent_repo_path = guess_enterprise_repo()
    config["enterprise"] = {
        "repo_path": ent_repo_path,
        "remote-dev": get_remote(ent_repo_path, "odoo-dev/enterprise"),
        "remote": get_remote(ent_repo_path, "odoo/enterprise"),
    }

    with open(CONFIG_FILE_PATH, "w") as configfile:  # save
        config.write(configfile)
    print("Congratulations, you are now set up!\n\n")
    return config
