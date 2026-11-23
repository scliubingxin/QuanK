#!/usr/bin/env python3
"""Copy the pinned LibreOffice arm64 bundle subset and record its contents."""
import argparse
from fnmatch import fnmatchcase
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import stat
import struct
import subprocess
import tempfile

ALLOWLIST = Path(__file__).with_name('office-core.allowlist.json')
MANIFEST = 'OFFICE-CORE.json'
VERSION = '26.8.1.1'
MACHO_MAGIC = {
    bytes.fromhex(value)
    for value in ('feedface', 'cefaedfe', 'feedfacf', 'cffaedfe',
                  'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca')
}
LOAD_LINE = re.compile(r'^\s+(.+) \(compatibility version [^\n]+\)$', re.M)
RPATH = re.compile(r'\bcmd LC_RPATH\s+cmdsize \d+\s+path (.+) \(offset \d+\)')
DYLIB_ID = re.compile(r'\bcmd LC_ID_DYLIB\s+cmdsize \d+\s+name (.+) \(offset \d+\)')


def digest(path):
    hash_ = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            hash_.update(chunk)
    return hash_.hexdigest()


def rules():
    return json.loads(ALLOWLIST.read_text())


def within_rule(parts, pattern):
    match = pattern.split('/')
    return len(parts) >= len(match) and all(
        fnmatchcase(part, glob) for part, glob in zip(parts, match)
    )


def selected(relative, config):
    return any(within_rule(relative.parts, pattern) for pattern in config['include']) and not any(
        within_rule(relative.parts, pattern) for pattern in config['exclude']
    )


def inventory(root, config):
    files = {}
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if relative == Path(MANIFEST):
            continue
        if not selected(relative, config) and relative != Path('Contents'):
            raise ValueError(f'Path outside Office allowlist: {relative}')
        mode = stat.S_IMODE(path.lstat().st_mode)
        if path.is_symlink():
            link = os.readlink(path)
            if Path(link).is_absolute() or not path.exists() or not path.resolve().is_relative_to(root):
                raise ValueError(f'Invalid Office symlink: {relative} -> {link}')
            files[relative.as_posix()] = {'link': link, 'mode': mode}
        elif path.is_file():
            files[relative.as_posix()] = {'sha256': digest(path), 'mode': mode}
        elif path.is_dir():
            files[relative.as_posix()] = {'directory': True, 'mode': mode}
        else:
            raise ValueError(f'Unsupported Office file: {relative}')
    return files


def is_macho(path):
    with path.open('rb') as stream:
        header = stream.read(8)
    if len(header) < 8 or header[:4] not in MACHO_MAGIC:
        return False
    # Java classes also begin with CAFEBABE. A fat header has a small slice count.
    if header[:4] == bytes.fromhex('cafebabe'):
        return 0 < int.from_bytes(header[4:], 'big') <= 32
    return True


def expand_path(name, loader, executable_directory):
    for prefix, directory in (('@loader_path', loader.parent),
                              ('@executable_path', executable_directory)):
        if name == prefix:
            return directory
        if name.startswith(prefix + '/'):
            return directory / name[len(prefix) + 1:]
    return Path(name)


def check_loads(root, files, otool):
    executable = root / 'Contents/MacOS/soffice'
    images = {}
    for relative, entry in files.items():
        path = root / relative
        if 'sha256' not in entry or not is_macho(path):
            continue
        loads = subprocess.check_output([otool, '-arch', 'arm64', '-L', path], text=True)
        commands = subprocess.check_output([otool, '-arch', 'arm64', '-l', path], text=True)
        names = LOAD_LINE.findall(loads)
        # otool -L lists the install name before a dylib's dependencies.
        if names and names[0] in DYLIB_ID.findall(commands):
            names.pop(0)
        rpaths = [expand_path(name, path, executable.parent) for name in RPATH.findall(commands)]
        images[path] = (names, rpaths)

    missing = []
    executable_rpaths = images[executable][1]
    for path, (names, rpaths) in images.items():
        for name in names:
            if name.startswith(('/usr/lib/', '/System/Library/')):
                continue
            if name.startswith('@rpath/'):
                suffix = name[len('@rpath/'):]
                candidates = [directory / suffix for directory in (*rpaths, *executable_rpaths)]
            else:
                candidates = [expand_path(name, path, executable.parent)]
            if not any(p.is_absolute() and p.resolve() in images for p in candidates):
                missing.append(f'{path.relative_to(root)}: {name}')
    if missing:
        raise ValueError('Unresolved Office Mach-O dependencies:\n' + '\n'.join(missing))


def make_manifest(root, config):
    with (root / 'Contents/Info.plist').open('rb') as stream:
        if plistlib.load(stream).get('CFBundleVersion') != VERSION:
            raise ValueError(f'Office source must be LibreOffice {VERSION}')
    with (root / 'Contents/MacOS/soffice').open('rb') as stream:
        if stream.read(8) != struct.pack('<II', 0xfeedfacf, 0x0100000c):
            raise ValueError('Office source must contain an arm64 soffice')
    files = inventory(root, config)
    return {'schema': 1, 'version': VERSION, 'architecture': 'arm64',
            'allowlist_sha256': digest(ALLOWLIST), 'files': files}


def build(source, output, otool):
    if output.exists() or output.is_symlink() or output.is_relative_to(source):
        raise ValueError('Choose a new Office output directory outside the input bundle')
    output.parent.mkdir(parents=True, exist_ok=True)
    config = rules()

    def ignore(directory, names):
        relative = Path(directory).relative_to(source)
        return [
            name for name in names
            if relative / name != Path('Contents') and not selected(relative / name, config)
        ]

    with tempfile.TemporaryDirectory(prefix='.office-core-', dir=output.parent) as stage:
        engine = Path(stage) / output.name
        shutil.copytree(source, engine, symlinks=True, ignore=ignore)
        manifest = make_manifest(engine, config)
        check_loads(engine, manifest['files'], otool)
        (engine / MANIFEST).write_text(json.dumps(manifest, indent=2) + '\n')
        engine.rename(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--source', type=Path, help='LibreOffice.app extracted from the pinned DMG')
    source.add_argument('--verify', type=Path, help='Verify an already built engine against its manifest')
    parser.add_argument('--output', type=Path, help='New engine directory, typically WillBuddyEngine')
    parser.add_argument('--otool', default=os.environ.get('OTOOL', 'otool'))
    args = parser.parse_args()
    if args.verify:
        root = args.verify.resolve(strict=True)
        path = root / MANIFEST
        if path.is_symlink():
            raise ValueError('Office manifest must be a regular file')
        manifest = json.loads(path.read_text())
        if manifest != make_manifest(root, rules()):
            raise ValueError('Office payload inventory or allowlist changed')
    elif not args.output:
        parser.error('--source requires --output')
    else:
        build(args.source.resolve(strict=True), args.output.parent.resolve() / args.output.name, args.otool)


if __name__ == '__main__':
    main()
