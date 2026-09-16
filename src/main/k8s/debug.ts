import { createReadStream, createWriteStream } from 'node:fs';
import { basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { PassThrough, Writable } from 'node:stream';
import { Exec, type V1Pod } from '@kubernetes/client-node';
import type {
    DebugContainerInput,
    DebugContainerResult,
    NodeShellInput,
    NodeShellResult,
    PodCopyResult,
    PodFileInput,
} from '../../shared/k8s/debug.js';
import { apis, kubeConfig } from './client.js';
import { K8sError, withK8s } from './errors.js';
import { assertContext } from './resources/write.js';

/*
 * Getting inside something that does not want to be got inside: an ephemeral container attached to
 * a running pod, a privileged pod that borrows a node's namespaces, and files carried in and out of
 * a container over exec. Each is a deliberate, visible act — nothing here happens implicitly.
 */

/** The image a debug container runs when the caller names none: small, and has a shell. */
export const DEFAULT_DEBUG_IMAGE = 'busybox:1.36';

/** A name nothing else will have, so two debug sessions on one pod never collide. */
export const debugContainerName = (now = new Date()): string =>
    `debugger-${now
        .toISOString()
        .replace(/[-:T.]/g, '')
        .slice(2, 14)}`;

/**
 * Attach a debug container to a running pod. Ephemeral containers are added through their own
 * subresource and can never be removed — the API has no call for it, they go when the pod does — so
 * the name is stamped with the time and the caller is told what was added.
 */
export function addDebugContainer(input: DebugContainerInput): Promise<DebugContainerResult> {
    const op = 'pods.debug';
    return withK8s(op, async () => {
        assertContext(input.context, op);
        const pod = await apis().core.readNamespacedPod({ name: input.name, namespace: input.namespace });
        const container = debugContainerName();
        const debugger_ = {
            name: container,
            image: input.image ?? DEFAULT_DEBUG_IMAGE,
            command: ['/bin/sh'],
            stdin: true,
            tty: true,
            // Sharing the target's process namespace is the point: without it the debugger sees
            // its own processes and nothing of the container it is there for.
            ...(input.targetContainer ? { targetContainerName: input.targetContainer } : {}),
        };
        // The subresource takes a JSON patch, and `add` on a key writes it whether or not it is
        // already there, so the one operation covers a pod with debuggers and a pod without.
        await apis().core.patchNamespacedPodEphemeralcontainers({
            name: input.name,
            namespace: input.namespace,
            body: [
                {
                    op: 'add',
                    path: '/spec/ephemeralContainers',
                    value: [...(pod.spec?.ephemeralContainers ?? []), debugger_],
                },
            ],
        });
        return { pod: input.name, namespace: input.namespace, container };
    });
}

/** The pod that borrows a node's namespaces, as a manifest so the whole thing is readable at once. */
export function nodeShellPod(node: string, name: string, image: string): V1Pod {
    return {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name, labels: { 'app.kubernetes.io/managed-by': 'kubermeister', 'kubermeister.io/node': node } },
        spec: {
            nodeName: node,
            hostPID: true,
            hostNetwork: true,
            hostIPC: true,
            restartPolicy: 'Never',
            // A node shell is worth nothing on a node it cannot be scheduled onto, and a cordoned or
            // tainted node is exactly when one is wanted.
            tolerations: [{ operator: 'Exists' }],
            terminationGracePeriodSeconds: 0,
            containers: [
                {
                    name: 'shell',
                    image,
                    securityContext: { privileged: true },
                    // Entering the host's namespaces is what makes this a node shell rather than a
                    // pod that happens to run on the node.
                    command: [
                        'nsenter',
                        '--target',
                        '1',
                        '--mount',
                        '--uts',
                        '--ipc',
                        '--net',
                        '--pid',
                        '--',
                        '/bin/sh',
                    ],
                    stdin: true,
                    tty: true,
                },
            ],
        },
    };
}

/**
 * Open a shell onto a node by running a privileged pod there. This is the most powerful thing the
 * app can do, so it is never implicit: the pod is named after the node, labelled as this app's, and
 * the caller is handed its name so the session can delete it when it ends.
 */
export function startNodeShell(input: NodeShellInput): Promise<NodeShellResult> {
    const op = 'nodes.debug';
    return withK8s(op, async () => {
        assertContext(input.context, op);
        const name = `kubermeister-node-shell-${input.name}-${Date.now().toString(36)}`.slice(0, 63);
        const created = await apis().core.createNamespacedPod({
            namespace: input.namespace,
            body: nodeShellPod(input.name, name, input.image ?? DEFAULT_DEBUG_IMAGE),
        });
        return { pod: created.metadata?.name ?? name, namespace: input.namespace, container: 'shell' };
    });
}

/** Run one command in a container, collecting stdout, with stderr kept for the error message. */
async function execCollect(
    target: { name: string; namespace: string; container: string },
    command: string[],
    stdout: Writable,
    stdin?: NodeJS.ReadableStream,
): Promise<void> {
    let errorText = '';
    const stderr = new Writable({
        write(chunk: Buffer, _encoding, callback) {
            errorText += chunk.toString('utf8');
            callback();
        },
    });
    await new Promise<void>((resolve, reject) => {
        void new Exec(kubeConfig())
            .exec(
                target.namespace,
                target.name,
                target.container,
                command,
                stdout,
                stderr,
                (stdin as PassThrough) ?? null,
                false,
                (status) => {
                    if (status.status === 'Failure') {
                        reject(new Error(errorText.trim() || status.message || 'the command failed'));
                    } else {
                        resolve();
                    }
                },
            )
            .catch(reject);
    });
}

/**
 * Copy one path out of a container into a local file. The container's own tar writes the archive to
 * stdout and it is piped straight to disk: nothing is held in memory, so the size of what is copied
 * is the disk's business rather than the app's.
 */
export function copyFromPod(input: PodFileInput & { localPath: string }): Promise<PodCopyResult> {
    const op = 'pods.copyFrom';
    return withK8s(
        op,
        async () => {
            assertContext(input.context, op);
            const file = createWriteStream(input.localPath);
            try {
                await execCollect(input, ['tar', 'cf', '-', input.remotePath], file);
            } catch (error) {
                throw new K8sError(
                    'invalid',
                    `Could not copy ${input.remotePath}: ${error instanceof Error ? error.message : String(error)}`,
                    op,
                );
            } finally {
                file.close();
            }
            return { localPath: input.localPath, remotePath: input.remotePath };
        },
        COPY_TIMEOUT_MS,
    );
}

/** Ceiling on one file copy: long enough for a real file, short enough not to hang a screen forever. */
const COPY_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Copy a local file into a container, under the directory the caller names. The archive is built by
 * the local tar-free path: the file is streamed into the container's own tar, which unpacks it.
 */
export function copyToPod(input: PodFileInput & { localPath: string }): Promise<PodCopyResult> {
    const op = 'pods.copyTo';
    return withK8s(
        op,
        async () => {
            assertContext(input.context, op);
            const stdin = new PassThrough();
            const sink = new Writable({
                write(_chunk, _encoding, callback) {
                    callback();
                },
            });
            const name = basename(input.localPath);
            const run = execCollect(
                input,
                ['sh', '-c', `cat > ${shellQuote(`${input.remotePath}/${name}`)}`],
                sink,
                stdin,
            );
            try {
                await Promise.all([run, pipeline(createReadStream(input.localPath), stdin)]);
            } catch (error) {
                throw new K8sError(
                    'invalid',
                    `Could not copy ${name}: ${error instanceof Error ? error.message : String(error)}`,
                    op,
                );
            }
            return { localPath: input.localPath, remotePath: `${input.remotePath}/${name}` };
        },
        COPY_TIMEOUT_MS,
    );
}

/** A path as one shell word, so a name with a space or a quote cannot become part of the command. */
export function shellQuote(path: string): string {
    return `'${path.replaceAll("'", `'\\''`)}'`;
}
