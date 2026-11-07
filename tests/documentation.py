"""Regression checks for portable documentation closure and broken-link detection."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import documents


class DocumentationTests(unittest.TestCase):
    def test_encoded_and_duplicate_anchors(self):
        files = {'guide.md': '# 轨道与时间\n\n# 轨道与时间\n',
                 'README.md': '[一](guide.md#%E8%BD%A8%E9%81%93%E4%B8%8E%E6%97%B6%E9%97%B4)\n[二](guide.md#轨道与时间-1)\n'}
        self.assertEqual(documents.check_links(files, files.__getitem__, ['README.md'])['issues'], [])

    def test_missing_file_and_anchor_are_distinct(self):
        files = {'README.md': '[missing](absent.md)\n[stale](guide.md#old)\n', 'guide.md': '# New\n'}
        issues = documents.check_links(files, files.__getitem__, ['README.md'])['issues']
        self.assertTrue(any('missing file' in issue for issue in issues))
        self.assertTrue(any('missing anchor' in issue for issue in issues))

    def test_fenced_examples_do_not_create_navigation(self):
        text = '# Guide\n```md\n[fake](missing.md)\n# Not a heading\n```\n<a id="custom"></a>\n[real](#custom)\n'
        self.assertEqual(documents.check_links(['a.md'], lambda _: text, ['a.md'])['issues'], [])
        self.assertNotIn('not-a-heading', documents.anchors(text))

    def test_portable_provenance_is_transitive(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixtures = {'README.md': '[sources](assets/cities/README.md)',
                        'assets/cities/README.md': '[manifest](manifest.json)',
                        'assets/cities/manifest.json': '{}',
                        'docs/unlinked-internal-note.md': '# Unpublished note'}
            for name, content in fixtures.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content)
            with patch.object(documents, 'DOCUMENT_ROOTS', ('README.md',)):
                selected = documents.portable_documents(root)
            self.assertIn('assets/cities/manifest.json', selected)
            self.assertNotIn('docs/unlinked-internal-note.md', selected)

    def test_source_references_do_not_silently_expand_package(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'README.md').write_text('[source](src/app.js)')
            with patch.object(documents, 'DOCUMENT_ROOTS', ('README.md',)):
                with self.assertRaisesRegex(ValueError, 'pinned repository URL'):
                    documents.portable_documents(root)
        with self.assertRaisesRegex(ValueError, 'leaves'):
            documents.resolve_link('README.md', '../private.txt')


if __name__ == '__main__':
    unittest.main()
