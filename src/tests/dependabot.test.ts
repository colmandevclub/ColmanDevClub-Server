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
  groups?: Record<string, { 'update-types'?: string[] }>
  'commit-message': { prefix: string }
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

  it('checks pnpm dependencies every Sunday at 09:00 in Jerusalem', () => {
    expect(updateFor('npm').schedule).toEqual({
      interval: 'weekly',
      day: 'sunday',
      time: '09:00',
      timezone: 'Asia/Jerusalem',
    })
  })

  it('limits concurrent dependency update pull requests to five', () => {
    expect(updateFor('npm')['open-pull-requests-limit']).toBe(5)
  })

  it('groups minor and patch updates together', () => {
    expect(updateFor('npm').groups).toEqual({
      'minor-and-patch': { 'update-types': ['minor', 'patch'] },
    })
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

  it('checks GitHub Actions monthly', () => {
    expect(updateFor('github-actions').schedule.interval).toBe('monthly')
  })

  it.each([
    ['npm', 'deps'],
    ['github-actions', 'ci'],
  ])('uses the %s commit prefix %s', (ecosystem, prefix) => {
    expect(updateFor(ecosystem)['commit-message'].prefix).toBe(prefix)
  })
})
