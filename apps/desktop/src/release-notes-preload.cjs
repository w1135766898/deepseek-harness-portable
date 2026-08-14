const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('deepSeekReleaseNotes', {
  getData: () => ipcRenderer.invoke('release-notes:get-data'),
  sendAction: action => ipcRenderer.send('release-notes:action', action),
  onReload: callback => {
    const listener = () => callback()
    ipcRenderer.on('release-notes:reload', listener)
    return () => ipcRenderer.removeListener('release-notes:reload', listener)
  },
  onUpdateState: callback => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('release-notes:update-state', listener)
    return () => ipcRenderer.removeListener('release-notes:update-state', listener)
  },
})
