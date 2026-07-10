# Local assets

[ [English](https://github.com/jaewonE/obsidian-local-assets) | [한국어](https://github.com/jaewonE/obsidian-local-assets/blob/master/README.ko.md) ]

![demo](https://github.com/jaewonE/obsidian-local-assets/blob/master/assets/demo.gif?raw=true)

Local assets는 노트가 참조하는 파일을 Obsidian vault 안에 보관하도록 돕는 플러그인입니다. 로컬 드래그/드롭과 붙여넣기 파일을 처리하고, 로컬 파일 참조 가져오기와 원격 자산 다운로드에도 같은 이름 규칙, 저장 위치, 확장자 정책을 적용합니다.

## 기능

- 드롭하거나 붙여넣은 로컬 파일을 `{note}-{n}.ext` 같은 공유 이름 규칙으로 저장합니다.
- 현재 노트, 현재 폴더, 전체 Markdown 노트의 원격 이미지, PDF, 오디오, 비디오를 다운로드합니다.
- 절대 로컬 경로, 공백을 이스케이프한 로컬 경로, Obsidian `app://` 파일 경로를 사용하는 Markdown 링크와 임베드를 로컬 링크로 변환합니다.
- Markdown 링크, Markdown 임베드, HTML media 태그, raw URL, 이미지 data URI를 로컬 링크로 변환합니다.
- 설정에 따라 링크 alias와 임베드 크기 메타데이터를 보존합니다.
- 첨부파일 저장 위치를 4가지 중 선택합니다: Obsidian 기본값, 노트와 같은 폴더, vault root, custom folder.
- URL 캐시를 즉시 재사용한 뒤 백그라운드에서 원격 내용을 검증하고, 내용이 바뀐 경우 캐시 파일을 교체한 뒤 알립니다.
- 매번 다시 다운로드해야 하는 경우 캐시 사용을 완전히 끌 수 있습니다.
- 설정 탭에서 skipped, failed, reused, downloaded, planned 항목의 상세 로그를 확인할 수 있습니다.

## 명령과 단축키

기본 단축키는 지정하지 않습니다. Obsidian `Settings -> Hotkeys`에서 원하는 단축키를 직접 지정할 수 있습니다.

- `Download assets for current note`: 현재 노트의 외부 자산을 로컬화합니다.
- `Download assets for current folder`: 현재 노트와 같은 폴더의 Markdown 노트를 처리합니다.
- `Download assets for all notes`: vault 전체 Markdown 노트를 처리합니다.
- `Retry failed asset downloads`: 마지막 작업에서 실패한 URL을 현재 노트 기준으로 다시 시도합니다.
- `Clear asset cache for current note`: 현재 노트에 아직 남아 있는 외부 URL의 캐시 항목을 제거합니다.
- `Clear asset cache`: 모든 URL-파일 경로 매핑을 제거합니다.

## 설정

- `Attachment folder`: `Use Obsidian default`, `Same folder as note`, `Vault root`, `Custom folder` 중 선택합니다.
- `Allowed local extensions`와 `Allowed remote extensions`: 허용할 확장자를 쉼표로 구분해 입력합니다.
- `Unknown extension fallback`: URL이나 응답 header에서 확장자를 알 수 없을 때 사용할 확장자입니다.
- `Naming pattern`: `{note}`와 `{n}`을 사용하는 파일명 템플릿입니다.
- `Use URL cache`: 켜면 캐시 파일을 즉시 삽입한 뒤 백그라운드에서 원격 내용을 확인합니다. 끄면 metadata가 있어도 항상 다시 다운로드합니다.
- `Conflict strategy`: 기존 캐시 재사용 및 백그라운드 검증, 기존 캐시를 절대 덮어쓰지 않기, 항상 새 파일 만들기 중 선택합니다.
- `Verify existing by hash`, `Verify existing by dimensions`, `Hash only when size differs`: 로컬 캐시 검증 방식입니다.
- `Max file size`, `Request timeout`, `Concurrency limit`: 처리 제한입니다.
- `Include images`, `Include PDFs`, `Include audio`, `Include video`: 처리할 자산 유형입니다.
- `Dry-run preview`: 파일을 쓰지 않고 다운로드와 링크 변환 계획만 확인합니다.
- `Include domains`와 `Exclude domains`: 선택적 도메인 필터입니다.

## 개발

- 의존성 설치: `npm install`
- lint: `npm run lint`
- test: `npm test`
- production build: `npm run build`

## 수동 설치

vault 플러그인 폴더에 다음 파일을 복사합니다.

- `main.js`
- `manifest.json`
- `styles.css`

## 개인정보와 네트워크 접근

Local assets는 Obsidian vault 안에서 실행됩니다. 사용자가 자산 명령을 직접 실행하면 노트에 명시된 절대 로컬 파일 경로를 읽어 vault로 복사할 수 있으며, 이 기능은 데스크톱 앱에서 사용할 수 있습니다. 같은 수동 처리 흐름에서 원격 소스에 대해서만 네트워크 요청을 보내며, 캐시 백그라운드 검증은 원격 처리의 일부입니다. 텔레메트리는 없습니다.

## 라이선스

GPL-3.0-only.
