{
    'name': "Run scripts on dashboard data files",
    'version': '1.0',
    'category': 'Hidden',
    'summary': 'Run scripts on dashboard data files',
    'description': 'Run scripts on dashboard data files',
    'depends': ['spreadsheet_dashboard'],
    'installable': True,
    'license': 'LGPL-3',
    'assets': {
        'spreadsheet.o_spreadsheet': [
            'spreadsheet_dashboard_script/static/src/**/*.js',
        ],
    }
}
