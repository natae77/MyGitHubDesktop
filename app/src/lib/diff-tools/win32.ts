import * as Path from 'path'

import {
  enumerateValues,
  HKEY,
  RegistryValue,
  RegistryValueType,
} from 'registry-js'
import { pathExists } from '../../ui/lib/path-exists'

import { IFoundDiffTool } from './found-diff-tool'

type RegistryKey = { key: HKEY; subKey: string }

type WindowsExternalDiffToolPathInfo = {
  /**
   * Registry key with the install location of the app. If not provided,
   * 'InstallLocation' or 'UninstallString' will be assumed.
   */
  readonly installLocationRegistryKey?:
    | 'InstallLocation'
    | 'UninstallString'
    | 'DisplayIcon'

  /**
   * List of lists of path components from the diff tool's installation folder to
   * the potential executable shims.
   */
  readonly executableShimPaths: ReadonlyArray<ReadonlyArray<string>>
}

/** Represents an external diff tool on Windows */
type WindowsExternalDiffTool = {
  /** Name of the diff tool. It will be used both as identifier and user-facing. */
  readonly name: string

  /**
   * Set of registry keys associated with the installed application.
   */
  readonly registryKeys: ReadonlyArray<RegistryKey>

  /** Prefix of the DisplayName registry key that belongs to this diff tool. */
  readonly displayNamePrefixes: string[]

  /** Value of the Publisher registry key that belongs to this diff tool. */
  readonly publishers: string[]
} & WindowsExternalDiffToolPathInfo

const registryKey = (key: HKEY, ...subKeys: string[]): RegistryKey => ({
  key,
  subKey: Path.win32.join(...subKeys),
})

const uninstallSubKey =
  'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'

const wow64UninstallSubKey =
  'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'

const CurrentUserUninstallKey = (subKey: string) =>
  registryKey(HKEY.HKEY_CURRENT_USER, uninstallSubKey, subKey)

const LocalMachineUninstallKey = (subKey: string) =>
  registryKey(HKEY.HKEY_LOCAL_MACHINE, uninstallSubKey, subKey)

const Wow64LocalMachineUninstallKey = (subKey: string) =>
  registryKey(HKEY.HKEY_LOCAL_MACHINE, wow64UninstallSubKey, subKey)

const diffTools: WindowsExternalDiffTool[] = [
  {
    name: 'Beyond Compare',
    registryKeys: [
      CurrentUserUninstallKey('Beyond Compare 5_is1'),
      CurrentUserUninstallKey('Beyond Compare 4_is1'),
      LocalMachineUninstallKey('Beyond Compare 5_is1'),
      LocalMachineUninstallKey('Beyond Compare 4_is1'),
      Wow64LocalMachineUninstallKey('Beyond Compare 5_is1'),
      Wow64LocalMachineUninstallKey('Beyond Compare 4_is1'),
    ],
    displayNamePrefixes: ['Beyond Compare'],
    publishers: ['Scooter Software'],
    executableShimPaths: [['BComp.exe'], ['BCompare.exe']],
  },
  {
    name: 'WinMerge',
    registryKeys: [
      CurrentUserUninstallKey('WinMerge_is1'),
      LocalMachineUninstallKey('WinMerge_is1'),
      Wow64LocalMachineUninstallKey('WinMerge_is1'),
    ],
    displayNamePrefixes: ['WinMerge'],
    publishers: ['Thingamahoochie Software'],
    executableShimPaths: [['WinMergeU.exe']],
  },
  {
    name: 'KDiff3',
    registryKeys: [
      CurrentUserUninstallKey('KDiff3'),
      LocalMachineUninstallKey('KDiff3'),
      Wow64LocalMachineUninstallKey('KDiff3'),
    ],
    displayNamePrefixes: ['KDiff3'],
    publishers: ['The KDiff3 project'],
    executableShimPaths: [['bin', 'kdiff3.exe'], ['kdiff3.exe']],
  },
  {
    name: 'P4Merge',
    registryKeys: [
      CurrentUserUninstallKey('{5C69DCAB-B36E-44DE-B90C-6B399C37B3F0}'),
      LocalMachineUninstallKey('{5C69DCAB-B36E-44DE-B90C-6B399C37B3F0}'),
      Wow64LocalMachineUninstallKey(
        '{5C69DCAB-B36E-44DE-B90C-6B399C37B3F0}'
      ),
    ],
    displayNamePrefixes: ['Helix'],
    publishers: ['Perforce Software'],
    executableShimPaths: [['p4merge.exe']],
  },
  {
    name: 'Meld',
    registryKeys: [
      CurrentUserUninstallKey('Meld_is1'),
      LocalMachineUninstallKey('Meld_is1'),
      Wow64LocalMachineUninstallKey('Meld_is1'),
    ],
    displayNamePrefixes: ['Meld'],
    publishers: ['The Meld project'],
    executableShimPaths: [['Meld.exe'], ['bin', 'Meld.exe']],
  },
  {
    name: 'DiffMerge',
    registryKeys: [
      CurrentUserUninstallKey('SourceGear DiffMerge'),
      LocalMachineUninstallKey('SourceGear DiffMerge'),
      Wow64LocalMachineUninstallKey('SourceGear DiffMerge'),
    ],
    displayNamePrefixes: ['DiffMerge'],
    publishers: ['SourceGear'],
    executableShimPaths: [['sgdm.exe'], ['DiffMerge.exe']],
  },
  {
    name: 'Araxis Merge',
    registryKeys: [
      CurrentUserUninstallKey('Araxis Merge'),
      LocalMachineUninstallKey('Araxis Merge'),
      Wow64LocalMachineUninstallKey('Araxis Merge'),
    ],
    displayNamePrefixes: ['Araxis Merge'],
    publishers: ['Araxis Ltd'],
    executableShimPaths: [['Compare.exe']],
  },
  {
    name: 'ExamDiff Pro',
    registryKeys: [
      CurrentUserUninstallKey('ExamDiff Pro_is1'),
      LocalMachineUninstallKey('ExamDiff Pro_is1'),
      Wow64LocalMachineUninstallKey('ExamDiff Pro_is1'),
    ],
    displayNamePrefixes: ['ExamDiff Pro'],
    publishers: ['PrestoSoft'],
    executableShimPaths: [['ExamDiff.exe']],
  },
  {
    name: 'TortoiseMerge',
    registryKeys: [
      CurrentUserUninstallKey('TortoiseSVN_is1'),
      LocalMachineUninstallKey('TortoiseSVN_is1'),
      Wow64LocalMachineUninstallKey('TortoiseSVN_is1'),
    ],
    displayNamePrefixes: ['TortoiseSVN'],
    publishers: ['TortoiseSVN'],
    executableShimPaths: [['bin', 'TortoiseMerge.exe']],
  },
]

function getKeyOrEmpty(
  keys: ReadonlyArray<RegistryValue>,
  key: string
): string {
  const entry = keys.find(k => k.name === key)
  return entry && entry.type === RegistryValueType.REG_SZ ? entry.data : ''
}

function getCleanInstallLocationFromDisplayIcon(displayIcon: string): string {
  // DisplayIcon can contain a path with an index (e.g. "C:\path\to\app.exe,0")
  return displayIcon.replace(/,\d+$/, '')
}

async function findApplication(
  diffTool: WindowsExternalDiffTool
): Promise<string | undefined> {
  for (const { key, subKey } of diffTool.registryKeys) {
    const keys = enumerateValues(key, subKey)
    if (keys.length === 0) {
      continue
    }

    const displayName = getKeyOrEmpty(keys, 'DisplayName')
    const publisher = getKeyOrEmpty(keys, 'Publisher')

    if (
      !displayName.length ||
      !diffTool.displayNamePrefixes.some(p => displayName.startsWith(p))
    ) {
      log.debug(`Unexpected DisplayName: '${displayName}'`)
      continue
    }

    if (
      !publisher.length ||
      !diffTool.publishers.includes(publisher)
    ) {
      log.debug(
        `Unexpected Publisher: '${publisher}' for '${displayName}'`
      )
      continue
    }

    const registryKey =
      diffTool.installLocationRegistryKey ?? 'InstallLocation'

    const installLocation = getKeyOrEmpty(keys, registryKey)

    if (!installLocation) {
      log.debug(
        `No ${registryKey} for '${displayName}'`
      )
      continue
    }

    const executableShimPaths =
      diffTool.installLocationRegistryKey === 'DisplayIcon'
        ? [getCleanInstallLocationFromDisplayIcon(installLocation)]
        : diffTool.executableShimPaths.map(p =>
            Path.join(installLocation, ...p)
          )

    for (const path of executableShimPaths) {
      const exists = await pathExists(path)
      if (exists) {
        return path
      }

      log.debug(`Executable for ${diffTool.name} not found at '${path}'`)
    }
  }

  return undefined
}

/**
 * Lookup known external diff tools using the Windows registry to find installed
 * applications and their location on disk for Desktop to launch.
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
