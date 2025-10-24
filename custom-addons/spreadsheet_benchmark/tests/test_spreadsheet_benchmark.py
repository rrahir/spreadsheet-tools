from unittest.mock import patch
import re
import os
import logging
import sys
import configparser
import statistics
import tempfile
import shutil
from pathlib import Path

from odoo.tests import HttpCase
from odoo.tests.common import ChromeBrowser

original_handle_console = ChromeBrowser._handle_console

_logger = logging.getLogger(__name__)



class TestSpreadsheetPerformance(HttpCase):
    """Run odoo-bin with:
    --test-tags=.test_spreadsheet_performance --stop-after-init
    """


    def test_spreadsheet_performance(self):

        scripts_path = str(Path(__file__).parents[3] / "scripts")
        sys.path.insert(0, scripts_path)
        import helpers
        import shared
        import config as config_mod

        # Load config
        config = config_mod.get_config(str(Path.home() / ".spConfig.ini"))

        # o-spreadsheet branches and runs
        branches = ["master-single-element-matrix-lul", "master"]
        runs_per_branch = 30  # adjust as needed
        document_id = 130

        # Build each branch once, save build file in temp dir
        temp_dirs = {}
        build_files = {}
        for branch in branches:
            spreadsheet_path = config["spreadsheet"]["repo_path"]
            helpers.checkout(spreadsheet_path, branch)
            helpers.run_build(config)
            repo, _version, rel_path, lib_file_name, _stylesheet = shared.get_version_info("master")
            repo_path = config[repo]["repo_path"]
            full_path = str(Path(repo_path) / rel_path)
            # Save build file in temp dir (use only filename)
            temp_dir = tempfile.mkdtemp(prefix=f"benchmark_{branch}_")
            build_filename = os.path.basename(lib_file_name)
            # breakpoint()
            helpers.copy_build(config, lib_file_name, temp_dir, stylesheet="NO")
            temp_dirs[branch] = temp_dir
            build_files[branch] = str(Path(temp_dir) / "o_spreadsheet.js")

        # Prepare result storage
        event_timings_by_branch = {branch: [] for branch in branches}

        def parse_event_timings(logs):
            # [[{'type': 'string', 'value': 'click'}, {'type': 'string', 'value': '.o_app[data-menu-xmlid="documents.menu_root"]'}], [{'type': 'string', 'value': "Owl is running in 'dev' mode."}], [{'type': 'string', 'value': '##### Model creation #####'}], [{'type': 'string', 'value': '### Loading data ###'}], [{'type': 'string', 'value': 'Data loaded in'}, {'type': 'number', 'value': 1.5, 'description': '1.5'}, {'type': 'string', 'value': 'ms'}], [{'type': 'string', 'value': '###'}], [{'type': 'string', 'value': 'cells import 3.9000000953674316 ms'}], [{'type': 'string', 'value': 'Replayed'}, {'type': 'number', 'value': 0, 'description': '0'}, {'type': 'string', 'value': 'commands in'}, {'type': 'number', 'value': 0, 'description': '0'}, {'type': 'string', 'value': 'ms'}], [{'type': 'string', 'value': 'evaluate all cells'}, {'type': 'number', 'value': 4.6000001430511475, 'description': '4.6000001430511475'}, {'type': 'string', 'value': 'ms'}], [{'type': 'string', 'value': 'START'}, {'type': 'number', 'value': 9.5, 'description': '9.5'}, {'type': 'string', 'value': 'ms'}], [{'type': 'string', 'value': 'Model created in'}, {'type': 'number', 'value': 25.299999952316284, 'description': '25.299999952316284'}, {'type': 'string', 'value': 'ms'}], [{'type': 'string', 'value': '######'}], [{'type': 'string', 'value': 'evaluate all cells'}, {'type': 'number', 'value': 3.200000047683716, 'description': '3.200000047683716'}, {'type': 'string', 'value': 'ms'}], [{'type': 'string', 'value': 'spreadsheet fully loaded'}]]
            timings = {}
            for log in logs:
                # Build the full log string
                log_str = " ".join(str(entry.get("value", "")) for entry in log)
                # Find all timings
                matches = re.findall(r"([\w .]+) (\d+(?:\.\d+)?) ms", log_str)
                for match in matches:
                    event_name = match[0].strip() or "Global"
                    value = float(match[1])
                    timings[event_name] = value
            print(timings  )
            return timings

        # Main loop: alternate runs between branches, copy prebuilt file to Odoo
        for i in range(runs_per_branch * len(branches)):
            branch = branches[i % len(branches)]
            iteration = (i // len(branches)) + 1
            _logger.warning(f"[Progress] Branch: {branch}, Iteration: {iteration} / {runs_per_branch}")
            repo, version, rel_path, lib_file_name, stylesheet = shared.get_version_info("master")
            repo_path = config[repo]["repo_path"]
            full_path = str(Path(repo_path) / rel_path)
            # Copy prebuilt file to Odoo location
            shutil.copy2(build_files[branch], full_path)

            logs = []
            def intercept_logs(*args, **kwargs):
                log_args = kwargs.get('args', ())
                logs.append(log_args)
                original_handle_console(*args, **kwargs)

            with patch.object(ChromeBrowser, "_handle_console", side_effect=intercept_logs, autospec=True):
                self.browser_js(
                    f"/odoo/documents/spreadsheet/{document_id}?debug=assets",
                    code="",
                    success_signal="spreadsheet fully loaded",
                    login="admin",
                )
            event_timings = parse_event_timings(logs)
            event_timings_by_branch[branch].append(event_timings)

        # Analysis and reporting
        def mean(arr):
            return statistics.mean(arr) if arr else 0
        def stddev(arr):
            return statistics.stdev(arr) if len(arr) > 1 else 0
        def stderr(arr):
            return stddev(arr) / (len(arr) ** 0.5) if len(arr) > 1 else 0

        # Collect all event names
        all_events = set()
        for branch in branches:
            for event_obj in event_timings_by_branch[branch]:
                all_events.update(event_obj.keys())

        print("\nBenchmark Results:")
        for event in all_events:
            best_mean = float("inf")
            best_branch = None
            stats = {}
            for branch in branches:
                arr = [obj.get(event) for obj in event_timings_by_branch[branch] if event in obj]
                arr = [v for v in arr if v is not None]
                if not arr:
                    continue
                m = mean(arr)
                se = stderr(arr)
                stats[branch] = (m, se, len(arr))
                if m < best_mean:
                    best_mean = m
                    best_branch = branch
            if best_mean < 5:
                continue
            print(f"\nEvent: {event}")
            max_branch_len = max(len(branch) for branch in branches)
            for branch in branches:
                if branch not in stats:
                    continue
                m, se, n = stats[branch]
                best_str = "*" if branch == best_branch else ""
                branch_fmt = f"{{:<{max_branch_len}}}".format(branch)
                print(f"  {branch_fmt}  Mean={m:.2f} ms, StdErr={se:.2f} ms, n={n} {best_str}")
