# helmsman

[English](README.md) | [한국어](README.ko.md)

**긴 에이전트 작업을 항해하듯 운영하는 방식.**

Helmsman의 출발점은 단순합니다. 에이전트가 자율적으로 움직이기 전에, 먼저 항로가 명확해야 합니다.

대부분의 에이전트 세션은 긴 대화 하나에 너무 많은 책임을 밀어 넣습니다. 사용자가 요청하고, 모델이 해석하고, Research를 수행하고, 결정하고, 계획하고, 구현하고, 마지막에는 Verification까지 했다고 말합니다. 작은 일에서는 이 방식도 통합니다. 하지만 제품 판단, 여러 구현 경로, 파일 간 의존성, 다음 세션에 남겨야 할 교훈이 생기면 쉽게 무너집니다.

Helmsman은 작업을 세 가지 구간으로 나눕니다.

- **Charting:** 사용자와 리드 에이전트가 맥락을 읽고, Research를 조준하고 수행하며, Evidence 기반 Decision Bundle로 항로를 잠급니다.
- **Autopilot:** 에이전트들은 이미 정해진 항로 안에서 Strategy, Blueprint, Hardening, Audit, Execution, Repair, Verification을 수행합니다.
- **Wiki Memory:** 세션에서 얻은 판단과 근거를 프로젝트 기억으로 남겨, 다음 세션이 같은 Research를 반복하지 않게 합니다.

이건 프롬프트 템플릿이 아닙니다. 한 번 쓰고 사라지는 AI 작업을 반복 가능하고, 검토 가능하고, 누적되는 작업 흐름으로 바꾸는 규율입니다.

## 왜 필요한가

에이전트 작업은 대개 조용하고 익숙한 방식으로 실패합니다.

- 방향이 보이기 전에 모델이 먼저 동의합니다.
- 첫 요청이 명확해 보인다는 이유로 Research가 엉뚱한 방향으로 갑니다.
- Research가 결정의 입력이 아니라, 이미 내린 결정을 꾸미는 문장이 됩니다.
- 모호한 계획이 그대로 구현 부채가 됩니다.
- 검토가 "코드가 도는지"만 보고 "처음 약속을 지켰는지"는 놓칩니다.
- 쓸 만한 교훈이 닫힌 채팅 기록 안에서 사라지고, 다음 세션이 같은 Research를 반복합니다.

Helmsman은 에이전트 세션이 흔들리기 쉬운 경계마다 근거와 작업 기록을 남기게 만들어 이런 실패를 어렵게 합니다.

```text
사용자 의도
  -> Aperture Bundle
  -> Research Lane Contract
  -> Targeted Research
  -> Evidence
  -> Decision Bundle
  -> Route Lock
  -> Route Card
  -> Strategy
  -> Blueprint
  -> Hardening
  -> Blueprint Gate
  -> Audit
  -> Audit Decision
  -> Execution
  -> Verification
  -> Closeout + Wiki Memory
```

## 핵심 철학

### 자율 실행보다 먼저 방향을 맞춘다

목적지가 흐릿하면 자율 실행은 비용이 됩니다. Helmsman은 초반 구간을 사용자에게 가깝게 둡니다. 첫 요청을 읽고 바로 달리지 않습니다. 먼저 Aperture Bundle로 Research 각도를 좁히고, Evidence를 모은 뒤, Decision Bundle로 항로를 확정합니다. 나중에 실행 에이전트가 마음대로 만들어내면 안 되는 제품/기술 판단은 Route Card에 잠급니다.

항로 설정은 한 번 확인하고 지나가는 절차가 아니라, 필요하면 되돌아오는 과정입니다. Charting은 Research 전에 항상 항로의 방향을 사용자 앞에 드러냅니다. 내부 규칙 이름으로는 Always Aperture입니다. 상세한 첫 요청은 확인 질문 하나로 충분할 수 있고, 대략적인 요청은 여러 차례 질문이 필요할 수 있습니다. 질문은 한 번에 최대 4개만 묻고, 필요하면 다음 차례로 이어갑니다. Route Card가 목표, Research 범위, 위험, Verification 시나리오를 충분히 담아내지 못하면 자율 작업으로 넘기지 않고 다시 Charting으로 돌아갑니다.

`Query Resolution`은 질문을 생략하게 해주는 단계가 아닙니다. 내부 판단인 `Bundle Density Read`는 쉽게 말해 이번 차례에 질문을 몇 개, 어떤 성격으로 물을지 정하는 일입니다. 확인하면 되는지, 더 탐색해야 하는지, Research 각도를 좁혀야 하는지, 막힌 결정을 먼저 드러내야 하는지 판단하는 용도입니다.

항로가 충분히 구체적일 때만 에이전트의 자율 작업으로 넘어갑니다.

### 작업 약속이 절차를 붙든다

리드 에이전트는 추론하고, 종합하고, 조율해야 합니다. 긴 프롬프트 안에서 전체 절차를 외우는 역할이 되면 안 됩니다. Helmsman은 스킬과 작업 기록으로 이 책임을 나눕니다. 계약은 현재 단계, 허용된 행동, 금지된 행동, 필요한 결과물, 종료 기준을 적고, 리드는 그 계약 안에서 판단합니다.

이 분리는 제어 장치입니다. 리드는 큰 절차 문서를 계속 기억하는 대신, 매 단계 현재 계약을 읽습니다. 이렇게 하면 절차가 슬금슬금 바뀌거나, 모델이 없는 지름길을 만들어내거나, 갑자기 항로를 벗어나는 일을 줄일 수 있습니다. 목적은 에이전트를 덜 똑똑하게 만드는 것이 아닙니다. 에이전트의 지능이 실수로 벗어나기 어려운 작업 기록 안에서 작동하게 만드는 것입니다.

### Evidence Before Decisions

Research는 결정을 한 뒤 붙이는 설명 문단이 아닙니다. 결정의 입력이고, 개념적으로는 항로가 잠기기 전까지 Charting 안에 속합니다. Helmsman은 Research를 출처나 주제별로 나눠 진행하고, 그 근거를 별도의 작업 기록으로 남길 수 있습니다. 그래서 이후 에이전트가 무엇을 알고 있었는지, 무엇이 불확실했는지, 왜 그 항로를 택했는지 다시 볼 수 있습니다.

### 계획은 공격을 견뎌야 한다

Blueprint는 느슨한 할 일 목록이면 안 됩니다. 소유권, 의존성, 예상 결과물, Verification 시나리오가 충분히 분명해야 하고, 구현 전에 독립 Auditor들이 공격할 수 있어야 합니다.

위험이 큰 계획은 제한된 Hardening을 거칩니다. 항로, 현재 코드, 테스트, 시나리오 약속을 기준으로 전체 계획을 다시 읽습니다. 단순 체크리스트가 놓치기 쉬운 문단 사이의 결함을 찾기 위해서입니다.

Blueprint가 있다고 해서 바로 Audit으로 넘어가지 않습니다. Blueprint Gate는 그 계획이 Audit 가능한 수준인지 봅니다. 기준을 통과하지 못하거나 Auditor가 수정 판정을 내리면, 작업은 Audit이나 Execution으로 밀고 나가지 않고 다시 Blueprint로 돌아갑니다.

### Verification은 처음 약속을 대조한다

"빌드가 통과했다"는 "작업이 끝났다"와 다릅니다. Helmsman의 Verification은 구현을 항로와 대조합니다. 사용자 의도, 잠긴 결정, 위험 모델, 실행 전에 정한 시나리오를 기준으로 봅니다.

Verification이 실패하면 실패 기록을 보관합니다. 다음 구현 차수는 조용히 덮어쓰는 작업이 아니라 명시적인 복구 절차가 됩니다.

### Memory는 채팅 기록이 아니라 Wiki가 되어야 한다

원본 채팅 기록은 너무 길고, 그 순간의 맥락에 너무 묶여 있고, 잡음도 많습니다. Helmsman은 세션 결과를 이후 에이전트가 필요한 부분만 골라 읽을 수 있는 Wiki Memory로 바꿉니다.

위키의 `index.md`는 검색 점수표가 아니라 목차입니다. 이후 세션은 먼저 목차를 읽고, 에이전트가 현재 질문, 이전 결정, 작업 맥락을 보고 어떤 개념 문서와 세션 문서가 관련 있는지 판단합니다. 검증 도구는 문서 구조와 출처 표시만 확인합니다. 파일명, 키워드 일치, 임베딩 점수, 신뢰도 숫자로 관련성을 대신 판단하지 않습니다.

## 작업 흐름

```text
Charting                       Autopilot                         Wiki Memory
맥락, Evidence, 항로 잠금        에이전트의 자율 작업              누적되는 프로젝트 기억

의도
  -> Aperture Bundle      Research 전에 어느 방향을 볼지 사용자와 맞춘다
  -> Research Lane Contract  볼 범위와 보지 않을 범위를 정한다
  -> Research             결정 전에 출처와 주제별 Evidence를 모은다
  -> Evidence             결정 전에 출처 있는 사실을 남긴다
  -> Decision Bundle      근거를 보고 항로를 선택하거나 승인한다
  -> Route Lock           사용자 확인이 필요한 선택을 고정한다
  -> Route Card           목표, 위험, 성공 기준, 시나리오를 정한다
     불명확하면: 다시 Charting으로 돌아간다
  -> Strategy             같은 목표의 Strategy 후보를 여럿 만든다
  -> Blueprint            의존성 순서를 반영한 하나의 계획으로 엮는다
  -> Hardening            Audit 전 제한된 전체 계획 재검토를 수행한다
  -> Blueprint Gate       불완전하면 다시 Blueprint로 돌아간다
  -> Audit                병렬 Auditor가 코드 변경 전에 계획을 공격한다
     수정 필요하면: 다시 Blueprint로 돌아간다
  -> Execution            의존성 순서 안에서 병렬 구현한다
  -> Verification         항로 기준으로 시나리오를 확인한다
     실패하면: 다시 실행으로 돌아간다
  -> Closeout             실제로 무슨 일이 일어났는지 설명한다
  -> Wiki Memory          다음 세션이 재사용할 지식을 남긴다
```

사람은 Charting에서 강합니다. 판단, 취향, 우선순위, 절충, 그리고 "그건 진짜 문제가 아니다"라고 말하는 일입니다. 에이전트는 Autopilot에서 강합니다. 넓게 보기, 지치지 않는 비교, 반복 Verification, 끝까지 구현하기입니다.

Helmsman은 이 두 강점 사이의 경계입니다.

## 호스트 모델

Helmsman은 특정 에이전트 제품에 갇히면 안 됩니다. 핵심은 `SKILL.md`, 보조 파일, 그리고 작업 기록입니다. Codex, Claude Code, 이후의 에이전트 환경은 이 핵심 단위를 실행하는 호스트입니다.

`plugins/helmsman/`에서 만들어지는 배포 묶음은 같은 스킬 묶음을 Codex와 Claude Code 양쪽에 노출합니다. 호스트 설정 파일은 스킬을 알려줄 뿐, 작업 흐름을 소유하지 않습니다. 설치와 호스트별 명령은 [docs/distribution.md](docs/distribution.md)에, 공개 기여와 릴리즈 운영은 [docs/open-source-operations.md](docs/open-source-operations.md)와 [CONTRIBUTING.md](CONTRIBUTING.md)에 둡니다.

## 사용 흐름

현재 단계가 불명확하면 루트 스킬을 씁니다. 다음 단계가 분명하면 해당 단계의 스킬을 바로 씁니다.

```text
$helmsman
  -> 작업 기록 상태를 읽는다
  -> charting, autopilot, verify 중 다음 스킬을 고른다
  -> contract.md를 갱신한다
  -> 다음 단계 작업 기록을 쓴다
```

일상적인 작업에서는 다음 단계에 맞는 스킬을 씁니다.

```text
$helmsman-charting    Autopilot 전에 항로를 조준하고 잠근다
$helmsman-autopilot   Strategy, Blueprint, Hardening, Audit, Execution, 복구를 운영한다
$helmsman-verify      결과를 Route Scenario와 대조하고 세션을 닫는다
```

실제 작업은 하나의 세션 작업 공간을 만듭니다.

```text
.helmsman/sessions/<session-id>/
  contract.md
  map.json
  route-card.md
  evidence/
  strategy-samples.md
  director-blueprint.md
  hardening.md
  audit.md
  plan.md
  execution-report.md
  verification.md
  retro.md
```

운영 규칙은 단순합니다. 상태는 작업 기록이 맡고, 리드 에이전트는 현재 계약 안에서 판단합니다. 스크립트는 템플릿 생성, 검증, 상태 출력처럼 반복 작업에서 생기는 실수를 줄입니다. 정상적인 실행에서는 리드가 `contract.md`를 갱신하고, 다음 작업 기록을 쓰고, 필요한 검증이나 상태 출력을 돌린 뒤 현재 스킬 안에서 계속하거나 다음 단계로 넘어갑니다.

## 현재 방향

Helmsman의 방향은 자율 실행이 항로를 벗어나지 못하게 하는 작업 방식입니다. 스킬은 배포 형태일 뿐이고, 핵심은 항로 계약과 작업 기록입니다.

제품 경계는 Charting 중심입니다. Charting은 Always Aperture를 맡습니다. 모든 항로는 Aperture Bundle로 시작하고, `Bundle Density Read`는 이번 차례에 질문을 몇 개, 어떤 성격으로 물을지만 정합니다. Targeted Research는 결정이 굳기 전에 Research Lane Contract로 조준되고, Evidence 수집도 Charting 안에서 끝납니다. Autopilot은 Route Lock 이후의 Strategy, Blueprint, Hardening, Audit, Execution, 복구를 운영합니다. Verify는 결과를 Route Scenario와 대조하고, 다음 세션이 재사용할 수 있는 closeout 기록을 남깁니다. 작업자는 필요할 때만 제한된 범위와 필수 결과물을 받아 실행합니다.

Autopilot은 실행 방식(`inline`, `serial-workers`, `parallel-workers`, `parked`)을 기록하고, 병렬 작업 전에는 파일과 작업 항목의 충돌 가능성을 확인합니다. 작업자가 살아 있다는 말이나 자기 보고만 믿지 않고, 실제 결과물과 시작/완료/실패 기록을 단계 통과 기준으로 봅니다. 스크립트는 템플릿 생성, 작업 기록 검증, 상태 출력, 기억 정리처럼 반복 가능한 일을 맡지만, 작업 흐름의 판단권을 갖지 않습니다.

배포 설명은 의도적으로 README 밖으로 뺐습니다. 짧게 말하면, 생성된 배포 묶음이 Codex와 Claude Code 양쪽에 스킬을 노출하고, 제품의 약속은 위의 작업 기록과 작업 흐름에 남습니다. 설치 명령, 호스트 설정 파일, 배포 등록 정보, 검증 기준은 [docs/distribution.md](docs/distribution.md)에 있습니다.

npm에 새 버전이 올라가도 로컬에 설치된 플러그인 캐시는 자동으로 바뀌지 않습니다. `helmsman doctor`는 npm `latest`와 로컬 설치 버전의 차이를 보여주고, `helmsman update`는 최신 배포판 기준으로 로컬 payload와 Codex cache를 다시 설치합니다.

설치된 스킬은 Helmsman에 처음 진입한 리드 에이전트에게 read-only `doctor` 확인을 한 번 실행하라고 지시합니다. 그래서 사용자가 직접 업데이트 여부를 확인할 필요가 없습니다. 에이전트는 새 버전이 있으면 알려주기만 하고, 사용자 승인 없이 업데이트를 실행하지 않습니다.

## 릴리즈 경계

위의 사용 흐름이 제품 경로입니다. 공개 릴리즈 체크는 `docs/release-guards.md`에 둡니다. 일상 사용이 관리자 체크리스트처럼 변하면 제품이 약해집니다.

릴리즈 경계는 의도적으로 좁습니다. 배포 묶음을 만들고, 패키지와 설정 파일의 버전이 맞는지 검증하고, 작업 기록/세션 검증기를 돌리고, 개인 계획이나 평가 흔적이 공개 저장소에 섞이지 않게 합니다.

## 참고할 만한 설계 아이디어

### 작업 기록과 리드의 약속

Helmsman은 작업 기록을 조타 장치로, 리드 에이전트를 항해사로 둡니다. 작업 기록은 무엇이 관련 있는지, 어떤 제품 판단이 맞는지, 어떤 구현 전략이 좋은지 대신 결정하지 않습니다. 대신 지금 허용된 다음 단계가 무엇인지, 어떤 근거가 있어야 하는지, 어떤 기준을 통과해야 다음으로 갈 수 있는지를 보이게 합니다.

그래서 리드 지시는 작게 유지될 수 있습니다. 하나의 오래 살아 있는 에이전트에게 모든 단계 규칙을 기억하라고 맡기는 대신, 현재 스킬이 작업 기록을 읽고 다음에 필요한 단계를 좁힙니다. 리드는 모델이 강한 영역, 즉 맥락 해석, 선택지 비교, 에이전트 조율에 집중합니다. 계약은 모델이 약한 영역, 즉 일관성, 순서 보장, 확인 단계를 건너뛰어도 된다는 허가를 지어내지 않는 일을 보호합니다.

### 항로 잠금

Autopilot이 시작되기 전에 목표, Aperture Bundle, Research Lane Contract, 성공 기준, 항로 위험, Verification 시나리오가 구체적으로 이름 붙어야 합니다. 그렇지 않으면 항로 설정은 다시 Charting으로 돌아갑니다. 이것이 초반 방향 이탈을 막는 안전장치입니다. 작은 모호함 하나가 그럴듯하지만 완전히 틀린 실행 경로로 증폭될 수 있기 때문입니다.

### Parallel Research, Strategy, Audit, Execution

Helmsman은 독립성이 실제 가치를 만드는 곳에서 병렬성을 씁니다. Charting 중에는 Researcher가 결정이 굳기 전에 출처나 주제별 Research 범위를 나눌 수 있습니다. Route Lock 이후에는 Strategist가 같은 역할과 같은 목표 아래에서 독립적인 Strategy를 만듭니다. Auditor는 한 명의 위험 모델에 갇히지 않도록 같은 Blueprint를 독립적으로 공격합니다. Implementor는 의존성 순서 안에서 함께 움직일 수 있는 작업을 병렬로 처리하고, 막힌 작업은 자기 차례를 기다립니다.

같은 목적의 Strategist를 셋 두는 이유도 여기에 있습니다. 셋은 서로 다른 직책이 아닙니다. 같은 계약과 같은 목표 아래에서 독립적인 Strategy를 뽑는 것입니다. 모델은 확률적으로 추론하기 때문에, 같은 목표를 줘도 실행마다 서로 다른 방식으로 수렴할 수 있습니다. 이 차이 자체가 신호가 됩니다. 독립 실행을 반복하면 너무 이른 결론을 줄이고, 합의 지점, 충돌 지점, 빠진 가정을 더 쉽게 볼 수 있습니다. 이후 Director가 원본 Strategy 보고서를 직접 읽고 하나의 Blueprint로 엮습니다.

### Atomic Blueprint

Blueprint는 Strategy를 소유권과 의존성 순서가 있는 구현 단위로 바꿉니다. 작업은 실행하고 검증할 수 있을 만큼 작아야 하지만, 전체 계약이 사라질 만큼 잘게 쪼개져서는 안 됩니다.

### Hardening

Hardening은 Audit 전에 Blueprint 전체를 제한적으로 다시 읽는 절차입니다. 심각한 계획 결함은 하나의 작업 안에만 있지 않습니다. Route Card, 소유권 그래프, 의존성 순서, 현재 코드, Verification 시나리오 사이에 숨어 있는 경우가 많습니다.

이 반복도 병렬 Strategist와 같은 이유에서 나왔습니다. 같은 스펙 문서를 모델에게 세 번 검토시키면, 뒤의 검토에서 새로운 문제가 계속 발견되는 경우가 많습니다. 모델이 문제 공간을 매번 같은 순서로 훑지 않기 때문입니다. Helmsman은 최대 세 번의 Hardening으로 계획을 실제로 수렴시킵니다. 끝없는 검토 의식으로 만들지 않으면서도, 한 번 읽고 지나갈 때 놓치는 결함을 줄이기 위한 장치입니다. Hardening은 별도 단계도 아니고 주제별 체크리스트도 아닙니다. Auditor와 Implementor가 실제 시간을 쓰기 전에 전체 계획을 반복해서 다시 읽고 문서 단락 사이의 실패를 잡는 절차입니다.

### Blueprint Gate

Blueprint는 Audit으로 넘어가기 전에 Blueprint Gate를 통과해야 합니다. 소유권 누락, 채워지지 않은 논리, 불명확한 결과물, 해결되지 않은 Hardening 지적이 있으면 다시 Blueprint로 돌아가야 합니다. Audit은 일관된 계획을 적대적으로 검토하는 단계이지, 애초에 Audit 가능한 계획이 없었다는 사실을 발견하는 단계가 아닙니다.

### Adversarial Audit

Audit은 구현 전에 일어납니다. 계획 결함이 아직 싸게 고칠 수 있을 때 잡기 위해서입니다. 여러 Auditor가 같은 Blueprint를 독립적으로 검사할 수 있습니다. Auditor의 일은 친절해지는 것이 아닙니다. 모순, 근거 부족, 잘못된 의존성, Verification 공백을 찾는 것입니다. Audit 판정이 수정이면 작업은 다시 Blueprint로 돌아갑니다.

### Scenario Verification

Verification은 최종 변경분의 분위기가 아니라 항로에서 나온 시나리오를 기준으로 합니다. 기술적으로 깨끗한 변경도 사용자가 실제로 필요로 한 시나리오를 만족하지 못하면 실패입니다.

### Durable Wiki Memory

세션 마감 기록은 닫는 말이 아닙니다. Wiki Memory의 원재료입니다. 오래 남길 교훈은 프로젝트 기억으로 올리고, 세션에 묶인 세부 내용은 이후 에이전트가 선택해서 읽을 수 있는 Wiki 문서로 압축합니다.

## 무엇을 기억하는가

Helmsman은 기억을 세 종류로 나눕니다.

- **승격된 프로젝트 기억:** 이후 작업에 계속 영향을 줘야 하는 안정적인 교훈.
- **세션 문서:** 특정 세션이 무엇을 결정하고, 시도하고, 바꾸고, 검증했는지에 대한 압축 기록.
- **개념 문서:** 한 세션을 넘어 재사용할 수 있는 설명.

이 구조는 검색 인덱스와 다릅니다. 시스템이 다음 요청을 기계적으로 점수화하지 않습니다. 다음 에이전트에게 구조화된 지도를 주고, 관련성 판단은 현재 맥락 속에서 에이전트가 하게 합니다.

## 에이전트 구성

Helmsman에서 역할은 장식이 아니라 필요한 긴장입니다.

| 역할 | 기여 |
| --- | --- |
| Researcher | 결정이 굳기 전에 Charting을 위한 출처 있는 근거를 모읍니다. |
| Strategist | 같은 확정된 목표에서 독립적인 Strategy를 만듭니다. |
| Director | 발산한 Strategy를 실행 가능한 Blueprint로 엮습니다. |
| Auditor | 계획을 공격하고 구현을 Verification 시나리오 기준으로 검증합니다. |
| Implementor | 의존성 순서에 따라 제한된 작업을 소유합니다. |

중요한 것은 역할 이름이 아닙니다. 역할 사이에 필요한 긴장을 남기는 것입니다. 계획을 제안한 에이전트가 그 계획을 Audit하는 유일한 에이전트가 되어서는 안 되고, 구현한 에이전트도 처음 항로에 비추어 다시 Verification을 받아야 합니다.

## 현재 형태

이 저장소에는 Helmsman 스킬, 역할 문서, Route/Verification 계약, Autopilot 기록, 검증용 스크립트, Wiki Memory 정리 흐름이 들어 있습니다. 현재 방향은 `docs/helmsman-protocol.md`와 `skills/helmsman-*`에 담겨 있습니다. 저장소에 남는 CLI 코드는 보조 도구일 뿐, 작업 흐름의 권한자가 아닙니다.

## Native Goal과 함께 쓰기

Codex나 Claude의 native goal은 긴 작업의 최종 목표입니다. Helmsman은 그 목표를 대신하지 않고, 다음 에이전트가 따를 수 있는 항로 기록으로 바꿉니다.

실제 흐름은 파일을 붙이는 방식입니다.

```text
$helmsman-charting
  -> .helmsman/goals/<goal-id>/goal.md
  -> route-card.md
  -> contract.md
  -> verification-scenarios.md
  -> stop-conditions.md

/goal @.helmsman/goals/<goal-id>/goal.md
```

긴 작업 중 기준은 하나입니다. 이 행동이 native goal에서 약속한 항로를 앞으로 밀고 있는가. 불명확하면 새 목표를 즉흥적으로 만들지 않고, 항로를 `blocked`로 표시한 뒤 사용자가 바로 이어받을 수 있는 재개 기록을 남깁니다.
