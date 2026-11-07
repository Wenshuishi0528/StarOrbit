"""Shared local-document link checks and portable documentation selection (stdlib only)."""
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit
import html
import posixpath
import re


DOCUMENT_ROOTS = (
    'README.md', 'README.en.md', '使用说明.md', 'CHANGELOG.md',
    '素材与迁移说明.md', 'LICENSING.md', 'LICENSE', 'docs/README.md',
    'assets/sky-detail/README.md', 'assets/sky-detail/manifest.json',
    'assets/earth/cities/README.md', 'assets/earth/cities/manifest.json',
    'assets/earth/elevation/README.md', 'assets/earth/elevation/manifest.json',
    'assets/D3-CELESTIAL-LICENSE.txt', 'assets/GEOTIFF-DEPENDENCY-LICENSES.txt',
)
LINK = re.compile(r'!?\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["\'][^\n]*?["\'])?\s*\)')


def markdown_lines(text):
    """Ignore fenced examples: their example links are not document navigation."""
    fence = None
    for number, line in enumerate(text.splitlines(), 1):
        match = re.match(r'^\s{0,3}(`{3,}|~{3,})', line)
        if match:
            marker = match.group(1)
            if fence is None:
                fence = marker
            elif marker[0] == fence[0] and len(marker) >= len(fence):
                fence = None
            continue
        if fence is None:
            yield number, line


def local_links(text):
    for number, line in markdown_lines(text):
        for match in LINK.finditer(line):
            target = match.group(1) or match.group(2)
            parsed = urlsplit(target)
            if parsed.scheme or target.startswith('//'):
                continue
            yield number, unquote(parsed.path), unquote(parsed.fragment)


def resolve_link(source, target):
    if not target:
        return source
    if target.startswith('/'):
        raise ValueError('absolute local links do not work in a portable package')
    result = posixpath.normpath(posixpath.join(posixpath.dirname(source), target))
    if result == '..' or result.startswith('../'):
        raise ValueError('link leaves the document root')
    return result


def anchors(text):
    """GitHub-style ATX heading anchors, duplicates and explicit HTML IDs."""
    result = set()
    counts = {}
    for _, line in markdown_lines(text):
        result.update(re.findall(r'<(?:a|h[1-6])\s+[^>]*(?:id|name)=["\']([^"\']+)', line))
        match = re.match(r'^ {0,3}#{1,6}\s+(.+?)(?:\s+#+\s*)?$', line)
        if not match:
            continue
        title = re.sub(r'<[^>]+>', '', html.unescape(match.group(1))).lower()
        title = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', title)
        slug = ''.join(c for c in title if c.isalnum() or c in '_- ')
        slug = slug.replace(' ', '-')
        count = counts.get(slug, 0)
        counts[slug] = count + 1
        result.add(slug + (f'-{count}' if count else ''))
    return result


def check_links(names, read_text, documents):
    names = set(names)
    issues = []
    references = 0
    anchor_cache = {}
    for source in sorted(documents):
        for line, target, fragment in local_links(read_text(source)):
            references += 1
            try:
                destination = resolve_link(source, target)
            except ValueError as error:
                issues.append(f'{source}:{line}: {error}: {target}')
                continue
            if destination not in names:
                issues.append(f'{source}:{line}: missing file: {destination}')
            elif fragment and PurePosixPath(destination).suffix.lower() == '.md':
                if destination not in anchor_cache:
                    anchor_cache[destination] = anchors(read_text(destination))
                if fragment not in anchor_cache[destination]:
                    issues.append(f'{source}:{line}: missing anchor: {destination}#{fragment}')
    return {'documents': len(documents), 'references': references, 'issues': issues}


def portable_documents(root):
    """Explicit entry points plus their local references; never collect source or output trees."""
    root = Path(root)
    selected = set(DOCUMENT_ROOTS)
    # Artwork must remain independently available under its own free licenses.
    selected.update(str(p.relative_to(root).as_posix())
                    for p in (root / 'assets/constellation-art').rglob('*')
                    if p.is_file() and not any(part.startswith('.') for part in p.relative_to(root).parts))
    pending = list(selected)
    visited = set()
    while pending:
        source = pending.pop()
        if source in visited:
            continue
        visited.add(source)
        path = root / source
        if not path.is_file():
            raise ValueError(f'missing package document: {source}')
        if path.suffix.lower() != '.md':
            continue
        for line, target, _ in local_links(path.read_text(encoding='utf-8')):
            destination = resolve_link(source, target)
            # Source examples belong in docs/examples; implementation references use pinned URLs.
            if destination.split('/')[0] in {'src', 'scripts', 'tests', 'output', 'node_modules', '.git'}:
                raise ValueError(f'{source}:{line}: use a pinned repository URL for source reference: {target}')
            resolved = (root / destination).resolve()
            if not resolved.is_relative_to(root.resolve()):
                raise ValueError(f'{source}:{line}: linked path leaves repository: {target}')
            if destination not in selected:
                selected.add(destination)
                pending.append(destination)
    return sorted(selected)
