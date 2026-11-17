import { readdirSync, readFileSync, statSync } from 'fs'
import { basename, join } from 'path'
import { inflateRawSync } from 'zlib'
import { readSequelCsv, type SequelImport } from '@core/sequel'

/**
 * Finds Library.csv in what you picked: Sequel's .zip as it was exported, the folder it unzips
 * to, or the CSV itself. Nothing is copied anywhere; the file is only read.
 */

const CSV_NAME = 'library.csv'

/** Reads one file out of a .zip (stored or deflated, which is all Sequel uses). */
export function readFromZip(zip: Buffer, wanted: (name: string) => boolean): Buffer | null {
  // The central directory lists every file; its end record is in the last ~64 KB.
  let end = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error("That file isn't a zip Eclipse can read.")
  const count = zip.readUInt16LE(end + 10)
  let p = zip.readUInt32LE(end + 16)
  for (let n = 0; n < count && p + 46 <= zip.length; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) break
    const method = zip.readUInt16LE(p + 10)
    const size = zip.readUInt32LE(p + 20)
    const nameLen = zip.readUInt16LE(p + 28)
    const extraLen = zip.readUInt16LE(p + 30)
    const commentLen = zip.readUInt16LE(p + 32)
    const local = zip.readUInt32LE(p + 42)
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen
    if (!wanted(name)) continue
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const data = zip.subarray(start, start + size)
    if (method === 0) return Buffer.from(data)
    if (method === 8) return inflateRawSync(data)
    throw new Error('That zip uses a kind of compression Eclipse can’t read. Unzip it and pick the folder instead.')
  }
  return null
}

function findCsvIn(folder: string, depth = 0): string | null {
  for (const name of readdirSync(folder)) {
    const full = join(folder, name)
    if (name.toLowerCase() === CSV_NAME) return full
    if (depth < 2 && !name.startsWith('.') && statSync(full).isDirectory()) {
      const found = findCsvIn(full, depth + 1)
      if (found) return found
    }
  }
  return null
}

export function readSequelExport(path: string): SequelImport {
  let text: string
  if (statSync(path).isDirectory()) {
    const csv = findCsvIn(path)
    if (!csv) throw new Error('No Library.csv in that folder. Pick the folder Sequel’s export unzips to.')
    text = readFileSync(csv, 'utf8')
  } else if (path.toLowerCase().endsWith('.zip')) {
    const data = readFromZip(readFileSync(path), (n) => basename(n).toLowerCase() === CSV_NAME && !n.startsWith('__MACOSX'))
    if (!data) throw new Error('No Library.csv in that zip. Is it Sequel’s export?')
    text = data.toString('utf8')
  } else {
    text = readFileSync(path, 'utf8')
  }
  return readSequelCsv(text)
}
