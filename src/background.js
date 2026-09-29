chrome.action.onClicked.addListener(tab => {
  if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'PLANNER_TOGGLE' }).catch(() => {});
});
