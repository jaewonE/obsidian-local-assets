# Local assets

[ [English](https://github.com/jaewonE/obsidian-local-assets) | [한국어](https://github.com/jaewonE/obsidian-local-assets/blob/master/README.ko.md) ]

![demo](https://github.com/jaewonE/obsidian-local-assets/blob/master/assets/demo.gif?raw=true)

Local assets는 두 가지 작업 흐름을 하나의 일관된 시스템으로 묶는 Obsidian 플러그인입니다.
- 드래그/드롭 또는 붙여넣기로 추가한 로컬 파일의 이름을 바꾸고 저장합니다.
- 현재 노트의 원격 자산(이미지, PDF, 오디오, 비디오)을 다운로드하고 링크를 로컬 위키링크로 변환합니다.

하나의 이름 규칙, 하나의 첨부파일 경로 정책, 하나의 확장자 정책을 공유해 충돌을 줄입니다.

## 핵심 동작

- 로컬 드롭/붙여넣기 파일은 `{note}-{n}.ext` 같은 공유 패턴으로 저장됩니다.
- 원격 링크는 명령 또는 리본 버튼을 통해 수동으로 처리됩니다.
- 원격 자산은 URL 기준으로 캐시되며 설정에 따라 재사용할 수 있습니다.
- 설정을 켜면 링크 변환 시 임베드 크기나 alias 메타데이터를 보존합니다.
- 확장자를 추론할 수 없는 경우 허용된 로컬 확장자 안에서 fallback 확장자를 검증합니다.

## 명령

- `download-current-note-assets`: 현재 노트의 원격 자산을 다운로드하고 로컬 링크로 변환합니다.
- `clear-asset-cache`: URL과 파일 경로의 캐시 매핑을 지웁니다.

## 주요 설정

- `allowedLocalExtensions`: 로컬 드롭/붙여넣기에 허용할 확장자입니다.
- `allowedRemoteExtensions`: 원격 다운로드에 허용할 확장자입니다.
- `unknownExtensionFallback`: 확장자 추론에 실패했을 때 사용할 확장자입니다. `allowedLocalExtensions`에 포함되어야 합니다.
- `namingPattern`: `{note}`와 `{n}` 토큰을 사용하는 파일 이름 템플릿입니다.
- `preserveSizeOrAlias`: 변환된 링크에서 `|width` 또는 alias 메타데이터를 보존합니다.
- `verifyExistingByHash`, `verifyExistingByDimensions`, `hashOnlyWhenSizeDiffers`: 캐시 재사용 검증 방식입니다.
- `includeImages`, `includePdf`, `includeAudio`, `includeVideo`: 처리할 파일 유형입니다.
- `dryRunPreview`: 파일을 쓰지 않고 링크 변환과 이름 규칙을 미리 봅니다.
- `conflictStrategy`: `reuse-existing`, `overwrite-never`, `create-new` 중 선택합니다.
- `includeDomains`, `excludeDomains`: 원격 다운로드 도메인 허용/차단 규칙입니다.
- `maxDownloadSizeMB`, `requestTimeoutMs`, `concurrencyLimit`: 다운로드 크기, timeout, 동시성 제어입니다.

## 구조

- `src/main.ts`: 플러그인 lifecycle, 명령 등록, 설정 저장, 리본 설정입니다.
- `src/features/localDrop.ts`: `editor-drop`과 `editor-paste`의 로컬 파일 처리를 담당합니다.
- `src/features/remoteDownload.ts`: 원격 자산 처리와 링크 변환을 담당합니다.
- `src/features/linkRewrite.ts`: 외부 링크 추출과 치환 헬퍼입니다.
- `src/services/attachmentPath.ts`: Obsidian 기본 첨부파일 경로 정책을 해석합니다.
- `src/services/nameAllocator.ts`: 공유 파일 이름 할당과 미리보기를 담당합니다.
- `src/services/extensionPolicy.ts`: 확장자 파싱, 검증, 도메인 및 파일 유형 필터링을 담당합니다.
- `src/services/cacheRegistry.ts`: 캐시 검증과 메타데이터 생성을 담당합니다.
- `src/settings/*`: 타입, 기본값, 설정 UI입니다.

## 개발

- 의존성 설치: `npm install`
- watch 모드: `npm run dev`
- production 빌드: `npm run build`
- lint: `npm run lint`

## 수동 테스트 체크리스트

- 허용/차단 확장자가 섞인 로컬 파일을 드롭/붙여넣기합니다.
- 이미지/PDF/오디오/비디오 링크가 있는 노트에서 원격 다운로드 명령을 실행합니다.
- 로컬과 원격 워크플로가 같은 번호 규칙을 공유하는지 확인합니다.
- 확장자를 알 수 없는 URL에 fallback 확장자가 적용되는지 확인합니다.
- dry-run을 켠 뒤 파일이 실제로 생성되지 않는지 확인합니다.

## 릴리스 파일

vault 플러그인 폴더에 다음 파일을 복사합니다.
- `main.js`
- `manifest.json`

## 개인정보와 네트워크 접근

Local assets는 Obsidian vault 안에서 실행됩니다. 원격 자산 다운로드 명령이나 리본 버튼을 사용자가 직접 실행할 때만 네트워크 요청을 보냅니다. 텔레메트리는 없으며 vault 바깥의 파일을 읽지 않습니다.

## 라이선스

GPL-3.0-only.
