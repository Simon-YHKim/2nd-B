# Framework: <NAME>

> Batch produced via `docs/research/psychology-handoff.md`. Verified DOIs only. Replace every `<…>` placeholder before committing.

## Foundational Sources

1. <Author(s)> (<Year>). <Title>. <Journal/Publisher>. DOI: <https://doi.org/…>
2. …

## Recent Validation (last 10 years)

1. <Author(s)> (<Year>). <Title>. <Journal>. DOI: <https://doi.org/…>
2. …

## Korean-Context Adaptations

- <한국심리학회지 / equivalent academic Korean sources, with DOI or KCI link>
- …

## Age Range Coverage

- Child (0–12): <applicable | partially | not applicable> — <근거 한 줄>
- Adolescent (13–17): …
- Young Adult (18–29): …
- Adult (30–49): …
- Midlife (50–64): …
- Elderly (65+): …

## Application to 2nd-Brain

### Interview Question Examples (validated)

**Korean**
- <한국어 질문 예시 1>
- <한국어 질문 예시 2>

**English**
- <English question example 1>
- <English question example 2>

### Trait Extraction Cues
- <저널 엔트리에서 무엇을 보고 어떤 트레잇으로 매핑하는지>

### Advisor Guidance Patterns
- <Advisor 엔진이 이 프레임워크를 어떻게 활용해야 하는지>

## Cautions & Limitations

- <알려진 한계>
- <Cross-cultural validity 우려>
- <적용하면 안 되는 상황>

## Suggested `knowledge_sources` INSERT rows

```sql
insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale, summary_ko, summary_en, application_notes)
values
  (
    '<Title>',
    ARRAY['<Author 1>', '<Author 2>'],
    '<10.xxxx/xxxx>',
    'https://doi.org/<…>',
    '<framework_slug>',
    '<age_range>',
    '<ko|en|both>',
    '<한국어 요약 1–2문단>',
    '<English summary 1–2 paragraphs>',
    '<2nd-Brain 적용 노트>'
  );
```
