const crypto = require("node:crypto");
const fs = require("node:fs");
const { Writable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { Worker, isMainThread, workerData } = require("node:worker_threads");
const zlib = require("node:zlib");

const COMPACT_DIGEST_RE = /^[0-9a-f]{64}$/i;
const COLON_DIGEST_RE = /^(?:[0-9a-f]{2}:){31}[0-9a-f]{2}$/i;
const NUMBERED_APK_SIGNER_RE = /^Signer #([1-9][0-9]*)$/;
const SDK_RANGE_APK_SIGNER_RE =
  /^Signer \(minSdkVersion=([0-9]+)(?: \(dev release=true\))?, maxSdkVersion=([0-9]+)\)$/;
const SCHEME_SINGLE_APK_SIGNER_RE = /^(V1|V2|V3\.0) Signer:$/;
const SCHEME_NUMBERED_APK_SIGNER_RE = /^(V1|V2|V3\.0) Signer #([1-9][0-9]*):$/;
const SCHEME_SDK_RANGE_APK_SIGNER_RE =
  /^V3\.[01] Signer: \(minSdkVersion=([0-9]+)(?: \(dev release=true\))?, maxSdkVersion=([0-9]+)\)$/;
const SOURCE_STAMP_APK_SIGNER_RE = /^Source Stamp Signer:?$/;
const AAB_MANIFEST_PATH = "META-INF/MANIFEST.MF";
const AAB_CROSS_CHECK_SUMMARY =
  "This JAR file contains internal inconsistencies that may result in different contents when reading via JarFile and JarInputStream:";
const AAB_MANIFEST_MISSING_JIS = "- Manifest is missing when reading via JarInputStream";
const AAB_SIGNED_ONLY_IN_JAR_FILE_RE =
  /^- Entry (.+) is signed in JarFile but is not signed in JarInputStream$/;
const AAB_FORBIDDEN_CROSS_WARNING_RES = [
  /^- Manifest is missing when reading via JarFile$/,
  /^- Manifest main attribute /,
  /^- Entry .+ is present when reading via JarInputStream but missing when reading via JarFile$/,
  /^- Entry .+ is present when reading via JarFile but missing when reading via JarInputStream$/,
  /^- Entry .+ is present in JarFile but unreadable$/,
  /^- Code signers are different for entry .+ when reading from JarFile and JarInputStream$/,
  /^- Entry .+ is signed in JarInputStream but is not signed in JarFile$/,
  /^- Signature verification failed on entry .+ when reading via Jar(?:InputStream|File)$/,
];
const MAX_AAB_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_AAB_DIRECTORY_COMPRESSED_BYTES = 1024;
const ZIP_INTEGRITY_CHUNK_BYTES = 64 * 1024;
const ZIP_INTEGRITY_TIMEOUT_MS = 120 * 1000;
const ZIP_COMMON_FLAGS = 0x0008 | 0x0800;
const ZIP_DEFLATE_OPTION_FLAGS = 0x0006;

class SignatureGateError extends Error {
  constructor(code) {
    super(code);
    this.name = "SignatureGateError";
    this.code = code;
  }
}

function reject(code) {
  throw new SignatureGateError(code);
}

function normalizeDigest(value, code = "digest-invalid") {
  const raw = typeof value === "string" ? value.trim() : "";
  if (COMPACT_DIGEST_RE.test(raw)) return raw.toLowerCase();
  if (COLON_DIGEST_RE.test(raw)) return raw.replaceAll(":", "").toLowerCase();
  reject(code);
}

function parseApkSignerDigests(output) {
  const records = [];
  const seenLabels = new Set();
  let style = null;

  for (const line of String(output ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")) {
    if (!line.includes("certificate SHA-256 digest")) continue;

    const match = line.match(/^(.+?) certificate SHA-256 digest:\s*(\S*)\s*$/);
    if (!match) reject("apk-signer-digest-invalid");
    const [, label, rawDigest] = match;
    if (SOURCE_STAMP_APK_SIGNER_RE.test(label)) continue;

    const numbered = label.match(NUMBERED_APK_SIGNER_RE);
    const legacySdkRange = label.match(SDK_RANGE_APK_SIGNER_RE);
    const schemeSingle = label.match(SCHEME_SINGLE_APK_SIGNER_RE);
    const schemeNumbered = label.match(SCHEME_NUMBERED_APK_SIGNER_RE);
    const schemeSdkRange = label.match(SCHEME_SDK_RANGE_APK_SIGNER_RE);
    if (!numbered && !legacySdkRange && !schemeSingle && !schemeNumbered && !schemeSdkRange) {
      reject("apk-signer-label-invalid");
    }

    const nextStyle = numbered
      ? "legacy-numbered"
      : legacySdkRange
        ? "legacy-sdk-range"
        : schemeSingle
          ? "scheme-single"
          : schemeNumbered
            ? `scheme-numbered-${schemeNumbered[1]}`
            : "scheme-sdk-range";
    if (style && style !== nextStyle) reject("apk-signer-style-mixed");
    style = nextStyle;
    if (seenLabels.has(label)) reject("apk-signer-duplicate");
    seenLabels.add(label);

    const sdkRange = legacySdkRange ?? schemeSdkRange;
    if (sdkRange && Number(sdkRange[1]) > Number(sdkRange[2])) {
      reject("apk-signer-sdk-range-invalid");
    }
    records.push({
      digest: normalizeDigest(rawDigest, "apk-signer-digest-invalid"),
      number: numbered ? Number(numbered[1]) : schemeNumbered ? Number(schemeNumbered[2]) : null,
    });
  }

  if (records.length === 0) reject("apk-signer-missing");
  if (style === "scheme-single" && records.length !== 1) reject("apk-signer-count-invalid");
  if (style === "legacy-numbered" || style?.startsWith("scheme-numbered-")) {
    records.forEach((record, index) => {
      if (record.number !== index + 1) reject("apk-signer-sequence-invalid");
    });
  }
  return records.map((record) => record.digest);
}

function parseAabSignerDigests(output) {
  const lines = String(output ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const signerHeaders = [];

  lines.forEach((line, index) => {
    const header = line.match(/^Signer #([1-9][0-9]*):\s*$/);
    if (header) {
      signerHeaders.push({ index, number: Number(header[1]) });
      return;
    }
    if (/^Signer #/.test(line)) reject("aab-signer-header-invalid");
    if (signerHeaders.length === 0 && /^\s*SHA256\s*:/i.test(line)) {
      reject("aab-digest-outside-signer");
    }
  });

  if (signerHeaders.length === 0) reject("aab-signer-missing");
  signerHeaders.forEach((header, index) => {
    if (header.number !== index + 1) reject("aab-signer-sequence-invalid");
  });

  return signerHeaders.map((header, signerIndex) => {
    const end = signerHeaders[signerIndex + 1]?.index ?? lines.length;
    const block = lines.slice(header.index + 1, end);
    const certificates = [];

    block.forEach((line, index) => {
      const certificate = line.match(/^\s*Certificate #([1-9][0-9]*):\s*$/);
      if (certificate) {
        certificates.push({ index, number: Number(certificate[1]) });
      } else if (/^\s*Certificate #/.test(line)) {
        reject("aab-certificate-header-invalid");
      }
    });

    const leaves = certificates.filter((certificate) => certificate.number === 1);
    if (leaves.length !== 1) reject("aab-leaf-certificate-count");
    certificates.forEach((certificate, index) => {
      if (certificate.number !== index + 1) reject("aab-certificate-sequence-invalid");
    });

    const firstCertificate = certificates[0].index;
    if (block.slice(0, firstCertificate).some((line) => /^\s*SHA256\s*:/i.test(line))) {
      reject("aab-digest-outside-certificate");
    }

    const leaf = leaves[0];
    const nextCertificate = certificates.find((certificate) => certificate.index > leaf.index);
    const leafBlock = block.slice(leaf.index + 1, nextCertificate?.index ?? block.length);
    const digestLines = leafBlock.filter((line) => /^\s*SHA256\s*:/i.test(line));
    if (digestLines.length !== 1) reject("aab-leaf-digest-count");

    const digest = digestLines[0].match(/^\s*SHA256:\s*(\S+)\s*$/i);
    if (!digest) reject("aab-leaf-digest-invalid");
    return normalizeDigest(digest[1], "aab-leaf-digest-invalid");
  });
}

function parseAabJarVerification(output) {
  const lines = String(output ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  if (lines.some((line) => /unsigned entries/i.test(line) || /treated as unsigned/i.test(line))) {
    reject("aab-jar-unsigned");
  }
  if (lines.filter((line) => line === "jar verified.").length !== 1) {
    reject("aab-jar-unverified");
  }

  const summaries = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line === AAB_CROSS_CHECK_SUMMARY);
  if (summaries.length === 0) {
    if (lines.some((line) => /not signed/i.test(line))) reject("aab-jar-unverified");
    return { mode: "standard", warningNames: [] };
  }
  if (summaries.length !== 1) reject("aab-jar-crosscheck-invalid");

  const summaryIndex = summaries[0].index;
  const crossCheckLines = [];
  let index = summaryIndex + 1;
  while (index < lines.length && lines[index].startsWith("- ")) {
    crossCheckLines.push({ line: lines[index], index });
    index += 1;
  }
  const manifestWarnings = crossCheckLines.filter(({ line }) => line === AAB_MANIFEST_MISSING_JIS);
  const signerWarnings = crossCheckLines.filter(({ line }) =>
    AAB_SIGNED_ONLY_IN_JAR_FILE_RE.test(line),
  );
  if (
    manifestWarnings.length !== 1 ||
    signerWarnings.length === 0 ||
    crossCheckLines.length !== manifestWarnings.length + signerWarnings.length
  ) {
    reject("aab-jar-crosscheck-invalid");
  }

  const allowedCrossCheckLines = new Set(crossCheckLines.map(({ index: lineIndex }) => lineIndex));
  if (
    lines.some(
      (line, lineIndex) =>
        !allowedCrossCheckLines.has(lineIndex) &&
        (/not signed/i.test(line) ||
          line === AAB_MANIFEST_MISSING_JIS ||
          AAB_SIGNED_ONLY_IN_JAR_FILE_RE.test(line) ||
          AAB_FORBIDDEN_CROSS_WARNING_RES.some((pattern) => pattern.test(line))),
    )
  ) {
    reject("aab-jar-crosscheck-invalid");
  }
  const warningNames = signerWarnings.map(
    ({ line }) => line.match(AAB_SIGNED_ONLY_IN_JAR_FILE_RE)[1],
  );
  if (new Set(warningNames).size !== warningNames.length) {
    reject("aab-jar-crosscheck-invalid");
  }
  return { mode: "manifest-last", warningNames };
}

function assertAabJarVerified(output) {
  const verification = parseAabJarVerification(output);
  if (verification.mode !== "standard") reject("aab-jar-structure-required");
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return crc >>> 0;
});

function crc32Update(crc, buffer) {
  for (const byte of buffer) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return crc >>> 0;
}

function crc32(buffer) {
  const crc = crc32Update(0xffffffff, buffer);
  return (crc ^ 0xffffffff) >>> 0;
}

function readExactly(fd, length, position) {
  const value = Buffer.alloc(length);
  if (fs.readSync(fd, value, 0, length, position) !== length) {
    throw new Error("short archive read");
  }
  return value;
}

function decodeZipName(bytes, flags) {
  if ((flags & 0x0800) === 0 && bytes.some((byte) => byte > 0x7f)) {
    throw new Error("non-UTF-8 archive name");
  }
  const name = bytes.toString("utf8");
  if (name.includes("\ufffd")) throw new Error("invalid UTF-8 archive name");
  return name;
}

function assertSupportedZipFlags(flags, method) {
  const allowed = ZIP_COMMON_FLAGS | (method === 8 ? ZIP_DEFLATE_OPTION_FLAGS : 0);
  if ((flags & ~allowed) !== 0) throw new Error("ZIP entry flags are unsupported");
}

function parseExtendedTimestampExtra(data, location) {
  if (data.length < 1) throw new Error("extended timestamp extra is malformed");
  const flags = data.readUInt8(0);
  if ((flags & ~0x07) !== 0) throw new Error("extended timestamp flags are unsupported");
  const timestampCount =
    location === "central"
      ? Number((flags & 0x01) !== 0)
      : Number((flags & 0x01) !== 0) +
        Number((flags & 0x02) !== 0) +
        Number((flags & 0x04) !== 0);
  if (data.length !== 1 + timestampCount * 4) {
    throw new Error("extended timestamp extra is malformed");
  }
  return {
    flags,
    modified: (flags & 0x01) !== 0 ? data.readUInt32LE(1) : undefined,
  };
}

function parseZipExtraFields(extra, location) {
  const fields = new Map();
  let cursor = 0;
  while (cursor < extra.length) {
    if (cursor + 4 > extra.length) throw new Error("ZIP extra field header is malformed");
    const id = extra.readUInt16LE(cursor);
    const size = extra.readUInt16LE(cursor + 2);
    const end = cursor + 4 + size;
    if (end > extra.length || fields.has(id)) throw new Error("ZIP extra field is malformed");
    const data = extra.subarray(cursor + 4, end);
    if (id === 0x5455) {
      fields.set(id, parseExtendedTimestampExtra(data, location));
    } else if (id === 0xcafe && data.length === 0) {
      // JAR marker and extended timestamps are metadata-only; all semantic extras fail closed.
      fields.set(id, {});
    } else {
      throw new Error("ZIP extra field is unsupported");
    }
    cursor = end;
  }
  return fields;
}

function assertCompatibleZipExtraFields(localFields, centralFields) {
  const localTimestamp = localFields.get(0x5455);
  const centralTimestamp = centralFields.get(0x5455);
  if (Boolean(localTimestamp) !== Boolean(centralTimestamp)) {
    throw new Error("local and central timestamp extra presence differs");
  }
  // Safe 0x5455 subset: central data carries only mtime, while its presence flags
  // must describe the same timestamp set as the corresponding local field.
  if (localTimestamp && centralTimestamp && localTimestamp.flags !== centralTimestamp.flags) {
    throw new Error("local and central timestamp flags differ");
  }
  if (
    localTimestamp?.modified !== undefined &&
    localTimestamp.modified !== centralTimestamp?.modified
  ) {
    throw new Error("local and central timestamp extras differ");
  }
}

function readStrictZip(file) {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    if (size < 22) throw new Error("archive is too short");
    const tailSize = Math.min(size, 65557);
    const tailOffset = size - tailSize;
    const tail = readExactly(fd, tailSize, tailOffset);
    let eocd = -1;
    for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
      if (
        tail.readUInt32LE(offset) === 0x06054b50 &&
        offset + 22 + tail.readUInt16LE(offset + 20) === tail.length
      ) {
        eocd = offset;
        break;
      }
    }
    if (eocd < 0) throw new Error("archive EOCD is missing");
    if (
      tail.readUInt16LE(eocd + 4) !== 0 ||
      tail.readUInt16LE(eocd + 6) !== 0 ||
      tail.readUInt16LE(eocd + 8) !== tail.readUInt16LE(eocd + 10)
    ) {
      throw new Error("multi-disk archive is unsupported");
    }
    const entryCount = tail.readUInt16LE(eocd + 10);
    const centralSize = tail.readUInt32LE(eocd + 12);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    if (
      entryCount === 0 ||
      entryCount === 0xffff ||
      centralSize === 0xffffffff ||
      centralOffset === 0xffffffff
    ) {
      throw new Error("ZIP64 or empty archive is unsupported");
    }
    const eocdOffset = tailOffset + eocd;
    if (centralOffset + centralSize !== eocdOffset || centralSize > 64 * 1024 * 1024) {
      throw new Error("central directory bounds are invalid");
    }

    const central = readExactly(fd, centralSize, centralOffset);
    const entries = [];
    const names = new Set();
    let centralCursor = 0;
    for (let count = 0; count < entryCount; count += 1) {
      if (
        centralCursor + 46 > central.length ||
        central.readUInt32LE(centralCursor) !== 0x02014b50
      ) {
        throw new Error("central directory entry is malformed");
      }
      const flags = central.readUInt16LE(centralCursor + 8);
      const method = central.readUInt16LE(centralCursor + 10);
      const crc = central.readUInt32LE(centralCursor + 16);
      const compressedSize = central.readUInt32LE(centralCursor + 20);
      const uncompressedSize = central.readUInt32LE(centralCursor + 24);
      const nameLength = central.readUInt16LE(centralCursor + 28);
      const extraLength = central.readUInt16LE(centralCursor + 30);
      const commentLength = central.readUInt16LE(centralCursor + 32);
      const diskStart = central.readUInt16LE(centralCursor + 34);
      const localOffset = central.readUInt32LE(centralCursor + 42);
      const end = centralCursor + 46 + nameLength + extraLength + commentLength;
      if (
        end > central.length ||
        diskStart !== 0 ||
        compressedSize === 0xffffffff ||
        uncompressedSize === 0xffffffff ||
        localOffset === 0xffffffff ||
        (method !== 0 && method !== 8)
      ) {
        throw new Error("central directory metadata is unsupported");
      }
      assertSupportedZipFlags(flags, method);
      const nameBytes = central.subarray(centralCursor + 46, centralCursor + 46 + nameLength);
      const centralExtraStart = centralCursor + 46 + nameLength;
      const centralExtraFields = parseZipExtraFields(
        central.subarray(centralExtraStart, centralExtraStart + extraLength),
        "central",
      );
      const name = decodeZipName(nameBytes, flags);
      if (names.has(name)) throw new Error("duplicate ZIP entry");
      names.add(name);
      entries.push({
        name,
        nameBytes: Buffer.from(nameBytes),
        flags,
        method,
        crc,
        compressedSize,
        uncompressedSize,
        localOffset,
        centralExtraFields,
      });
      centralCursor = end;
    }
    if (centralCursor !== central.length) throw new Error("unparsed central directory bytes");

    for (const entry of entries) {
      if (entry.localOffset + 30 > centralOffset) throw new Error("local header is out of bounds");
      const local = readExactly(fd, 30, entry.localOffset);
      if (local.readUInt32LE(0) !== 0x04034b50) throw new Error("local header is malformed");
      const localFlags = local.readUInt16LE(6);
      const localMethod = local.readUInt16LE(8);
      const localCrc = local.readUInt32LE(14);
      const localCompressedSize = local.readUInt32LE(18);
      const localUncompressedSize = local.readUInt32LE(22);
      const localNameLength = local.readUInt16LE(26);
      const localExtraLength = local.readUInt16LE(28);
      const localName = readExactly(fd, localNameLength, entry.localOffset + 30);
      const localExtra = readExactly(
        fd,
        localExtraLength,
        entry.localOffset + 30 + localNameLength,
      );
      const localExtraFields = parseZipExtraFields(localExtra, "local");
      if (
        localFlags !== entry.flags ||
        localMethod !== entry.method ||
        !localName.equals(entry.nameBytes)
      ) {
        throw new Error("local and central metadata differ");
      }
      assertCompatibleZipExtraFields(localExtraFields, entry.centralExtraFields);
      const usesDescriptor = (entry.flags & 0x0008) !== 0;
      if (
        !usesDescriptor &&
        (localCrc !== entry.crc ||
          localCompressedSize !== entry.compressedSize ||
          localUncompressedSize !== entry.uncompressedSize)
      ) {
        throw new Error("local and central sizes differ");
      }
      if (
        usesDescriptor &&
        (localCrc !== 0 || localCompressedSize !== 0 || localUncompressedSize !== 0)
      ) {
        throw new Error("local descriptor placeholders differ");
      }
      entry.dataOffset = entry.localOffset + 30 + localNameLength + localExtraLength;
      let entryEnd = entry.dataOffset + entry.compressedSize;
      if (entryEnd > centralOffset) throw new Error("entry data is out of bounds");
      if (usesDescriptor) {
        const descriptorPrefix = readExactly(fd, 4, entryEnd).readUInt32LE(0);
        const candidates = [entryEnd];
        if (descriptorPrefix === 0x08074b50) candidates.push(entryEnd + 4);
        const matches = candidates.filter((candidate) => {
          if (candidate + 12 > centralOffset) return false;
          const descriptor = readExactly(fd, 12, candidate);
          return (
            descriptor.readUInt32LE(0) === entry.crc &&
            descriptor.readUInt32LE(4) === entry.compressedSize &&
            descriptor.readUInt32LE(8) === entry.uncompressedSize
          );
        });
        if (matches.length !== 1) throw new Error("data descriptor is invalid or ambiguous");
        entryEnd = matches[0] + 12;
      }
      entry.endOffset = entryEnd;
    }

    const physicalEntries = [...entries].sort(
      (left, right) => left.localOffset - right.localOffset,
    );
    let expectedOffset = 0;
    for (const entry of physicalEntries) {
      if (entry.localOffset !== expectedOffset) throw new Error("orphan or overlapping local data");
      expectedOffset = entry.endOffset;
    }
    if (expectedOffset !== centralOffset) throw new Error("orphan bytes precede central directory");
    return { fd, entries: physicalEntries, close: false };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

function readStrictZipEntry(archive, entry, limit) {
  if (entry.uncompressedSize > limit || entry.compressedSize > limit) {
    throw new Error("archive entry exceeds verification limit");
  }
  const compressed = readExactly(archive.fd, entry.compressedSize, entry.dataOffset);
  let value;
  if (entry.method === 0) {
    value = compressed;
  } else {
    const inflated = zlib.inflateRawSync(compressed, { maxOutputLength: limit, info: true });
    if (inflated.engine.bytesWritten !== compressed.length) {
      throw new Error("deflate stream has trailing bytes");
    }
    value = inflated.buffer;
  }
  if (value.length !== entry.uncompressedSize || crc32(value) !== entry.crc) {
    throw new Error("archive entry integrity check failed");
  }
  return value;
}

function verifyStoredZipEntry(fd, entry) {
  if (entry.compressedSize !== entry.uncompressedSize) {
    throw new Error("stored archive entry sizes differ");
  }
  const buffer = Buffer.allocUnsafe(Math.min(ZIP_INTEGRITY_CHUNK_BYTES, entry.compressedSize || 1));
  let crc = 0xffffffff;
  let offset = 0;
  while (offset < entry.compressedSize) {
    const length = Math.min(buffer.length, entry.compressedSize - offset);
    if (fs.readSync(fd, buffer, 0, length, entry.dataOffset + offset) !== length) {
      throw new Error("short archive read");
    }
    crc = crc32Update(crc, buffer.subarray(0, length));
    offset += length;
  }
  if (offset !== entry.uncompressedSize || ((crc ^ 0xffffffff) >>> 0) !== entry.crc) {
    throw new Error("archive entry integrity check failed");
  }
}

async function verifyDeflatedZipEntries(fd, entries) {
  for (const entry of entries) {
    const inflater = zlib.createInflateRaw();
    let crc = 0xffffffff;
    let outputBytes = 0;
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        outputBytes += chunk.length;
        if (outputBytes > entry.uncompressedSize) {
          callback(new Error("archive entry exceeds its declared size"));
          return;
        }
        crc = crc32Update(crc, chunk);
        callback();
      },
    });
    const source = fs.createReadStream(null, {
      fd,
      autoClose: false,
      start: entry.dataOffset,
      end: entry.dataOffset + entry.compressedSize - 1,
      highWaterMark: ZIP_INTEGRITY_CHUNK_BYTES,
    });
    await pipeline(source, inflater, sink);
    if (inflater.bytesWritten !== entry.compressedSize) {
      throw new Error("deflate stream has trailing bytes");
    }
    if (
      outputBytes !== entry.uncompressedSize ||
      ((crc ^ 0xffffffff) >>> 0) !== entry.crc
    ) {
      throw new Error("archive entry integrity check failed");
    }
  }
}

function verifyAllArchiveEntriesStreaming(archive) {
  for (const entry of archive.entries) {
    if (entry.method === 0) verifyStoredZipEntry(archive.fd, entry);
  }
  const deflatedEntries = archive.entries
    .filter((entry) => entry.method === 8)
    .map(({ compressedSize, crc, dataOffset, uncompressedSize }) => ({
      compressedSize,
      crc,
      dataOffset,
      uncompressedSize,
    }));
  if (deflatedEntries.length === 0) return;

  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const worker = new Worker(__filename, {
    workerData: {
      task: "verify-aab-deflate",
      fd: archive.fd,
      entries: deflatedEntries,
      signal: signal.buffer,
    },
  });
  worker.unref();
  const waitResult = Atomics.wait(signal, 0, 0, ZIP_INTEGRITY_TIMEOUT_MS);
  void worker.terminate();
  if (waitResult === "timed-out") throw new Error("archive integrity verification timed out");
  if (Atomics.load(signal, 0) !== 1) throw new Error("archive entry integrity check failed");
}

function assertSafeArchivePath(name) {
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    Buffer.byteLength(name, "utf8") > 4096 ||
    /[\u0000-\u001f\u007f\\\ufffd]/.test(name) ||
    name.startsWith("/") ||
    /^[A-Za-z]:/.test(name) ||
    name.endsWith("/") ||
    name.split("/").some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    reject("aab-archive-path-invalid");
  }
}

function parseManifestNames(buffer) {
  const text = buffer.toString("utf8");
  if (text.includes("\ufffd") || /[\u0000]/.test(text)) reject("aab-manifest-invalid");
  const physicalLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const sections = [[]];
  let logicalLine = null;
  for (const line of physicalLines) {
    if (line.startsWith(" ")) {
      if (logicalLine === null) reject("aab-manifest-invalid");
      logicalLine += line.slice(1);
      continue;
    }
    if (logicalLine !== null) {
      sections[sections.length - 1].push(logicalLine);
      logicalLine = null;
    }
    if (line === "") {
      if (sections[sections.length - 1].length > 0) sections.push([]);
    } else {
      logicalLine = line;
    }
  }
  if (logicalLine !== null) sections[sections.length - 1].push(logicalLine);
  const nonEmptySections = sections.filter((section) => section.length > 0);
  if (nonEmptySections.length === 0) reject("aab-manifest-invalid");

  const parsed = nonEmptySections.map((section) => {
    const attributes = new Map();
    for (const line of section) {
      const separator = line.indexOf(": ");
      if (separator <= 0 || !/^[A-Za-z0-9-]+$/.test(line.slice(0, separator))) {
        reject("aab-manifest-invalid");
      }
      const key = line.slice(0, separator).toLowerCase();
      if (attributes.has(key)) reject("aab-manifest-invalid");
      attributes.set(key, line.slice(separator + 2));
    }
    return attributes;
  });
  if (parsed[0].has("name")) reject("aab-manifest-invalid");
  const names = [];
  const nameSet = new Set();
  for (const attributes of parsed.slice(1)) {
    const name = attributes.get("name");
    if (
      typeof name !== "string" ||
      name.length === 0 ||
      ![...attributes.keys()].some((key) => key.endsWith("-digest"))
    ) {
      reject("aab-manifest-invalid");
    }
    assertSafeArchivePath(name);
    if (nameSet.has(name)) reject("aab-manifest-invalid");
    nameSet.add(name);
    names.push(name);
  }
  return names;
}

function validateAabArchive(file, verification, signerCount) {
  let archive;
  try {
    archive = readStrictZip(file);
    const directoryEntries = archive.entries.filter((entry) => entry.name.endsWith("/"));
    const fileEntries = archive.entries.filter((entry) => !entry.name.endsWith("/"));
    for (const entry of directoryEntries) {
      assertSafeArchivePath(entry.name.slice(0, -1));
      if (entry.uncompressedSize !== 0) throw new Error("directory entry contains data");
      if (
        readStrictZipEntry(archive, entry, MAX_AAB_DIRECTORY_COMPRESSED_BYTES).length !== 0
      ) {
        throw new Error("directory entry contains data");
      }
    }
    const names = fileEntries.map((entry) => entry.name);
    names.forEach(assertSafeArchivePath);
    verifyAllArchiveEntriesStreaming(archive);

    const manifestAliases = names.filter(
      (name) => name.toUpperCase() === AAB_MANIFEST_PATH.toUpperCase(),
    );
    if (manifestAliases.length !== 1 || manifestAliases[0] !== AAB_MANIFEST_PATH) {
      reject("aab-manifest-count");
    }

    const reservedNames = new Set([AAB_MANIFEST_PATH.toUpperCase()]);
    const signaturePaths = [];
    const signerPairs = new Map();
    for (const name of names) {
      if (/^META-INF\/SIG-/i.test(name)) reject("aab-signature-material-invalid");
      const signature = name.match(/^META-INF\/([A-Za-z0-9_-]{1,8})\.(SF|RSA|DSA|EC)$/i);
      const looksLikeSignature = /^META-INF\/[^/]+\.(SF|RSA|DSA|EC)$/i.test(name);
      if (looksLikeSignature && !signature) reject("aab-signature-material-invalid");
      if (!signature) continue;
      const folded = name.toUpperCase();
      if (reservedNames.has(folded)) reject("aab-signature-material-invalid");
      reservedNames.add(folded);
      signaturePaths.push(name);
      const basename = signature[1].toUpperCase();
      const pair = signerPairs.get(basename) ?? { signatureFile: 0, signatureBlock: 0 };
      if (signature[2].toUpperCase() === "SF") pair.signatureFile += 1;
      else pair.signatureBlock += 1;
      signerPairs.set(basename, pair);
    }
    if (
      signerPairs.size !== signerCount ||
      [...signerPairs.values()].some(
        (pair) => pair.signatureFile !== 1 || pair.signatureBlock !== 1,
      )
    ) {
      reject(
        signerPairs.size === signerCount
          ? "aab-signature-material-invalid"
          : "aab-signer-archive-count",
      );
    }
    const signatureSet = new Set(signaturePaths);

    const manifestIndex = names.indexOf(AAB_MANIFEST_PATH);
    if (verification.mode === "manifest-last") {
      if (manifestIndex !== names.length - 1) reject("aab-manifest-order-invalid");
      const tail = names.slice(-(signaturePaths.length + 1));
      if (
        tail[tail.length - 1] !== AAB_MANIFEST_PATH ||
        tail.slice(0, -1).length !== signaturePaths.length ||
        !tail.slice(0, -1).every((name) => signatureSet.has(name))
      ) {
        reject("aab-signature-material-invalid");
      }
    } else if (manifestIndex !== 0) {
      reject("aab-manifest-order-invalid");
    }

    const manifestEntry = fileEntries.find((entry) => entry.name === AAB_MANIFEST_PATH);
    const manifestNames = parseManifestNames(
      readStrictZipEntry(archive, manifestEntry, MAX_AAB_MANIFEST_BYTES),
    );
    const payloadNames = names.filter(
      (name) => name !== AAB_MANIFEST_PATH && !signatureSet.has(name),
    );
    const manifestSet = new Set(manifestNames);
    if (
      manifestSet.size !== payloadNames.length ||
      payloadNames.some((name) => !manifestSet.has(name))
    ) {
      reject("aab-manifest-payload-mismatch");
    }

    if (verification.mode === "manifest-last") {
      const expectedWarnings = new Set([...manifestNames, AAB_MANIFEST_PATH]);
      if (
        verification.warningNames.length !== expectedWarnings.size ||
        verification.warningNames.some((name) => {
          assertSafeArchivePath(name);
          return !expectedWarnings.has(name);
        })
      ) {
        reject("aab-jar-warning-set-mismatch");
      }
    }
  } catch (error) {
    if (error instanceof SignatureGateError) throw error;
    reject("aab-archive-invalid");
  } finally {
    if (archive?.fd !== undefined) fs.closeSync(archive.fd);
  }
}

function digestMatches(actual, expected) {
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function verifyReleaseSigners({
  apkOutput,
  aabVerificationOutput,
  aabCertificateOutput,
  aabFile,
  apkExpected,
  aabExpected,
}) {
  const expectedApk = normalizeDigest(apkExpected, "apk-expected-digest-invalid");
  const expectedAab = normalizeDigest(aabExpected, "aab-expected-digest-invalid");
  const apkDigests = parseApkSignerDigests(apkOutput);
  const aabDigests = parseAabSignerDigests(aabCertificateOutput);
  const aabVerification = parseAabJarVerification(aabVerificationOutput);
  validateAabArchive(aabFile, aabVerification, aabDigests.length);

  if (!apkDigests.every((digest) => digestMatches(digest, expectedApk))) {
    reject("apk-signer-mismatch");
  }
  if (!aabDigests.every((digest) => digestMatches(digest, expectedAab))) {
    reject("aab-signer-mismatch");
  }
  return { apkSignerCount: apkDigests.length, aabSignerCount: aabDigests.length };
}

function readReport(file, code) {
  if (typeof file !== "string" || file.length === 0) reject(code);
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    reject(code);
  }
}

function main(argv = process.argv.slice(2)) {
  const [command, apkFile, aabVerificationFile, aabCertificateFile, aabFile, ...extra] = argv;
  if (command !== "verify" || typeof aabFile !== "string" || extra.length > 0) {
    reject("command-invalid");
  }
  const result = verifyReleaseSigners({
    apkOutput: readReport(apkFile, "apk-report-unreadable"),
    aabVerificationOutput: readReport(aabVerificationFile, "aab-verification-report-unreadable"),
    aabCertificateOutput: readReport(aabCertificateFile, "aab-certificate-report-unreadable"),
    aabFile,
    apkExpected: process.env.ANDROID_APK_SIGNER_SHA256,
    aabExpected: process.env.ANDROID_AAB_SIGNER_SHA256,
  });
  process.stdout.write(
    `[android-release-signatures] PASS apk-signers=${result.apkSignerCount} aab-signers=${result.aabSignerCount}\n`,
  );
}

function reportFailure(error) {
  const code = error instanceof SignatureGateError ? error.code : "unexpected";
  process.stderr.write(`::error title=Android release signer gate::${code}\n`);
  process.exitCode = 1;
}

module.exports = {
  SignatureGateError,
  assertAabJarVerified,
  normalizeDigest,
  parseAabJarVerification,
  parseAabSignerDigests,
  parseApkSignerDigests,
  validateAabArchive,
  verifyReleaseSigners,
};

if (!isMainThread && workerData?.task === "verify-aab-deflate") {
  const signal = new Int32Array(workerData.signal);
  verifyDeflatedZipEntries(workerData.fd, workerData.entries).then(
    () => {
      Atomics.store(signal, 0, 1);
      Atomics.notify(signal, 0);
    },
    () => {
      Atomics.store(signal, 0, 2);
      Atomics.notify(signal, 0);
    },
  );
}

if (isMainThread && require.main === module) {
  try {
    main();
  } catch (error) {
    reportFailure(error);
  }
}
