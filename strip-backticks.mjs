/**
 * House rule: no backticks in a DSH client bundle. They are only safe when
 * every occurrence sits in a comment, so this script proves that first and
 * refuses to touch a file where a backtick appears in live code.
 *
 * Usage: node strip-backticks.mjs <file...>
 */
import { readFileSync, writeFileSync } from 'node:fs'

let failed = false

for (const file of process.argv.slice(2)) {
  const source = readFileSync(file, 'utf8')
  const lines = source.split('\n')
  const bad = []

  lines.forEach((line, index) => {
    if (!line.includes('`')) return
    /* Strip the comment part and see whether the backtick survives in code. */
    const star = line.indexOf('*')
    const slash = line.indexOf('//')
    const commentAt = star >= 0 && (slash < 0 || star < slash) ? star : slash
    const code = commentAt >= 0 ? line.slice(0, commentAt) : line
    if (code.includes('`')) bad.push(index + 1)
  })

  if (bad.length > 0) {
    console.error('REFUSED ' + file + ' — backtick in code at line(s): ' + bad.join(', '))
    failed = true
    continue
  }

  if (!source.includes('`')) {
    console.log('clean    ' + file + ' (no backticks)')
    continue
  }

  const next = source.split('`').join("'")
  writeFileSync(file, next, 'utf8')
  console.log('cleaned  ' + file)
}

process.exit(failed ? 1 : 0)
