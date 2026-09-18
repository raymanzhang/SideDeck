# SideDeck icon

`sidedeck-icon.png` is the canonical imagegen-created source: a silver main
display and a wide teal secondary-display frame, on a transparent background.

Export with the locked local Tauri CLI:

```sh
npm run tauri -- icon assets/brand/sidedeck-icon.png --output /tmp/sidedeck-icons
```

Copy `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, and `icon.ico`
into `src-tauri/icons`; copy `32x32.png` to `public/favicon.png`.
