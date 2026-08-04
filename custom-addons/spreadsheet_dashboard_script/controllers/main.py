import io
import os
import zipfile

from odoo import http
from odoo.http import request
from odoo.http.stream import content_disposition
from odoo.tools.misc import file_open


class SpreadsheetDashboardScriptController(http.Controller):
    @http.route('/spreadsheet_dashboard_script/download_all', type='http', auth='user')
    def download_all_dashboards(self, **kwargs):
        """Download every dashboard data file (in the addons-path) as a single
        zip, flat (basenames only), so the archive can be extracted into one
        folder and processed by scripts.
        """
        dashboards = request.env['spreadsheet.dashboard'].get_dashboards()
        buffer = io.BytesIO()
        used_names = set()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
            for dashboard in dashboards:
                path = dashboard['data']['path']
                name = os.path.basename(path)
                # Avoid collisions between identically-named files of different
                # modules by suffixing duplicates.
                base, ext = os.path.splitext(name)
                counter = 1
                while name in used_names:
                    name = f"{base} ({counter}){ext}"
                    counter += 1
                used_names.add(name)
                with file_open(path, mode='rb') as f:
                    archive.writestr(name, f.read())
        return request.make_response(
            buffer.getvalue(),
            headers=[
                ('Content-Type', 'application/zip'),
                ('Content-Disposition', content_disposition('dashboards.zip')),
            ],
        )
