# SignalScope Privacy Notice

SignalScope is a local Chrome extension for collecting public LinkedIn company posts that the user can already view in the active browser tab.

## Data handling

- The extension does not collect or transmit analytics, telemetry, credentials, cookies, browsing history, or authentication data.
- It does not automatically sign in, bypass access restrictions, or perform likes, comments, follows, reposts, or publishing actions.
- Post data is processed locally in the browser and is saved only to a folder selected by the user or to the browser's normal download location.
- Folder permissions, company aliases, and interrupted-scan checkpoints are stored locally in the extension's browser storage.
- No collected content is sent to the developer or to a third-party server.

## Permissions

- `activeTab`: temporary access to the LinkedIn company Posts page selected by the user.
- `scripting`: injects the local collector into that active tab after the user starts a scan.
- Background service worker: performs local file saving, checkpoint storage, and cumulative-file merging. It does not make network requests.

## User control

Users choose when to start or stop every scan, which folder receives exports, and which files are later opened in the local research desk. Removing the extension removes its locally stored settings and checkpoints. Exported files remain under the user's control.

## Contact

Before public release, replace this section with the repository issue URL or a maintained contact address.
