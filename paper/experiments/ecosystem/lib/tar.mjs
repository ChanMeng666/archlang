// Minimal tar reader (POSIX ustar + GNU longname + pax), zero dependencies.
// Enough for npm tarballs: regular files only, everything else skipped.

const BLK = 512;

function str(buf, off, len) {
  let end = off;
  const max = off + len;
  while (end < max && buf[end] !== 0) end++;
  return buf.toString("utf8", off, end);
}

function octal(buf, off, len) {
  const s = str(buf, off, len).trim();
  if (!s) return 0;
  return parseInt(s, 8) || 0;
}

/**
 * Parse an uncompressed tar buffer.
 * @returns {Array<{name: string, size: number, data: Buffer}>} regular files
 */
export function untar(buf) {
  const out = [];
  let off = 0;
  let longName = null;
  let paxName = null;
  while (off + BLK <= buf.length) {
    const hdr = buf.subarray(off, off + BLK);
    // two consecutive zero blocks = end of archive
    let zero = true;
    for (let i = 0; i < BLK; i++) if (hdr[i] !== 0) { zero = false; break; }
    if (zero) break;

    let name = str(hdr, 0, 100);
    const size = octal(hdr, 124, 12);
    const type = String.fromCharCode(hdr[156] || 0x30);
    const prefix = str(hdr, 345, 155);
    if (prefix) name = prefix + "/" + name;
    if (longName !== null) { name = longName; longName = null; }
    if (paxName !== null) { name = paxName; paxName = null; }

    const dataOff = off + BLK;
    const padded = Math.ceil(size / BLK) * BLK;

    if (type === "L") {
      // GNU long name: payload is the real name
      longName = buf.toString("utf8", dataOff, dataOff + size).replace(/\0+$/, "");
    } else if (type === "x" || type === "X") {
      // pax extended header: "<len> path=<value>\n"
      const payload = buf.toString("utf8", dataOff, dataOff + size);
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(payload);
      if (m) paxName = m[1];
    } else if (type === "0" || type === "\0") {
      out.push({ name, size, data: buf.subarray(dataOff, dataOff + size) });
    }
    off = dataOff + padded;
  }
  return out;
}
