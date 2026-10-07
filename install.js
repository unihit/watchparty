(() => {
  const install = document.getElementById('installApp');
  const update = document.getElementById('updateApp');
  const status = document.getElementById('connectionStatus');
  const help = document.getElementById('installHelp');
  const helpStatus = document.getElementById('installStatus');
  const installNow = document.getElementById('installNow');
  const chromeLink = document.getElementById('openInChrome');
  const pageUrl = new URL('./', location.href).href;
  let pending, installed = false, prompting = false;
  chromeLink.hidden = !/Android/i.test(navigator.userAgent);
  chromeLink.href = 'intent://' + pageUrl.replace(/^https:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(pageUrl) + ';end';
  document.getElementById('installPageLink').href = pageUrl;
  document.getElementById('installPageLink').textContent = pageUrl;
  const standalone = () => matchMedia('(display-mode: standalone)').matches;
  const refresh = () => {
    install.hidden = standalone() || installed;
    install.textContent = pending ? '앱 설치' : '설치 안내';
    install.disabled = prompting;
    installNow.hidden = !pending || installed || standalone();
    installNow.disabled = prompting;
    status.textContent = navigator.onLine ? '이 기기에 저장되는 개인 목록' : '오프라인 · 저장한 목록을 볼 수 있습니다';
  };
  refresh();
  addEventListener('online', refresh);
  addEventListener('offline', refresh);
  addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); pending = event;
    installed = false; refresh();
    helpStatus.textContent = '설치 준비가 됐습니다. 아래 앱 설치를 눌러주세요.';
  });
  addEventListener('appinstalled', () => { pending = null; installed = true; refresh(); if(help.open) help.close(); });
  const requestInstall = async () => {
    if(prompting) return;
    if (pending) {
      const prompt = pending; pending = null;
      prompting = true; refresh();
      try {
        await prompt.prompt(); const choice = await prompt.userChoice;
        if(choice.outcome === 'accepted') { helpStatus.textContent = '설치를 요청했습니다. 브라우저의 설치 완료 안내를 확인해주세요.'; if(help.open) help.close(); }
        else { helpStatus.textContent = '설치를 취소했습니다. 다시 설치하려면 Chrome의 ⋮ 메뉴에서 홈 화면에 추가 또는 앱 설치를 선택하세요.'; if(!help.open) help.showModal(); }
      } catch {
        helpStatus.textContent = '설치 창을 열지 못했습니다. Chrome의 ⋮ 메뉴에서 홈 화면에 추가 또는 앱 설치를 선택하세요.';
        if(!help.open) help.showModal();
      } finally { prompting = false; refresh(); }
    } else {
      helpStatus.textContent = '아직 이 브라우저에서 설치 창을 제공하지 않았습니다. Chrome에서 페이지를 조작하고 잠시 기다리거나, ⋮ 메뉴에서 홈 화면에 추가 또는 앱 설치를 선택하세요. 이미 설치했다면 홈 화면에서 watchparty를 찾아주세요.';
      if(!help.open) help.showModal();
    }
  };
  install.onclick = requestInstall;
  installNow.onclick = requestInstall;
  document.getElementById('closeInstallHelp').onclick = () => help.close();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => {
      const offer = () => {
        if (!registration.waiting || !navigator.serviceWorker.controller) return;
        update.hidden = false;
        update.onclick = () => registration.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' });
      };
      offer();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offer(); });
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloaded) { reloaded = true; location.reload(); }
      });
    }).catch(() => {
      status.textContent = '오프라인 준비 실패 · 인터넷에 연결한 뒤 다시 열어주세요';
    });
  }
})();
