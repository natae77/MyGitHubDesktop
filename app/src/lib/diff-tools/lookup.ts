import { ExternalDiffToolError } from './shared'
import { IFoundDiffTool } from './found-diff-tool'
import { getAvailableDiffTools as getAvailableDiffToolsDarwin } from './darwin'
import { getAvailableDiffTools as getAvailableDiffToolsWindows } from './win32'
import { getAvailableDiffTools as getAvailableDiffToolsLinux } from './linux'

let diffToolCache: ReadonlyArray<IFoundDiffTool<string>> | null = null

/**
 * Resolve a list of installed diff tools on the user's machine, using the known
 * install identifiers that each OS supports.
 */
export async function getAvailableDiffTools(): Promise<
  ReadonlyArray<IFoundDiffTool<string>>
> {
  if (diffToolCache && diffToolCache.length > 0) {
    return diffToolCache
  }

  if (__DARWIN__) {
    diffToolCache = await getAvailableDiffToolsDarwin()
    return diffToolCache
  }

  if (__WIN32__) {
    diffToolCache = await getAvailableDiffToolsWindows()
    return diffToolCache
  }

  if (__LINUX__) {
    diffToolCache = await getAvailableDiffToolsLinux()
    return diffToolCache
  }

  log.warn(
    `Platform not currently supported for resolving diff tools: ${process.platform}`
  )

  return []
}

/**
 * Find a diff tool installed on the machine using the friendly name, or the
 * first valid diff tool if `null` is provided.
 *
 * Will throw an error if the diff tool name cannot be found (i.e. it has been removed).
 */
export async function findDiffToolOrDefault(
  name: string | null
): Promise<IFoundDiffTool<string> | null> {
  const diffTools = await getAvailableDiffTools()
  if (diffTools.length === 0) {
    return null
  }

  if (name) {
    const match = diffTools.find(p => p.editor === name) || null
    if (!match) {
      const menuItemName = __DARWIN__ ? 'Settings' : 'Options'
      const message = `The diff tool '${name}' could not be found. Please open ${menuItemName} and choose an available diff tool.`

      throw new ExternalDiffToolError(message, { openPreferences: true })
    }

    return match
  }

  return diffTools[0]
}
