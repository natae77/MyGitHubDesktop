import * as React from 'react'
import { List } from './list'
import { IFileTreeNode } from '../../../lib/app-state'

/** A flattened row representing a single visible node in the tree. */
export interface IFlattenedTreeRow {
  readonly node: IFileTreeNode
  readonly depth: number
  readonly isExpanded: boolean
  readonly isExpandable: boolean
  readonly path: string
}

/**
 * Flatten a hierarchical tree into a list of visible rows based on
 * which folders are currently expanded.
 *
 * Sorting: Each depth level has folders first, then files,
 * each group alphabetical (case-insensitive). This is already
 * handled by buildFileTree in ls-tree.ts, so we preserve order here.
 */
export function flattenTree(
  nodes: ReadonlyArray<IFileTreeNode>,
  expandedPaths: ReadonlySet<string>,
  depth: number = 0
): ReadonlyArray<IFlattenedTreeRow> {
  const rows: IFlattenedTreeRow[] = []

  for (const node of nodes) {
    const isExpandable = node.type === 'tree'
    const isExpanded = isExpandable && expandedPaths.has(node.path)

    rows.push({
      node,
      depth,
      isExpanded,
      isExpandable,
      path: node.path,
    })

    if (isExpanded && node.children) {
      const childRows = flattenTree(node.children, expandedPaths, depth + 1)
      rows.push(...childRows)
    }
  }

  return rows
}

/**
 * Filter the tree to only include nodes whose path matches the filter text,
 * plus their ancestor folders. Returns a new tree with non-matching
 * nodes removed.
 */
export function filterTree(
  nodes: ReadonlyArray<IFileTreeNode>,
  filterText: string
): ReadonlyArray<IFileTreeNode> {
  if (filterText.length === 0) {
    return nodes
  }

  const lowerFilter = filterText.toLowerCase()
  const result: IFileTreeNode[] = []

  for (const node of nodes) {
    if (node.type === 'blob') {
      if (node.path.toLowerCase().includes(lowerFilter)) {
        result.push(node)
      }
    } else {
      // For folders, recursively filter children
      const filteredChildren = node.children
        ? filterTree(node.children, filterText)
        : []
      if (filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren,
        })
      } else if (node.path.toLowerCase().includes(lowerFilter)) {
        // Folder name itself matches
        result.push(node)
      }
    }
  }

  return result
}

/**
 * Collect all folder paths in a tree (for auto-expanding during search).
 */
export function getAllFolderPaths(
  nodes: ReadonlyArray<IFileTreeNode>
): ReadonlySet<string> {
  const paths = new Set<string>()
  for (const node of nodes) {
    if (node.type === 'tree') {
      paths.add(node.path)
      if (node.children) {
        for (const p of getAllFolderPaths(node.children)) {
          paths.add(p)
        }
      }
    }
  }
  return paths
}

const TreeRowHeight = 30

interface ITreeListProps {
  readonly flattenedRows: ReadonlyArray<IFlattenedTreeRow>
  readonly selectedPath: string | null
  readonly filterText?: string
  readonly workingDirectoryChangedPaths?: ReadonlySet<string>
  readonly onRowClick: (row: IFlattenedTreeRow) => void
  readonly onRowContextMenu?: (row: IFlattenedTreeRow, event: React.MouseEvent) => void
  readonly onExpandToggle: (path: string) => void
}

interface ITreeListState {
  readonly selectedIndex: number
}

export class TreeList extends React.Component<
  ITreeListProps,
  ITreeListState
> {
  private listRef = React.createRef<List>()

  public constructor(props: ITreeListProps) {
    super(props)
    this.state = {
      selectedIndex: this.findSelectedIndex(props),
    }
  }

  public componentDidUpdate(prevProps: ITreeListProps) {
    if (prevProps.selectedPath !== this.props.selectedPath ||
        prevProps.flattenedRows !== this.props.flattenedRows) {
      const idx = this.findSelectedIndex(this.props)
      if (idx !== this.state.selectedIndex) {
        this.setState({ selectedIndex: idx })
      }
    }
  }

  private findSelectedIndex(props: ITreeListProps): number {
    if (props.selectedPath === null) {
      return -1
    }
    return props.flattenedRows.findIndex(r => r.path === props.selectedPath)
  }

  private onRowClick = (row: number, _source: unknown) => {
    const item = this.props.flattenedRows[row]
    if (item) {
      this.props.onRowClick(item)
    }
  }

  private onSelectedRowChanged = (row: number, _source: unknown) => {
    this.setState({ selectedIndex: row })
  }

  private rowRenderer = (row: number): JSX.Element | null => {
    const item = this.props.flattenedRows[row]
    if (!item) {
      return null
    }

    const { node, depth, isExpanded, isExpandable } = item
    const paddingLeft = depth * 16 + 8
    const isModified = this.props.workingDirectoryChangedPaths?.has(node.path) ?? false

    const icon = isExpandable
      ? isExpanded
        ? 'chevron-down'
        : 'chevron-right'
      : node.type === 'blob'
        ? 'file'
        : 'file-directory'

    const onExpandClick = (e: React.MouseEvent) => {
      e.stopPropagation()
      if (isExpandable) {
        this.props.onExpandToggle(item.path)
      }
    }

    return (
      <div
        className="tree-list-row"
        style={{ paddingLeft }}
        onContextMenu={
          this.props.onRowContextMenu
            ? (e: React.MouseEvent) => this.props.onRowContextMenu!(item, e)
            : undefined
        }
      >
        <span
          className={`tree-list-icon octicon octicon-${icon}`}
          onClick={onExpandClick}
        />
        <span className="tree-list-name">
          {this.renderName(node.name)}
        </span>
        {isModified && <span className="tree-list-modified-indicator" />}
      </div>
    )
  }

  private renderName(name: string): JSX.Element | string {
    const filterText = this.props.filterText
    if (!filterText || filterText.length === 0) {
      return name
    }

    const lowerName = name.toLowerCase()
    const lowerFilter = filterText.toLowerCase()
    const idx = lowerName.indexOf(lowerFilter)

    if (idx === -1) {
      return name
    }

    return (
      <>
        {name.substring(0, idx)}
        <mark>{name.substring(idx, idx + filterText.length)}</mark>
        {name.substring(idx + filterText.length)}
      </>
    )
  }

  private onRowKeyDown = (row: number, event: React.KeyboardEvent) => {
    const item = this.props.flattenedRows[row]
    if (!item) {
      return
    }

    if (event.key === 'ArrowRight' && item.isExpandable && !item.isExpanded) {
      event.preventDefault()
      this.props.onExpandToggle(item.path)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (item.isExpandable && item.isExpanded) {
        this.props.onExpandToggle(item.path)
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.props.onRowClick(item)
    }
  }

  public render() {
    const selectedRows = this.state.selectedIndex >= 0
      ? [this.state.selectedIndex]
      : []

    return (
      <div className="tree-list-container">
        <List
          ref={this.listRef}
          rowCount={this.props.flattenedRows.length}
          rowHeight={TreeRowHeight}
          rowRenderer={this.rowRenderer}
          selectedRows={selectedRows}
          onRowClick={this.onRowClick}
          onSelectedRowChanged={this.onSelectedRowChanged}
          onRowKeyDown={this.onRowKeyDown}
          selectionMode="single"
          setScrollTop={undefined}
          invalidationProps={this.props.flattenedRows}
        />
      </div>
    )
  }
}
