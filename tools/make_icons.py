"""Generate dependency-free PWA icons from simple shapes."""
import struct
import zlib
from pathlib import Path


def png_chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def make_icon(size, path):
    blue = (27, 90, 140, 255)
    white = (255, 255, 255, 255)
    rows = []
    for y in range(size):
        row = bytearray([0])
        yy = y / size
        for x in range(size):
            xx = x / size
            body = .18 <= xx <= .82 and .54 <= yy <= .77
            back = .24 <= xx <= .76 and .34 <= yy <= .62
            arm = ((xx - .18) ** 2 + (yy - .54) ** 2 <= .055 ** 2 or
                   (xx - .82) ** 2 + (yy - .54) ** 2 <= .055 ** 2) and .49 <= yy <= .7
            foot = (.24 <= xx <= .29 or .71 <= xx <= .76) and .77 <= yy <= .84
            color = white if body or back or arm or foot else blue
            row.extend(color)
        rows.append(bytes(row))
    raw = zlib.compress(b''.join(rows), 9)
    data = b'\x89PNG\r\n\x1a\n'
    data += png_chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    data += png_chunk(b'IDAT', raw) + png_chunk(b'IEND', b'')
    path.write_bytes(data)


root = Path(__file__).resolve().parents[1]
for pixels in (192, 512):
    make_icon(pixels, root / f'icon-{pixels}.png')
