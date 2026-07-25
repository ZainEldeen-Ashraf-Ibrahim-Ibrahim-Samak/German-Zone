import { WindowApi } from '../../electron/preload'

declare global {
  interface Window {
    api: WindowApi
  }
}
