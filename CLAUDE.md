# Repository Context for Claude

## SimonK-stack (반드시 먼저 읽을 것)

이 레포는 **SimonK-stack 프레임워크**를 git 서브모듈로 포함합니다.

- **위치**: `./SimonK-stack/`
- **Upstream**: https://github.com/Simon-YHKim/SimonK-stack
- **내용**: 100+ Claude Code 스킬 (`./SimonK-stack/skills-src/<name>/SKILL.md`), 하네스 오케스트레이션, 템플릿

### 사용자가 "SimonK Stack" / "SimonK 스택" / 특정 스킬(`simonk`, `ship`, `wiki-query` 등)을 언급하면

1. `./SimonK-stack/` 디렉토리를 먼저 확인하세요.
2. 비어있거나 누락된 경우:
   ```bash
   git submodule update --init --recursive
   ```
3. 최신 동기화:
   ```bash
   git submodule update --remote SimonK-stack
   ```

### ⚠️ 헷갈리지 말 것

- `origin/SimonK-stack-legacy` 라는 **빈 브랜치**가 존재합니다 (구버전, 무시).
- "SimonK Stack"은 MCP 도구 모음이 아니라, **이 서브모듈**을 의미합니다.

### 스킬 인덱스 빠른 참조

- 자율 실행 하네스: `./SimonK-stack/skills-src/simonk/`
- 전체 목록: `ls ./SimonK-stack/skills-src/`
- 인덱스: `./SimonK-stack/.claude/skills/INDEX.md`
