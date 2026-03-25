# GitHub Desktop N

[GitHub Desktop](https://desktop.github.com/) 기반의 커스텀 빌드입니다.
컨텍스트 메뉴 개선, 키보드 단축키 추가 등 사용성 향상을 포함합니다.

## 사전 요구사항

| 도구 | 버전 | 설치 방법 |
|------|------|-----------|
| Node.js | v24.x (`.nvmrc` 참조) | https://nodejs.org/ |
| Yarn | >= 1.9 | `npm install -g yarn` |
| Python | 3.x | https://www.python.org/ (네이티브 모듈 빌드용) |
| Visual Studio Build Tools | 2022 | https://visualstudio.microsoft.com/downloads/ ("C++ 빌드 도구" 워크로드 선택) |
| WiX Toolset | v3 | https://wixtoolset.org/ (MSI 인스톨러 생성용) |

### WiX Toolset 설치

WiX Toolset v3는 MSI 인스톨러를 생성하는 데 필요합니다.

- 공식 사이트: https://wixtoolset.org/docs/wix3/
- 또는 Chocolatey: `choco install wixtoolset --version=3.14.0 -y`
- 설치 후 `light.exe`, `candle.exe`가 PATH에 있어야 합니다.

## 빌드

```bash
# 의존성 설치
yarn

# 개발 빌드
yarn build:dev

# 프로덕션 빌드
yarn build:prod
```

## 패키징 (인스톨러 생성)

```bash
# 프로덕션 빌드 후 패키징
yarn build:prod
yarn package
```

`dist/` 폴더에 다음 파일들이 생성됩니다:

| 파일 | 설명 |
|------|------|
| `GitHubDesktopNSetup-x64.exe` | Squirrel 인스톨러 (`%LOCALAPPDATA%`에 설치) |
| `GitHubDesktopN-x64.msi` | WiX MSI 인스톨러 (`Program Files`에 설치) |

## 개발 실행

```bash
yarn start
```

## 주요 변경 사항 (원본 대비)

- 앱 이름: GitHub Desktop N
- Changes/History 탭 파일 컨텍스트 메뉴 순서 통일 및 개선
- 키보드 단축키 추가 (Ctrl+C: 경로 복사, Ctrl+E: Explorer, Ctrl+R: 터미널)
- WiX MSI 인스톨러 지원 (Program Files 직접 설치)

## 라이선스

MIT
