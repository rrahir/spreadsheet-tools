from os.path import join
from lxml import etree
import logging
import json


from odoo import _, api, models, modules
from odoo.exceptions import UserError
from odoo.tools.misc import file_path, file_open
from odoo.addons.spreadsheet_dashboard_script.tools.pretty_json_encoder import pretty_json_dump


_logger = logging.getLogger(__name__)

# Sentinel revision id committed to source data files so a fresh collaborative
# session starts from the file instead of a stale revision.
START_REVISION = "START_REVISION"


class SpreadsheetDashboard(models.Model):
    _inherit= 'spreadsheet.dashboard'

    @api.model
    def get_dashboards(self):
        """Return every dashboard defined in data files as
        ``[{"name": <name>,
            "data": {"path": <path>, "content": <json>},
            "sample": {"path": <path>, "content": <json>} | False}]``.

        ``sample`` is ``False`` when the dashboard has no sample file. Records
        without a data file are skipped (see ``_iter_dashboard_records``).
        """
        def entry(path):
            with file_open(path, mode='r') as f:
                return {"path": path, "content": json.load(f)}

        result = []
        for filepath in self._iter_data_filepaths():
            for record in self._iter_dashboard_records(filepath):
                result.append({
                    "name": record["name"],
                    "data": entry(record["data"]),
                    "sample": entry(record["sample"]) if record["sample"] else False,
                })
        return result

    @api.model
    def get_dashboard_target_files(self, dashboard_id):
        """Return the ``data`` and ``sample`` file paths (in the addons-path)
        of the given dashboard record, so a script can overwrite them on disk.

        The record is located through its external ID (a dashboard defined in
        data files always has one). ``sample`` is ``False`` when the dashboard
        has no sample file.
        """
        dashboard = self.browse(dashboard_id).exists()
        if not dashboard:
            raise UserError(_("Dashboard %s does not exist.", dashboard_id))
        data_record = self.env['ir.model.data'].search([
            ('model', '=', self._name),
            ('res_id', '=', dashboard.id),
        ], limit=1)
        if not data_record:
            raise UserError(_(
                "The open dashboard has no external ID; it is not defined in "
                "data files and cannot be written to disk."
            ))
        xml_id = f"{data_record.module}.{data_record.name}"
        for path in self._get_data_filepaths(data_record.module):
            with file_open(path, mode='rb') as source:
                try:
                    tree = etree.parse(source)
                except etree.LxmlSyntaxError:
                    continue
            nodes = tree.xpath(
                "//record[@model='spreadsheet.dashboard'][@id=$xml_id]",
                xml_id=data_record.name,
            )
            if not nodes:
                continue
            record = self._extract_record_files(nodes[0])
            if not record["data"]:
                raise UserError(_(
                    "The dashboard record %s has no 'spreadsheet_binary_data' file.",
                    xml_id,
                ))
            return {"data": record["data"], "sample": record["sample"]}
        raise UserError(_(
            "Could not find the data file for the open dashboard (external ID: %s).",
            xml_id,
        ))

    @api.model
    def reload_dashboard_from_source(self, dashboard_id):
        """Reset the given dashboard record to its source data file on disk:
        overwrite its spreadsheet content with the file and drop the
        collaborative revisions/snapshot, so reloading the editor shows the
        committed file instead of the edited state.
        """
        dashboard = self.browse(dashboard_id).exists()
        if not dashboard:
            raise UserError(_("Dashboard %s does not exist.", dashboard_id))
        files = self.get_dashboard_target_files(dashboard_id)
        with file_open(files["data"], mode='r') as f:
            dashboard.spreadsheet_data = f.read()
        dashboard._delete_collaborative_data()

    @api.model
    def reload_all_dashboards_from_source(self):
        """Reset every data-defined dashboard record to its source data file on
        disk (see :meth:`reload_dashboard_from_source`). Dashboards without a
        resolvable source file are skipped. Returns the number reset.
        """
        data_records = self.env['ir.model.data'].search([('model', '=', self._name)])
        count = 0
        for data_record in data_records:
            try:
                self.reload_dashboard_from_source(data_record.res_id)
            except UserError:
                continue
            count += 1
        return count

    @api.model
    def write_dashboard_files(self, files_data):
        for dashboard_file, data in files_data.items():
            # Reset the revision id on every written file so committed sources
            # always start a fresh collaborative session (done here so callers
            # never have to remember to set it).
            data["revisionId"] = START_REVISION
            pretty_json_dump(data, dashboard_file)

    def _iter_data_filepaths(self):
        """Yield the absolute path of every ``.xml`` data file of every module
        that (transitively) declares ``spreadsheet_dashboard`` as a dependency.
        """
        modules_ = self.env['ir.module.module'].search([])
        dashboard_modules = modules_.filtered(
            lambda m: 'spreadsheet_dashboard' in m.dependencies_id.mapped('name')
        )
        for module in dashboard_modules:
            yield from self._get_data_filepaths(module.name)

    def _get_data_filepaths(self, module_name):
        manifest = modules.get_manifest(module_name)
        for path in manifest.get('data', ()):
            if path.endswith('.xml'):
                yield file_path(join(module_name, path), env=self.env)

    @staticmethod
    def _extract_record_files(node):
        """Read a ``<record model='spreadsheet.dashboard'>`` node and return
        ``{"name": <name>, "data": <path>, "sample": <path or False>}``.

        ``name`` and ``data`` are ``None`` when the corresponding field is
        absent; ``sample`` is ``False`` when there is no sample file.
        """
        name, data, sample = None, None, None
        for field_node in node.iterchildren():
            field_name = field_node.get('name')
            if field_name == 'name':
                name = field_node.text
            elif field_name == 'spreadsheet_binary_data':
                data = field_node.get('file')
            elif field_name == 'sample_dashboard_file_path':
                sample = field_node.text
        return {"name": name, "data": data, "sample": sample or False}

    def _iter_dashboard_records(self, filepath):
        """Yield ``{"name": <name>, "data": <path>, "sample": <path or False>}``
        for every spreadsheet.dashboard record in ``filepath`` that has a data
        file.

        Tolerant: an unparseable file is skipped (logged) and records without
        a data file are skipped instead of raising.
        """
        with file_open(filepath, mode='rb') as source:
            try:
                tree = etree.parse(source)
            except etree.LxmlSyntaxError:
                _logger.warning("Error parsing XML file %s", filepath)
                return
        for node in tree.xpath("//record[@model='spreadsheet.dashboard']"):
            record = self._extract_record_files(node)
            if record["data"]:
                yield record
