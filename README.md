# Watchparty · 내 영상 보관함

Android Chrome에서 설치할 수 있는 개인 유튜브 링크 목록 PWA입니다. 앱 주소: https://unihit.github.io/watchparty/

- 썸네일 카드, 검색, 재생 상태 필터
- 카테고리와 작품명 추가·이름 변경·삭제
- 영상 제목과 메모 편집
- 기기 내 저장과 JSON 내보내기·가져오기
- 앱 화면과 목록의 오프라인 사용 (썸네일과 영상 재생은 인터넷 필요)

개인 영상 주소는 앱 소스에 포함되어 있지 않습니다. 앱에서 링크를 직접 추가하거나 목록 JSON 파일을 가져오세요. 목록은 현재 기기에 저장됩니다. Google Drive 연결 후 사용자가 저장을 선택하거나 자동 저장을 켜면 본인 Drive의 Watchparty 폴더에 목록과 선택한 썸네일을 저장합니다. Google 웹 OAuth 클라이언트 ID 설정이 필요합니다.

## 설치

GitHub Pages 주소를 Android Chrome에서 열고 `앱 설치` 버튼을 누르세요. 버튼이 설치 안내로 표시되면 Chrome의 `⋮ → 홈 화면에 추가 → 설치`를 선택하세요.

## GitHub Pages

Settings → Pages → Deploy from a branch → main → / (root).
모든 파일 경로와 서비스 워커 범위는 상대 경로를 사용하므로 저장소 하위 주소에서도 동작합니다.

서비스 워커 파일을 변경할 때 캐시 버전을 바꿔주세요. 업데이트를 발견하면 앱에서 업데이트 버튼을 제공합니다.

