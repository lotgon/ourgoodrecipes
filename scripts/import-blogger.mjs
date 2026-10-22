// Retired: the live-feed importer overwrote reviewed recipes and original evidence.
// Keep this entry point as a fail-closed guard for old commands and integrations.
console.error([
  'The legacy Blogger live-feed import is disabled to protect reviewed recipes.',
  'No recipes or images were downloaded or changed.',
  'Use the supported offline Google Takeout import instead:',
  '  python scripts/import-takeout.py C:/path/to/takeout.zip',
  'Review the resulting changes before committing. See scripts/README.md.',
].join('\n'));
process.exitCode = 1;
