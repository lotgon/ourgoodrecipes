"""Offline regression checks for selective import and preservation."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('importer', Path(__file__).with_name('import-takeout.py'))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class ImportTest(unittest.TestCase):
    def test_redesign_selects_one_complete_edition(self):
        marker = '\n— оригинальный текст (черновик) —\n'
        self.assertEqual(importer.single_recipe_text('New quantities and steps' + marker + 'Old recipe'),
                         'New quantities and steps')
        self.assertEqual(importer.single_recipe_text('см. оригинальный рецепт ниже' + marker + 'Original method'),
                         'Original method')
        self.assertEqual(importer.single_recipe_text(marker + 'Original only'), 'Original only')
        layered = 'Mayonnaise\nPotatoes\nMayonnaise\nFish'
        self.assertEqual(importer.single_recipe_text(layered), layered)

    def test_preservation_selection_and_repeatability(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent.parent) as tmp:
            importer.ROOT = root = Path(tmp)
            output = root / 'recipes/blogger'
            output.mkdir(parents=True)
            (root / 'manual_overrides.json').write_text('{}')
            recipe = {'id': 'blogger-1', 'title': 'Curated title', 'source': {'postId': '1'},
                      'ingredients': ['Custom quantity'], 'steps': ['Custom step'], 'images': []}
            importer.write_json(output / 'existing.json', recipe)
            feed = '''<feed xmlns="http://www.w3.org/2005/Atom" xmlns:b="http://schemas.google.com/blogger/2018">
            <id>tag:blogger.com,1999:blog-4333353184444059143</id>
            <entry><id>x.post-1</id><b:type>POST</b:type><b:status>LIVE</b:status><title>Old title</title>
            <content type="html">&lt;p&gt;Original text&lt;/p&gt;&lt;img src="https://example.com/a.jpg"&gt;</content></entry>
            <entry><id>x.post-2</id><b:type>POST</b:type><b:status>DRAFT</b:status><title>Private draft</title></entry>
            <entry><id>x.post-3</id><b:type>COMMENT</b:type><b:status>LIVE</b:status><title>Comment</title></entry></feed>'''
            archive = root / 'takeout.zip'
            with zipfile.ZipFile(archive, 'w') as z:
                z.writestr(f'Takeout/Blogger/Blogs/{importer.BLOG}/feed.atom', feed)
                z.writestr('Takeout/Blogger/Albums/ourgoodrecipes/a.jpg', b'photo')
                z.writestr('Takeout/Blogger/Blogs/Other/feed.atom', 'unrelated')
            with contextlib.redirect_stdout(io.StringIO()):
                importer.run(archive)
                first = (output / 'existing.json').read_bytes()
                importer.run(archive)
            self.assertEqual(first, (output / 'existing.json').read_bytes())
            data = json.loads(first)
            for key in ('title', 'ingredients', 'steps'):
                self.assertEqual(data[key], recipe[key])
            self.assertEqual(data['sourceText'], 'Original text')
            self.assertTrue((root / data['images'][0]).is_file())
            manifest = json.loads((output / '_manifest.json').read_text())
            self.assertEqual(manifest['count'], 1)
            self.assertFalse(any(p.name == 'Other' for p in (root / '.local-backups').rglob('*')))
            self.assertNotIn('Private draft', first.decode())


if __name__ == '__main__':
    unittest.main()
