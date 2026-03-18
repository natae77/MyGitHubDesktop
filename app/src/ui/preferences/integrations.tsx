import * as React from 'react'
import { DialogContent } from '../dialog'
import { LinkButton } from '../lib/link-button'
import { Row } from '../../ui/lib/row'
import { Select } from '../lib/select'
import { Shell, parse as parseShell } from '../../lib/shells'
import { suggestedExternalEditor } from '../../lib/editors/shared'
import { suggestedExternalDiffTool } from '../../lib/diff-tools/shared'
import { CustomIntegrationForm } from './custom-integration-form'
import { ICustomIntegration } from '../../lib/custom-integration'
import { enableCustomIntegration } from '../../lib/feature-flag'

const CustomIntegrationValue = 'other'

interface IIntegrationsPreferencesProps {
  readonly availableEditors: ReadonlyArray<string>
  readonly selectedExternalEditor: string | null
  readonly availableShells: ReadonlyArray<Shell>
  readonly selectedShell: Shell
  readonly useCustomEditor: boolean
  readonly customEditor: ICustomIntegration
  readonly useCustomShell: boolean
  readonly customShell: ICustomIntegration
  readonly onSelectedEditorChanged: (editor: string) => void
  readonly onSelectedShellChanged: (shell: Shell) => void
  readonly onUseCustomEditorChanged: (useCustomEditor: boolean) => void
  readonly onCustomEditorChanged: (customEditor: ICustomIntegration) => void
  readonly onUseCustomShellChanged: (useCustomShell: boolean) => void
  readonly onCustomShellChanged: (customShell: ICustomIntegration) => void
  readonly availableDiffTools: ReadonlyArray<string>
  readonly selectedExternalDiffTool: string | null
  readonly useCustomDiffTool: boolean
  readonly customDiffTool: ICustomIntegration
  readonly onSelectedDiffToolChanged: (diffTool: string) => void
  readonly onUseCustomDiffToolChanged: (useCustomDiffTool: boolean) => void
  readonly onCustomDiffToolChanged: (customDiffTool: ICustomIntegration) => void
}

interface IIntegrationsPreferencesState {
  readonly selectedExternalEditor: string | null
  readonly selectedShell: Shell
  readonly useCustomEditor: boolean
  readonly customEditor: ICustomIntegration
  readonly useCustomShell: boolean
  readonly customShell: ICustomIntegration
  readonly selectedExternalDiffTool: string | null
  readonly useCustomDiffTool: boolean
  readonly customDiffTool: ICustomIntegration
}

export class Integrations extends React.Component<
  IIntegrationsPreferencesProps,
  IIntegrationsPreferencesState
> {
  private customEditorFormRef = React.createRef<CustomIntegrationForm>()
  private customShellFormRef = React.createRef<CustomIntegrationForm>()
  private customDiffToolFormRef = React.createRef<CustomIntegrationForm>()

  public constructor(props: IIntegrationsPreferencesProps) {
    super(props)

    this.state = {
      selectedExternalEditor: this.props.selectedExternalEditor,
      selectedShell: this.props.selectedShell,
      useCustomEditor: this.props.useCustomEditor,
      customEditor: this.props.customEditor,
      useCustomShell: this.props.useCustomShell,
      customShell: this.props.customShell,
      selectedExternalDiffTool: this.props.selectedExternalDiffTool,
      useCustomDiffTool: this.props.useCustomDiffTool,
      customDiffTool: this.props.customDiffTool,
    }
  }

  public async componentWillReceiveProps(
    nextProps: IIntegrationsPreferencesProps
  ) {
    const editors = nextProps.availableEditors
    let selectedExternalEditor = nextProps.selectedExternalEditor
    if (editors.length) {
      const indexOf = selectedExternalEditor
        ? editors.indexOf(selectedExternalEditor)
        : -1
      if (indexOf === -1) {
        selectedExternalEditor = editors[0]
        nextProps.onSelectedEditorChanged(selectedExternalEditor)
      }
    }

    const shells = nextProps.availableShells
    let selectedShell = nextProps.selectedShell
    if (shells.length) {
      const indexOf = shells.indexOf(selectedShell)
      if (indexOf === -1) {
        selectedShell = shells[0]
        nextProps.onSelectedShellChanged(selectedShell)
      }
    }
    const diffTools = nextProps.availableDiffTools
    let selectedExternalDiffTool = nextProps.selectedExternalDiffTool
    if (diffTools.length) {
      const indexOf = selectedExternalDiffTool
        ? diffTools.indexOf(selectedExternalDiffTool)
        : -1
      if (indexOf === -1) {
        selectedExternalDiffTool = diffTools[0]
        nextProps.onSelectedDiffToolChanged(selectedExternalDiffTool)
      }
    }

    this.setState({
      selectedExternalEditor,
      selectedShell,
      useCustomEditor: nextProps.useCustomEditor,
      useCustomShell: nextProps.useCustomShell,
      customShell: nextProps.customShell,
      customEditor: nextProps.customEditor,
      selectedExternalDiffTool,
      useCustomDiffTool: nextProps.useCustomDiffTool,
      customDiffTool: nextProps.customDiffTool,
    })
  }

  public componentDidMount(): void {
    if (enableCustomIntegration()) {
      const {
        availableEditors,
        availableShells,
        useCustomEditor,
        useCustomShell,
      } = this.props

      // When there are no available editors or shells, the `Select` component
      // will have the custom editor or shell already selected, but we need
      // to handle that as initial value, otherwise the custom integration
      // form won't be rendered.

      if (availableEditors.length === 0 && !useCustomEditor) {
        this.setSelectedEditor(CustomIntegrationValue)
      }

      if (availableShells.length === 0 && !useCustomShell) {
        this.setSelectedShell(CustomIntegrationValue)
      }

      const { availableDiffTools, useCustomDiffTool } = this.props
      if (availableDiffTools.length === 0 && !useCustomDiffTool) {
        this.setSelectedDiffTool(CustomIntegrationValue)
      }
    }
  }

  public componentDidUpdate(
    prevProps: IIntegrationsPreferencesProps,
    prevState: IIntegrationsPreferencesState
  ): void {
    // When the user switches to the custom editor or shell, we want to focus the
    // path input field.
    if (!prevState.useCustomEditor && this.state.useCustomEditor) {
      this.customEditorFormRef.current?.focus()
    }

    if (!prevState.useCustomShell && this.state.useCustomShell) {
      this.customShellFormRef.current?.focus()
    }

    if (!prevState.useCustomDiffTool && this.state.useCustomDiffTool) {
      this.customDiffToolFormRef.current?.focus()
    }
  }

  private onSelectedEditorChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = event.currentTarget.value
    if (!value) {
      return
    }

    this.setSelectedEditor(value)
  }

  private setSelectedEditor = (editor: string) => {
    if (editor === CustomIntegrationValue) {
      this.setState({ useCustomEditor: true })
      this.props.onUseCustomEditorChanged(true)
    } else {
      this.setState({
        useCustomEditor: false,
        selectedExternalEditor: editor,
      })
      this.props.onUseCustomEditorChanged(false)
      this.props.onSelectedEditorChanged(editor)
    }
  }

  private onSelectedShellChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = event.currentTarget.value
    if (!value) {
      return
    }

    this.setSelectedShell(value)
  }

  private setSelectedShell = (shell: string) => {
    if (shell === CustomIntegrationValue) {
      this.setState({ useCustomShell: true })
      this.props.onUseCustomShellChanged(true)
    } else {
      const parsedValue = parseShell(shell)
      this.setState({
        useCustomShell: false,
        selectedShell: parsedValue,
      })
      this.props.onSelectedShellChanged(parsedValue)
      this.props.onUseCustomShellChanged(false)
    }
  }

  private renderExternalEditor() {
    const options = this.props.availableEditors
    const { selectedExternalEditor, useCustomEditor } = this.state
    const label = __DARWIN__ ? 'External Editor' : 'External editor'

    if (!enableCustomIntegration() && options.length === 0) {
      // this is emulating the <Select/> component's UI so the styles are
      // consistent for either case.
      //
      // TODO: see whether it makes sense to have a fallback UI
      // which we display when the select list is empty
      return (
        <div className="select-component no-options-found">
          <label>{label}</label>
          <span>
            No editors found.{' '}
            <LinkButton uri={suggestedExternalEditor.url}>
              Install {suggestedExternalEditor.name}?
            </LinkButton>
          </span>
        </div>
      )
    }

    return (
      <Select
        label={enableCustomIntegration() ? undefined : label}
        aria-label="External editor"
        value={
          useCustomEditor
            ? CustomIntegrationValue
            : selectedExternalEditor ?? undefined
        }
        onChange={this.onSelectedEditorChanged}
      >
        {options.map(n => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        {enableCustomIntegration() && (
          <option key={CustomIntegrationValue} value={CustomIntegrationValue}>
            {__DARWIN__
              ? 'Configure Custom Editor…'
              : 'Configure custom editor…'}
          </option>
        )}
      </Select>
    )
  }

  private renderNoExternalEditorHint() {
    const options = this.props.availableEditors
    if (options.length > 0) {
      return null
    }

    return (
      <Row>
        <div className="no-options-found">
          <span>
            No other editors found.{' '}
            <LinkButton uri={suggestedExternalEditor.url}>
              Install {suggestedExternalEditor.name}?
            </LinkButton>
          </span>
        </div>
      </Row>
    )
  }

  private renderCustomExternalEditor() {
    return (
      <Row>
        <CustomIntegrationForm
          id="custom-editor"
          ref={this.customEditorFormRef}
          path={this.state.customEditor.path ?? ''}
          arguments={this.state.customEditor.arguments}
          onPathChanged={this.onCustomEditorPathChanged}
          onArgumentsChanged={this.onCustomEditorArgumentsChanged}
        />
      </Row>
    )
  }

  private onCustomEditorPathChanged = (path: string, bundleID?: string) => {
    const customEditor: ICustomIntegration = {
      path,
      bundleID,
      arguments: this.state.customEditor.arguments ?? [],
    }

    this.setState({ customEditor })
    this.props.onCustomEditorChanged(customEditor)
  }

  private onCustomEditorArgumentsChanged = (args: string) => {
    const customEditor: ICustomIntegration = {
      path: this.state.customEditor.path,
      bundleID: this.state.customEditor.bundleID,
      arguments: args,
    }

    this.setState({ customEditor })
    this.props.onCustomEditorChanged(customEditor)
  }

  private renderSelectedShell() {
    const options = this.props.availableShells
    const { selectedShell, useCustomShell } = this.state

    return (
      <Select
        label={enableCustomIntegration() ? undefined : 'Shell'}
        aria-label="Shell"
        value={useCustomShell ? CustomIntegrationValue : selectedShell}
        onChange={this.onSelectedShellChanged}
      >
        {options.map(n => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        {enableCustomIntegration() && (
          <option key={CustomIntegrationValue} value={CustomIntegrationValue}>
            {__DARWIN__ ? 'Configure Custom Shell…' : 'Configure custom shell…'}
          </option>
        )}
      </Select>
    )
  }

  private renderCustomShell() {
    return (
      <Row>
        <CustomIntegrationForm
          id="custom-shell"
          ref={this.customShellFormRef}
          path={this.state.customShell.path}
          arguments={this.state.customShell.arguments}
          onPathChanged={this.onCustomShellPathChanged}
          onArgumentsChanged={this.onCustomShellArgumentsChanged}
        />
      </Row>
    )
  }

  private onCustomShellPathChanged = (path: string, bundleID?: string) => {
    const customShell: ICustomIntegration = {
      path,
      bundleID,
      arguments: this.state.customShell.arguments ?? [],
    }

    this.setState({ customShell })
    this.props.onCustomShellChanged(customShell)
  }

  private onCustomShellArgumentsChanged = (args: string) => {
    const customShell: ICustomIntegration = {
      path: this.state.customShell.path ?? '',
      bundleID: this.state.customShell.bundleID,
      arguments: args,
    }

    this.setState({ customShell })
    this.props.onCustomShellChanged(customShell)
  }

  private onSelectedDiffToolChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = event.currentTarget.value
    if (!value) {
      return
    }

    this.setSelectedDiffTool(value)
  }

  private setSelectedDiffTool = (diffTool: string) => {
    if (diffTool === CustomIntegrationValue) {
      this.setState({ useCustomDiffTool: true })
      this.props.onUseCustomDiffToolChanged(true)
    } else {
      this.setState({
        useCustomDiffTool: false,
        selectedExternalDiffTool: diffTool,
      })
      this.props.onUseCustomDiffToolChanged(false)
      this.props.onSelectedDiffToolChanged(diffTool)
    }
  }

  private renderExternalDiffTool() {
    const options = this.props.availableDiffTools
    const { selectedExternalDiffTool, useCustomDiffTool } = this.state
    const label = __DARWIN__ ? 'External Diff Tool' : 'External diff tool'

    if (!enableCustomIntegration() && options.length === 0) {
      return (
        <div className="select-component no-options-found">
          <label>{label}</label>
          <span>
            No diff tools found.{' '}
            <LinkButton uri={suggestedExternalDiffTool.url}>
              Install {suggestedExternalDiffTool.name}?
            </LinkButton>
          </span>
        </div>
      )
    }

    return (
      <Select
        label={enableCustomIntegration() ? undefined : label}
        aria-label="External diff tool"
        value={
          useCustomDiffTool
            ? CustomIntegrationValue
            : selectedExternalDiffTool ?? undefined
        }
        onChange={this.onSelectedDiffToolChanged}
      >
        {options.map(n => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        {enableCustomIntegration() && (
          <option key={CustomIntegrationValue} value={CustomIntegrationValue}>
            {__DARWIN__
              ? 'Configure Custom Diff Tool…'
              : 'Configure custom diff tool…'}
          </option>
        )}
      </Select>
    )
  }

  private renderNoExternalDiffToolHint() {
    const options = this.props.availableDiffTools
    if (options.length > 0) {
      return null
    }

    return (
      <Row>
        <div className="no-options-found">
          <span>
            No other diff tools found.{' '}
            <LinkButton uri={suggestedExternalDiffTool.url}>
              Install {suggestedExternalDiffTool.name}?
            </LinkButton>
          </span>
        </div>
      </Row>
    )
  }

  private renderCustomExternalDiffTool() {
    return (
      <Row>
        <CustomIntegrationForm
          id="custom-diff-tool"
          ref={this.customDiffToolFormRef}
          path={this.state.customDiffTool.path ?? ''}
          arguments={this.state.customDiffTool.arguments}
          onPathChanged={this.onCustomDiffToolPathChanged}
          onArgumentsChanged={this.onCustomDiffToolArgumentsChanged}
        />
      </Row>
    )
  }

  private onCustomDiffToolPathChanged = (path: string, bundleID?: string) => {
    const customDiffTool: ICustomIntegration = {
      path,
      bundleID,
      arguments: this.state.customDiffTool.arguments ?? [],
    }

    this.setState({ customDiffTool })
    this.props.onCustomDiffToolChanged(customDiffTool)
  }

  private onCustomDiffToolArgumentsChanged = (args: string) => {
    const customDiffTool: ICustomIntegration = {
      path: this.state.customDiffTool.path,
      bundleID: this.state.customDiffTool.bundleID,
      arguments: args,
    }

    this.setState({ customDiffTool })
    this.props.onCustomDiffToolChanged(customDiffTool)
  }

  public render() {
    if (!enableCustomIntegration()) {
      return (
        <DialogContent>
          <h2>Applications</h2>
          <Row>{this.renderExternalEditor()}</Row>
          <Row>{this.renderSelectedShell()}</Row>
          <Row>{this.renderExternalDiffTool()}</Row>
        </DialogContent>
      )
    }

    return (
      <DialogContent>
        <fieldset>
          <legend>
            <h2>{__DARWIN__ ? 'External Editor' : 'External editor'}</h2>
          </legend>
          <Row>{this.renderExternalEditor()}</Row>
          {this.state.useCustomEditor && this.renderCustomExternalEditor()}
          {this.renderNoExternalEditorHint()}
        </fieldset>
        <fieldset>
          <legend>
            <h2>Shell</h2>
          </legend>
          <Row>{this.renderSelectedShell()}</Row>
          {this.state.useCustomShell && this.renderCustomShell()}
        </fieldset>
        <fieldset>
          <legend>
            <h2>
              {__DARWIN__ ? 'External Diff Tool' : 'External diff tool'}
            </h2>
          </legend>
          <Row>{this.renderExternalDiffTool()}</Row>
          {this.state.useCustomDiffTool && this.renderCustomExternalDiffTool()}
          {this.renderNoExternalDiffToolHint()}
        </fieldset>
      </DialogContent>
    )
  }
}
