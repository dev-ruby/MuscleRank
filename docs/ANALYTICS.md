# Vercel Web Analytics

이 프로젝트는 정적 HTML 사이트입니다. `dist/index.html`이 `dist/analytics.js`를 불러오고, HTTPS 사이트에서 Vercel의 `/_vercel/insights/script.js`를 로드합니다. npm 패키지 설치나 빌드 명령 변경은 필요 없습니다.

## 활성화

1. Vercel에서 MuscleRank 프로젝트의 **Analytics**를 열고 **Enable**을 누릅니다. 이미 활성화돼 있으면 다음 단계로 진행합니다.
2. 변경된 `dist/index.html`과 새 `dist/analytics.js`를 GitHub 저장소에 함께 커밋·푸시합니다.
3. 연결된 Vercel 프로젝트의 새 배포가 완료되면 배포 주소에 방문합니다.
4. Analytics 대시보드에서 방문자·페이지 조회 수가 들어오는지 확인합니다.

현재 설정은 페이지 방문 집계입니다. 앱 내부의 바디그래프/운동 기록 탭 전환은 URL이 바뀌지 않으므로 별도 페이지 조회로 기록하지 않습니다. 운동 기록이나 체격 정보를 커스텀 이벤트로 전송하는 코드는 추가하지 않았습니다.

로컬 HTTP 서버에서는 분석 스크립트를 불러오지 않습니다. 실제 수집 여부는 Vercel 배포 후 확인해야 합니다. 배포된 사이트에서 스크립트가 404라면 Analytics가 활성화되어 있는지 확인하고 다시 배포하세요. 광고 차단 확장 프로그램도 수집을 막을 수 있습니다.

- [Vercel 시작 안내](https://vercel.com/docs/analytics/quickstart)
- [Vercel 문제 해결](https://vercel.com/docs/analytics/troubleshooting)
