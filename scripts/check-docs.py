"""Check repository Markdown or a built portable ZIP without extracting it."""
from pathlib import Path
import argparse
import json
import re
import zipfile
from documents import check_links, portable_documents


def check_repository(root):
    docs = sorted({*root.glob('*.md'), *(root / 'docs').rglob('*.md'),
                   *(root / 'assets').rglob('README.md')})
    names = {str(path.relative_to(root).as_posix()) for path in docs}
    # Only inventory referenced files: no traversal of node_modules or large output trees.
    from documents import local_links, resolve_link
    for path in docs:
        source = str(path.relative_to(root).as_posix())
        for _, target, _ in local_links(path.read_text(encoding='utf-8')):
            try:
                destination = resolve_link(source, target)
            except ValueError:
                continue
            if (root / destination).is_file():
                names.add(destination)
    read = lambda name: (root / name).read_text(encoding='utf-8')
    report = check_links(names, read, [str(path.relative_to(root).as_posix()) for path in docs])
    version = json.loads((root / 'package.json').read_text())['displayVersion']
    for name in ['README.md', 'README.en.md', '使用说明.md', 'HANDOFF.md',
                 'docs/product-scope.md', 'docs/architecture.md', 'docs/formats.md',
                 'docs/development-release.md', 'docs/verification.md']:
        first = '\n'.join(read(name).splitlines()[:12])
        if f'v{version}' not in first:
            report['issues'].append(f'{name}: current document header does not identify v{version}')
    for name in ['README.md', 'README.en.md']:
        if re.search(r'127\s*(?:个深空|deep.sky)', read(name), re.I):
            report['issues'].append(f'{name}: stale deep-sky catalogue count')
    try:
        selected = portable_documents(root)
        report['portableFiles'] = len(selected)
    except ValueError as error:
        report['issues'].append(str(error))
    return report


def check_package(path, version):
    with zipfile.ZipFile(path) as archive:
        prefix = '星轨/'
        names = {name[len(prefix):] for name in archive.namelist()
                 if name.startswith(prefix) and not name.endswith('/')}
        documents = sorted(name for name in names if name.endswith('.md'))
        read = lambda name: archive.read(prefix + name).decode('utf-8')
        report = check_links(names, read, documents)
        if archive.testzip() is not None:
            report['issues'].append('ZIP integrity check failed')
        for name in ['先读我.txt', 'README.md', 'README.en.md', '使用说明.md']:
            if name not in names or f'v{version}' not in '\n'.join(read(name).splitlines()[:12]):
                report['issues'].append(f'{name}: missing or inconsistent package version')
        required = ['assets/sky-detail/README.md', 'assets/earth/cities/README.md',
                    'assets/earth/cities/manifest.json', 'assets/D3-CELESTIAL-LICENSE.txt',
                    'assets/GEOTIFF-DEPENDENCY-LICENSES.txt', 'assets/earth/elevation/README.md',
                    'assets/constellation-art/README.md', 'assets/constellation-art/LICENSE-FAL-1.3.html',
                    'assets/constellation-art/LICENSE-CC-BY-SA-4.0.txt']
        required += ['assets/chinese-sky/README.md', 'assets/chinese-sky/catalog.json',
                     'assets/chinese-sky/source/CC-BY-SA-4.0.txt',
                     'assets/chinese-sky/art/README.md', 'assets/chinese-sky/art/manifest.json',
                     'assets/chinese-sky/art/rigid-placements.json']
        for name in required:
            if name not in names:
                report['issues'].append(f'missing provenance or license: {name}')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    version = json.loads((root / 'package.json').read_text())['displayVersion']
    report = check_package(args.package, version) if args.package else check_repository(root)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(bool(report['issues']))


if __name__ == '__main__':
    main()
