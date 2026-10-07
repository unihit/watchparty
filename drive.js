(() => {
  const $ = id => document.getElementById(id), app = window.Watchparty;
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  let token = null, expiry = 0, folder = null, jsonFile = null, baseline = null, busy = false, dirty = false, timer, dbPromise;
  const objectUrls = new Set();
  const status = text => $('driveStatus').textContent = text;
  const controls = () => {
    $('driveConnect').disabled = busy;
    $('driveLoad').disabled = !token || busy || !jsonFile;
    $('driveSave').disabled = !token || busy;
    $('driveAuto').disabled = !token || busy || Boolean(jsonFile && !baseline);
    $('driveDisconnect').hidden = !token;
    $('driveConnect').textContent = token ? '다시 연결' : 'Google 연결';
  };
  const db = () => dbPromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('watchparty-thumbnails', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error('썸네일 저장 공간을 열 수 없습니다.'));
  });
  async function imageStore(action, id, value) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('images', action === 'get' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('images');
      const request = action === 'get' ? store.get(id) : action === 'delete' ? store.delete(id) : store.put(value, id);
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(Error('썸네일 저장에 실패했습니다.'));
      transaction.onabort = () => reject(Error('썸네일 저장이 중단됐습니다.'));
    });
  }
  async function api(path, options = {}, upload = false) {
    if (!token || Date.now() >= expiry) { token = null; controls(); throw Error('Google 연결이 만료됐습니다. 다시 연결해주세요.'); }
    const headers = new Headers(options.headers); headers.set('Authorization', 'Bearer ' + token);
    const response = await fetch('https://www.googleapis.com/' + (upload ? 'upload/drive/v3/' : 'drive/v3/') + path, { ...options, headers });
    if (!response.ok) {
      if (response.status === 401) { token = null; controls(); }
      let message;
      try { message = (await response.json()).error?.message; } catch {}
      throw Error(response.status === 401 ? 'Google 연결을 다시 해주세요.' : 'Drive 요청 실패 (' + response.status + ')' + (message ? ': ' + message : ''));
    }
    return response;
  }
  const json = async (path, options, upload) => (await api(path, options, upload)).json();
  const query = q => 'files?' + new URLSearchParams({ q, spaces: 'drive', fields: 'files(id,name,version,modifiedTime),nextPageToken', pageSize: '100' });
  async function discover() {
    const found = await json(query("trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='watchparty' and value='folder-v1' }"));
    folder = found.files[0]?.id || null; jsonFile = null; baseline = null;
    if (folder) {
      const files = await json(query("trashed = false and '" + folder + "' in parents and appProperties has { key='watchparty' and value='catalog-v1' }"));
      jsonFile = files.files[0] || null;
    }
  }
  async function multipart(metadata, blob) {
    const boundary = 'watchparty_' + crypto.randomUUID();
    const body = new Blob(['--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n', JSON.stringify(metadata), '\r\n--' + boundary + '\r\nContent-Type: ' + (blob.type || 'application/octet-stream') + '\r\n\r\n', blob, '\r\n--' + boundary + '--'], { type: 'multipart/related; boundary=' + boundary });
    return json('files?uploadType=multipart&fields=id,version', { method: 'POST', body }, true);
  }
  async function ensureFolder() {
    if (!folder) folder = (await json('files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Watchparty', mimeType: 'application/vnd.google-apps.folder', appProperties: { watchparty: 'folder-v1' } }) })).id;
  }
  const metadata = id => json('files/' + encodeURIComponent(id) + '?fields=id,version');
  async function checkConflict() {
    if (jsonFile) {
      const latest = await metadata(jsonFile.id);
      if (!baseline || latest.version !== baseline) { $('driveAuto').checked = false; throw Error('Drive에 다른 변경 내용이 있습니다. 먼저 불러오세요. 현재 기기 목록은 내보내기로 보관할 수 있습니다.'); }
    }
  }
  async function uploadState() {
    await checkConflict(); await ensureFolder();
    const snapshot = app.getState();
    const uploaded = [];
    for (const video of snapshot.videos) {
      const cached = await imageStore('get', video.id);
      if (cached?.dirty) {
        const file = await multipart({ name: video.id + '.jpg', parents: [folder], appProperties: { watchparty: 'thumbnail-v1' } }, cached.blob);
        video.thumbnailFileId = file.id; uploaded.push({ id: video.id, fileId: file.id, cached });
      }
    }
    await checkConflict();
    const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });
    if (jsonFile) jsonFile = await json('files/' + encodeURIComponent(jsonFile.id) + '?uploadType=media&fields=id,version', { method: 'PATCH', body: blob }, true);
    else jsonFile = await multipart({ name: 'watchparty.json', parents: [folder], appProperties: { watchparty: 'catalog-v1' } }, blob);
    baseline = jsonFile.version;
    for (const image of uploaded) {
      const latest = await imageStore('get', image.id);
      if (latest?.changedAt === image.cached.changedAt) {
        await imageStore('put', image.id, { ...latest, dirty: false, remoteId: image.fileId });
        app.updateThumbnail(image.id, image.fileId);
      }
    }
  }
  async function run(operation) {
    if (busy) return;
    busy = true; controls();
    try { await operation(); } catch (error) { status(error.message || '연결에 실패했습니다.'); }
    finally { busy = false; controls(); if (dirty && token && $('driveAuto').checked) schedule(); }
  }
  async function saveRemote() {
    await run(async () => {
      status('목록과 썸네일을 Drive에 저장 중…'); dirty = false;
      try { await uploadState(); status('Drive에 저장했습니다. 다른 기기에서 같은 Google 계정으로 불러오세요.'); }
      catch (error) { dirty = true; $('driveAuto').checked = false; throw error; }
    });
  }
  async function loadRemote() {
    if (app.getState().videos.length && !confirm('현재 기기의 목록을 Drive 목록으로 바꿀까요? 보관할 내용이 있다면 먼저 목록 내보내기를 이용하세요.')) return;
    await run(async () => {
      status('Drive 목록을 불러오는 중…');
      const before = await metadata(jsonFile.id);
      const data = await (await api('files/' + encodeURIComponent(jsonFile.id) + '?alt=media')).json();
      const after = await metadata(jsonFile.id);
      if (before.version !== after.version) throw Error('목록이 변경됐습니다. 다시 불러오기를 눌러주세요.');
      // Validate before changing any local thumbnail records.
      if (data?.version !== 2 || !catalogValid(data.categories, data.presets) || !Array.isArray(data.videos) || !data.videos.every(valid)) throw Error('올바른 Watchparty 목록이 아닙니다.');
      for (const video of data.videos) {
        const cached = await imageStore('get', video.id);
        if (cached && (!video.thumbnailFileId || cached.remoteId !== video.thumbnailFileId)) await imageStore('delete', video.id);
      }
      app.applyState(data); baseline = after.version; dirty = false;
      status('Drive 목록을 불러왔습니다. 편집 후 자동 저장을 켤 수 있습니다.');
    });
  }
  function schedule() {
    clearTimeout(timer); timer = setTimeout(() => { if (!busy && dirty && token && $('driveAuto').checked) saveRemote(); }, 1500);
  }
  function loadGIS() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client';
      script.onload = resolve; script.onerror = () => { script.remove(); reject(Error('Google 로그인 스크립트를 불러올 수 없습니다. 인터넷 연결을 확인하세요.')); };
      document.head.append(script);
    });
  }
  async function connect() {
    const clientId = localStorage.getItem('watchparty-google-client-id');
    if (!clientId) { openSettings(); return; }
    // Loading the library first can consume the browser's popup gesture: if so, ask for a second explicit click.
    if (!window.google?.accounts?.oauth2) {
      try { status('Google 연결 준비 중…'); await loadGIS(); status('준비됐습니다. Google 연결을 한 번 더 눌러주세요.'); }
      catch (e) { status(e.message); } return;
    }
    const client = google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: SCOPE, include_granted_scopes: false,
      error_callback: () => { status('로그인 창이 닫혔거나 차단됐습니다. Chrome에서 다시 연결해주세요.'); },
      callback: async result => {
        if (result.error || !result.access_token) { status('Google 연결을 승인하지 않았습니다.'); return; }
        token = result.access_token; expiry = Date.now() + Number(result.expires_in || 3600) * 1000 - 30000;
        $('driveAuto').checked = false;
        await run(async () => {
          status('Watchparty 저장 파일을 찾는 중…'); await discover();
          status(jsonFile ? '저장된 Drive 목록이 있습니다. 불러오기를 눌러주세요.' : '연결됐습니다. Drive에 저장을 누르면 Watchparty 폴더를 만듭니다.');
          app.render();
        });
      }
    }); client.requestAccessToken({ prompt: 'select_account' });
  }
  function openSettings() { $('clientId').value = localStorage.getItem('watchparty-google-client-id') || ''; $('driveConfigError').textContent = ''; $('driveConfig').showModal(); }
  $('driveSettings').onclick = openSettings;
  $('driveConfigClose').onclick = () => $('driveConfig').close();
  $('driveConfigForm').onsubmit = event => {
    event.preventDefault(); const id = $('clientId').value.trim();
    if (!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(id)) { $('driveConfigError').textContent = '올바른 웹 OAuth 클라이언트 ID를 입력해주세요.'; return; }
    try { localStorage.setItem('watchparty-google-client-id', id); } catch { $('driveConfigError').textContent = '이 브라우저에서 설정을 저장할 수 없습니다.'; return; }
    token = null; folder = null; jsonFile = null; baseline = null; $('driveAuto').checked = false; controls();
    $('driveConfig').close(); status('설정을 저장했습니다. Google 연결을 눌러주세요.');
  };
  $('driveConnect').onclick = connect; $('driveSave').onclick = saveRemote; $('driveLoad').onclick = loadRemote;
  $('driveAuto').onchange = () => { if ($('driveAuto').checked && dirty) schedule(); };
  $('driveDisconnect').onclick = () => {
    clearTimeout(timer); token = null; expiry = 0; folder = null; jsonFile = null; baseline = null; $('driveAuto').checked = false; controls();
    status('연결을 해제했습니다. 기기에 저장한 목록과 썸네일은 유지됩니다.');
  };
  window.WatchpartyDrive = {
    releaseThumbnails() { for (const url of objectUrls) URL.revokeObjectURL(url); objectUrls.clear(); },
    changed() { dirty = true; if (token && $('driveAuto').checked) schedule(); },
    async storeThumbnail(id, file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw Error('10MB 이하의 JPG, PNG, WebP 이미지를 선택하세요.');
      const bitmap = await createImageBitmap(file), canvas = document.createElement('canvas');
      const scale = Math.min(1, 640 / bitmap.width); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      if (canvas.height > 2000) { bitmap.close(); throw Error('가로형 썸네일 이미지를 선택해주세요.'); }
      const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .8));
      if (!blob) throw Error('썸네일 이미지를 변환할 수 없습니다.');
      await imageStore('put', id, { blob, dirty: true, changedAt: crypto.randomUUID(), remoteId: null });
    },
    async showThumbnail(video, image) {
      const display = blob => {
        if (!blob || !image.isConnected) return;
        const url=URL.createObjectURL(blob);objectUrls.add(url);
        image.onload=()=>{image.hidden=false};image.onerror=()=>{image.hidden=true};
        image.hidden=false;image.src=url;
      };
      let cached;
      try { cached=await imageStore('get',video.id); } catch {}
      if(cached?.blob)display(cached.blob);
      if(video.thumbnailFileId&&token&&(!cached||(!cached.dirty&&cached.remoteId!==video.thumbnailFileId))){
        try{const response=await api('files/'+encodeURIComponent(video.thumbnailFileId)+'?alt=media');let blob=await response.blob();if(!blob.type.startsWith('image/'))blob=new Blob([blob],{type:'image/jpeg'});display(blob);try{await imageStore('put',video.id,{blob,dirty:false,remoteId:video.thumbnailFileId})}catch{}}
        catch { /* A local thumbnail stays visible if Drive is unavailable. */ }
      }
    }
  };
  controls(); app.render();
})();
