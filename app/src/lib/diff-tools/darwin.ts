import { pathExists } from '../../ui/lib/path-exists'
import { IFoundDiffTool } from './found-diff-tool'
import appPath from 'app-path'

/** Represents an external diff tool on macOS */
interface IDarwinExternalDiffTool {
  /** Name of the diff tool. It will be used both as identifier and user-facing. */
  readonly name: string

  /**
   * List of bundle identifiers that are used by the app in its multiple
   * versions.
   */
  readonly bundleIdentifiers: string[]
}

/**
 * This list contains all the external diff tools supported on macOS. Add a new
 * entry here to add support for your favorite diff tool.
 */
const diffTools: IDarwinExternalDiffTool[] = [
  {
    name: 'Beyond Compare',
    bundleIdentifiers: [
      'com.ScooterSoftware.BeyondCompare',
      'com.ScooterSoftware.BeyondCompare5',
    ],
  },
  {
    name: 'Kaleidoscope',
    bundleIdentifiers: [
      'com.blackpixel.kaleidoscope',
      'com.blackpixel.kaleidoscope3',
    ],
  },
  {
    name: 'KDiff3',
    bundleIdentifiers: ['org.kde.kdiff3'],
  },
  {
    name: 'P4Merge',
    bundleIdentifiers: ['com.perforce.p4merge'],
  },
  {
    name: 'DiffMerge',
    bundleIdentifiers: ['com.sourcegear.DiffMerge'],
  },
  {
    name: 'Meld',
    bundleIdentifiers: ['org.gnome.Meld', 'org.gnome.meld'],
  },
  {
    name: 'Araxis Merge',
    bundleIdentifiers: ['com.araxis.merge'],
  },
  {
    name: 'FileMerge',
    bundleIdentifiers: ['com.apple.FileMerge'],
  },
]

async function findApplication(
  diffTool: IDarwinExternalDiffTool
): Promise<string | null> {
  for (const identifier of diffTool.bundleIdentifiers) {
    try {
      const installPath = await appPath(identifier).catch((e: any) =>
        e.message === "Couldn't find the app"
          ? Promise.resolve(null)
          : Promise.reject(e)
      )

      if (installPath && (await pathExists(installPath))) {
        return installPath
      }

      log.debug(
        `App installation for ${diffTool.name} not found at '${installPath}'`
      )
    } catch (error) {
      log.debug(`Unable to locate ${diffTool.name} installation`, error)
    }
  }

  return null
}

/**
 * Lookup known external diff tools using the bundle ID that each uses
 * to register itself on a user's machine when installing.
 */
export async function getAvailableDiffTools(): Promise<
  ReadonlyArray<IFoundDiffTool<string>>
> {
  const results: Array<IFoundDiffTool<string>> = []

  for (const diffTool of diffTools) {
    const path = await findApplication(diffTool)

    if (path) {
      results.push({ editor: diffTool.name, path })
    }
  }

  return results
}
