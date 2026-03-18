import { spawn } from 'child_process'
import { pathExists } from '../../ui/lib/path-exists'
import { ExternalDiffToolError, FoundDiffTool } from './shared'
import {
  ICustomIntegration,
} from '../custom-integration'

/**
 * Context describing what kind of diff to perform.
 */
export type DiffToolContext =
  | { kind: 'working-directory' }
  | { kind: 'commit'; sha: string; parentSHAs: ReadonlyArray<string> }
  | { kind: 'range'; baseSha: string; headSha: string }

function buildDiffToolArgs(
  toolPath: string,
  filePath: string,
  context: DiffToolContext
): ReadonlyArray<string> {
  // The --extcmd value is shell-evaluated by git, so paths with spaces
  // must be quoted to avoid being split by the shell.
  const quotedPath = toolPath.includes(' ') ? `"${toolPath}"` : toolPath
  const baseArgs = ['difftool', '--no-prompt', `--extcmd=${quotedPath}`]

  switch (context.kind) {
    case 'working-directory':
      return [...baseArgs, '--', filePath]
    case 'commit': {
      const parentSha = context.parentSHAs[0]
      return [...baseArgs, parentSha, context.sha, '--', filePath]
    }
    case 'range':
      return [...baseArgs, context.baseSha, context.headSha, '--', filePath]
  }
}

async function launchDiffToolProcess(
  repositoryPath: string,
  args: ReadonlyArray<string>,
  toolName: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('git', [...args], {
      cwd: repositoryPath,
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    let stderr = ''
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('error', reject)
    child.on('close', (code: number | null) => {
      if (code === 0 || code === null) {
        resolve()
      } else {
        reject(
          new Error(
            `git difftool exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`
          )
        )
      }
    })

    child.unref()
  }).catch((e: unknown) => {
    const label = __DARWIN__ ? 'Settings' : 'Options'
    log.error(
      `Error while launching diff tool ${toolName}`,
      e instanceof Error ? e : undefined
    )
    throw new ExternalDiffToolError(
      `Something went wrong while trying to start ${toolName}. Please open ${label} and try another diff tool.`,
      { openPreferences: true }
    )
  })
}

/**
 * Open a file diff in the desired external diff tool.
 *
 * @param repositoryPath The root path of the repository.
 * @param filePath The relative path of the file within the repository.
 * @param diffTool The external diff tool to launch.
 * @param context The context describing what to diff.
 */
export async function launchExternalDiffTool(
  repositoryPath: string,
  filePath: string,
  diffTool: FoundDiffTool,
  context: DiffToolContext
): Promise<void> {
  const exists = await pathExists(diffTool.path)
  const label = __DARWIN__ ? 'Settings' : 'Options'
  if (!exists) {
    throw new ExternalDiffToolError(
      `Could not find executable for ${diffTool.editor} at path '${diffTool.path}'. Please open ${label} and select an available diff tool.`,
      { openPreferences: true }
    )
  }

  const args = buildDiffToolArgs(diffTool.path, filePath, context)
  return launchDiffToolProcess(repositoryPath, args, `'${diffTool.editor}'`)
}

/**
 * Open a file diff in a custom external diff tool.
 *
 * @param repositoryPath The root path of the repository.
 * @param filePath The relative path of the file within the repository.
 * @param customDiffTool The custom diff tool configuration.
 * @param context The context describing what to diff.
 */
export async function launchCustomExternalDiffTool(
  repositoryPath: string,
  filePath: string,
  customDiffTool: ICustomIntegration,
  context: DiffToolContext
): Promise<void> {
  const exists = await pathExists(customDiffTool.path)
  const label = __DARWIN__ ? 'Settings' : 'Options'
  if (!exists) {
    throw new ExternalDiffToolError(
      `Could not find executable for custom diff tool at path '${customDiffTool.path}'. Please open ${label} and select an available diff tool.`,
      { openPreferences: true }
    )
  }

  const args = buildDiffToolArgs(customDiffTool.path, filePath, context)
  const toolName = `custom diff tool at path '${customDiffTool.path}'`
  return launchDiffToolProcess(repositoryPath, args, toolName)
}
