import * as React from 'react'
import classNames from 'classnames'

import { CommittedFileChange } from '../../models/status'
import { mapStatus } from '../../lib/status'
import { PathLabel } from '../lib/path-label'
import { Octicon, iconForStatus } from '../octicons'
import { TooltippedContent } from '../lib/tooltipped-content'
import { TooltipDirection } from '../lib/tooltip'

interface ICommittedFileItemProps {
  readonly availableWidth: number
  readonly file: CommittedFileChange
  readonly focused: boolean
  readonly isFilterMatched?: boolean
}

export class CommittedFileItem extends React.Component<ICommittedFileItemProps> {
  public render() {
    const { file, focused, isFilterMatched } = this.props
    const { status } = file
    const fileStatus = mapStatus(status)

    const listItemPadding = 10 * 2
    const statusWidth = 16
    const filterMatchWidth = isFilterMatched ? 20 : 0
    const filePathPadding = 5
    const availablePathWidth =
      this.props.availableWidth -
      listItemPadding -
      filePathPadding -
      statusWidth -
      filterMatchWidth

    return (
      <div className={classNames('file', { 'filter-matched': isFilterMatched })}>
        <PathLabel
          path={file.path}
          status={file.status}
          availableWidth={availablePathWidth}
          ariaHidden={true}
        />
        <TooltippedContent
          ancestorFocused={focused}
          openOnFocus={true}
          tooltip={fileStatus}
          direction={TooltipDirection.NORTH}
        >
          <Octicon
            symbol={iconForStatus(status)}
            className={'status status-' + fileStatus.toLowerCase()}
          />
        </TooltippedContent>
        {isFilterMatched && (
          <span className="filter-match-indicator" aria-label="Matches filter">
            ★
          </span>
        )}
      </div>
    )
  }
}
