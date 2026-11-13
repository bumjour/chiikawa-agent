'use strict';
// PC를 켜고 로그인하면 치이카와 에이전트가 저절로 켜지게 (Windows: 시작 프로그램, 맥: 로그인 항목)
// 기본값은 켜짐. 우클릭 메뉴 'PC 켤 때 자동 실행'으로 끄고 켤 수 있어요.
const { app } = require('electron');
const path = require('path');

// 개발용(electron . 실행)은 electron.exe + 프로젝트 폴더로 등록하고, 설치본과 이름을 나눠서 서로 덮어쓰지 않게 해요.
function options() {
  if (app.isPackaged || process.platform !== 'win32') return {};
  return {
    path: process.execPath,
    args: [path.resolve(__dirname, '..')],
    name: 'ChiikawaAgentDev',
  };
}

function isEnabled() {
  return app.getLoginItemSettings(options()).openAtLogin;
}

function setEnabled(on) {
  const opts = options();
  app.setLoginItemSettings({ ...opts, openAtLogin: !!on, openAsHidden: true });
}

// 앱이 켜질 때: 설정값(autoStart)에 맞춰 등록 상태를 맞춰 둬요. (실행 파일 위치가 바뀌어도 다시 잡힘)
function sync(cfg, log = () => {}) {
  try {
    const want = cfg.autoStart !== false;
    setEnabled(want);
    log(`[autostart] ${want ? '켜짐' : '꺼짐'}`);
  } catch (err) {
    log(`[autostart] 설정 실패: ${err.message}`);
  }
}

module.exports = { isEnabled, setEnabled, sync };
