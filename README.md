# kubermeister

A fast, native desktop client for browsing and managing Kubernetes clusters.

## Installation

Kubermeister ships in two channels. Both can be installed side by side; they are separate apps
with separate settings.

| Channel    | App name         | What it is                                                   | Where                                                                           |
| ---------- | ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Stable** | Kubermeister     | Versioned releases, `vX.Y.Z`                                 | [Releases](https://github.com/araratpoghosyan/kubermeister/releases)            |
| **Tip**    | Kubermeister Tip | Nightly build, rebuilt on every change to `main`. May break. | [Tip release](https://github.com/araratpoghosyan/kubermeister/releases/tag/tip) |

The first stable release is not out yet. Until it is, Tip is the only download.

### macOS

Download the `.dmg` for your Mac: `mac-arm64` for Apple silicon, `mac-x64` for Intel. Open it and
drag the app into Applications. Builds are signed and notarized, so the app opens without any
security prompt.

### Windows

Download the `win-x64.exe` installer and run it. The installer is not code-signed yet, so Windows
SmartScreen shows a warning on first run: choose **More info**, then **Run anyway**. This happens
once per install.

### Linux

**AppImage** (any distribution): download `linux-x86_64.AppImage`, make it executable, and run it.

```sh
chmod +x Kubermeister-*-linux-x86_64.AppImage
./Kubermeister-*-linux-x86_64.AppImage
```

**Debian / Ubuntu**: download `linux-amd64.deb` and install it.

```sh
sudo apt install ./Kubermeister-*-linux-amd64.deb
```

### Updating

Download the newer build and install it over the existing one; settings are kept. Tip assets are
replaced in place on every rebuild, so the Tip download link always points at the latest build.
In-app updates are coming.
