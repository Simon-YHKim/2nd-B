# Framework: Habit Formation & Behavior Change

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref / publisher record (May 2026).
>
> **Scope.** Academic basis for how habits form, how long they take, what supports adoption, and how 2nd-Brain should design for sustained engagement *without manipulation*. Habit research is the lens through which engagement, streaks, reminders, and onboarding-to-routine conversion are evaluated. Cross-references — not duplications — exist to `sdt.md` (intrinsic motivation), `methodology/active-learning-hil.md` (notification budget), `data-ethics-consent.md` (dark-pattern boundary), `crisis-detection.md` (anhedonia / depression complication), and `cross-cultural-east-asian.md` (Korean cadence norms).
>
> **Trust score target**: Anchors the engagement-design layer of 2nd-Brain. Without this batch, "streaks", "reminders", and "tiny habits" risk being introduced as practitioner folklore (Tier D) rather than evidence-grounded design (Tier A/B).

## AI Retrieval Guide (for RAG / Wiki use)

**When user input suggests** → **look here**:

- "How long until this becomes a habit?" → §Lally 2010 (66-day median, 18–254 day range)
- "I missed a day, I should give up" → §Lally 2010 (one missed day does not reset)
- Cue-routine-reward / habit-goal mechanics → §Wood & Neal 2007, §Wood & Rünger 2016
- "I want to start X but never follow through" → §Gollwitzer 1999, §Gollwitzer & Sheeran 2006 (implementation intentions)
- Tiny / small-step framing → §Fogg 2009 (FBM: B = MAT)
- "Should we use streaks / points / badges?" → §Hamari/Koivisto/Sarsa 2014, §Koivisto & Hamari 2019, §Mekler 2017 (the trade-off literature)
- "Are notifications helping or hurting?" → cross-link to `methodology/active-learning-hil.md` (Mehrotra 2016, Pielot 2018)
- "Are these design choices manipulative?" → §Mathur 2019 + cross-link to `data-ethics-consent.md`
- Korean / East-Asian cadence (평일 vs 주말, family timing) → §Korean-Context, cross-link to `cross-cultural-east-asian.md`
- "User is showing low motivation / anhedonia" → cross-link to `crisis-detection.md` (do NOT pure-habit-coach)

---

## Foundational Sources

1. Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., & Wardle, J. (2010). How are habits formed: Modelling habit formation in the real world. *European Journal of Social Psychology*, 40(6), 998–1009. DOI: https://doi.org/10.1002/ejsp.674
   - **The "66 days" paper**. 96 participants chose an eating, drinking, or activity behavior to perform daily in a consistent context for 12 weeks; self-reported automaticity (Self-Report Habit Index) was modelled as an asymptotic curve. Median time to reach 95 % of plateau automaticity was **66 days**, with individual range **18 to 254 days**. Critically, **missing a single opportunity did not materially impair habit formation** — the asymptotic curve is robust to occasional gaps. This is the empirical anchor for every "build a habit in N days" claim, and the result that licenses 2nd-Brain's "missed day ≠ broken streak" policy.

2. Wood, W., & Neal, D. T. (2007). A new look at habits and the habit-goal interface. *Psychological Review*, 114(4), 843–863. DOI: https://doi.org/10.1037/0033-295X.114.4.843
   - **Theoretical core**. Habits are defined as *learned associations between contextual cues and responses*, acquired through repetition in stable contexts and executed with minimal conscious deliberation. The habit-goal interface frames the distinction: goals direct what we deliberately pursue; habits execute when context cues fire, regardless of current goals. This is the academic source for the popular "cue → routine → reward" loop (Duhigg's trade book popularises this work; cite Wood & Neal, not Duhigg).

3. Wood, W., & Rünger, D. (2016). Psychology of habit. *Annual Review of Psychology*, 67, 289–314. DOI: https://doi.org/10.1146/annurev-psych-122414-033417
   - **The standard review** of two decades of habit research. Confirms the dual-system architecture (deliberative goal pursuit vs context-cued automatic action), reviews neural correlates (basal ganglia, dorsolateral striatum), and frames the policy-relevant point: **changing the context is often more effective than trying to change the behaviour by willpower**. Discontinuity moments (move, new job, life transition) are when habits are most malleable — relevant to 2nd-Brain onboarding timing.

4. Verplanken, B., & Aarts, H. (1999). Habit, attitude, and planned behaviour: Is habit an empty construct or an interesting case of goal-directed automaticity? *European Review of Social Psychology*, 10(1), 101–134. DOI: https://doi.org/10.1080/14792779943000035
   - **Habit vs intention dissociation**. Establishes that when habit strength is high, behaviour is predicted more by past behaviour and context than by stated intentions or attitudes — i.e., asking users "do you intend to journal tomorrow?" loses predictive power as journaling becomes habitual. Methodologically grounded the Self-Report Habit Index used by Lally et al. (2010).

5. Gollwitzer, P. M. (1999). Implementation intentions: Strong effects of simple plans. *American Psychologist*, 54(7), 493–503. DOI: https://doi.org/10.1037/0003-066X.54.7.493
   - **The "if-then plan" paper**. Goal intentions ("I intend to X") are weak predictors of action; **implementation intentions** ("When situation Y occurs, I will perform behaviour Z") are dramatically stronger because they pre-link a contextual cue to a response — effectively a deliberate scaffold for habit formation. Mechanism: increased cue accessibility plus automated response initiation once the cue is encountered.

6. Gollwitzer, P. M., & Sheeran, P. (2006). Implementation intentions and goal achievement: A meta-analysis of effects and processes. *Advances in Experimental Social Psychology*, 38, 69–119. DOI: https://doi.org/10.1016/S0065-2601(06)38002-1
   - **The meta-analytic anchor**. 94 independent studies, *d* = 0.65 (medium-to-large effect) of implementation intentions on goal attainment over and above goal intentions alone. Establishes that the if-then plan effect is real, replicable, and substantial — and that it works through pre-specifying both *when/where* (cue) and *what* (response). Direct design implication: 2nd-Brain onboarding should ask the user to specify when and where they will journal, not just whether they intend to.

7. Fogg, B. J. (2009). A behavior model for persuasive design. In *Persuasive '09: Proceedings of the 4th International Conference on Persuasive Technology*, Article 40. ACM. DOI: https://doi.org/10.1145/1541948.1541999
   - **The Fogg Behaviour Model (FBM): B = MAT** — behaviour occurs when **M**otivation, **A**bility, and a **T**rigger converge at the same moment. Design implication: if a behaviour isn't happening, either motivation is too low, the behaviour is too hard, or no trigger fired. The "tiny habits" practitioner method popularised in Fogg's 2019 trade book derives from this conference paper — the trade book is Tier D (no peer-review DOI), but the 2009 conference paper is the citable source. Use this paper, not the book, in `knowledge_sources`.

---

## Recent Validation & Engagement-Design Evidence (last ~15 years)

8. Hamari, J., Koivisto, J., & Sarsa, H. (2014). Does gamification work? — A literature review of empirical studies on gamification. In *2014 47th Hawaii International Conference on System Sciences (HICSS)*, pp. 3025–3034. DOI: https://doi.org/10.1109/HICSS.2014.377
   - **First systematic gamification review**. 24 empirical studies. Conclusion: gamification *can* produce positive effects on motivation and engagement, but **effects depend heavily on context and user characteristics**, and several studies report null or negative effects. Streaks, points, and badges are not free wins.

9. Koivisto, J., & Hamari, J. (2019). The rise of motivational information systems: A review of gamification research. *International Journal of Information Management*, 45, 191–210. DOI: https://doi.org/10.1016/j.ijinfomgt.2018.10.013
   - **Five-year follow-up review**. 273 empirical studies. Most studies report positive *short-term* engagement effects, but **long-term engagement evidence is weak and heterogeneous**. Health and education domains show stronger effects than generic productivity domains. Cross-cultural variation in gamification reception is documented but under-theorised. Direct design caution: optimising for week-1 engagement via game mechanics may hurt week-12 retention if intrinsic motivation is crowded out.

10. Mekler, E. D., Brühlmann, F., Tuch, A. N., & Opwis, K. (2017). Towards understanding the effects of individual gamification elements on intrinsic motivation and performance. *Computers in Human Behavior*, 71, 525–534. DOI: https://doi.org/10.1016/j.chb.2015.08.048
    - **The "gamification can backfire" caveat with a published DOI**. Points, levels, and leaderboards increased *performance* on a task but did **not** enhance intrinsic motivation, perceived autonomy, or competence — and in some conditions reduced them. Connects directly to `sdt.md` (autonomy/competence/relatedness) — gamification that feels controlling thwarts the autonomy need it superficially appears to support. The empirical basis for 2nd-Brain's policy: no leaderboards, no public-ranking pressure, streaks framed as *evidence of consistency* not *currency to defend*.

11. Webb, T. L., Joseph, J., Yardley, L., & Michie, S. (2010). Using the internet to promote health behavior change: A systematic review and meta-analysis of the impact of theoretical basis, use of behavior change techniques, and mode of delivery on efficacy. *Journal of Medical Internet Research*, 12(1), e4. DOI: https://doi.org/10.2196/jmir.1376
    - **The digital-intervention meta-analysis**. 85 studies of internet-delivered behaviour-change interventions. Mean *d* = 0.16 — small but real. Interventions explicitly grounded in behaviour-change theory (especially Theory of Planned Behaviour, Social Cognitive Theory) produced larger effects than atheoretical ones; richer behaviour-change technique sets and more modes of delivery (text + email + SMS) also helped. Lesson for 2nd-Brain: theory-grounded design beats unguided "good ideas", but expect modest effect sizes — do not over-promise.

12. Mathur, A., Acar, G., Friedman, M. J., Lucherini, E., Mayer, J., Chetty, M., & Narayanan, A. (2019). Dark patterns at scale: Findings from a crawl of 11K shopping websites. *Proceedings of the ACM on Human-Computer Interaction*, 3(CSCW), Article 81. DOI: https://doi.org/10.1145/3359183
    - **The empirical map of manipulative UI**. Catalogues 15 dark-pattern types (false scarcity, confirmshaming, forced action, sneak-into-basket, etc.) observed across 11 K commercial sites. The 2nd-Brain relevance is the inverse: this paper specifies the patterns we must *not* deploy in service of habit formation. Cross-references `data-ethics-consent.md`. Engagement designed via dark patterns is excluded from the 2nd-Brain product surface regardless of measured short-term lift.

---

## Self-Determination Theory cross-link (not duplicated here)

See `batches/sdt.md` — Ryan & Deci (2000), Vansteenkiste, Ryan & Soenens (2020). The bridge to this batch:

- **Sustainability requires intrinsic motivation.** Extrinsic motivators (points, streaks, badges, social pressure) can drive short-term action but tend to crowd out intrinsic motivation over time when they signal control rather than competence. Mekler et al. (2017, this batch) is the empirical bridge — gamification elements that satisfied competence or autonomy needs sustained engagement; those that felt controlling did not.
- **Implementation intentions are compatible with autonomy** when the user authors them. Gollwitzer's if-then plan succeeds because the user freely commits to the cue → response link. A system that *imposes* the plan ("we'll remind you every day at 9 PM whether you like it or not") thwarts autonomy and predicts attrition.
- **2nd-Brain's habit layer must be need-supportive**, not need-thwarting. Practical heuristic: a habit feature is healthy if it strengthens the user's sense of "I'm doing this because it matters to me"; it is unhealthy if it strengthens "I'm doing this to avoid losing the streak."

---

## Notification & reminder design cross-link (not duplicated here)

See `methodology/active-learning-hil.md` §5 — Mehrotra et al. (2016, CHI '16; ACM DOI: 10.1145/2858036.2858566) and Pielot, Vradi & Park (2018, MobileHCI '18; ACM DOI: 10.1145/3229434.3229445). The bridge:

- Habit-formation literature says **a reliable trigger is necessary** (Fogg 2009, Lally 2010 implies context-stability).
- Notification literature says **users dismiss most notifications** and dismissal trains future dismissal.
- The resolved policy: **prefer context-based triggers (time-of-day + recent-activity inference) over volume**, cap reminders at the active-learning budget (≤1 habit-related notification per day, default off), and let the user author their own implementation intention rather than the system imposing one.

---

## Korean-Context Adaptations

Direct Korean-language peer-reviewed habit-formation literature (in the Lally-style replication sense) is thin; the broader Korean self-regulation and behaviour-change literature is more developed.

- **Korean replications and adjacent Korean work.** Korean academic publishing on habit and self-regulation has grown post-2015, but a direct Korean replication of Lally et al. (2010) with a published DOI is not yet established as of May 2026. For Korean-locale framing, this batch leans on:
  - `cross-cultural-east-asian.md` for cadence and obligation context (collectivist constraints on autonomy-styled habit framing).
  - `sdt.md` Korean BPNS (이명희·김아영 2008, DOI: 10.21193/kjspp.2008.22.4.010) for the autonomy-in-Korean-context caveat.
  - `cbt-rebt.md` Korean CBT meta (Kim & Jin 2019, DOI: 10.22143/HSS21.10.4.119) — confirms self-monitoring and reframing techniques generalise to Korean samples, an indirect endorsement of the underlying behaviour-change technique set.

- **평일 vs 주말 cadence.** Korean users frequently report different evening availability on weekdays (often 야근 / 회식 pressure) versus weekends. A rigid "every day at the same time" habit prescription has worse fit than a weekday/weekend dual-cadence prescription. This is product folklore not yet peer-reviewed; flag in §Cautions and treat as design heuristic rather than evidence claim until a Korean DOI is added.

- **Family / cohabitation context.** Korean adult users still living with parents (older-than-Western emerging-adulthood norms — see `emerging-adulthood.md` Côté 2014 critique and Korean K-IDEA work) often lack stable private context cues for journaling. Habit-formation prescriptions assuming a stable solo bedroom routine should be checked against this.

---

## Age Range Coverage

- **Child (0–12)**: applicable in principle (parental scaffolding shapes early habit formation), but **outside 2nd-Brain's user base** per C10 (18+).
- **Adolescent (13–17)**: applicable but **outside 2nd-Brain's user base** per C10.
- **Young Adult (18–29)**: applicable — Lally (2010) sample skewed to this range; emerging-adulthood discontinuity creates frequent habit-installation opportunities.
- **Adult (30–49)**: applicable — most-studied window; stable life context supports habit formation but competes with established habits that must be disrupted.
- **Midlife (50–64)**: applicable — habit formation works; the Wood & Rünger (2016) "context-change window" point applies (career transitions, children leaving, etc.).
- **Elderly (65+)**: applicable — habits are well-studied in older adults; cognitive-load reduction from automated routines is *more* valuable as executive function declines, but new-habit acquisition can take longer than the Lally median.

---

## Application to 2nd-Brain

### Engine pipeline placement

- **Engine 1 (Classifier) — pre-flight check.** If user content suggests anhedonia, severe depression, or the inability to derive reward from prior-liked activities, do **not** route into habit-coaching surfaces. Anhedonia complicates habit formation at the reward-loop level (Wood & Neal 2007's cue-response chain depends on context-paired reinforcement). Route per `crisis-detection.md`.
- **Engine 3 (Persona / state)** — track habit-formation phase (pre-installation, installation, plateau-approaching, plateau-stable) per user-stated practice, not per system score. Lally (2010) 66-day median is the *display anchor*, not a deadline.
- **Engine 4 (Advisor) — GREEN zone** — habit-formation guidance is appropriate. Use the patterns below.
- **Engine 5 (Onboarding) — implementation intention capture.** During the first session, capture (a) the behaviour the user wants to make habitual, (b) the cue (time + place + preceding event), (c) the response specification. This is Gollwitzer 1999 / Sheeran 2006 in product form.

### Onboarding: capture an implementation intention

The single highest-leverage product moment. Ask the user to complete an if-then sentence themselves:

```
When ___________________ (cue: time + place + preceding event)
I will ___________________ (specific 2nd-Brain behaviour, smallest viable size)
```

Default suggested cue templates (user can override):
- "When I sit down with my evening coffee" (preceding-event cue)
- "When I get into bed but before I open social apps" (location + state cue)
- "When I close the laptop after work" (preceding-event cue)

**Do not impose a cue**. Autonomy support (`sdt.md`) requires the user authors the plan.

### Tone for the 66-day finding

When users ask "how long until this is a habit?", the honest answer is:

- **English**: "In one study, the median was about 66 days, but it ranged from 18 to 254. Yours will probably be somewhere in there. One missed day doesn't break it."
- **Korean**: "한 연구에서는 새 행동이 자동화되는 데 보통 66일 정도 걸렸어요. 사람마다 18일에서 254일까지 차이가 있어요. 하루 빠진다고 처음부터 다시 시작하는 건 아니에요."

Never say "21 days" (Maltz folklore, no academic basis). Never imply a fixed deadline.

### Streaks: design rules grounded in the evidence

1. **Streaks display *consistency*, not *currency***. A streak is a count of consecutive days; it is not points the user "owns" and can "lose". Use language like "27 days consistent" not "27-day streak (don't break it!)".
2. **Missed days do not reset.** Lally (2010) shows one missed opportunity does not impair the asymptotic habit curve. The streak indicator should show the day as missed but the count continues (e.g., "26 days · 1 missed"). Hard resets create the shame-and-abandon pattern flagged in §Cautions.
3. **No public streaks, no social comparison.** Per Mekler et al. (2017), competitive/comparative gamification crowds out intrinsic motivation. Streaks are private to the user.
4. **No FOMO, no false scarcity, no confirmshaming** (Mathur et al. 2019 dark-pattern list). No "you'll lose 27 days of progress if you don't journal in the next 2 hours" notifications. Ever.
5. **Voice layer celebrates consistency, not perfection.** A 60 % adherence pattern over 90 days is a successful habit by Lally's automaticity model; treat it as such. The persona/Advisor voice should say "you've been steady" not "you missed 4 days this month".

### Notification cadence

Per the cross-link to `methodology/active-learning-hil.md`:

- Default: **no notifications at all** until the user has opted in to one.
- Maximum: **one habit-related notification per day**, at the user-authored cue time, opt-in only.
- **No follow-up notifications** if the first is dismissed (Pielot 2018: dismissal trains future dismissal).
- **No streak-loss notifications** under any circumstance (see streak rule 4).
- Korean-locale default: separate weekday vs weekend cue times (see §Korean-Context).

### Habit-installation Advisor patterns

When the user expresses installation intent, the Advisor should:

1. **Surface the implementation intention** if one exists; help the user write one if not.
2. **Right-size the behaviour** (Fogg 2009 ability axis). If the user proposes "journal 30 minutes every day," surface the trade-off: ability cost is high, attrition risk is high. Offer a smaller default (one entry, one sentence) and let the user scale up.
3. **Anchor to existing context cues**, not new ones. Wood & Rünger (2016): stable contexts produce stable habits.
4. **Frame the 66-day expectation explicitly** so the user does not interpret week-3 friction as failure.
5. **Schedule a 4-week check-in** for the user to reflect on whether the implementation intention is working, not to grade them.

### Habit-change (replacing an existing habit) Advisor patterns

For users trying to *change* a habit (e.g., stop doom-scrolling at night, replace evening alcohol with tea):

1. **Identify the current cue** (Wood & Neal 2007 habit-goal interface — change the cue or change the response, not "try harder").
2. **Use a discontinuity moment** if available (move, schedule change, new job — Wood & Rünger 2016).
3. **Recognise that goal intentions alone are weak** (Gollwitzer 1999) — author an if-then plan that pre-commits the replacement behaviour to the existing cue.
4. **Do not pathologise relapse.** Habit change is iterative; the 66-day curve assumes occasional misses.

### Trait extraction cues (journal entries)

- **Strong implementation-intention language**: "every morning when…", "I always…", "as soon as I get home, I…" → tag as habit-anchored behaviour.
- **Pure goal-intention language**: "I want to start…", "I'll try to…", "I should…" → tag as intention without scaffold; surface implementation-intention prompt.
- **Streak shame signals**: "I ruined my streak", "I broke my chain", "I have to start over" → reframe gently; do not affirm the reset framing.
- **Habit-formation friction at week 2–4**: normalise per Lally (2010). The motivation dip in this window is expected, not a failure signal.

### Cross-references

- `sdt.md` — intrinsic motivation is what makes habits sustainable; need-thwarting habit design backfires.
- `methodology/active-learning-hil.md` — notification budget and dismissal-fatigue evidence.
- `data-ethics-consent.md` — dark-pattern prohibition list; Mathur et al. (2019) is referenced from both ends.
- `crisis-detection.md` — anhedonia / depression complicates habit formation; route distress, do not habit-coach.
- `cross-cultural-east-asian.md` — Korean cadence and obligation context.
- `growth-mindset.md` — calibrated framing of "habit didn't form yet" as malleable rather than fixed-trait failure.
- `cbt-rebt.md` — when habit-formation friction is driven by distorted self-talk ("I always fail at this"), the GREEN-zone reframing path applies.
- `self-knowledge.md` — habit reflection vs habit rumination; per Trapnell & Campbell (1999), repeated journaling on "why I keep failing this habit" can tip into rumination. Switch frame after the third revisit.

---

## Cautions & Limitations

- **66 days is a median, not a deadline.** Range was 18 to 254 days (Lally 2010). Users whose habits take longer than 66 days are normal, not deficient. Any UI copy that implies "if you haven't formed the habit by day 66 you've failed" is empirically wrong and must not ship.
- **Self-report habit measurement is imperfect.** The Self-Report Habit Index (Verplanken & Aarts 1999, used by Lally 2010) measures perceived automaticity, not behavioural automaticity directly. Real-world automaticity in 2nd-Brain users will be observable from log data, but the published curve is on self-report.
- **Habit formation is highly variable across behaviours.** Simple eating/drinking behaviours formed faster than complex activity behaviours in Lally (2010). Journaling is closer to the complex end. Expect the user-specific median to skew toward the longer half of the range.
- **Gamification can crowd out intrinsic motivation** (Mekler 2017, Koivisto & Hamari 2019). Streaks, points, and badges that feel controlling reduce the autonomy need-satisfaction that sustains long-term engagement. Use minimally and frame as evidence, not currency.
- **Dark patterns are excluded regardless of measured lift.** Mathur et al. (2019) documents 15 manipulation types; 2nd-Brain's policy is exclusion, not "use sparingly". Engagement designed via manipulation forfeits the trust premise of the product.
- **Notification overuse is worse than under-use.** Pielot et al. (2018): dismissal trains dismissal. Default to off; require opt-in; cap at one per day.
- **Anhedonia / depression complicates habit formation.** Reward-loop habit formation (Wood & Neal 2007) depends on context-paired reinforcement. Users with reduced reward sensitivity may not form habits via the standard curve. Route distress per `crisis-detection.md`; do not pure-habit-coach over an underlying clinical pattern.
- **Cultural variation in self-discipline norms.** Habit and "discipline" carry different valences across cultures. Western individualist framings ("commit to yourself", "you alone are responsible") may be alienating to Korean users embedded in family-obligation contexts. See `cross-cultural-east-asian.md`.
- **Effect sizes for digital behaviour-change interventions are modest.** Webb et al. (2010) reports *d* = 0.16. Do not over-promise. 2nd-Brain habit features can plausibly produce real but modest sustained-engagement gains; "we'll change your life in 21 days" is both empirically wrong and dark-pattern adjacent.
- **Not a substitute for material conditions.** A user who cannot establish a stable evening cue because of shift work or caregiving load has a structural constraint, not a willpower deficit. Habit-coaching language must respect this — surface the constraint, do not blame the user.
- **Tier note on the popular literature.** Duhigg's *The Power of Habit* (2012) and Clear's *Atomic Habits* (2018) popularise this research but are trade books without single-paper DOIs. They are Tier D in the §3 schema; reference Wood & Neal (2007), Wood & Rünger (2016), and Lally (2010) instead. Fogg's *Tiny Habits* (2019) is similarly Tier D; cite Fogg (2009) Persuasive Technology paper instead.

---

## Suggested `knowledge_sources` INSERT rows

See `supabase/seed/habit-formation-change.sql` (to be generated alongside this batch). The intended row set covers:

- Lally et al. (2010) — habit formation 66-day median
- Wood & Neal (2007) — habit-goal interface
- Wood & Rünger (2016) — psychology of habit review
- Verplanken & Aarts (1999) — habit vs intention dissociation
- Gollwitzer (1999) — implementation intentions
- Gollwitzer & Sheeran (2006) — implementation-intentions meta
- Fogg (2009) — Fogg Behaviour Model (B = MAT)
- Hamari, Koivisto & Sarsa (2014) — gamification literature review
- Koivisto & Hamari (2019) — motivational information systems
- Mekler et al. (2017) — gamification elements and intrinsic motivation
- Webb et al. (2010) — internet behaviour-change meta
- Mathur et al. (2019) — dark patterns at scale

```sql
-- Example row (full set in supabase/seed/habit-formation-change.sql)
insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale, summary_ko, summary_en, application_notes)
values
  (
    'How are habits formed: Modelling habit formation in the real world',
    ARRAY['Phillippa Lally', 'Cornelia H. M. van Jaarsveld', 'Henry W. W. Potts', 'Jane Wardle'],
    '10.1002/ejsp.674',
    'https://doi.org/10.1002/ejsp.674',
    'habit_formation',
    'young_adult,adult',
    'en',
    '일상 환경에서 새로운 행동이 자동화되기까지 걸리는 시간을 측정한 연구. 참가자 96명의 자기보고 자동화 곡선을 분석한 결과, 95% 자동화에 도달하는 데 중앙값 66일(개인 범위 18–254일)이 걸렸다. 하루를 놓치는 것은 곡선에 의미 있는 영향을 주지 않았다.',
    'Real-world habit-formation study (N=96). Median time to reach 95% of asymptotic automaticity = 66 days, range 18–254 days. A single missed opportunity did not impair the curve. Anchors 2nd-Brain''s honest expectation-setting and the policy that missed days do not reset streaks.',
    'Display 66-day expectation as median, never as deadline. Do not reset streaks on missed days. Frame week 2–4 friction as expected, not as failure.'
  );
```

(Remaining 11 rows follow the same structure in the SQL seed file.)
