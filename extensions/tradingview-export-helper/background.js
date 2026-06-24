chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "ICT_EXPORT_HELPER_DOWNLOAD_LOG") return false;

  const payload = JSON.stringify(message.payload ?? {}, null, 2);
  const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  chrome.downloads.download(
    {
      url: dataUrl,
      filename: `ict-tradingview-helper-log-${timestamp}.json`,
      saveAs: true
    },
    (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true, downloadId });
    }
  );

  return true;
});
