import { promises as fsp } from 'node:fs'
import { dirname } from 'node:path'

/** The slice of Electron's safeStorage that we use. Lets tests supply a fake. */
export interface Encryptor {
  isEncryptionAvailable: () => boolean
  encryptString: (plain: string) => Buffer
  decryptString: (encrypted: Buffer) => string
}

export class KeyFormatError extends Error {}
export class EncryptionUnavailableError extends Error {
  constructor() {
    super('Windows encryption is not available for this account, so Dirvo cannot store the key safely.')
  }
}

/** Basic sanity check so typos and pasted whitespace are caught early. Not a security check. */
export function normalizeKey(input: string): string {
  const key = input.trim()
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) {
    throw new KeyFormatError('That does not look like an Anthropic API key (it should start with "sk-ant-").')
  }
  return key
}

/**
 * Stores the API key encrypted with Electron safeStorage (Windows DPAPI, tied to this Windows account).
 * Plain text is never written to disk. If encryption is unavailable, saving is refused.
 */
export class KeyStore {
  constructor(
    private readonly filePath: string,
    private readonly encryptor: Encryptor
  ) {}

  encryptionAvailable(): boolean {
    return this.encryptor.isEncryptionAvailable()
  }

  async hasKey(): Promise<boolean> {
    return (await this.load()) !== null
  }

  async save(input: string): Promise<void> {
    const key = normalizeKey(input)
    if (!this.encryptor.isEncryptionAvailable()) throw new EncryptionUnavailableError()
    await fsp.mkdir(dirname(this.filePath), { recursive: true })
    await fsp.writeFile(this.filePath, this.encryptor.encryptString(key))
  }

  /** The decrypted key, for use in the main process only. Null if none is stored or it cannot be decrypted. */
  async load(): Promise<string | null> {
    try {
      const data = await fsp.readFile(this.filePath)
      if (!this.encryptor.isEncryptionAvailable()) return null
      return this.encryptor.decryptString(data)
    } catch {
      return null
    }
  }

  async remove(): Promise<void> {
    await fsp.rm(this.filePath, { force: true })
  }
}
