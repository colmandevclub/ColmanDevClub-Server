import { emailTemplateSchemas, type TemplateId } from '../../schemas/email.js'
import { emailTheme as theme } from './theme.js'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[character]!
  })
}

const roleLabels = {
  applicant: 'מועמד/ת',
  member: 'חבר/ת מועדון',
  mentor: 'מנטור/ית',
  admin: 'מנהל/ת',
} as const

const presentation = {
  'registration-confirmation': {
    label: 'אישור הרשמה',
    headline: ['ההרשמה שלך', 'נקלטה.'],
    leadParagraphs: 2,
  },
  'admission-accepted': {
    label: 'קבלה למועדון',
    headline: ['התקבלת.', 'ברוכים הבאים!'],
    leadParagraphs: 3,
  },
  'verify-email': {
    label: 'אימות כתובת המייל',
    headline: ['כמעט שם.', 'נשאר רק לאמת.'],
    leadParagraphs: 1,
  },
  'reset-password': {
    label: 'איפוס סיסמה',
    headline: ['חוזרים', 'לעניינים.'],
    leadParagraphs: 1,
  },
  invite: {
    label: 'הזמנה למועדון',
    headline: ['יש לך מקום', 'לבנות איתנו.'],
    leadParagraphs: 2,
  },
} as const

function templateContent(template: TemplateId, data: unknown) {
  switch (template) {
    case 'registration-confirmation': {
      const parsed = emailTemplateSchemas[template].parse(data)
      return {
        subject: 'קיבלנו את ההרשמה שלך למועדון הפיתוח',
        fullName: parsed.fullName,
        paragraphs: [
          parsed.status === 'registered'
            ? 'ההרשמה שלך ליום המיון נקלטה בהצלחה.'
            : 'ההרשמה שלך נקלטה ברשימת ההמתנה. כרגע אין יום מיון זמין.',
          'להגדרת סיסמה לחשבון שלך, יש לפתוח את הקישור הבא.',
          'הקישור מיועד לשימוש חד־פעמי ותוקפו שעה אחת.',
        ],
        action: 'הגדרת סיסמה',
        url: parsed.setPasswordUrl,
      }
    }
    case 'verify-email': {
      const parsed = emailTemplateSchemas[template].parse(data)
      return {
        subject: 'אימות כתובת המייל שלך במועדון הפיתוח',
        fullName: parsed.fullName,
        paragraphs: [
          'כדי להשלים את ההרשמה, יש לאמת את כתובת המייל שלך.',
          'הקישור מיועד לשימוש חד־פעמי ותוקפו 24 שעות.',
          'אם לא נרשמת למועדון, אפשר להתעלם מההודעה.',
        ],
        action: 'אימות כתובת המייל',
        url: parsed.verificationUrl,
      }
    }
    case 'admission-accepted': {
      const parsed = emailTemplateSchemas[template].parse(data)
      return {
        subject: 'התקבלת למועדון הפיתוח — ברוכים הבאים!',
        fullName: parsed.fullName,
        paragraphs: [
          'עברת את המיונים בהצלחה והתקבלת למועדון הפיתוח!',
          `נשמח לראות אותך איתנו בשנת הפעילות ${parsed.academicYear}.`,
          'אפשר להיכנס לחשבון כדי לראות את פרטי ההצטרפות שלך.',
          'אם כתובת המייל שלך עדיין לא אומתה, יש להשלים את האימות לפני קבלת גישה לתוכן לחברים.',
        ],
        action: 'לכניסה לחשבון',
        url: parsed.signInUrl,
      }
    }
    case 'reset-password': {
      const parsed = emailTemplateSchemas[template].parse(data)
      return {
        subject: 'איפוס הסיסמה שלך במועדון הפיתוח',
        fullName: parsed.fullName,
        paragraphs: [
          'קיבלנו בקשה לאיפוס הסיסמה לחשבון שלך.',
          'הקישור מיועד לשימוש חד־פעמי ותוקפו שעה אחת.',
          'אם לא ביקשת לאפס את הסיסמה, אפשר להתעלם מההודעה. הסיסמה שלך לא תשתנה.',
        ],
        action: 'איפוס סיסמה',
        url: parsed.resetPasswordUrl,
      }
    }
    case 'invite': {
      const parsed = emailTemplateSchemas[template].parse(data)
      return {
        subject: 'הזמנה להצטרף למועדון הפיתוח',
        fullName: parsed.fullName,
        paragraphs: [
          `הוזמנת להצטרף למועדון בתפקיד ${roleLabels[parsed.role]}, לשנת הפעילות ${parsed.academicYear}.`,
          'להשלמת ההצטרפות, יש לפתוח את הקישור הבא.',
          'הקישור מיועד לשימוש חד־פעמי ותוקפו 7 ימים.',
          'אם ההזמנה אינה מיועדת לך, אפשר להתעלם מההודעה.',
        ],
        action: 'קבלת ההזמנה',
        url: parsed.inviteUrl,
      }
    }
    default:
      throw new Error('Unknown email template')
  }
}

export function renderEmail(template: TemplateId, data: unknown, appOrigin: string) {
  const content = templateContent(template, data)
  // Callers supply links minted by their domain service. Never send a foreign origin.
  const origin = new URL(appOrigin)
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    new URL(content.url).origin !== origin.origin
  ) {
    throw new Error('Invalid email action origin')
  }

  const greeting = content.fullName ? `שלום ${content.fullName},` : 'שלום,'
  const footer = 'מועדון הפיתוח · המכללה למינהל'
  const design = presentation[template]
  const lead = content.paragraphs.slice(0, design.leadParagraphs)
  const details = content.paragraphs.slice(design.leadParagraphs)
  const noteTitle = template === 'admission-accepted' ? 'לפני שמתחילים' : 'קישור אישי. שימוש בטוח.'
  const html = `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(content.subject)}</title>
    <style>
      a:focus-visible { outline:3px solid ${theme.accentInk}; outline-offset:4px; }
      @media screen and (max-width:480px) {
        .mail-outer { padding:24px 12px !important; }
        .mail-brand { padding:0 4px 22px !important; }
        .mail-hero { padding:30px 24px !important; }
        .mail-title { font-size:32px !important; }
        .mail-inner { padding:28px 24px !important; }
        .mail-cta { display:block !important; text-align:center !important; }
        .mail-wordmark { font-size:18px !important; }
      }
    </style>
  </head>
  <body dir="rtl" style="margin:0;padding:0;background-color:${theme.page};color:${theme.ink};font-family:Arial,Helvetica,sans-serif;text-align:start;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(content.subject)}</div>
    <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:${theme.page};">
      <tr><td class="mail-outer" align="center" style="padding:40px 20px;">
        <table role="presentation" dir="rtl" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;">
          <tr><td class="mail-brand" style="padding:0 8px 28px;">
            <table role="presentation" dir="rtl" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td aria-hidden="true" width="40" style="width:40px;height:40px;border:1px solid ${theme.line};border-radius:12px;background-color:${theme.accentTint};text-align:center;color:${theme.accentInk};font:700 18px/40px 'Courier New',monospace;"><span dir="ltr">&lt;/&gt;</span></td>
                <td style="padding:0 12px;">
                  <p class="mail-wordmark" style="margin:0;color:${theme.ink};font-size:21px;font-weight:700;letter-spacing:-0.6px;"><bdi>ColmanDevClub</bdi></p>
                  <p style="margin:4px 0 0;color:${theme.inkMuted};font-size:12px;">מועדון הפיתוח · המכללה למינהל</p>
                </td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="border:1px solid ${theme.line};border-radius:22px;background-color:${theme.surface};overflow:hidden;">
            <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;">
              <tr><td class="mail-hero" style="padding:34px 40px 38px;border-radius:21px 21px 0 0;background-color:${theme.inkBand};background-image:linear-gradient(125deg,${theme.inkBand},${theme.accentInk});color:${theme.surface};">
                <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td style="vertical-align:middle;"><span style="display:inline-block;padding:7px 12px;border:1px solid ${theme.accent};border-radius:999px;color:${theme.accentTint};font-size:12px;line-height:18px;">${design.label}</span></td>
                    <td aria-hidden="true" width="52" style="width:52px;height:52px;border:1px solid ${theme.accent};border-radius:15px;background-color:${theme.inkBand};color:${theme.lineStrong};text-align:center;font:400 24px/52px 'Courier New',monospace;"><span dir="ltr">{&nbsp;}</span></td>
                  </tr>
                </table>
                <h1 class="mail-title" style="margin:26px 0 22px;color:${theme.surface};font-size:40px;font-weight:700;line-height:1.18;letter-spacing:-1px;">${design.headline.map(escapeHtml).join('<br>')}</h1>
                <table role="presentation" aria-hidden="true" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
                  <tr><td width="52" style="width:52px;height:3px;background-color:${theme.accentTint};font-size:0;line-height:0;">&nbsp;</td><td style="height:3px;background-color:${theme.accent};font-size:0;line-height:0;">&nbsp;</td></tr>
                </table>
              </td></tr>
              <tr><td class="mail-inner" style="padding:36px 40px 38px;">
                <p style="margin:0 0 14px;color:${theme.inkMuted};font-size:15px;line-height:1.8;">${content.fullName ? `שלום <bdi>${escapeHtml(content.fullName)}</bdi>,` : escapeHtml(greeting)}</p>
                ${lead.map((paragraph) => `<p style="margin:0 0 12px;color:${theme.ink};font-size:16px;line-height:1.8;">${escapeHtml(paragraph)}</p>`).join('\n                ')}
                <table role="presentation" dir="rtl" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 28px;width:100%;border-collapse:collapse;">
                  <tr><td><a class="mail-cta" href="${escapeHtml(content.url)}" style="display:inline-block;padding:16px 28px;border:1px solid ${theme.accent};border-radius:12px;background-color:${theme.accent};color:${theme.surface};font-size:16px;font-weight:700;line-height:22px;text-decoration:none;">${escapeHtml(content.action)}&nbsp; <span aria-hidden="true">&#8592;</span></a></td></tr>
                </table>
                <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
                  <tr><td style="padding:18px 20px;border:1px solid ${theme.line};border-radius:12px;background-color:${theme.accentTint};">
                    <p style="margin:0 0 7px;color:${theme.accentInk};font-size:12px;font-weight:700;line-height:1.6;">${noteTitle}</p>
                    ${details.map((paragraph) => `<p style="margin:0;color:${theme.inkMuted};font-size:13px;line-height:1.8;">${escapeHtml(paragraph)}</p>`).join('\n                    ')}
                  </td></tr>
                </table>
                <p style="margin:24px 0 8px;color:${theme.inkMuted};font-size:12px;line-height:1.8;">אם הכפתור אינו נפתח, אפשר להעתיק את הקישור לדפדפן:</p>
                <p dir="ltr" style="margin:0;word-break:break-all;overflow-wrap:anywhere;font-size:12px;line-height:1.8;"><a dir="ltr" href="${escapeHtml(content.url)}" style="color:${theme.accentInk};text-decoration:underline;">${escapeHtml(content.url)}</a></p>
              </td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:26px 16px 0;text-align:center;">
            <p style="margin:0 0 8px;color:${theme.ink};font-size:13px;font-weight:700;line-height:1.8;">לומדים, בונים ומפתחים יחד.</p>
            <p style="margin:0;color:${theme.inkMuted};font-size:11px;line-height:1.8;">${footer}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`

  return {
    subject: content.subject,
    html,
    text: [
      greeting,
      content.subject,
      ...content.paragraphs,
      `${content.action}:\n${content.url}`,
      footer,
    ].join('\n\n'),
  }
}
