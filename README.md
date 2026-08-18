# 무신사 포토후기 TOP10 모니터

무신사 상품의 "사진후기만 · 유용한순" TOP10 리뷰 구성을 매시간 자동으로 체크하고, 순위 구성원이 바뀌면(신규 진입/이탈) 텔레그램으로 알림을 보내는 개인용 웹앱입니다.

## 구조

- **Web 서비스 (Render 무료)**: 대시보드(현재 TOP10), 변동이력(최근 30일), 상품 관리 UI + `/api/cron/check` 체크 실행 엔드포인트
- **스케줄러 (GitHub Actions 무료)**: 매시간 정각 `/api/cron/check`를 호출해 체크를 트리거. (Render는 Cron Job 서비스에 무료 플랜을 제공하지 않아, 이미 갖고 있는 GitHub 계정의 무료 Actions 스케줄 기능으로 대체)
- **DB**: Postgres (Neon 무료 플랜 권장)

무신사의 리뷰 목록은 로그인 없이 아래 비공식 내부 API로 조회합니다 (사이트 구조 변경 시 동작이 깨질 수 있습니다):

```
GET https://goods.musinsa.com/api2/review/v1/view/list
    ?page=0&pageSize=10&goodsNo={상품번호}&sort=up_cnt_desc&hasPhoto=true&isExperience=false
```

## 1. 로컬 개발 준비

```bash
npm install
cp .env.example .env
```

`.env` 파일을 열어 아래 값을 채웁니다.

- `DATABASE_URL`: 아래 2번에서 발급받은 Postgres 커넥션 스트링
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`: 아래 3번에서 발급
- `DASHBOARD_PASSWORD`: 대시보드 로그인 비밀번호 (직접 정하기)
- `SESSION_SECRET`: 임의의 긴 랜덤 문자열 (직접 정하기, 예: `openssl rand -hex 32`)
- `CRON_SECRET`: 외부 스케줄러가 체크를 트리거할 때 쓰는 고정 시크릿 (직접 정하기, 임의의 랜덤 문자열)

DB 스키마 적용:

```bash
npm run migrate
```

로컬 서버 실행:

```bash
npm run dev
```

`http://localhost:3000` 접속 → 로그인 → 상품관리에서 무신사 상품 URL 등록 → 대시보드에서 "지금 체크" 클릭해 정상 동작 확인.

체크 로직만 단독 실행(크론이 실제로 하는 일과 동일):

```bash
npm run check
```

## 2. Postgres DB 준비 (Neon, 무료)

1. https://neon.tech 에서 계정 생성 (본인이 직접 가입해야 합니다)
2. 새 프로젝트 생성 → 기본 데이터베이스의 **Connection string**을 복사
3. `.env`의 `DATABASE_URL`에 붙여넣기 (`sslmode=require` 포함된 형태 그대로 사용)
4. `npm run migrate`로 테이블 생성

## 3. 텔레그램 봇 준비 (본인이 직접 생성)

1. 텔레그램에서 **@BotFather** 검색 후 대화 시작
2. `/newbot` 입력 → 봇 이름과 username(반드시 `bot`으로 끝나야 함) 설정
3. 발급된 **토큰**을 `TELEGRAM_BOT_TOKEN`에 저장
4. 방금 만든 봇을 검색해서 아무 메시지나 한 번 전송 (예: `안녕`)
5. 브라우저로 아래 URL 접속 (TOKEN 자리에 본인 토큰 입력):
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
6. 응답 JSON에서 `"chat":{"id": 123456789, ...}` 의 숫자를 `TELEGRAM_CHAT_ID`에 저장

## 4. Render 배포 (Web 서비스)

1. 이 프로젝트를 GitHub 리포지토리에 push (본인 GitHub 계정 필요)
2. https://render.com 에서 계정 생성 후 **New > Blueprint** 선택, 방금 push한 리포지토리 연결
   → `render.yaml`을 읽어 Web 서비스가 자동 생성됩니다
3. 서비스의 **Environment** 탭에서 `.env`와 동일한 값을 입력: `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DASHBOARD_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`
4. 배포 완료 후 발급되는 URL(예: `https://musinsa-review-monitor-web.onrender.com`)로 접속해 로그인 → 상품 등록

## 5. GitHub Actions로 매시간 체크 예약

Render 무료 플랜은 Cron Job(예약 실행) 서비스를 지원하지 않으므로, 대신 이 리포지토리에 포함된 `.github/workflows/hourly-check.yml`이 매시간 Render 앱의 `/api/cron/check`를 호출합니다.

1. GitHub 리포지토리 → **Settings > Secrets and variables > Actions** 이동
2. 아래 두 개의 **Repository secret** 추가
   - `RENDER_APP_URL`: 4번에서 발급받은 Render 앱 URL (예: `https://musinsa-review-monitor-web.onrender.com`, 끝에 슬래시 없이)
   - `CRON_SECRET`: 위 3번에서 Render에 설정한 `CRON_SECRET`과 동일한 값
3. **Actions** 탭에서 "Hourly Musinsa review check" 워크플로우를 확인할 수 있고, `workflow_dispatch`로 수동 실행도 가능합니다 (즉시 테스트용)

### 참고사항 / 알려진 제약

- Render 무료 Web 서비스는 15분간 요청이 없으면 슬립 상태가 되지만, GitHub Actions가 매시간 깨워서 체크를 트리거하므로 사용자가 대시보드에 접속하지 않아도 체크/알림은 정상 동작합니다. 다만 첫 요청은 기동 지연(수십 초)이 있을 수 있어 워크플로우의 curl 타임아웃을 90초로 넉넉히 잡아뒀습니다.
- 무신사 API가 비공식이므로 응답 구조가 바뀌거나 특정 요청을 차단할 수 있습니다. 이 경우 `src/lib/musinsa.ts`의 파싱 로직을 API 응답에 맞춰 수정해야 합니다.
- 상품 삭제 시 해당 상품의 스냅샷/변동이력도 함께 삭제됩니다(DB 외래키 CASCADE).
- 변동이력은 30일이 지나면 매 체크 사이클마다 자동 삭제됩니다.
- `/api/cron/check`는 로그인 쿠키가 아니라 `CRON_SECRET` 헤더로만 보호되므로, 이 값은 대시보드 비밀번호와 마찬가지로 외부에 노출되지 않도록 주의하세요.
