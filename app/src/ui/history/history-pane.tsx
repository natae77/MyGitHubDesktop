import * as React from 'react'
import { Repository } from '../../models/repository'
import { Commit, CommitOneLine } from '../../models/commit'
import { CommittedFileChange } from '../../models/status'
import { IDiff, ImageDiffType } from '../../models/diff'
import { Dispatcher } from '../dispatcher'
import { IExplorerState, IConstrainedValue, ICompareState } from '../../lib/app-state'
import { IChangesetData } from '../../lib/git'
import { CommitList } from './commit-list'
import { FileList } from './file-list'
import { SeamlessDiffSwitcher } from '../diff/seamless-diff-switcher'
import { Account } from '../../models/account'
import { Emoji } from '../../lib/emoji'
import { isRepositoryWithGitHubRepository } from '../../models/repository'
import { GitHubRepository } from '../../models/github-repository'
import { openFile } from '../lib/open-file'
import { ThrottledScheduler } from '../lib/throttled-scheduler'

interface IHistoryPaneProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly emoji: Map<string, Emoji>

  /** Explorer state for path-filtered history */
  readonly explorerState: IExplorerState

  /** All commits loaded, keyed by SHA */
  readonly commitLookup: Map<string, Commit>

  /** The compare state for commit SHAs and branch comparison */
  readonly compareState: ICompareState

  /** Local (unpushed) commit SHAs */
  readonly localCommitSHAs: ReadonlyArray<string>

  /** Selected commit SHAs */
  readonly selectedCommitSHAs: ReadonlyArray<string>
  readonly shasInDiff: ReadonlyArray<string>
  readonly isContiguous: boolean

  /** Currently selected file in history diff */
  readonly selectedFile: CommittedFileChange | null
  readonly currentDiff: IDiff | null
  readonly changesetData: IChangesetData

  /** Width for the commit summary resizable */
  readonly commitSummaryWidth: IConstrainedValue

  /** Image diff type */
  readonly imageDiffType: ImageDiffType

  readonly hideWhitespaceInDiff: boolean
  readonly showSideBySideDiff: boolean

  readonly externalEditorLabel?: string
  readonly onOpenInExternalEditor: (fullPath: string) => void
  readonly onViewCommitOnGitHub: (SHA: string, filePath?: string) => void

  readonly onRevertCommit: (commit: Commit) => void
  readonly onAmendCommit: (commit: Commit, isLocalCommit: boolean) => void

  readonly isLocalRepository: boolean

  readonly localTags: Map<string, string> | null
  readonly tagsToPush: ReadonlyArray<string> | null

  readonly isMultiCommitOperationInProgress: boolean

  readonly accounts: ReadonlyArray<Account>

  readonly onCherryPick: (
    repository: Repository,
    commits: ReadonlyArray<CommitOneLine>
  ) => void
}

export class HistoryPane extends React.Component<IHistoryPaneProps> {
  private readonly loadChangedFilesScheduler = new ThrottledScheduler(200)

  public componentWillUnmount() {
    this.loadChangedFilesScheduler.clear()
  }

  private getCommitSHAs(): ReadonlyArray<string> {
    const { explorerState, compareState } = this.props

    // If explorer has a selected path, use filtered commits
    if (explorerState.selectedPath !== null) {
      return explorerState.filteredCommitSHAs
    }

    // Otherwise use the standard compare state commits
    return compareState.commitSHAs
  }

  private onCommitsSelected = (
    commits: ReadonlyArray<Commit>,
    isContiguous: boolean
  ) => {
    this.props.dispatcher.changeCommitSelection(
      this.props.repository,
      commits.map(c => c.sha),
      isContiguous
    )

    this.loadChangedFilesScheduler.queue(() => {
      this.props.dispatcher.loadChangedFilesForCurrentSelection(
        this.props.repository
      )
    })
  }

  private onScroll = (start: number, end: number) => {
    const commitSHAs = this.getCommitSHAs()
    const threshold = 10

    if (commitSHAs.length - end <= threshold) {
      const { explorerState } = this.props

      if (explorerState.selectedPath !== null) {
        // Load next filtered batch
        this.props.dispatcher.loadNextFilteredCommitBatch(this.props.repository)
      } else {
        // Load next regular batch
        this.props.dispatcher.loadNextCommitBatch(this.props.repository)
      }
    }
  }

  private getGitHubRepository(): GitHubRepository | null {
    const repo = this.props.repository
    if (isRepositoryWithGitHubRepository(repo)) {
      return repo.gitHubRepository
    }
    return null
  }

  private onOpenBinaryFile = (fullPath: string) => {
    openFile(fullPath, this.props.dispatcher)
  }

  private onOpenSubmodule = (fullPath: string) => {
    this.props.dispatcher.incrementMetric('openSubmoduleFromDiffCount')
    this.props.dispatcher.openOrAddRepository(fullPath)
  }

  private onChangeImageDiffType = (imageDiffType: ImageDiffType) => {
    this.props.dispatcher.changeImageDiffType(imageDiffType)
  }

  private onFileDoubleClick = () => {
    // No-op for now; could open file in external editor
  }

  private getSelectedCommits(): ReadonlyArray<Commit> {
    const commits: Commit[] = []
    for (const sha of this.props.selectedCommitSHAs) {
      const commit = this.props.commitLookup.get(sha)
      if (commit) {
        commits.push(commit)
      }
    }
    return commits
  }

  private renderEmptyMessage(): JSX.Element | string {
    const { explorerState } = this.props

    if (explorerState.isLoadingFilteredCommits) {
      return 'Loading commits…'
    }

    if (explorerState.selectedPath !== null) {
      return `No history for "${explorerState.selectedPath}"`
    }

    return 'No history'
  }

  public render() {
    const commitSHAs = this.getCommitSHAs()
    const selectedCommits = this.getSelectedCommits()
    const { explorerState } = this.props

    return (
      <div id="history-pane">
        <div className="history-top">
          <div className="history-commit-list">
            <CommitList
              gitHubRepository={this.getGitHubRepository()}
              commitSHAs={commitSHAs}
              commitLookup={this.props.commitLookup}
              selectedSHAs={this.props.selectedCommitSHAs}
              emoji={this.props.emoji}
              localCommitSHAs={this.props.localCommitSHAs}
              onCommitsSelected={this.onCommitsSelected}
              onScroll={this.onScroll}
              onRevertCommit={this.props.onRevertCommit}
              onAmendCommit={this.props.onAmendCommit}
              onViewCommitOnGitHub={sha => this.props.onViewCommitOnGitHub(sha)}
              emptyListMessage={this.renderEmptyMessage()}
              isLocalRepository={this.props.isLocalRepository}
              tagsToPush={this.props.tagsToPush ?? undefined}
              isMultiCommitOperationInProgress={this.props.isMultiCommitOperationInProgress}
              onCherryPick={commits =>
                this.props.onCherryPick(this.props.repository, commits)
              }
              accounts={this.props.accounts}
            />
          </div>
          {selectedCommits.length > 0 && (
            <div className="history-file-list">
              <FileList
                files={this.props.changesetData.files}
                onSelectedFileChanged={file =>
                  this.props.dispatcher.changeFileSelection(
                    this.props.repository,
                    file
                  )
                }
                onRowDoubleClick={this.onFileDoubleClick}
                selectedFile={this.props.selectedFile}
                availableWidth={300}
                explorerSelectedPath={explorerState.selectedPath}
              />
            </div>
          )}
        </div>
        {this.renderDiffViewer()}
      </div>
    )
  }

  private renderDiffViewer(): JSX.Element | null {
    const {
      currentDiff,
      selectedFile,
      repository,
      dispatcher,
      imageDiffType,
      hideWhitespaceInDiff,
      showSideBySideDiff,
    } = this.props

    if (currentDiff === null || selectedFile === null) {
      return null
    }

    return (
      <div className="history-bottom">
        <SeamlessDiffSwitcher
          repository={repository}
          readOnly={true}
          imageDiffType={imageDiffType}
          file={selectedFile}
          diff={currentDiff}
          hideWhitespaceInDiff={hideWhitespaceInDiff}
          showSideBySideDiff={showSideBySideDiff}
          showDiffCheckMarks={false}
          onOpenBinaryFile={this.onOpenBinaryFile}
          onOpenSubmodule={this.onOpenSubmodule}
          onChangeImageDiffType={this.onChangeImageDiffType}
          onHideWhitespaceInDiffChanged={hideWhitespace =>
            dispatcher.onHideWhitespaceInHistoryDiffChanged(
              hideWhitespace,
              repository,
              selectedFile
            )
          }
        />
      </div>
    )
  }
}
