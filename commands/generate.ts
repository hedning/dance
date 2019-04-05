// @ts-ignore
import { load, CORE_SCHEMA } from 'js-yaml'
import { createWriteStream, readFileSync, WriteStream } from 'fs'


// File setup
// ===============================================================================================

const prefix = 'dance'
const header = 'Auto-generated by commands/generate.ts. Do not edit manually.'

const stream: WriteStream = createWriteStream('./commands/index.ts', 'utf8')
const doc   : WriteStream = createWriteStream('./commands/README.md', 'utf8')

stream.write(`// ${header}

/** A provided command. */
export interface ICommand {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly keybindings: { key: string, when: string }[]
}

`)

doc.write(`
Commands
========

<!-- ${header} -->

Commands are defined in [\`commands.yaml\`](./commands.yaml), and then exported
to VS Code-compatible [commands](https://code.visualstudio.com/api/extension-guides/command)
and [key bindings](https://code.visualstudio.com/docs/getstarted/keybindings).

They are implemented in [\`src/commands\`](../src/commands).

| ID | Title | Description | Key bindings |
| -- | ----- | ----------- | ------------ |
`)


// Data setup
// ===============================================================================================

interface Entry {
  title: string
  descr: string
  keys?: string
  add ?: string
}

const yaml: Record<string, Entry> = load(readFileSync('./commands/commands.yaml', 'utf8'), { schema: CORE_SCHEMA })

for (const id in yaml) {
  const command = yaml[id]

  if (command.descr == null)
    command.descr = command.title + '.'

  if (command.add && command.add.includes('extend')) {
    let title = command.title.replace('Select to', 'Extend to').replace('Select', 'Extend with')
    let descr = command.descr.replace('Select to', 'Extend to').replace('Select', 'Extend with')

    if (title === 'Extend with until') title = 'Extend until'

    if (title === command.title) title += ' (extend)'
    if (descr === command.descr) descr = descr.replace('.', ' (extend).')

    yaml[id + '.extend'] = {
      ...command,

      title, descr,
      keys: `s-${command.keys}`,
    }
  }
}

for (const id in yaml) {
  const command = yaml[id]

  if (command.add && command.add.includes('back')) {
    yaml[id + '.backwards'] = {
      ...command,
      title: `${command.title} (backwards)`,
      descr: `${command.descr} (backwards)`,
      keys: `a-${command.keys}`,
    }
  }
}

for (let i = 0; i < 10; i++) {
  yaml[`count.${i}`] = {
    title: `Count ${i}`,
    descr: `Adds ${i} to the current counter for the next operation.`,
    keys : `${i}`,
  }
}


// Generate TypeScript and Markdown files
// ===============================================================================================

const commands: string[] = []

const matches = (regex: RegExp, input: string) => {
  let m: RegExpExecArray[] = []
  let match: RegExpExecArray | null

  while (match = regex.exec(input))
    m.push(match)

  return m
}

const parseWhen = (when: string) => ({
  enabled: `${prefix}.mode != 'disabled'`,
  normal : `${prefix}.mode == 'normal'`,
  insert : `${prefix}.mode == 'insert'`,
} as any)[when]

const parseKey = (key: string) => key.replace('a-', 'Alt+').replace('s-', 'Shift+').replace('c-', 'Ctrl+')

const writable = (id: string) => id.replace(/\.\w/g, c => c.substr(1).toUpperCase())
const parseKeys = (key: string) => matches(/([\S]+) \((\w+)\)/g, key).map(x => ({ key: parseKey(x[1]), when: parseWhen(x[2]) }))

for (const id in yaml) {
  const command = yaml[id]
  const keys = parseKeys(command.keys || '')

  commands.push(id)

  stream.write(`/** ${command.descr} */\n`)
  stream.write(`export const ${writable(id)}: ICommand & { readonly id: '${prefix}.${id}' } = {\n`)
  stream.write(`  id         : '${prefix}.${id}',\n`)
  stream.write(`  title      : '${command.title}',\n`)
  stream.write(`  description: '${command.descr.replace("'", "\\'")}',\n`)

  if (command.keys) {
    stream.write(`  keybindings: [\n`)

    for (const key of keys) {
      stream.write(`    { key: '${key.key.replace('\\', '\\\\')}', when: '${key.when.replace(/'/g, '\\\'')}' },\n`)
    }

    stream.write(`  ],\n`)
  } else {
    stream.write('  keybindings: [],\n')
  }

  stream.write(`}\n`)

  const docKeys = keys
    .map(({ key, when }) => `\`${key.replace(/(\+|^)[a-z]/g, x => x.toUpperCase())}\` (\`${when}\`)`)
    .join(', ')

  doc.write(`| \`${prefix}.${id}\` | ${command.title} | ${command.descr} | ${docKeys} |\n`)
}


// Write footers and close streams
// ===============================================================================================

stream.write(`
/** All defined commands. */
export const commands = {
${commands.map(x => `  /** ${yaml[x].descr} */\n  ${writable(x)}`).join(',\n')}
}

/** An enum which maps command names to command IDs. */
export const enum Command {
${commands.map(x => `  /** ${yaml[x].descr} */\n  ${writable(x)} = '${prefix}.${x}'`).join(',\n')}
}
`)

doc.write('\n')

stream.close()
doc.close()