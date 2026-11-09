"""Makes one Text+ template .drb per frame rate from resources/Template.drb.

AppendToTimeline reads endFrame in the template clip's own frame rate and converts it,
rounding down (Spike 4, 2026-11-08): a 24 fps template on a 25 fps timeline turns 60
frames into 62, and some lengths cannot be reached at all. A template at the timeline's
own rate needs no conversion.

The rate is a double inside the Fusion Title's FieldsBlob (bytes 8+ are protobuf:
field 3 = { field 1 = double fps }). Only those 8 bytes change, so nothing else moves.

    python -I scripts/make_templates.py            writes resources/templates/*.drb
"""
import os
import re
import struct
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'resources', 'Template.drb')
OUT = os.path.join(HERE, '..', 'resources', 'templates')

# tag → rate stored in the template. NTSC rates in two spellings until Resolve shows
# which one it uses itself (Spike 5); the bridge picks the template by tag.
RATES = {
    '23976': 24000 / 1001, '23976d': 23.976,
    '24': 24.0, '25': 25.0,
    '2997': 30000 / 1001, '2997d': 29.97,
    '30': 30.0, '48': 48.0, '50': 50.0,
    '5994': 60000 / 1001, '5994d': 59.94,
    '60': 60.0,
}

# key 0x1a (field 3, length-delimited), length 9, key 0x09 (field 1, 64-bit), double
RATE_FIELD = re.compile(rb'\x1a\x09\x09(.{8})', re.S)


def patch_blob(blob: bytes, fps: float) -> bytes:
    hits = list(RATE_FIELD.finditer(blob))
    if len(hits) != 1:
        raise SystemExit(f'Expected one frame-rate field in the title blob, found {len(hits)}')
    old = struct.unpack('<d', hits[0].group(1))[0]
    if not 1 <= old <= 240:
        raise SystemExit(f'Frame-rate field reads {old}; the template format has changed')
    at = hits[0].start(1)
    return blob[:at] + struct.pack('<d', fps) + blob[at + 8:]


def patch_folder_xml(xml: str, fps: float) -> str:
    # The Fusion Title's own FieldsBlob is the first one inside <Sm2MpGenerator>
    m = re.search(r'(<Sm2MpGenerator[^>]*>\s*<FieldsBlob>)([0-9a-f]+)(</FieldsBlob>)', xml)
    if not m:
        raise SystemExit('No Fusion Title found in the template bin')
    new = patch_blob(bytes.fromhex(m.group(2)), fps).hex()
    return xml[:m.start(2)] + new + xml[m.end(2):]


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    with zipfile.ZipFile(SRC) as z:
        entries = [(i, z.read(i.filename)) for i in z.infolist()]
    for tag, fps in RATES.items():
        dst = os.path.join(OUT, f'Template_{tag}.drb')
        with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
            for info, data in entries:
                if info.filename.endswith('MpFolder.xml') and b'Sm2MpGenerator' in data:
                    data = patch_folder_xml(data.decode('utf-8'), fps).encode('utf-8')
                z.writestr(info, data)
        print(f'{tag:7s} {fps:.9f} -> {os.path.relpath(dst)}')


if __name__ == '__main__':
    sys.exit(main())
