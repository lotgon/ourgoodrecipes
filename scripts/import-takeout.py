"""Import only ourgoodrecipes from a Takeout ZIP, preserving curated recipes.

Usage: python scripts/import-takeout.py PATH_TO_ZIP
Full selected blog backup stays local; only LIVE posts enter the site catalog.
"""
import collections
import hashlib
import html
from html.parser import HTMLParser
import json
import re
from pathlib import Path
import sys
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent
BLOG = 'Рецепты для блюд с низким содержанием соли и глютена'
BLOG_ID = '4333353184444059143'
NS = {'a': 'http://www.w3.org/2005/Atom', 'b': 'http://schemas.google.com/blogger/2018'}
DRAFT_MARKER = re.compile(r'^\s*[—–-]?\s*оригинальный\s+текст\s*\(черновик\)\s*[—–-]?\s*$', re.I | re.M)


def single_recipe_text(text):
    """Select one edition; never deduplicate individual ingredients or layers."""
    parts = DRAFT_MARKER.split(text, maxsplit=1)
    if len(parts) == 1:
        return text
    formatted, original = (part.strip() for part in parts)
    # An incomplete redesign explicitly delegates to the original; use it whole.
    if not formatted or 'см. оригинальный рецепт ниже' in formatted.casefold():
        return original or formatted
    return formatted


class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0
        self.images = []

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.hidden += 1
        if tag in ('br', 'p', 'div', 'li', 'h1', 'h2', 'h3', 'tr'):
            self.parts.append('\n')
        if tag == 'img':
            values = dict(attrs)
            if values.get('src'):
                self.images.append(values['src'])

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.hidden = max(0, self.hidden - 1)
        if tag in ('p', 'div', 'li', 'h1', 'h2', 'h3', 'tr'):
            self.parts.append('\n')
        elif tag in ('span', 'strong', 'b', 'td', 'th'):
            self.parts.append(' ')

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)

    def text(self):
        return '\n'.join(line.strip() for line in ''.join(self.parts).splitlines() if line.strip())


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    value = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    if not path.exists() or path.read_text(encoding='utf-8') != value:
        path.write_text(value, encoding='utf-8')


def run(archive_path):
    archive_path = Path(archive_path)
    out = ROOT / 'recipes/blogger'
    existing = {}
    for file in sorted(out.glob('*.json')):
        data = json.loads(file.read_text(encoding='utf-8'))
        if isinstance(data.get('source'), dict) and data['source'].get('postId'):
            existing[str(data['source']['postId'])] = (file, data)
    overrides = json.loads((ROOT / 'manual_overrides.json').read_text(encoding='utf-8'))
    backup = ROOT / '.local-backups' / archive_path.stem
    prefixes = [f'Takeout/Blogger/Blogs/{BLOG}/',
                f'Takeout/Blogger/Comments/{BLOG}/',
                'Takeout/Blogger/Albums/ourgoodrecipes/']
    with zipfile.ZipFile(archive_path) as archive:
        feed = ET.fromstring(archive.read(prefixes[0] + 'feed.atom'))
        if BLOG_ID not in feed.findtext('a:id', default='', namespaces=NS):
            raise ValueError('Unexpected Blogger blog ID')
        for item in archive.infolist():
            if not any(item.filename.startswith(prefix) for prefix in prefixes):
                continue
            target = (backup / item.filename).resolve()
            if not target.is_relative_to(backup.resolve()):
                raise ValueError('Unsafe ZIP path')
            if not item.is_dir():
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(item))
        # Original album photos are retained locally, and copied to the site only
        # when a published post references their filename.
        album = {Path(i.filename).name: i for i in archive.infolist()
                 if i.filename.startswith(prefixes[2]) and
                 Path(i.filename).suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp', '.gif')}
        counts = collections.Counter()
        manifest = []
        missing_images = []
        text_fallbacks = []
        unpublished_ids = set()
        removed_draft_tails = []
        missing_method_ids = []
        for entry in feed.findall('a:entry', NS):
            kind = entry.findtext('b:type', namespaces=NS)
            status = entry.findtext('b:status', namespaces=NS)
            counts[f'{kind}:{status}'] += 1
            if kind == 'POST' and status != 'LIVE':
                unpublished_ids.add('blogger-' + entry.findtext('a:id', namespaces=NS).split('.post-')[-1])
            if (kind, status) != ('POST', 'LIVE'):
                continue
            post_id = entry.findtext('a:id', namespaces=NS).split('.post-')[-1]
            raw = entry.findtext('a:content', default='', namespaces=NS)
            parsed = Text()
            parsed.feed(raw)
            full_text = parsed.text()
            source_text = single_recipe_text(full_text)
            if DRAFT_MARKER.search(full_text):
                removed_draft_tails.append(post_id)
            title = html.unescape(entry.findtext('a:title', default='', namespaces=NS)).strip()
            if not title and source_text and len(source_text.splitlines()[0]) <= 120:
                title = source_text.splitlines()[0]
            file, recipe = existing.get(post_id, (out / f'post-{post_id}.json', {}))
            if not recipe:
                recipe = {'id': f'blogger-{post_id}', 'title': title or f'Рецепт {post_id}',
                          'status': 'imported', 'source': {'type': 'blogger',
                          'blog': 'https://ourgoodrecipes.blogspot.com', 'postId': post_id},
                          'mainIngredients': [], 'intro': '', 'ingredients': [],
                          'steps': [], 'notes': [], 'images': [], 'possibleDuplicateOf': None}
                for key in ('intro', 'ingredients', 'steps', 'notes'):
                    if key in overrides.get(post_id, {}):
                        recipe[key] = overrides[post_id][key]
            # Keep curated titles, quantities, steps, tags and status unchanged.
            # Carry forward the two explicitly reviewed corrections from c72ebb3.
            if post_id == '1878312322131950147':
                recipe['ingredients'] = ['Арахис' if v == 'Арахис — горсть' else v
                                         for v in recipe.get('ingredients', [])]
            if post_id == '4739354494222385885':
                recipe['steps'] = [v.replace('пока внутри не станут прозрачными',
                                            'пока внутри не станут непрозрачными')
                                   if isinstance(v, str) else v for v in recipe.get('steps', [])]
            if title and recipe.get('title', '').startswith('Recipe '):
                recipe['title'] = title
            for field, atom in [('publishedAt', 'published'), ('updatedAt', 'updated')]:
                if not recipe.get(field):
                    recipe[field] = entry.findtext(f'a:{atom}', default='', namespaces=NS)[:10] or None
            recipe.setdefault('labels', [c.get('term') for c in entry.findall('a:category', NS)
                                         if c.get('term')])
            recipe['sourceText'] = source_text
            # Audited source contains only these three ingredients, no method.
            if post_id == '9032234626701581334' and not recipe.get('steps'):
                recipe['sourceText'] = ''
                missing_method_ids.append(post_id)
            # Restore quantities verified against the pre-redesign original.
            if post_id == '8486890088533995417':
                restored = []
                for value in recipe.get('ingredients', []):
                    value = {'г. нежирных ребрышек': '200–300 г. нежирных ребрышек',
                             'ст.л. риса': '3 ст.л. риса'}.get(value, value)
                    if value == 'капуста' and value in restored:
                        continue
                    restored.append(value)
                recipe['ingredients'] = restored
                # This sourceText is never displayed alongside structured steps.
                recipe['sourceText'] = single_recipe_text(full_text).replace(
                    'г. нежирных ребрышек', '200–300 г. нежирных ребрышек', 1).replace(
                    'ст.л. риса', '3 ст.л. риса', 1)
            if not recipe.get('steps') and recipe['sourceText']:
                text_fallbacks.append(post_id)
            images = [p for p in recipe.get('images', []) if (ROOT / p).is_file()]
            had_images = bool(images)
            unresolved = []
            for url in dict.fromkeys(parsed.images):
                name = Path(urllib.parse.unquote(urllib.parse.urlsplit(url).path)).name
                if name in album:
                    dest = ROOT / 'images/blogger/takeout' / name
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    content = archive.read(album[name])
                    if not dest.exists() or dest.read_bytes() != content:
                        dest.write_bytes(content)
                    # Existing post images remain preferred, avoid duplicate display.
                    if not had_images and dest.relative_to(ROOT).as_posix() not in images:
                        images.append(dest.relative_to(ROOT).as_posix())
                elif not had_images:
                    unresolved.append({'postId': post_id, 'url': url})
            if not images:
                missing_images.extend(unresolved)
            recipe['images'] = images
            recipe['originalImageUrls'] = list(dict.fromkeys(parsed.images))
            write_json(file, recipe)
            manifest.append({key: recipe.get(key) for key in ('id', 'title', 'images', 'possibleDuplicateOf', 'publishedAt', 'labels')} |
                            {'file': file.relative_to(ROOT).as_posix()})
        # Preserve recipes previously created in this folder outside the Blogger feed.
        ids = {r['id'] for r in manifest}
        for file, recipe in existing.values():
            if recipe['id'] not in ids and recipe['id'] not in unpublished_ids:
                manifest.append({key: recipe.get(key) for key in ('id', 'title', 'images', 'possibleDuplicateOf', 'publishedAt', 'labels')} |
                                {'file': file.relative_to(ROOT).as_posix()})
        manifest.sort(key=lambda r: r['id'])
        write_json(out / '_manifest.json', {'source': 'Google Takeout', 'count': len(manifest),
                   'duplicateTitles': sum(bool(r['possibleDuplicateOf']) for r in manifest), 'recipes': manifest})
        report = {'archive': archive_path.name, 'sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(),
                  'blogId': BLOG_ID, 'entries': dict(counts), 'catalogCount': len(manifest),
                  'albumPhotosBackedUp': len(album), 'textFallbackPostIds': text_fallbacks,
                  'removedDraftTailPostIds': removed_draft_tails,
                  'missingMethodPostIds': missing_method_ids,
                  'missingImages': missing_images,
                  'policy': 'Existing curated fields preserved. Drafts, pages, comments and settings are in ignored local backup.'}
        write_json(ROOT / 'scripts/takeout-import-report.json', report)
        print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == '__main__':
    run(sys.argv[1])
