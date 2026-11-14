import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'

it('S-0.6 type-checks the API entrypoint with the Vercel module resolver', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile)
  expect(config.error).toBeUndefined()
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  expect(parsed.errors).toEqual([])

  const options = { ...parsed.options, noEmit: true }
  const host = ts.createCompilerHost(options)
  // Vercel's Node builder uses this resolver without an ESM resolution mode:
  // https://github.com/vercel/vercel/blob/main/packages/node/src/typescript.ts
  host.resolveModuleNames = (names, containingFile) =>
    names.map((name) => ts.resolveModuleName(name, containingFile, options, ts.sys).resolvedModule)

  const program = ts.createProgram([join(root, 'src/app.ts')], options, host)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  const messages = ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  })
  expect(messages).toBe('')
})
