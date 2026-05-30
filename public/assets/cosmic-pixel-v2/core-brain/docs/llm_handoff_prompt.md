# Handoff Prompt for Coding LLM

You are continuing the 2ndB app build.
Apply the attached `2ndB_core_brain_ui_pack_v2` as the visual and interaction basis for the `/core-brain` screen.

Hard requirements:

1. Keep the existing product structure: Core Brain → domains → masks/personas → records/wiki data points.
2. Use user-facing title `나의 중심` while keeping internal route names if needed.
3. Show the Core screen as a connection map, not a score dashboard.
4. Implement evidence visibility with `이걸 만든 조각들`.
5. Persona detail must support `who / for whom / goal / do / fuel`.
6. Add handoff to `/jarvis` with Core Brain context when the user taps `세컨비에게 이 중심으로 묻기`.
7. Avoid clinical/therapy/diagnosis language. Use self-understanding/growth language.
8. Preserve Cosmic Pixel Graph Village palette and mobile-first layout.

Start by integrating:

- `css/core-brain-v2.css`
- `components/CoreBrainScreenSkeleton.tsx` as a structural reference
- `mockups/mobile_core_overview_390x844.svg` as the target visual reference
- `layout/core_brain_layout_example.json` for section order and data contract
