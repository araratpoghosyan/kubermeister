# kubermeister

A fast, native desktop client for browsing and managing Kubernetes clusters.

It reads your existing kubeconfig and needs nothing else installed: no `kubectl`, no plugins. The
kubeconfig itself is never written, so switching context or namespace in the app changes only the
app's own settings.

## What it does

- **Cluster at a glance.** A summary of nodes, workloads and capacity, live CPU and memory
  sparklines from metrics-server, alerts for what needs attention, and a stream of recent events.
- **Every common kind.** Pods, Deployments, StatefulSets, DaemonSets, Jobs, CronJobs and
  autoscalers; config maps and secrets; services, ingresses, endpoints and network policies;
  volumes, claims, storage classes and snapshots; service accounts, roles and bindings; custom
  resource definitions and the Helm releases installed in the cluster.
- **Lists that stay current.** Each list follows a watch, so objects appear, change and disappear
  as the cluster changes, with search, sorting and column control on top.
- **Details that explain.** Every object has an overview, its events, labels and annotations, and
  the live manifest as YAML. Pods add logs, an interactive shell and port forwarding; deployments
  add rollout history and replica sets; services add ports and endpoints.
- **Changes when you need them.** Create from a template or a pasted manifest, edit the manifest in
  place, scale, restart a workload's pods, and delete one object or a selection. Every write can be
  checked first with a dry run, and an edit that lost a race to another writer is reported rather than silently applied.
- **Secrets stay secret.** Secret values are never read for the list or detail views; they appear
  only in the manifest, where the cluster itself stores them.

## Installation

Kubermeister ships in two channels. Both can be installed side by side; they are separate apps
with separate settings.

| Channel    | App name         | What it is                                                   | Where                                                                           |
| ---------- | ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Stable** | Kubermeister     | Versioned releases, `vX.Y.Z`                                 | [Releases](https://github.com/araratpoghosyan/kubermeister/releases)            |
| **Tip**    | Kubermeister Tip | Nightly build, rebuilt on every change to `main`. May break. | [Tip release](https://github.com/araratpoghosyan/kubermeister/releases/tag/tip) |

### macOS

Download the `.dmg` for your Mac: `mac-arm64` for Apple silicon, `mac-x64` for Intel. Open it and
drag the app into Applications. Builds are signed and notarized, so the app opens without any
security prompt.

Or install with [Homebrew](https://brew.sh). Homebrew 7 requires third-party taps to be trusted
once before anything from them can be installed:

```sh
brew trust araratpoghosyan/tap
brew install --cask araratpoghosyan/tap/kubermeister        # stable
brew install --cask araratpoghosyan/tap/kubermeister@tip    # tip
```

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

The app checks for updates shortly after launch and every few hours. When a new version is found, a
pill appears in the top bar and a notification offers to update; the download runs in the background
and a restart finishes it (quitting the app installs it too). Settings › Updates chooses between
being asked first (the default), downloading silently, or never checking automatically, and its
About card shows the installed version, its channel and a **Check for updates** button; the same
check is in the application menu and the ⌘K palette. Stable follows stable releases; Tip follows the
nightly build. Installing a newer download over the existing app also works; settings are kept.
Homebrew users can run `brew upgrade` as well.
