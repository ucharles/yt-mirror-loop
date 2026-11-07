# SideStore 설치 담당자 안내

이 앱은 개발 서버가 필요 없는 **Release IPA**로 전달합니다. IPA는 서명되지 않은 상태이며 SideStore에서 사용자의 Apple 계정으로 서명하여 설치합니다. 무료 계정은 7일 안에 갱신해야 합니다. 자동 갱신을 설정해도 성공 여부를 확인할 담당자는 필요합니다.

## 1. 전달 파일 준비 (개발자)

```bash
npm run lint
npm run typecheck
npm run build:ipa
```

- `build/yt-mirror-loop.ipa`: iPad에서 SideStore로 선택할 앱 파일
- `build/sidestore/`: IPA, 한국어 사용자 안내, 설치 담당자 안내, 빌드 정보, SHA-256
- `build/yt-mirror-loop-sidestore.zip`: 위 폴더를 묶은 전달용 파일
- 빌드는 로컬 Xcode의 Release archive를 사용합니다. 기존 무료 계정·무서명 IPA 전달 경로이며 EAS/App Store용 서명 빌드와 다릅니다.
- 번들 안의 실행 파일·`main.jsbundle`·실기기 플랫폼을 검사합니다. Expo Go나 Metro를 켤 필요가 없습니다. YouTube 재생은 인터넷이 필요합니다.

## 2. 기존 데이터부터 백업

1. 현재 사용하는 앱의 영상 목록에서 **내보내기**를 누르고 JSON을 앱 바깥의 파일 앱 또는 Mac에 저장합니다.
2. 로컬 영상의 원본 파일도 따로 확보합니다. **JSON은 영상 파일 자체와 마지막 재생 위치를 포함하지 않습니다.**
3. 기존 앱을 삭제하지 않습니다. Xcode 설치본과 SideStore 설치본은 서명 시 식별자가 달라 별도 앱으로 나타날 수 있습니다. 데이터가 자동으로 옮겨진다고 가정하지 않습니다.
4. 새 앱에서 **가져오기**로 JSON을 선택합니다. 로컬 영상에 ‘파일 없음’이 뜨면 **파일 연결**로 원본 파일을 지정합니다. 구간·메모·유튜브 목록을 확인한 뒤 기존 앱 정리를 판단합니다.

## 3. SideStore 최초 설정

이미 SideStore가 있으면 먼저 실행·수동 갱신이 되는지 확인합니다. 설치되어 있지 않으면 아래 절차를 진행합니다.

1. iPad를 Wi-Fi에 연결합니다. App Store에서 [LocalDevVPN](https://docs.sidestore.io/docs/installation/prerequisites)을 설치하고 VPN 구성을 허용합니다.
2. Mac에 [공식 iloader](https://iloader.app)를 설치합니다. USB로 iPad를 연결하고 기기의 ‘이 컴퓨터를 신뢰’를 승인합니다.
3. iloader에서 사용할 Apple 계정으로 로그인하고 기기를 선택하여 **Install SideStore (Stable)**를 진행합니다. 비밀번호·이중 인증·기기 암호는 사용자가 직접 입력합니다.
4. iPad 설정 → 일반 → VPN 및 기기 관리에서 해당 개발자 앱을 신뢰합니다. 필요하면 개인정보 보호 및 보안 → 개발자 모드를 켜고 재시작합니다.
5. LocalDevVPN을 연결하고 SideStore에서 같은 Apple 계정으로 로그인합니다.
6. SideStore → **My Apps**에서 SideStore 옆 남은 일수를 눌러 **SideStore 자체를 먼저 갱신**합니다. 이후 앱 설치를 진행합니다.

설치 화면과 지원 조건은 [SideStore 공식 설치 안내](https://docs.sidestore.io/docs/installation/install)를 우선합니다. 페어링 파일 교체가 필요하면 [공식 복구 안내](https://docs.sidestore.io/docs/advanced/pairing-file)를 따릅니다.

## 4. 앱 설치

1. `yt-mirror-loop.ipa`를 AirDrop 등으로 iPad 파일 앱에 저장합니다. ZIP을 전달했다면 먼저 압축을 풉니다.
2. Wi-Fi와 LocalDevVPN 연결을 확인합니다.
3. SideStore → **My Apps** → **+**에서 IPA를 선택합니다.
4. 설치가 완료되면 앱을 열어 영상 목록·구간 정보를 확인하고, 필요하면 위의 JSON 가져오기를 진행합니다.
5. **Mac과 USB 연결을 끊은 상태**에서 앱을 완전히 닫았다가 다시 열어 독립 실행을 확인합니다.

무료 계정은 SideStore를 포함하여 활성 앱 3개 제한이 있습니다. 기존 설치본 때문에 제한에 걸려도 백업 전에 앱을 삭제하지 않습니다. 설치된 앱·계정을 먼저 확인합니다.

## 5. 갱신 설정

- iPad 설정 → 일반 → 백그라운드 앱 새로 고침을 허용하고, SideStore의 Background Refresh 설정이 제공되면 켭니다.
- SideStore는 백그라운드 갱신을 시도합니다. 갱신 시 **Wi-Fi와 LocalDevVPN**이 필요합니다. iPadOS가 실행 시점을 결정하므로 성공을 보장하지 않습니다.
- 단축어 앱에서 SideStore의 **Refresh All Apps** 동작이 제공되면, 매일 충전할 때 또는 일정한 시간에 실행하는 개인용 자동화를 추가합니다. ‘즉시 실행’ 등 실행 전 확인을 생략하는 옵션이 제공되면 선택합니다. 동작 이름·제공 여부는 설치한 버전에 따라 다를 수 있습니다.
- 자동화를 한 번 직접 실행하고, SideStore와 이 앱의 남은 일수가 실제로 늘어나는지 확인합니다. 지원되지 않으면 백그라운드 갱신과 주 2회 수동 확인을 사용합니다.
- 서명 갱신은 사용 기간을 연장하는 것이며 새 기능을 설치하는 업데이트와 다릅니다. 앱 업데이트는 새 IPA를 같은 SideStore에서 설치합니다.

## 6. 전달 전에 담당자가 확인할 것

- [ ] JSON과 로컬 영상 원본을 별도로 백업했다.
- [ ] 전달한 최신 IPA를 SideStore로 설치했다.
- [ ] Mac 연결 없이 실행된다.
- [ ] YouTube 재생·화질 선택·기본 자막 OFF·반전·전체화면이 동작한다.
- [ ] 목록·구간·메모를 가져왔고 로컬 파일 연결을 확인했다.
- [ ] SideStore와 이 앱을 수동 갱신한 뒤 데이터가 남아 있다.
- [ ] 자동화/백그라운드 갱신을 설정하고 실제 일수 갱신을 확인했다.
- [ ] 사용자에게 사용안내와 문제 발생 시 연락할 담당자를 전달했다.

## 문제 복구

- 갱신 실패: Wi-Fi → LocalDevVPN 연결 → SideStore **Refresh All** 순서로 다시 시도합니다.
- SideStore도 열리지 않거나 페어링 오류가 계속되면 담당자가 Mac의 iloader로 복구합니다. 기기 업데이트·초기화 후 페어링 재설정이 필요할 수 있습니다.
- 앱을 지우고 해결하려고 하지 않습니다. 삭제는 앱 내부 영상과 설정을 지울 수 있습니다.

공식 자료: [준비 사항](https://docs.sidestore.io/docs/installation/prerequisites), [설치](https://docs.sidestore.io/docs/installation/install), [FAQ](https://docs.sidestore.io/docs/faq), [페어링 복구](https://docs.sidestore.io/docs/advanced/pairing-file). 확인일: 2026-11-07.
