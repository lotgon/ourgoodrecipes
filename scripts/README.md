`import-blogger.mjs` is retired: it refuses to run before any network or file operations, protecting reviewed recipes. The legacy GitHub workflow has no push trigger or write permission and only explains this retirement when manually dispatched. Use the offline Takeout importer below.

For an offline Google Takeout archive, run:

```powershell
python scripts/import-takeout.py C:/path/to/takeout.zip
```

This selects only recipe blog ID `4333353184444059143` and its `ourgoodrecipes` album. Existing recipe text, titles and manual changes are preserved. Published posts receive their original text from the archive; incomplete structured recipes display that text as a fallback. The catalog reads `recipes/blogger/_manifest.json`.

Redesigned posts often append an older copy after `— оригинальный текст (черновик) —`. The importer selects one edition for `sourceText`; complete structured recipes display only their ingredients, steps and notes. Fallback text replaces structured sections instead of repeating them. A recipe without a method in the source is marked honestly. Repeated ingredients in separate salad layers are intentional and are not automatically deduplicated. Full unmodified HTML stays in the local backup.

Checks: `python scripts/test-import-takeout.py` and `node scripts/test-recipe-page.mjs`.

Also run `node scripts/test-legacy-import.mjs` and `node scripts/test-blogger-filters.mjs`. Identical fallback and original editions display once with an explanation; both saved fields remain intact. Original reference links are preserved separately in `originalLinks` and rendered as HTTP(S) links without altering either recipe text. Blogger product filters use conservative tags derived from titles and labels.

The earlier edition is essential evidence: `originalText` preserves the text after the draft marker separately and is available in a collapsed “Оригинал для сверки” block. `sourceText` is only a display fallback, never the source of truth for quantity verification. Do not delete original evidence or equate rendering tests with content verification. When no earlier edition exists, `originalTextOrigin` is `archived-post` rather than `pre-redesign`.

`recipe-content-audit.json` records a content comparison of all 101 archived recipes: corrected fields, findings and unresolved ambiguities. `needs-review` means the original itself is ambiguous or incomplete; do not guess the answer. This report checks fidelity to the archive, not culinary correctness. Revisit it if the archive or curated recipes change.

The complete selected backup, including eight unpublished drafts, pages, comments, theme and settings, is stored under ignored `.local-backups/<archive-name>/`. Other blogs and the Google profile are not extracted. Keep the original ZIP separately. The public import audit is `scripts/takeout-import-report.json`.
