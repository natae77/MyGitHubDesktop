# FolderView 비주얼 레이아웃 기획서

> FolderView.md의 보충 문서. 레이아웃·비주얼 관련 사항만 다룬다.
> 기능 로직, State, Phase 등은 FolderView.md를 참조.

---

## 1. 전체 구조

```
┌─────────────────────────────────────────────────────────────────┐
│  [Repository ▼]  [Branch ▼]  [Fetch origin]                    │
├──────────────────┬──────────────────────────────────────────────┤
│                  │                                              │
│  Explorer        │  Main Pane                                   │
│  (좌측 사이드바)  │  [Changes] [History] 탭                      │
│                  │                                              │
│                  │                                              │
└──────────────────┴──────────────────────────────────────────────┘
```

- Explorer 사이드바와 Main Pane은 **좌우 분할** (Resizable)
- Main Pane 내부는 탭에 따라 **상하 분할** (목록 영역 + Diff 영역)
- **Diff는 항상 Main Pane 하단에 배치** (기존 우측 배치 → 하단으로 변경)
- Diff는 Explorer 사이드바 영역을 **침범하지 않음**

---

## 2. Explorer 사이드바

```
┌──────────────────┐
│  🔀 master       │  ← root 노드 = 현재 브랜치명
│  ├── 📁 app      │
│  │   ├── 📁 src  │
│  │   │   ├── ☑foo.ts
│  │   │   └── bar.ts
│  │   └── 📁 test │
│  ├── 📁 docs     │
│  └── 📄 pkg.json │
│                  │
│  [🔍 Filter...]  │
└──────────────────┘
```

### 2.1 Root 노드

- 트리 최상단에 **현재 브랜치명**이 root 노드로 표시 (예: `master`, `feature/login`)
- root 노드 선택 = **필터 해제** (전체 히스토리 표시)
- 이로써 기존 "Showing history for: ... [Clear filter]" 배너가 **불필요**해짐
  - root가 곧 clear filter 역할

### 2.2 노드 표시

- 폴더: 📁 아이콘 + 접기/펼치기 화살표
- 파일: 📄 아이콘
- 수정된 파일: ☑ 마크 (working directory 변경 사항)
- 선택된 노드: 배경색 하이라이트

---

## 3. Changes 탭 레이아웃

**핵심 변경: 상단에 Change List(좌) + Commit 영역(우), 하단에 Diff**

```
┌──────────────────┬──────────────────────────────────────────────┐
│  🔀 master       │  [Changes 6] [History]                       │
│  ├── 📁 app      ├─────────────────────┬────────────────────────┤
│  │   ├── ...     │  Change List        │  Commit 영역            │
│  ├── 📁 docs     │                     │                        │
│  └── 📄 pkg.json │  ☑ file1.ts    +    │  Summary (required)    │
│                  │  ☑ file2.scss  +    │  ┌──────────────────┐  │
│                  │  ☑ file3.tsx   M    │  │ Description      │  │
│                  │  ☑ file4.ts    M    │  │                  │  │
│                  │  ☑ file5.txt   +    │  └──────────────────┘  │
│                  │  ☑ file6.toml  M    │  👤 Co-authors         │
│                  │                     │  [Commit to master]    │
│                  ├─────────────────────┴────────────────────────┤
│                  │                                              │
│                  │  Diff Viewer                                 │
│                  │  ─────────────────────────────────────────── │
│                  │  @@ -3,7 +3,7 @@                            │
│                  │  - name = "old-name"                         │
│                  │  + name = "new-name"                         │
│                  │                                              │
│                  │                                              │
└──────────────────┴──────────────────────────────────────────────┘
```

### 3.1 상단 영역 (좌우 분할)

| 위치 | 내용 | 비고 |
|------|------|------|
| 상단 좌측 | Change List (파일 목록 + 체크박스 + 상태 아이콘) | 기존 `FilterChangesList`의 파일 목록 부분 |
| 상단 우측 | Summary + Description + Commit 버튼 | 기존 `CommitMessage` 컴포넌트 |

- 좌우 비율은 고정 또는 Resizable (v1에서는 고정 비율로 시작 가능)
- Change List에서 파일 선택 → 하단 Diff에 해당 파일의 diff 표시

### 3.2 하단 영역

- **Diff Viewer** — 선택된 파일의 diff 표시
- 기존 `SeamlessDiffSwitcher` 재사용
- 상단/하단 사이에 **Resizable 경계** (드래그로 비율 조절)

---

## 4. History 탭 레이아웃

**핵심 변경: 상단에 Commit List(좌) + File List(우), 하단에 Diff**

```
┌──────────────────┬──────────────────────────────────────────────┐
│  🔀 master       │  [Changes] [History]                         │
│  ├── 📁 app      ├─────────────────────┬────────────────────────┤
│  │   ├── 📁 src ←│  Commit List        │  File List             │
│  │   ├── ...     │                     │                        │
│  ├── 📁 docs     │  ○ abc1234 msg...   │  M app/src/foo.ts  ★  │
│  └── 📄 pkg.json │  ○ def5678 msg...   │  A app/src/bar.ts  ★  │
│                  │  ○ ghi9012 msg...   │  D docs/old.md        │
│                  │  ○ jkl3456 msg...   │  M README.md           │
│                  │                     │                        │
│                  ├─────────────────────┴────────────────────────┤
│                  │                                              │
│                  │  Diff Viewer                                 │
│                  │  ─────────────────────────────────────────── │
│                  │  @@ -10,5 +10,5 @@                          │
│                  │  - old line                                  │
│                  │  + new line                                  │
│                  │                                              │
│                  │                                              │
└──────────────────┴──────────────────────────────────────────────┘
```

### 4.1 상단 영역 (좌우 분할)

| 위치 | 내용 | 비고 |
|------|------|------|
| 상단 좌측 | Commit List (Explorer 경로로 필터링된 커밋 목록) | 기존 `CommitList` 재사용 |
| 상단 우측 | File List (선택된 커밋의 변경 파일 목록) | 기존 `FileList` 재사용 |

- ★ = Explorer에서 선택한 경로에 해당하는 파일 (하이라이트 표시)
- Explorer에서 `app/src` 선택 → Commit List는 `app/src` 변경 커밋만 표시
- 커밋 클릭 → File List에는 해당 커밋의 **모든** 변경 파일 표시 (필터 경로 외 포함)

### 4.2 하단 영역

- **Diff Viewer** — File List에서 선택한 파일의 diff 표시
- 기존 `SeamlessDiffSwitcher` 재사용
- 상단/하단 사이에 **Resizable 경계**

### 4.3 필터링 인터랙션 흐름

```
Explorer에서 📁 app/src 클릭
  → Commit List: git log -- app/src (필터링된 커밋만)
  → File List: (커밋 미선택 상태 — 비어있음)

Commit List에서 커밋 abc1234 클릭
  → File List: 해당 커밋의 전체 변경 파일 (★ 표시로 필터 경로 파일 구분)
  → Diff: (파일 미선택 상태 — 비어있음 또는 첫 번째 파일 자동 선택)

File List에서 foo.ts 클릭
  → Diff: foo.ts의 diff 표시

Explorer에서 🔀 master (root) 클릭
  → Commit List: 전체 히스토리 (필터 해제)
  → File List, Diff: 리셋
```

---

## 5. 비주얼 원칙 요약

| 원칙 | 설명 |
|------|------|
| Diff는 항상 하단 | Changes/History 모두 Diff Viewer가 Main Pane 하단에 위치 |
| Explorer 독립성 | Diff가 Explorer 사이드바 영역을 침범하지 않음 |
| Root = Clear Filter | Explorer 최상단 브랜치명 노드 선택 → 필터 해제 |
| 배너 제거 | "Showing history for: ... [Clear filter]" 불필요 |
| 상단 좌우 분할 | Changes: ChangeList + Commit 영역 / History: CommitList + FileList |
| 상하 Resizable | 상단(목록) ↔ 하단(Diff) 경계를 드래그로 조절 가능 |

---

## 6. FolderView.md 반영 필요 사항

이 문서의 내용에 따라 FolderView.md에서 업데이트가 필요한 섹션:

| FolderView.md 섹션 | 변경 내용 |
|---------------------|----------|
| 최종 레이아웃 (line 7-20) | 이 문서의 전체 구조로 교체 |
| Phase 2.2 FileExplorer (line 169-189) | root 노드(브랜치명) 추가 — `IFileTreeNode`에 root 노드 개념 반영 |
| Phase 3.1 render() (line 199-214) | `renderMainPane()` 내부가 상하 분할 구조임을 명시 |
| Phase 3.4 Changes 탭 재구성 (line 224-234) | ChangeList(좌) + CommitMessage(우) + Diff(하단) 구조로 재정의 |
| Phase 3.5 History 탭 재구성 (line 236-274) | 레이아웃 다이어그램을 이 문서의 섹션 4로 교체 |
| Phase 4.1 CSS (line 339-382) | `#history-pane`, `#changes-pane` 내부 flex 방향을 상하 분할로 수정 |
| Phase 5.3 키보드 단축키 (line 433-436) | root 노드 선택으로 필터 해제하는 단축키 고려 |
