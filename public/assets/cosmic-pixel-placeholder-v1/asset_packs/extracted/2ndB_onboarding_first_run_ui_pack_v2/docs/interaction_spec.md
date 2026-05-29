# Interaction Spec

## Entry points

### New anonymous visitor

1. Landing or auth entry
2. Onboarding preview
3. Sign up / age gate if required
4. First shard prompt
5. Main graph

### Returning user with no records

1. Main graph empty state
2. CTA: first shard
3. Journal first-run mode
4. Save success
5. Main graph highlight

### Returning user with records

Skip onboarding and go to main graph.

## Step transitions

Use calm horizontal slide or fade transitions.
Avoid bouncy animation except for small “뽁” overshoot on CTA or character reveal.

## First shard save

Flow:

1. User writes one short line.
2. Validate text is non-empty.
3. Use existing safety/classification path.
4. Create journal record.
5. Show Momo event cue if companion pack is installed.
6. Navigate to graph with highlight.

## Skip behavior

Skip should:

- Mark onboarding as completed for this device/session.
- Navigate to main graph.
- If there are no records, show empty graph state and first shard CTA.

## Age gate behavior

- Validate date format.
- Verify age >= 18.
- Show a calm validation message if the user cannot continue.
- Avoid shaming language.
