import { app, Menu, type MenuItemConstructorOptions } from 'electron';
import { broadcast } from './ipc/push.js';
import { checkForUpdates } from './updater.js';

/**
 * The application menu. Its Settings item carries the standard macOS `Cmd+,` accelerator, so the
 * visible entry and the shortcut come from one mechanism; other platforms open Settings by click.
 * Activating it pushes `open-settings`, which the renderer routes to the settings screen. "Check for
 * Updates…" starts a check and opens Settings too, whose Updates card is where the outcome shows.
 */
export function buildMenuTemplate(platform: NodeJS.Platform = process.platform): MenuItemConstructorOptions[] {
    const isMac = platform === 'darwin';
    const settingsItem: MenuItemConstructorOptions = {
        label: 'Settings…',
        ...(isMac ? { accelerator: 'Cmd+,' } : {}),
        click: () => broadcast('open-settings', {}),
    };
    const updatesItem: MenuItemConstructorOptions = {
        label: 'Check for Updates…',
        click: () => {
            void checkForUpdates();
            broadcast('open-settings', {});
        },
    };
    const first: MenuItemConstructorOptions = isMac
        ? {
              label: app.name,
              submenu: [
                  { role: 'about' },
                  updatesItem,
                  { type: 'separator' },
                  settingsItem,
                  { type: 'separator' },
                  { role: 'services' },
                  { type: 'separator' },
                  { role: 'hide' },
                  { role: 'hideOthers' },
                  { role: 'unhide' },
                  { type: 'separator' },
                  { role: 'quit' },
              ],
          }
        : { label: 'File', submenu: [settingsItem, updatesItem, { type: 'separator' }, { role: 'quit' }] };
    return [first, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }];
}

export function installApplicationMenu(): void {
    Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate()));
}
