/**
 * A found external diff tool on the user's machine
 */
export type FoundDiffTool = {
  /**
   * The friendly name of the diff tool, to be used in labels
   */
  editor: string
  /**
   * The executable associated with the diff tool to launch
   */
  path: string
}

interface IErrorMetadata {
  /** The error dialog should link off to the default diff tool's website */
  suggestDefaultDiffTool?: boolean

  /** The error dialog should direct the user to open Preferences */
  openPreferences?: boolean
}

export class ExternalDiffToolError extends Error {
  /** The error's metadata. */
  public readonly metadata: IErrorMetadata

  public constructor(message: string, metadata: IErrorMetadata = {}) {
    super(message)

    this.metadata = metadata
  }
}

export const suggestedExternalDiffTool = {
  name: 'Beyond Compare',
  url: 'https://www.scootersoftware.com',
}
