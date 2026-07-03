export const meta = {
  name: 'clone-gap-analysis',
  description: 'Per-screen visual fidelity gap analysis: reference capture vs current render + source',
  phases: [{ title: 'Analyze', detail: 'one agent per screen, visual + code diff' }],
}

const REPO = '/home/user/2nd-B'
const REF_CAP = `${REPO}/docs/clone-audit/reference-captures`
const CUR = `${REPO}/docs/clone-audit/current`
const REF_SRC = `${REPO}/docs/clone-audit/reference-handoff/reference-app`

// name, route, routeFile
const SCREENS = [
  ['01-auth', '/sign-in', 'src/app/(auth)/sign-in.tsx'],
  ['02-onboard', '/onboarding', 'src/app/onboarding.tsx'],
  ['03-ttfv', '/ttfv', 'src/app/ttfv.tsx'],
  ['05-home', '/deepspace-home', 'src/app/deepspace-home.tsx'],
  ['06-capture', '/capture', 'src/app/capture.tsx'],
  ['07-chat', '/secondb', 'src/app/secondb.tsx'],
  ['08-records', '/records', 'src/app/records.tsx'],
  ['09-settings', '/settings', 'src/app/settings.tsx'],
  ['10-me', '/persona', 'src/app/persona.tsx'],
  ['12-record', '/record/r1', 'src/app/record/[id].tsx'],
  ['13-interview', '/interview', 'src/app/interview.tsx'],
  ['14-bigfive', '/big-five', 'src/app/big-five.tsx'],
  ['15-attachment', '/attachment', 'src/app/attachment.tsx'],
  ['16-values', '/values', 'src/app/values.tsx'],
  ['17-audit', '/audit', 'src/app/audit.tsx'],
  ['18-trend', '/trends', 'src/app/trends.tsx'],
  ['19-motivation', '/motivation', 'src/app/motivation.tsx'],
  ['20-strengths', '/strengths', 'src/app/strengths.tsx'],
  ['21-northstar', '/northstar', 'src/app/northstar.tsx'],
  ['22-ratify', '/ratifications', 'src/app/ratifications.tsx'],
  ['23-iden', '/iden', 'src/app/iden.tsx'],
  ['24-ops', '/ops', 'src/app/ops.tsx'],
  ['25-focus', '/focus', 'src/app/focus.tsx'],
  ['26-reminders', '/reminders', 'src/app/reminders.tsx'],
  ['27-inbox', '/inbox', 'src/app/inbox.tsx'],
  ['28-connect', '/integrations', 'src/app/integrations.tsx'],
  ['29-import', '/import', 'src/app/import.tsx'],
  ['30-datareview', '/data', 'src/app/data.tsx'],
  ['31-callrec', '/call-reflection', 'src/app/call-reflection.tsx'],
  ['32-share', '/share-card', 'src/app/share-card.tsx'],
  ['33-plans', '/plans', 'src/app/plans.tsx'],
  ['34-museum', '/museum', 'src/app/museum.tsx'],
  ['36-imagine', '/imagine', 'src/app/imagine.tsx'],
]

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['screen', 'fidelityScore', 'verdict', 'realScreenModule', 'refSourceFile', 'topGaps'],
  properties: {
    screen: { type: 'string' },
    fidelityScore: { type: 'integer', description: '0-100, how close current render is to reference capture' },
    verdict: { type: 'string', enum: ['needs-full-rebuild', 'major-gaps', 'minor-gaps', 'close'] },
    realScreenModule: { type: 'string', description: 'the actual RN file that renders this screen (follow re-export), repo-relative' },
    refSourceFile: { type: 'string', description: 'reference-app/*.jsx file that defines this screen' },
    renderBroken: { type: 'boolean', description: 'true if current render shows an error / blank / wrong screen / auth redirect' },
    topGaps: {
      type: 'array',
      description: 'most important visual differences, most severe first',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['aspect', 'reference', 'current', 'fix'],
        properties: {
          aspect: { type: 'string', description: 'e.g. layout, navbar, statusbar, color, typography, copy, spacing, component, asset' },
          reference: { type: 'string' },
          current: { type: 'string' },
          fix: { type: 'string', description: 'concrete change to make in the RN screen' },
        },
      },
    },
  },
}

phase('Analyze')
const results = await parallel(
  SCREENS.map(([name, route, routeFile]) => () =>
    agent(
      `You are doing pixel-fidelity gap analysis for ONE screen of the 2nd-Brain app. The goal is to make the current React Native (Expo) app render IDENTICALLY to a finalized web reference prototype.

Screen: ${name} (route ${route}).

Do these steps:
1. Read the REFERENCE capture image (the target): ${REF_CAP}/${name}.png
2. Read the CURRENT app render: ${CUR}/${name}.png
3. Read the current route file: ${REPO}/${routeFile} — if it just re-exports a screen module/component, follow the import and read the ACTUAL screen module too (report its path as realScreenModule).
4. Find the reference source: search ${REF_SRC}/ for the JSX that defines this screen (grep a distinctive Korean string visible in the reference capture, or check sb-*.jsx). Read it to get exact copy, colors, layout, and component structure. Design tokens are in ${REF_SRC}/m3-theme.css; shared data/primitives in ${REF_SRC}/sb-data.jsx; shell (statusbar/navbar/companion/window-layout) in ${REF_SRC}/sb-app.jsx.

Then produce a structured gap report comparing CURRENT render to the REFERENCE target. Score fidelity 0-100 (100 = pixel identical). List the most important concrete differences (layout structure, bottom 5-tab navbar presence, status bar, colors vs m3 tokens, typography/fonts, EXACT Korean copy differences, spacing, missing/extra components, character asset). For each gap give a concrete fix in the RN screen. Be specific and terse. Do NOT edit any files — analysis only.`,
      { label: name, phase: 'Analyze', schema: SCHEMA, effort: 'medium' },
    ).then((r) => r || { screen: name, fidelityScore: -1, verdict: 'major-gaps', realScreenModule: routeFile, refSourceFile: '?', topGaps: [] }),
  ),
)

return results.filter(Boolean)
