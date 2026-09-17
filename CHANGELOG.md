# Changelog

All notable changes to Kubermeister are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Every push to `main` also ships as the rolling Tip
build, which is not listed here.

## [Unreleased]

### Added

- README describing the app as it stands, a security policy, this changelog, a contributing guide
  and issue and pull request templates.

## [0.3.0] - 2026-09-17

### Added

- In-app update notifications: a pill in the top bar, a one-click download, and an
  `Updates` setting that chooses between asking first, downloading silently, or never checking.
- Rollout control on Deployments: history with rollback, pause and resume, a live rollout status
  tab, and a side-by-side comparison of two revisions' pod templates.
- Restart for Deployments, StatefulSets and DaemonSets, stamping the same annotation `kubectl` does.
- Node cordon, uncordon and drain from the node's detail, with a plan shown before the drain runs and
  eviction that honours PodDisruptionBudgets.
- Helm release rollback and uninstall, keeping Helm's own bookkeeping so the CLI still reads the
  release afterwards.
- Pod lifecycle actions: evict, forced delete, retry a Job, trigger and suspend a CronJob.
- Owner chain on every pod, linking it to the workload that runs it, and a pod list for every
  workload.
- Per-container detail with each container's role and its usage against its requests, and editing
  of an autoscaler's bounds.
- `describe` for pods and nodes as a structured document with copy and download.
- Log console: search that narrows the console, a since window, a larger virtualised buffer, whole
  log download, and one merged view following every pod of a workload.
- Port forwards listed and stopped from the top bar, targeting a Service that survives a rollout,
  remembered per context and offered again on the next launch.
- New kinds: ReplicaSets, ReplicationControllers, PodDisruptionBudgets, PriorityClasses, Leases,
  RuntimeClasses, IngressClasses, CSI drivers, nodes and storage capacity, mutating and validating
  webhook configurations, ValidatingAdmissionPolicies, APIServices and FlowSchemas.
- A browser for the instances of any CustomResourceDefinition, with the printer columns
  `kubectl get` shows and editing through the same manifest editor.
- A detail screen per namespace rolling up what it holds, its quotas and limit ranges and its pods'
  usage, with namespace create and delete.
- Owner and finalizers on every detail, a Related tab on pods explaining every link, pod list
  grouping by node or workload, and per-screen column choice remembered between launches.

### Changed

- Lists share one watch per kind and namespace and render only the rows in view, so a large
  cluster costs a screenful of DOM rather than the whole list.
- The repository moved to the `kubermeister` GitHub organization; old URLs redirect.

### Fixed

- Every write now carries the context it was rendered under and is refused when the connection has
  moved on; streams end when the context or kubeconfig changes; a detail page closes before a
  context switch; single-object reads no longer fall back to the first same-named object across
  namespaces; deleting a node, namespace or CRD asks for the name to be typed.

### Removed

- Debug containers, the node shell and file copy over the exec channel. `kubectl debug` and
  `kubectl cp` are the right tools for those, and the app now opens no way into a cluster beyond
  a shell into an existing container.
- The bottom shell drawer: a shell belongs to its pod's Shell tab again and ends when the tab does.

## [0.2.0] - 2026-09-16

The first release with the full client.

### Added

- Kubeconfig loading, context and namespace switching, and a settings store; the kubeconfig itself
  is never written.
- The cluster dashboard with capacity cards, usage sparklines from metrics-server, alerts and
  recent events; node and namespace screens.
- Live lists over the API server's watches for Pods, Deployments, StatefulSets, DaemonSets, Jobs,
  CronJobs, autoscalers, ConfigMaps, Secrets (values masked), Services, Ingresses, Endpoints,
  NetworkPolicies, PersistentVolumes, claims, StorageClasses, VolumeSnapshots, ServiceAccounts,
  Roles, RoleBindings, ClusterRoles, ClusterRoleBindings, CustomResourceDefinitions and Helm
  releases, plus the events stream, quotas and limits screens.
- Pod detail with logs, an interactive shell and port forwarding; deployment detail with rollout
  history and replica sets; the live manifest on every detail.
- Create from a template or pasted manifest, edit any manifest in place with dry run and conflict
  detection, scale, and delete one object or a selection.
- The settings screen, the command palette, and the window reopening where it was closed.
- Unit tests with coverage thresholds and an end-to-end suite against a disposable k3s cluster.

## [0.1.1] - 2026-09-15

### Added

- The Electron skeleton, packaging for macOS, Windows and Linux, signed and notarized macOS builds,
  the stable and Tip release channels, in-app updates through electron-updater, and the Homebrew
  tap.

[Unreleased]: https://github.com/kubermeister/kubermeister/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/kubermeister/kubermeister/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/kubermeister/kubermeister/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/kubermeister/kubermeister/releases/tag/v0.1.1
