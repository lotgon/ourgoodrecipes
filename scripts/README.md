`import-blogger.mjs` imports the legacy Blogger collection into `recipes/blogger/` and downloads post images into `images/blogger/`.

For an offline Google Takeout archive, run:

```powershell
python scripts/import-takeout.py C:/path/to/takeout.zip
```

This selects only recipe blog ID `4333353184444059143` and its `ourgoodrecipes` album. Existing recipe text, titles and manual changes are preserved. Published posts receive their original text from the archive; incomplete structured recipes display that text as a fallback. The catalog reads `recipes/blogger/_manifest.json`.

Redesigned posts often append an older copy after `— оригинальный текст (черновик) —`. The importer selects one edition for `sourceText`; complete structured recipes display only their ingredients, steps and notes. Fallback text replaces structured sections instead of repeating them. A recipe without a method in the source is marked honestly. Repeated ingredients in separate salad layers are intentional and are not automatically deduplicated. Full unmodified HTML stays in the local backup.

Checks: `python scripts/test-import-takeout.py` and `node scripts/test-recipe-page.mjs`.

The complete selected backup, including eight unpublished drafts, pages, comments, theme and settings, is stored under ignored `.local-backups/<archive-name>/`. Other blogs and the Google profile are not extracted. Keep the original ZIP separately. The public import audit is `scripts/takeout-import-report.json`.
