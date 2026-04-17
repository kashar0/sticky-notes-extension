# Sticky Notes

Leave sticky notes on any website and they will still be there the next time you visit. Notes are stored per hostname so your reminder on a specific GitHub issue or a note on a documentation page stays exactly where you left it.

## What you can do with each note

Notes are draggable by their header bar. You can move them anywhere on the page without accidentally selecting the text inside. If you want to lock a note in place so it does not move, the pin button fixes its position until you unpin it.

Each note can be set to one of six colors: yellow, green, blue, pink, purple, or orange. You change the color by clicking the colored dots in the note header. This makes it easy to organize notes visually, for example using red for urgent reminders and blue for reference notes.

Notes can be minimized to just their header bar when they are in the way but you do not want to delete them yet. A timestamp in each note shows when you last edited it.

The extension popup shows you all notes on the current page. From there you can hide individual notes without deleting them, show hidden notes again, or delete specific ones. There is also an add button in the popup to create a new note without having to interact with the page directly.

## How notes are saved

Notes are keyed by the hostname of the page you are on. Every time you move, edit, or delete a note the extension immediately writes the updated state to chrome.storage.local. Notes survive browser restarts and profile sessions.

## Security

The content script uses createElement and textContent for all DOM operations. There is no innerHTML used anywhere, so note content cannot execute as HTML or inject scripts regardless of what you type.

## How to install

Clone or download this repo, open Chrome and go to chrome://extensions, enable Developer Mode, click Load unpacked, and select this folder.

## Permissions

The extension needs storage to save your notes, scripting and activeTab to inject the note layer onto the page you are viewing. Nothing is sent anywhere and no note content leaves your browser.
