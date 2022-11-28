import contextlib
import os
import re
import subprocess
import time

from typing import List
from const import USER_HOME

# See https://stackoverflow.com/questions/6194499/pushd-through-os-system
# Allows one to execute code in a given dir
@contextlib.contextmanager
def pushd(new_dir):
    previous_dir = os.getcwd()
    os.chdir(new_dir)
    try:
        yield
    finally:
        os.chdir(previous_dir)


def guess_spreadsheet_repo() -> str:
    print("looking for Odoo Spreadsheet repository...")
    try:
        with pushd(USER_HOME):
            cmd = [
                "grep",
                "-r",
                "@odoo/o-spreadsheet",
                "--include",
                "package.json",
            ]
            result = (
                subprocess.check_output(cmd).decode("utf-8").split("\n")[:-1]
            )
            result = [
                os.path.join(USER_HOME, r.split(":")[0].rstrip("/package.json"))
                for r in result
            ]
    except Exception:
        result = []

    repos = {
        str(index + 1): proposition
        for (index, proposition) in enumerate(result)
    }
    repos_guess = "\n".join(["%s: %s" % (i, p) for [i, p] in repos.items()])
    print(f"\nsuggested repo path: \n{repos_guess}")
    answer = input("\nyour repo path: ")
    return repos.get(answer, answer)


def guess_odoo_repo() -> str:
    # TODO support cross platform
    print("looking for Odoo Community repository...")
    try:
        cmd = ["find", USER_HOME, "-type", "f", "-iname", "odoo-bin"]
        result = subprocess.check_output(cmd).decode("utf-8").split("\n")[:-1]
        result = [re.sub("\/odoo-bin$", "", r) for r in result]
    except Exception:
        result = []

    repos = {
        str(index + 1): proposition
        for (index, proposition) in enumerate(result)
    }
    repos_guess = "\n".join(["%s: %s" % (i, p) for [i, p] in repos.items()])
    print(f"\nsuggested repo path: \n{repos_guess}")
    answer = input("\nyour repo path: ")
    return repos.get(answer, answer)


def guess_enterprise_repo() -> str:
    # TODO support cross platform
    print("looking for Odoo Enterprise repository...")
    try:
        cmd = [
            "find",
            USER_HOME,
            "-type",
            "d",
            "-iname",
            "documents_spreadsheet",
        ]
        result = subprocess.check_output(cmd).decode("utf-8").split("\n")[:-1]
        result = [re.sub("\/documents_spreadsheet$", "", r) for r in result]
    except Exception:
        result = []

    repos = {
        str(index + 1): proposition
        for (index, proposition) in enumerate(result)
    }
    repos_guess = "\n".join(["%s: %s" % (i, p) for [i, p] in repos.items()])
    print(f"\nsuggested repo path: \n{repos_guess}")
    answer = input("\nyour repo path: ")
    return repos.get(answer, answer)


def get_remote(exec_path, remote_addr) -> str:
    with pushd(exec_path):
        cmd = ["git", "remote", "-v"]
        remotes = subprocess.check_output(cmd).decode("utf-8").split("\n")

        remote = [remote for remote in remotes if remote_addr in remote][0]
        return remote.split()[0]


def find_file() -> str:
    """cross platform find"""
    return ""


def get_o_spreadsheet_hash(path) -> str:
    # TORORAR make it crossplatform
    lines = (
        subprocess.check_output(["tail", "-10", path])
        .decode("utf-8")
        .split("\n")
    )
    return [line for line in lines if "hash" in line][0][-9:-2]


def retry_cmd(cmd_args: List[str], nbr_retry: int):
    for i in range(nbr_retry):
        try:
            result = subprocess.check_output(cmd_args)
        except subprocess.CalledProcessError as e:
            if i < nbr_retry - 1:
                print(f"call #{i+1} failed. Retrying ...")
                time.sleep(0.5)
                continue
            else:
                raise e
        break
    return result