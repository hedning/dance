import * as vscode from 'vscode'

import { commands, Mode } from './commands/index'


/** Name of the extension, used in commands and settings. */
export const extensionName = 'dance'

/**
 * Global state of the extension.
 */
export class Extension implements vscode.Disposable {
  enabled: boolean = false

  typeCommand: vscode.Disposable | undefined = undefined
  changeEditorCommand: vscode.Disposable | undefined = undefined

  currentCount: number = 0

  readonly modeMap = new Map<vscode.TextEditor, Mode>()
  readonly subscriptions: vscode.Disposable[] = []

  readonly normalModeLineDecoration = vscode.window.createTextEditorDecorationType({
    borderColor: new vscode.ThemeColor('editor.background'),
    borderStyle: 'solid',
    borderWidth: '2px',
    isWholeLine: true,
  })

  readonly primarySelectionDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.selectionBackground'),
  })

  readonly secondarySelectionDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.inactiveSelectionBackground'),
  })

  constructor() {
    this.setEnabled(vscode.workspace.getConfiguration(extensionName).get('enabled', true))
  }

  setEditorMode(editor: vscode.TextEditor, mode: Mode): Thenable<void> {
    if (this.modeMap.get(editor) === mode)
      return Promise.resolve()

    this.modeMap.set(editor, mode)

    if (mode !== Mode.Insert) {
      editor.setDecorations(this.normalModeLineDecoration, editor.selections)
    } else {
      editor.setDecorations(this.normalModeLineDecoration, [])
    }

    return vscode.commands.executeCommand('setContext', extensionName + '.mode', mode)
  }

  setMode(mode: Mode): Thenable<void> {
    const editor = vscode.window.activeTextEditor

    return editor === undefined
      ? Promise.resolve()
      : this.setEditorMode(editor, mode)
  }

  setEnabled(enabled: boolean) {
    if (enabled === this.enabled)
      return

    if (!enabled) {
      this.setMode(Mode.Disabled)
      this.changeEditorCommand!.dispose()
      this.subscriptions.splice(0).forEach(x => x.dispose())

      vscode.workspace.getConfiguration(extensionName).update('enabled', this.enabled = false)
    } else {
      this.setMode(Mode.Normal)
      this.changeEditorCommand = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor === undefined)
          return

        let mode = this.modeMap.get(editor)

        if (mode === undefined)
          this.modeMap.set(editor, mode = Mode.Normal)

        return this.setMode(mode)
      })

      vscode.window.onDidChangeTextEditorSelection(e => {
        if (this.modeMap.get(e.textEditor) !== Mode.Insert) {
          // Change how the lines look
          e.textEditor.setDecorations(this.normalModeLineDecoration, e.selections)

          // The secondary selections are slightly less visible
          e.textEditor.setDecorations(this.primarySelectionDecoration, [e.selections[0]])
          e.textEditor.setDecorations(this.secondarySelectionDecoration, e.selections.slice(1))
        } else {
          // In insert mode, we reset all decorations we applied previously
          e.textEditor.setDecorations(this.normalModeLineDecoration    , [])
          e.textEditor.setDecorations(this.primarySelectionDecoration  , [])
          e.textEditor.setDecorations(this.secondarySelectionDecoration, [])
        }
      })

      for (let i = 0; i < commands.length; i++)
        this.subscriptions.push(commands[i].register(this))

      vscode.workspace.getConfiguration(extensionName).update('enabled', this.enabled = true)
    }

    return this.enabled
  }

  dispose() {
    this.normalModeLineDecoration.dispose()
    this.primarySelectionDecoration.dispose()
    this.secondarySelectionDecoration.dispose()

    if (!this.enabled)
      return

    this.typeCommand!.dispose()
  }
}

export let state: Extension

export function activate(context: vscode.ExtensionContext) {
  state = new Extension()

  context.subscriptions.push(
    vscode.commands.registerCommand(extensionName + '.toggle', () => state.setEnabled(!state.enabled)),
  )

  if (process.env.VERBOSE_LOGGING === 'true') {
    // Log all commands we need to implement
    Promise.all([ vscode.commands.getCommands(true), import('../commands/index') ])
      .then(([registeredCommands, { commands }]) => {
        for (const command of Object.values(commands)) {
          if (registeredCommands.indexOf(command.id) === -1)
            console.warn('Command', command.id, 'is defined but not implemented.')
        }
      })
  }
}

export function deactivate() {
  state.dispose()
}