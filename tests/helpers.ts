import type { FolderMetadata } from '../src/shared/types'

export const meta = (over: Partial<FolderMetadata> = {}): FolderMetadata => ({
  path: 'C:\\Users\\jdoe\\AppData\\Local\\Acme\\Cache',
  name: 'Cache',
  sizeBytes: 1000,
  fileCount: 3,
  dirCount: 1,
  extensionCounts: { '.dat': 2, '.log': 1 },
  createdAt: '2024-01-01T00:00:00.000Z',
  modifiedAt: '2024-02-01T00:00:00.000Z',
  oldestFileAt: '2024-01-01T00:00:00.000Z',
  newestFileAt: '2024-02-01T00:00:00.000Z',
  sampleFileNames: ['a.dat', 'b.dat', 'c.log'],
  unreadableCount: 0,
  linksSkipped: 0,
  ...over
})
