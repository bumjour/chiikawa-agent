# 치이카와 에이전트 (비공식 팬메이드)

바탕화면에 치이카와 캐릭터가 떠 있는 작은 비서예요. Windows·macOS에서 동작해요.

- **일정 비서**: 캐릭터를 클릭하면 오늘 일정을 캐릭터 말투로 알려 줘요. 한국어 아래에 일본어가 함께 나와요.
- **AI 대화**: 캐릭터와 자유롭게 대화해요. 가끔 시간대에 맞는 한마디(혼잣말)도 건네요.
- 캐릭터 7종: 치이카와 · 하치와레 · 우사기 · 모몽가 · 쿠리만쥬 · 시사 · 랏코
- AI: Google Gemini(무료 등급) · Anthropic Claude · OpenAI 중 선택. API 키는 각자 발급해서 넣어요.

## ⬇️ 다운로드

**다운로드 페이지: https://chiikawa-agent.github.io/chiikawa-agent/**

| 내 컴퓨터 | 바로 받기 |
|---|---|
| 🪟 Windows 10 / 11 | [ChiikawaAgent-Windows.exe](https://github.com/chiikawa-agent/chiikawa-agent/releases/latest/download/ChiikawaAgent-Windows.exe) |
| 🍎 맥 · M1~M4 칩 | [ChiikawaAgent-Mac-AppleSilicon.dmg](https://github.com/chiikawa-agent/chiikawa-agent/releases/latest/download/ChiikawaAgent-Mac-AppleSilicon.dmg) |
| 💻 맥 · 인텔 칩 | [ChiikawaAgent-Mac-Intel.dmg](https://github.com/chiikawa-agent/chiikawa-agent/releases/latest/download/ChiikawaAgent-Mac-Intel.dmg) |
| 📄 설치 가이드 PDF | [ChiikawaAgent-Guide.pdf](https://github.com/chiikawa-agent/chiikawa-agent/releases/latest/download/ChiikawaAgent-Guide.pdf) |

- Windows: "Windows의 PC 보호" 창이 뜨면 **추가 정보 → 실행**
- 맥: 처음 열 때 경고가 뜨면 **시스템 설정 → 개인정보 보호 및 보안 → 그래도 열기**

처음 실행하면 설정 창에서 이름, 직장인/학생, AI 키를 순서대로 입력해요.

## 캐릭터 이미지

받자마자 7종 모두 그림이 나와요. (모몽가·쿠리만쥬·시사·랏코는 앱에 들어 있고, 치이카와·하치와레·우사기는 처음 켤 때 팬 사이트에서 받아 와요.)

- 다른 그림을 쓰고 싶으면 캐릭터 우클릭 → **모습 고르기 → ＋ 내 이미지 추가**로 직접 준비한 이미지(배경 투명 PNG·GIF)를 넣을 수 있어요.

## 새 버전 배포

`package.json`의 `version`을 올리고 같은 이름의 태그(예: `v0.2.2`)를 올리면, GitHub Actions가 Windows·macOS 설치 파일을 만들어 Releases에 자동으로 올려요.

## 개발용 실행

```bash
npm install
npm start          # 개발용 실행
npm run dist:win   # Windows 설치 파일 만들기
npm run dist:mac   # macOS 설치 파일 만들기 (맥에서)
npm run guide      # 설치 가이드 PDF 만들기
```

## 고지

- 「ちいかわ」 캐릭터와 관련된 모든 권리는 원작자 nagano 및 권리자에게 있습니다.
- 이 프로그램은 개인이 만든 **비공식 팬메이드**이며, **비영리·무료**로만 배포합니다. 판매·광고 등 상업적으로 이용하지 않습니다.
- 권리자의 요청이 있으면 즉시 배포를 중단합니다.
- 입력한 일정과 대화는 사용자가 고른 AI 서비스로만 직접 전송되며, 개발자 서버를 거치지 않습니다.
