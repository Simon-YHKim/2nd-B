# LLM Handoff Prompt

You are implementing the first-run onboarding experience for 2ndB.

The visual direction is Cosmic Pixel Graph Village: a dark, cosmic, pixel-inspired graph village.
The app is not a game, and it should not look like a farming sim. It is a self-understanding, personal AI, and imagination-to-next-step tool.

Existing app constraints:
- Keep NavGraph as the main information model.
- Keep Core Brain / 나의 중심 as the center node.
- Keep SecondB / 세컨비 as the floating AI friend.
- Keep Journal, Capture, Wiki, Core Brain, Jarvis, Imagine routes.
- Page zoom is locked; graph zoom/pan is separate.
- Use semantic tokens; do not introduce random hardcoded colors if the project has a token layer.
- Avoid clinical or therapy language.

Implement:
1. `/onboarding` five-step flow.
2. Optional birth_date age gate if missing.
3. First-run empty graph state.
4. First shard save prompt.
5. Main graph handoff after first shard save.

Use these assets from:
`public/assets/cosmic-pixel-v2/onboarding/`

Start with the skeleton in `components/OnboardingFlowSkeleton.tsx`, but adapt it to the existing project architecture.
