# Commit files to any GitHub repo via the API (blob -> tree -> commit -> ref),
# without a local clone or checkout. Thin CLI wrapper around create_commit_on_github.
import os
import sys

from github_commit import create_commit_on_github
from config import check_gh
from shared import get_verbose


def _parse_file_arg(arg: str) -> tuple[str, str]:
    """
    Parse a "local_path[:repo_path]" argument.

    Returns (repo_path, local_path). When no repo_path is given, the file is
    committed at the same relative path it has locally.
    """
    local_path, sep, repo_path = arg.partition(":")
    if not sep:
        repo_path = local_path
    return repo_path, local_path


def fast_update(repo, branch, base, message, file_args, update_existing=False):
    """
    repo            : "owner/repo".
    branch          : ref to create (or move with update_existing).
    base            : branch/tag/commit SHA to build on top of.
    message         : commit message.
    file_args       : list of "local_path[:repo_path]" strings.
    update_existing : False -> create a new branch; True -> move an existing one.
    """
    check_gh()

    if "/" not in repo:
        sys.exit(f'Expected repo as "owner/repo", got: {repo}')
    owner, _, name = repo.partition("/")

    files = {}
    for arg in file_args:
        repo_path, local_path = _parse_file_arg(arg)
        if not os.path.isfile(local_path):
            sys.exit(f"File not found: {local_path}")
        with open(local_path, "rb") as f:
            files[repo_path] = f.read()

    get_verbose() and print(f"Committing {len(files)} file(s) to {repo}@{base} -> {branch}")
    sha = create_commit_on_github(
        owner=owner,
        repo=name,
        branch=branch,
        base=base,
        files=files,
        message=message,
        create_ref=not update_existing,
    )
    print(f"Created commit {sha[:10]} on {repo}:{branch}")
    return sha


# TODO: we need the pre processing of update just have the commit message & we can find the files from the github release!

# 1. Build → write the artifact anywhere on disk (repo, a scratch dir, wherever).
# 2. sp_tool fast_update owner/repo branch base "message" path/to/built.js:repo/relative/path.js
