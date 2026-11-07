"""Validate the Release IPA and collect a self-contained SideStore handoff folder."""
import hashlib
import json
import plistlib
import shutil
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ipa = Path(sys.argv[1]).resolve()
root = Path(__file__).resolve().parent.parent
with zipfile.ZipFile(ipa) as archive:
    assert archive.testzip() is None, 'Corrupt IPA archive'
    prefix = 'Payload/ytmirrorloop.app/'
    info = plistlib.loads(archive.read(prefix + 'Info.plist'))
    assert archive.getinfo(prefix + 'main.jsbundle').file_size > 0, 'Missing embedded JS'
    assert archive.getinfo(prefix + info['CFBundleExecutable']).file_size > 0, 'Missing executable'
    assert info['CFBundleIdentifier'] == 'com.pgmworks.ytmirrorloop', 'Unexpected bundle ID'
    assert 'iPhoneOS' in info['CFBundleSupportedPlatforms'], 'Not a physical-device build'

handoff = root / 'build' / 'sidestore'
handoff.mkdir(parents=True, exist_ok=True)
shutil.copy2(ipa, handoff / ipa.name)
shutil.copy2(root / 'docs' / 'SIDESTORE_USER_GUIDE.md', handoff / '사용안내.md')
shutil.copy2(root / 'docs' / 'INSTALL.md', handoff / '설치담당자안내.md')
checksum = hashlib.sha256(ipa.read_bytes()).hexdigest()
(handoff / 'SHA256SUMS.txt').write_text(f'{checksum}  {ipa.name}\n', encoding='utf-8')
manifest = {
    'createdAt': datetime.now(timezone.utc).isoformat(),
    'version': info['CFBundleShortVersionString'],
    'buildNumber': info['CFBundleVersion'],
    'bundleIdentifier': info['CFBundleIdentifier'],
    'minimumOSVersion': info['MinimumOSVersion'],
    'configuration': 'Release',
    'signing': 'unsigned; SideStore signs during installation',
    'sha256': checksum,
    'validation': 'IPA structure and embedded JS checked; device install/refresh still required',
}
(handoff / 'build-info.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
shutil.make_archive(str(root / 'build' / 'yt-mirror-loop-sidestore'), 'zip', handoff)
print(f'SideStore handoff: {handoff}')
