import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class StoreReviewTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='2ndb-store-review-')
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        source = Path(__file__).resolve().parent
        self.here = root / 'docs/store-copy'
        shutil.copytree(source, self.here, ignore=shutil.ignore_patterns('__pycache__'))
        font = root / 'assets/fonts/Pretendard-Regular.otf'
        font.parent.mkdir(parents=True)
        shutil.copyfile(source.parents[1] / 'assets/fonts/Pretendard-Regular.otf', font)
        self.drafts = json.loads((self.here / 'drafts.json').read_text(encoding='utf-8'))
        for caption in self.drafts['locales']['en']['screenshotCaptions']:
            name = 'index' if caption['route'] == '/' else caption['route'].lstrip('/')
            route = root / 'src/app' / (name + '.tsx')
            route.parent.mkdir(parents=True, exist_ok=True)
            route.write_text('// Route existence fixture\n', encoding='utf-8')

    def build(self):
        (self.here / 'drafts.json').write_bytes((json.dumps(self.drafts, ensure_ascii=False) + '\n').encode('utf-8'))
        return subprocess.run([sys.executable, str(self.here / 'build-review.py')], capture_output=True)

    def test_all_five_languages_render_with_copyable_fields(self):
        result = self.build()
        self.assertEqual(result.returncode, 0, result.stderr)
        validation = json.loads((self.here / 'validation.json').read_text(encoding='utf-8'))
        self.assertEqual(len(validation['fields']), 35)
        self.assertTrue(all(field['passed'] for field in validation['fields']))
        html = (self.here / 'review.html').read_text(encoding='utf-8')
        for locale in ['ko', 'en', 'es', 'pt', 'id']:
            self.assertIn(f'data-locale="{locale}"', html)
            self.assertIn(f'id="{locale}-description" lang="{locale}"', html)
            self.assertIn(f'data-copy="{locale}-captions"', html)
        self.assertIn('35개 필드 통과', html)
        self.assertIn('캡션 30개', html)

    def test_missing_new_language_fails_without_replacing_review(self):
        before = (self.here / 'review.html').read_bytes()
        del self.drafts['locales']['id']
        self.assertNotEqual(self.build().returncode, 0)
        self.assertEqual((self.here / 'review.html').read_bytes(), before)
        self.assertEqual(json.loads((self.here / 'validation.json').read_text(encoding='utf-8'))['status'], 'FAIL')

    def test_keyword_limit_counts_utf8_bytes(self):
        self.drafts['locales']['es']['keywords'] = 'é' * 51
        self.assertNotEqual(self.build().returncode, 0)
        validation = json.loads((self.here / 'validation.json').read_text(encoding='utf-8'))
        field = next(f for f in validation['fields'] if f['locale'] == 'es' and f['field'] == 'keywords')
        self.assertEqual(field['count'], 102)
        self.assertFalse(field['passed'])

    def test_caption_requires_an_existing_route(self):
        self.drafts['locales']['pt']['screenshotCaptions'][0]['route'] = '/not-a-real-screen'
        self.assertNotEqual(self.build().returncode, 0)


if __name__ == '__main__':
    unittest.main()
