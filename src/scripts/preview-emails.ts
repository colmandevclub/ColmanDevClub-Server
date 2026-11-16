import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { renderEmail } from '../services/email/templates.js'
import type { EmailTemplateData, TemplateId } from '../schemas/email.js'

// Synthetic fixtures only. This script never loads env, credentials or a transport.
const origin = 'https://club.example'
const fullName = 'ישראל ישראלי'
const fixtures = {
  'registration-confirmation': {
    fullName,
    status: 'registered',
    setPasswordUrl: `${origin}/reset-password?token=preview-only&type=set_password`,
  },
  'admission-accepted': {
    fullName,
    academicYear: 'תשפ״ז 2026–2027',
    signInUrl: `${origin}/signin`,
  },
  'verify-email': { fullName, verificationUrl: `${origin}/verify-email?token=preview-only` },
  'reset-password': { fullName, resetPasswordUrl: `${origin}/reset-password?token=preview-only` },
  invite: {
    role: 'mentor',
    academicYear: 'תשפ״ז 2026–2027',
    inviteUrl: `${origin}/invite/preview-only`,
  },
} satisfies EmailTemplateData

const output = resolve('.email-preview')
await mkdir(output, { recursive: true })
const previews: (ReturnType<typeof renderEmail> & { name: string })[] = (
  Object.keys(fixtures) as TemplateId[]
).map((template) => ({
  name: template,
  ...renderEmail(template, fixtures[template], origin),
}))
previews.push({
  name: 'registration-confirmation-waitlisted',
  ...renderEmail(
    'registration-confirmation',
    {
      ...fixtures['registration-confirmation'],
      status: 'waitlisted',
    },
    origin,
  ),
})
for (const preview of previews) {
  await writeFile(resolve(output, `${preview.name}.html`), preview.html)
  await writeFile(resolve(output, `${preview.name}.txt`), preview.text)
}
await writeFile(
  resolve(output, 'index.html'),
  await readFile(new URL('./email-preview.html', import.meta.url), 'utf8'),
)
console.info('Synthetic email previews written to .email-preview/index.html')
