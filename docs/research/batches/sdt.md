# Framework: Self-Determination Theory (SDT)

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref / publisher record (May 2026).

## Foundational Sources

1. Ryan, R. M., & Deci, E. L. (2000). Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being. *American Psychologist*, 55(1), 68–78. DOI: https://doi.org/10.1037/0003-066X.55.1.68
2. Deci, E. L., & Ryan, R. M. (2000). The "what" and "why" of goal pursuits: Human needs and the self-determination of behavior. *Psychological Inquiry*, 11(4), 227–268. DOI: https://doi.org/10.1207/S15327965PLI1104_01

**Note**: Deci & Ryan's foundational book *Intrinsic Motivation and Self-Determination in Human Behavior* (1985, Plenum) and *Self-Determination Theory: Basic Psychological Needs in Motivation, Development, and Wellness* (2017, Guilford) are books without single-paper DOIs.

## Recent Validation (last 10 years)

1. Vansteenkiste, M., Ryan, R. M., & Soenens, B. (2020). Basic psychological need theory: Advancements, critical themes, and future directions. *Motivation and Emotion*, 44(1), 1–31. DOI: https://doi.org/10.1007/s11031-019-09818-1

## Korean-Context Adaptations

- 이명희, 김아영 (2008). 자기결정성 이론에 근거한 한국 청소년의 기본 심리욕구 척도 개발 및 타당화. *한국심리학회지: 사회및성격*, 22(4), 157–174. DOI: https://doi.org/10.21193/kjspp.2008.22.4.010

## Age Range Coverage

SDT's three basic psychological needs (autonomy, competence, relatedness) are theorized as universal across the lifespan. Measurement varies by age.

- **Child (0–12)**: applicable — parent-rated or child-report adaptations exist; need-supportive parenting research is robust.
- **Adolescent (13–17)**: applicable — Korean BPNS for adolescents (이명희·김아영 2008) validated in middle/high school samples.
- **Young Adult (18–29)**: applicable — most-studied window.
- **Adult (30–49)**: applicable — work and relationship domains heavily studied.
- **Midlife (50–64)**: applicable — autonomy and competence remain central; relatedness shifts in salience.
- **Elderly (65+)**: applicable — autonomy-supportive eldercare research validated.

## Application to 2nd-Brain

### Interview Question Examples (validated)

Each need (autonomy, competence, relatedness) is probed separately. **Reflection prompts, not BPNS scoring.**

**Korean**
- 요즘 하루 중에 ''내가 정말 원해서 하는'' 일이라고 느끼는 시간이 얼마나 되시나요? (Autonomy)
- 일이나 공부, 운동 같은 영역에서 ''내가 잘 해내고 있다''고 느꼈던 최근 순간을 떠올려 보면 어떤 일이었어요? (Competence)
- 본인이 누군가에게 진심으로 받아들여진다고 느낀 최근 경험이 있다면 어떤 자리였어요? (Relatedness)
- ''해야 해서'' 하는 일과 ''하고 싶어서'' 하는 일의 비율이 본인 일상에서 어느 정도 되는 것 같으세요? (Autonomy quality)

**English**
- In a typical day, how much of what you do feels like something *you* genuinely chose? (Autonomy)
- Think of a recent moment where you felt you were doing something well — what was it? (Competence)
- When was the last time you felt truly accepted by someone? What was the setting? (Relatedness)
- Roughly, what fraction of your daily activity feels "have to" vs "want to"? (Autonomy quality)

### Trait Extraction Cues

- **Autonomy frustration**: frequent use of "have to", "should", "forced to"; passive-voice descriptions of decisions; resentment toward routine.
- **Autonomy satisfaction**: explicit choice language, willingness language ("I decided to"), endorsement of values behind actions.
- **Competence frustration**: frequent "I can't" or "I'm not good at"; avoidance of skill-domain content; comparison-based negative self-talk.
- **Competence satisfaction**: progress narratives, mastery moments, accurate self-assessment of growing skill.
- **Relatedness frustration**: loneliness vocabulary, mentions of disconnection, suppressed disclosure in close relationships.
- **Relatedness satisfaction**: warm relational specifics (named people, particular interactions), reciprocity descriptions.

Pattern stability across ≥10 entries before tagging.

### Advisor Guidance Patterns

- Diagnose the **need state** before suggesting actions. A user with autonomy frustration responding to "set a stricter routine" is being asked to deepen the problem.
- Match guidance to the deficient need:
  - **Autonomy-deficient** → reduce should-talk, surface authentic preferences, identify one task to either drop or reframe as chosen
  - **Competence-deficient** → smaller-scope tasks with visible progress, skill-building prompts, calibrated challenge
  - **Relatedness-deficient** → connection-action prompts (specific person, specific gesture), not generic "reach out more"
- Use Vansteenkiste et al. (2020) finding: need *frustration* (active thwarting) is more harmful than mere need *dissatisfaction* (absence). Distinguish in guidance — a user being actively controlled by an employer needs different support than a user who simply lacks autonomy-supportive contexts.
- For Korean users, validate the dual demand: 이명희·김아영 (2008) confirm the three needs apply in Korean adolescents, but autonomy must be parsed against family/social obligation context, not framed as pure self-expression.

## Cautions & Limitations

- **Not a productivity framework**: SDT is about well-being and intrinsic motivation, not extracting more output. Do not use it to justify "discover your true motivation so you can grind harder."
- **Cultural universality is empirical, not assumed**: need universality is supported across diverse samples (Vansteenkiste et al. 2020) but expression of autonomy in collectivist contexts differs. Autonomy ≠ individualism.
- **Intrinsic ≠ always better**: some tasks legitimately require external structure; SDT's nuance is *internalization* (taking external regulation and making it one's own), not pure intrinsic motivation everywhere.
- **Not a substitute for material conditions**: lack of autonomy in a coercive workplace is a structural problem, not a mindset to fix. Advisor should name this rather than reframing.
- **Not clinical**: need-frustration patterns correlate with depression/anxiety risk but do not diagnose. Route distress to Safety Classifier.

## Suggested `knowledge_sources` INSERT rows

See `supabase/seed/sdt.sql`.
