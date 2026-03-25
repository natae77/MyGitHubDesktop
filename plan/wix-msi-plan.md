# electron-wix-msi를 이용한 Program Files 직접 설치 MSI 생성

## Context
현재 프로젝트는 electron-winstaller(Squirrel.Windows)로 MSI를 생성하는데, 이 MSI는 앱을 직접 설치하지 않고 "deployment tool"을 설치한다. electron-wix-msi를 추가하여 `C:\Program Files\GitHubDesktopN\`에 직접 설치하는 진짜 MSI를 생성하도록 한다.

## 수정 파일

### 1. `package.json` — devDependency 추가
- `electron-wix-msi` 패키지 추가

### 2. `script/dist-info.ts` — WiX MSI 경로 헬퍼 함수 추가
- `getWindowsWixMsiName()` → `GitHubDesktopN-x64.msi` (기존 Squirrel MSI와 이름 구분)
- `getWindowsWixMsiPath()` → `dist/GitHubDesktopN-x64.msi`

### 3. `script/package.ts` — Squirrel MSI 제거 + WiX MSI 생성 로직 추가
- 기존 `electronInstaller.Options`에서 `setupMsi` 옵션 제거 (Squirrel MSI 더 이상 생성 안 함)
- `electron-wix-msi`의 `MSICreator` import
- `packageWindows()` 내 기존 Squirrel 패키징 완료 후, WiX MSI 생성 단계 추가:
  ```
  const msiCreator = new MSICreator({
    appDirectory: distPath,                    // electron-packager 출력 경로
    outputDirectory: outputDir,                // dist/
    exe: `${nugetPkgName}.exe`,               // GitHubDesktopN.exe
    name: productName,                         // "GitHub Desktop N"
    manufacturer: getCompanyName(),            // "GitHub, Inc."
    version: getVersion(),                     // "3.5.7-beta2"
    arch: getDistArchitecture(),               // 'x64' | 'arm64'
    icon: iconSource,                          // icon-logo.ico
    ui: { chooseDirectory: true },             // 설치 경로 선택 UI
  })
  await msiCreator.create()
  await msiCreator.compile()
  ```
- 생성된 MSI 파일을 원하는 이름으로 rename

### 4. `package.json` (scripts) — 선택적으로 별도 스크립트 추가
- `"package:msi"` 스크립트를 추가하여 WiX MSI만 별도로 생성할 수 있게 할 수도 있음
- 또는 기존 `yarn package`에 통합

## 사전 요구사항
- WiX Toolset v3 설치 필요 (https://wixtoolset.org/ 또는 `choco install wixtoolset`)
- `light.exe`, `candle.exe`가 PATH에 있어야 함

## 검증
- `yarn build:prod` 실행
- `yarn package` 실행
- `dist/` 폴더에 WiX MSI 파일 생성 확인
- MSI 실행하여 Program Files에 직접 설치되는지 확인
- 설치된 앱 실행 확인
