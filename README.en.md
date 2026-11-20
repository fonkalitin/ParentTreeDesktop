# ParentTree

A desktop family-tree editor for Windows x64. People, relationships, photos and attachments live in portable .fam documents.

- People catalog and canvas.
- Parent/child and marriage relationships, visual groups and uncertain links.
- Photos, attachments, notes and partial dates.
- Autosave, search, undo/redo and PNG/PDF export.
- Dark desktop UI, zoom and minimap.
- No account required. Documents stay on your computer.

## Run

Get **ParentTree-1.2.0-win-x64.zip** from this repository's Releases tab, extract it into a writable folder and run **ParentTreeDesktop.exe**.
The bundled example contains eight fictional people across three generations.
If Microsoft WebView2 is missing, install it using the separate **WebView2-Win10-x64.zip**, or the [official x64 standalone installer](https://go.microsoft.com/fwlink/?linkid=2124701).

The application includes .NET 10 and uses the installed WebView2 Runtime.
It does not unpack its own browser engine. The app is not code-signed; verify SHA256SUMS.txt before running a download.

## Keep your work

Your .fam documents contain photos and attachments. Preferences, recovery and UI profile live in ParentTreeData beside the executable.
Move your documents, EXE and ParentTreeData together. Reopen the desired .fam after moving if its saved path changed.
Documents and recovery files are not encrypted by the app. Keep backups and avoid sharing real personal data in bug reports.

## Build

On Windows, install .NET SDK 10 LTS and Node.js 24:

```powershell
npm --prefix web ci
npm --prefix web test
./build.ps1
```

See [build details](docs/BUILD.md), [security](SECURITY.md), [contributing](CONTRIBUTING.md), [third-party notices](THIRD_PARTY_NOTICES.md) and the [release audit](docs/RELEASE_AUDIT.md).

## License

ParentTree is licensed under [GNU GPL v3.0](LICENSE), **GPL-3.0-only**. Distributed modifications must comply with the GPL, including corresponding source availability. Third-party components retain their own terms; Microsoft WebView2 Runtime is licensed separately.
