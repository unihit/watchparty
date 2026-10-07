(() => {
  const install = document.getElementById('installApp');
  const update = document.getElementById('updateApp');
  const status = document.getElementById('connectionStatus');
  let pending;
  const standalone = () => matchMedia('(display-mode: standalone)').matches;
  const refresh = () => {
    install.hidden = standalone();
    status.textContent = navigator.onLine ? '이 기기에 저장되는 개인 목록' : '오프라인 · 목록과 메모를 볼 수 있습니다';
  };
  refresh();
  addEventListener('online', refresh);
  addEventListener('offline', refresh);
  addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); pending = event;
    install.textContent = '앱 설치'; refresh();
  });
  addEventListener('appinstalled', () => { pending = null; install.hidden = true; });
  install.onclick = async () => {
    if (pending) {
      const prompt = pending; pending = null;
      await prompt.prompt(); await prompt.userChoice;
      install.textContent = '설치 안내';
    } else {
      document.getElementById('installHelp').showModal();
    }
  };
  document.getElementById('closeInstallHelp').onclick = () => document.getElementById('installHelp').close();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').then(registration => {
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
