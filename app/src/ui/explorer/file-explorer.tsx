import * as React from 'react'
import classNames from 'classnames'
import debounce from 'lodash/debounce'
import {
  TreeList,
  IFlattenedTreeRow,
  flattenTree,
  filterTree,
  getAllFolderPaths,
} from '../lib/list/tree-list'
import { IFileTreeNode } from '../../lib/app-state'
import { showContextualMenu, IMenuItem } from '../../lib/menu-item'
import { revealInFileManager } from '../../lib/app-shell'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { clipboard } from 'electron'
import * as Path from 'path'

interface IFileExplorerProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly fileTree: ReadonlyArray<IFileTreeNode>
  readonly expandedPaths: ReadonlySet<string>
  readonly selectedPath: string | null
  readonly currentBranchName: string | null
  readonly workingDirectoryChangedPaths: ReadonlySet<string>
  readonly isLoadingFileTree: boolean
  readonly onOpenInExternalEditor?: (fullPath: string) => void
}

interface IFileExplorerState {
  readonly filterText: string
  readonly debouncedFilterText: string
}

export class FileExplorer extends React.Component<
  IFileExplorerProps,
  IFileExplorerState
> {
  public constructor(props: IFileExplorerProps) {
    super(props)
    this.state = {
      filterText: '',
      debouncedFilterText: '',
    }
  }

  private applyFilter = debounce((text: string) => {
    this.setState({ debouncedFilterText: text })
  }, 150)

  private onFilterTextChanged = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const filterText = event.currentTarget.value
    this.setState({ filterText })
    this.applyFilter(filterText)
  }

  private onClearFilter = () => {
    this.setState({ filterText: '', debouncedFilterText: '' })
    this.applyFilter.cancel()
  }

  private onRootClick = () => {
    this.props.dispatcher.selectExplorerPath(
      this.props.repository,
      null,
      null
    )
  }

  private onRowClick = (row: IFlattenedTreeRow) => {
    if (row.isExpandable) {
      this.props.dispatcher.toggleExplorerFolder(
        this.props.repository,
        row.path
      )
    }

    // Select the path (both files and folders can be selected for filtering)
    this.props.dispatcher.selectExplorerPath(
      this.props.repository,
      row.path,
      row.node.type
    )
  }

  private onExpandToggle = (path: string) => {
    this.props.dispatcher.toggleExplorerFolder(this.props.repository, path)
  }

  private onRowContextMenu = (
    row: IFlattenedTreeRow,
    _event: React.MouseEvent
  ) => {
    const fullPath = Path.join(this.props.repository.path, row.path)
    const items: IMenuItem[] = [
      {
        label: 'Copy Path',
        action: () => clipboard.writeText(fullPath),
      },
      {
        label: 'Copy Relative Path',
        action: () => clipboard.writeText(row.path),
      },
      { type: 'separator' },
      {
        label: __DARWIN__
          ? 'Reveal in Finder'
          : __WIN32__
            ? 'Reveal in Explorer'
            : 'Open in File Manager',
        action: () => revealInFileManager(this.props.repository, row.path),
      },
    ]

    if (this.props.onOpenInExternalEditor && row.node.type === 'blob') {
      items.push({
        label: 'Open in External Editor',
        action: () => this.props.onOpenInExternalEditor!(fullPath),
      })
    }

    showContextualMenu(items)
  }

  private getFlattenedRows(): ReadonlyArray<IFlattenedTreeRow> {
    const { fileTree, expandedPaths } = this.props
    const { debouncedFilterText } = this.state

    if (debouncedFilterText.length > 0) {
      const filteredTree = filterTree(fileTree, debouncedFilterText)
      const autoExpandPaths = getAllFolderPaths(filteredTree)
      return flattenTree(filteredTree, autoExpandPaths)
    }

    return flattenTree(fileTree, expandedPaths)
  }

  public render() {
    const flattenedRows = this.getFlattenedRows()

    return (
      <div id="file-explorer">
        <div
          className={classNames('explorer-root-node', {
            selected: this.props.selectedPath === null,
          })}
          onClick={this.onRootClick}
        >
          <span className="root-icon">🔀</span>
          <span className="root-label">
            {this.props.currentBranchName ?? 'HEAD'}
          </span>
        </div>
        <div className="explorer-search">
          <input
            type="text"
            className="explorer-filter-input"
            placeholder="Filter files..."
            value={this.state.filterText}
            onChange={this.onFilterTextChanged}
            aria-label="Filter files"
          />
          {this.state.filterText.length > 0 && (
            <button
              className="explorer-filter-clear"
              onClick={this.onClearFilter}
              aria-label="Clear filter"
            >
              ×
            </button>
          )}
        </div>
        <div className="explorer-tree">
          {this.renderContent(flattenedRows)}
        </div>
      </div>
    )
  }

  private renderContent(
    flattenedRows: ReadonlyArray<IFlattenedTreeRow>
  ): JSX.Element {
    if (this.props.isLoadingFileTree) {
      return <div className="explorer-placeholder">Loading file tree…</div>
    }

    if (this.props.fileTree.length === 0) {
      return <div className="explorer-placeholder">No files yet</div>
    }

    if (flattenedRows.length === 0 && this.state.debouncedFilterText.length > 0) {
      return (
        <div className="explorer-placeholder">
          No files matching "{this.state.debouncedFilterText}"
        </div>
      )
    }

    return (
      <TreeList
        flattenedRows={flattenedRows}
        selectedPath={this.props.selectedPath}
        filterText={this.state.debouncedFilterText}
        workingDirectoryChangedPaths={this.props.workingDirectoryChangedPaths}
        onRowClick={this.onRowClick}
        onRowContextMenu={this.onRowContextMenu}
        onExpandToggle={this.onExpandToggle}
      />
    )
  }
}
