import { pathExists } from '../../ui/lib/path-exists'
import { IFoundDiffTool } from './found-diff-tool'

/** Represents an external diff tool on Linux */
interface ILinuxExternalDiffTool {
  /** Name of the diff tool. It will be used both as identifier and user-facing. */
  readonly name: string

  /** List of possible paths where the diff tool's executable might be located. */
  readonly paths: string[]
}

/**
 * This list contains all the external diff tools supported on Linux. Add a new
 * entry here to add support for your favorite diff tool.
 */
const diffTools: ILinuxExternalDiffTool[] = [
  {
    name: 'Meld',
    paths: ['/usr/bin/meld'],
  },
  {
    name: 'KDiff3',
    paths: ['/usr/bin/kdiff3'],
  },
  {
    name: 'Beyond Compare',
    paths: ['/usr/bin/bcompare', '/usr/bin/bcomp'],
  },
  {
    name: 'DiffMerge',
    paths: ['/usr/bin/diffmerge'],
  },
  {
    name: 'P4Merge',
    paths: ['/usr/bin/p4merge'],
  },
  {
    name: 'Kompare',
    paths: ['/usr/bin/kompare'],
  },
]

async function getAvailablePath(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    if (await pathExists(path)) {
      return path
    }
  }

  return null
}

export async function getAvailableDiffTools(): Promise<
  ReadonlyArray<IFoundDiffTool<string>>
> {
  const results: Array<IFoundDiffTool<string>> = []

  for (const diffTool of diffTools) {
    const path = await getAvailablePath(diffTool.paths)
    if (path) {
      results.push({ editor: diffTool.name, path })
    }
  }

  return results
}
