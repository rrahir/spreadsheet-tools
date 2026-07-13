"""
Build a git commit on GitHub directly via the `gh` CLI — no clone, no checkout.

This drives GitHub's Git Data API (blob -> tree -> commit -> ref) server-side
using `gh api`, so nothing is created locally except the file content that gets
uploaded. The `base_tree` overlay means only the changed paths are sent;
everything else is inherited from the base commit's tree.

Requires the `gh` CLI, authenticated (`gh auth login`) with `contents:write`
scope on the target repo.
"""

import base64
import json
import subprocess


def gh_api(endpoint, method="GET", fields=None, jq=None):
    """Call `gh api`. `fields` are passed as -f key=value string fields."""
    cmd = ["gh", "api", "-X", method, endpoint]
    for k, v in (fields or {}).items():
        cmd += ["-f", f"{k}={v}"]
    if jq:
        cmd += ["--jq", jq]
    out = subprocess.run(cmd, capture_output=True, check=True).stdout.decode().strip()
    return out


def _post_json(endpoint, payload, method="POST", jq=None):
    """POST/PATCH a JSON body via `gh api --input -` (clean for nested data)."""
    cmd = ["gh", "api", "-X", method, endpoint, "--input", "-"]
    if jq:
        cmd += ["--jq", jq]
    out = subprocess.run(
        cmd, input=json.dumps(payload).encode(),
        capture_output=True, check=True,
    ).stdout.decode().strip()
    return out


def create_commit_on_github(owner, repo, branch, base, files, message,
                            create_ref=True):
    """
    Build a commit on top of `base` with `files` overlaid, entirely via the
    GitHub API. No local clone or checkout is performed.

    owner, repo : target repository.
    branch      : ref to create/update (e.g. "some-branch").
    base        : branch, tag, or commit SHA to build on top of (e.g. "main").
    files       : dict of {repo-relative path: bytes}. Use a value of None to
                  delete that path.
    message     : commit message.
    create_ref  : True -> create refs/heads/<branch>; False -> move an existing
                  branch (force update).

    Returns the new commit SHA.
    """
    slug = f"repos/{owner}/{repo}"

    # 0. Resolve the base commit SHA and its tree SHA.
    base_commit = gh_api(f"{slug}/commits/{base}", jq=".sha")
    base_tree = gh_api(f"{slug}/git/commits/{base_commit}", jq=".tree.sha")

    # 1. Create a blob per file, then assemble tree entries.
    tree_entries = []
    for path, content in files.items():
        if content is None:  # deletion
            tree_entries.append({"path": path, "mode": "100644",
                                 "type": "blob", "sha": None})
            continue
        blob_sha = gh_api(
            f"{slug}/git/blobs", method="POST",
            fields={"encoding": "base64",
                    "content": base64.b64encode(content).decode()},
            jq=".sha",
        )
        tree_entries.append({"path": path, "mode": "100644",
                             "type": "blob", "sha": blob_sha})

    # 2. Create a new tree overlaying the entries onto the base tree.
    new_tree = _post_json(
        f"{slug}/git/trees",
        {"base_tree": base_tree, "tree": tree_entries},
        jq=".sha",
    )

    # 3. Create the commit object on top of the base commit.
    new_commit = _post_json(
        f"{slug}/git/commits",
        {"message": message, "tree": new_tree, "parents": [base_commit]},
        jq=".sha",
    )

    # 4. Point a ref at the new commit.
    if create_ref:
        _post_json(f"{slug}/git/refs",
                   {"ref": f"refs/heads/{branch}", "sha": new_commit})
    else:
        _post_json(f"{slug}/git/refs/heads/{branch}",
                   {"sha": new_commit, "force": True}, method="PATCH")

    return new_commit


if __name__ == "__main__":
    sha = create_commit_on_github(
        owner="your-org", repo="your-repo",
        branch="some-branch", base="main",
        files={
            "relative/path/to/file1": b"new contents\n",
            "relative/path/to/file2": b"more contents\n",
        },
        message="commit built via gh api",
    )
    print("new commit:", sha)
