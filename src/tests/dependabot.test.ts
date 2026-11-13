import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'

// Reuse the YAML parser already provided by Vitest's Vite dependency without
// adding a production dependency solely for configuration tests.
const require = createRequire(import.meta.url)
const requireFromVitest = createRequire(require.resolve('vitest/package.json'))
const requireFromVite = createRequire(requireFromVitest.resolve('vite/package.json'))
interface Update {
  'package-ecosystem': string
  directory: string
  schedule: Record<string, string>
  'open-pull-requests-limit'?: number
  groups?: Record<string, { patterns?: string[]; 'update-types'?: string[] }>
  ignore?: { 'dependency-name': string; 'update-types'?: string[] }[]
  'commit-message'?: { prefix: string }
}

const { parseDocument } = requireFromVite('yaml') as {
  parseDocument(source: string): {
    errors: unknown[]
    toJS(): { version: number; updates: Update[] }
  }
}

const document = parseDocument(
  readFileSync(new URL('../../.github/dependabot.yml', import.meta.url), 'utf8'),
)
const config = document.toJS()

function updateFor(ecosystem: string) {
  const matches = config.updates.filter(
    (update: Update) => update['package-ecosystem'] === ecosystem,
  )
  expect(matches, `Expected exactly one ${ecosystem} update entry`).toHaveLength(1)
  return matches[0]!
}

describe('Dependabot configuration', () => {
  it('is valid YAML using the supported configuration version', () => {
    expect(document.errors).toEqual([])
    expect(config.version).toBe(2)
  })

  it('covers npm and GitHub Actions exactly once', () => {
    expect(config.updates).toHaveLength(2)
    updateFor('npm')
    updateFor('github-actions')
  })

  it.each(['npm', 'github-actions'])('checks %s at the repository root', (ecosystem) => {
    expect(updateFor(ecosystem).directory).toBe('/')
  })

  it('checks pnpm dependencies monthly', () => {
    expect(updateFor('npm').schedule).toEqual({ interval: 'monthly' })
  })

  it('limits concurrent dependency update pull requests to two', () => {
    expect(updateFor('npm')['open-pull-requests-limit']).toBe(2)
  })

  it('groups all minor and patch updates together', () => {
    expect(updateFor('npm').groups).toEqual({
      'all-deps': { patterns: ['*'], 'update-types': ['minor', 'patch'] },
    })
  })

  it('ignores major upgrades for every dependency', () => {
    expect(updateFor('npm').ignore).toEqual([
      { 'dependency-name': '*', 'update-types': ['version-update:semver-major'] },
    ])
  })

  it('keeps major upgrades out of every dependency update group', () => {
    const groups = Object.values(updateFor('npm').groups ?? {})
    expect(groups.length).toBeGreaterThan(0)
    for (const group of groups) {
      // An omitted update-types filter would also group major upgrades.
      expect(group['update-types']).toBeInstanceOf(Array)
      expect(group['update-types']).not.toContain('major')
    }
  })

  it('checks GitHub Actions monthly in one group', () => {
    const actions = updateFor('github-actions')
    expect(actions.schedule.interval).toBe('monthly')
    expect(actions.groups).toEqual({ actions: { patterns: ['*'] } })
  })

  it('uses the npm commit prefix deps', () => {
    expect(updateFor('npm')['commit-message']?.prefix).toBe('deps')
  })
})
