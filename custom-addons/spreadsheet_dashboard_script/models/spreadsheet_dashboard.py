from os.path import join
from lxml import etree
import logging
import json


from odoo import api, models, modules
from odoo.tools.misc import file_path, file_open
from odoo.addons.spreadsheet_dashboard_script.tools.pretty_json_encoder import pretty_json_dump


_logger = logging.getLogger(__name__)


class SpreadsheetDashboard(models.Model):
    _inherit= 'spreadsheet.dashboard'

    @api.model
    def get_dashboard_files(self):
        result = {}
        modules = self.env['ir.module.module'].search([])
        dashboard_modules = modules.filtered(lambda m: 'spreadsheet_dashboard' in m.dependencies_id.mapped('name'))
        for module in dashboard_modules:
            for path in self._get_data_filepaths(module.name):
                for files in self._parse_xml(path):
                    for dashboard_file in [files["data"], files["sample"]]:
                        with file_open(dashboard_file, mode='r') as f:
                            result[dashboard_file] = json.load(f)
        return result

    @api.model
    def get_dashboard_files_for_sample(self):
        result = {}
        modules = self.env['ir.module.module'].search([])
        dashboard_modules = modules.filtered(lambda m: 'spreadsheet_dashboard' in m.dependencies_id.mapped('name'))
        for module in dashboard_modules:
            for path in self._get_data_filepaths(module.name):
                files = self._parse_xml(path)
                for r in files:
                    with file_open(r["data"], mode='r') as f:
                        result[r["sample"]] = json.load(f)
        return result

    @api.model
    def write_dashboard_files(self, files_data):
        for dashboard_file, data in files_data.items():
            pretty_json_dump(data, dashboard_file)

    def _get_data_filepaths(self, module_name):
        manifest = modules.get_manifest(module_name)
        for path in manifest.get('data', ()):
            if path.endswith('.xml'):
                yield file_path(join(module_name, path), env=self.env)

    def _parse_xml(self, filepath):
        with file_open(filepath, mode='rb') as source:
            try:
                tree = etree.parse(source)
            except etree.LxmlSyntaxError:
                _logger.warning("Error parsing XML file %s", filepath)
                tree = etree.fromstring('<data/>')
        files = []
        for node in tree.xpath("//record[@model='spreadsheet.dashboard']"):
            data, sample = None, None
            for field_node in node.iterchildren():
                field_name = field_node.get('name')
                if field_name == 'spreadsheet_binary_data':
                    data = field_node.get('file')
                elif field_name == 'sample_dashboard_file_path':
                    sample = field_node.text
            if data and sample:
                files.append({
                    "data": data,
                    "sample": sample,
                })
            else:
                raise ValueError(f"Invalid record in {filepath}: missing 'spreadsheet_binary_data' or 'sample_dashboard_file_path'")
        return files
