import * as React from 'react'
import { Branch, IAheadBehind } from '../../models/branch'
import { ComparisonMode } from '../../lib/app-state'

interface ICompareHeaderProps {
  /** The branch being compared against the current branch */
  readonly comparisonBranch: Branch
  /** Ahead/behind counts relative to current branch */
  readonly aheadBehind: IAheadBehind
  /** Current comparison mode */
  readonly comparisonMode: ComparisonMode
  /** Called when the user switches between ahead/behind tabs */
  readonly onComparisonModeChanged: (mode: ComparisonMode) => void
}

/**
 * Header shown above the commit list in Compare mode.
 * Displays the branch being compared and ahead/behind counts.
 */
export class CompareHeader extends React.Component<ICompareHeaderProps> {
  private onBehindClick = () => {
    this.props.onComparisonModeChanged(ComparisonMode.Behind)
  }

  private onAheadClick = () => {
    this.props.onComparisonModeChanged(ComparisonMode.Ahead)
  }

  public render() {
    const { comparisonBranch, aheadBehind, comparisonMode } = this.props

    return (
      <div className="compare-header">
        <div className="compare-branch-name">
          Comparing with <strong>{comparisonBranch.name}</strong>
        </div>
        <div className="compare-tabs">
          <button
            className={`compare-tab ${comparisonMode === ComparisonMode.Behind ? 'active' : ''}`}
            onClick={this.onBehindClick}
          >
            {`${aheadBehind.behind} behind`}
          </button>
          <button
            className={`compare-tab ${comparisonMode === ComparisonMode.Ahead ? 'active' : ''}`}
            onClick={this.onAheadClick}
          >
            {`${aheadBehind.ahead} ahead`}
          </button>
        </div>
      </div>
    )
  }
}
