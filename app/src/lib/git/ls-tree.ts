import { git } from './core'
import { Repository } from '../../models/repository'
import { IFileTreeNode } from '../app-state'

/**
 * Get the list of tracked files at HEAD using `git ls-tree`.
 * Returns a flat list of relative paths.
 */
export async function getTrackedFiles(
  repository: Repository
): Promise<ReadonlyArray<string>> {
  const result = await git(
    ['ls-tree', '-r', '--name-only', 'HEAD'],
    repository.path,
    'getTrackedFiles',
    { successExitCodes: new Set([0, 128]) }
  )

  // unborn HEAD (no commits yet)
  if (result.exitCode === 128) {
    return []
  }

  const output = result.stdout.trim()
  if (output.length === 0) {
    return []
  }

  return output.split('\n')
}

/**
 * Build a hierarchical tree structure from a flat list of file paths.
 * Each path is relative to the repository root (e.g., "app/src/index.ts").
 *
 * Sorting: folders first, then files, each group alphabetically (case-insensitive).
 */
export function buildFileTree(
  paths: ReadonlyArray<string>
): ReadonlyArray<IFileTreeNode> {
  const root: Map<string, any> = new Map()

  for (const filePath of paths) {
    const parts = filePath.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1

      if (!current.has(part)) {
        current.set(part, isLast ? null : new Map())
      } else if (!isLast && current.get(part) === null) {
        // edge case: file path shadows a directory
        current.set(part, new Map())
      }

      if (!isLast) {
        current = current.get(part)
      }
    }
  }

  return buildNodesFromMap(root, '')
}

function buildNodesFromMap(
  map: Map<string, any>,
  parentPath: string
): ReadonlyArray<IFileTreeNode> {
  const nodes: IFileTreeNode[] = []

  for (const [name, value] of map) {
    const fullPath = parentPath ? `${parentPath}/${name}` : name

    if (value instanceof Map) {
      nodes.push({
        name,
        path: fullPath,
        type: 'tree',
        children: buildNodesFromMap(value, fullPath),
      })
    } else {
      nodes.push({
        name,
        path: fullPath,
        type: 'blob',
      })
    }
  }

  return sortFileTreeNodes(nodes)
}

/**
 * Sort nodes: folders first, then files, each group alphabetically (case-insensitive).
 * Matches P4V/VS Code convention.
 */
function sortFileTreeNodes(
  nodes: ReadonlyArray<IFileTreeNode>
): ReadonlyArray<IFileTreeNode> {
  return [...nodes].sort((a, b) => {
    // folders first
    if (a.type === 'tree' && b.type !== 'tree') {
      return -1
    }
    if (a.type !== 'tree' && b.type === 'tree') {
      return 1
    }
    // alphabetical within same type (case-insensitive)
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  })
}
