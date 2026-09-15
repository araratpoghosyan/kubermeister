import { Writable } from 'node:stream';
import { Log } from '@kubernetes/client-node';
import type { LogLevel, LogLine } from '../../shared/k8s/logs.js';
import { streamSchemas, type StreamController, type StreamSend } from '../../shared/streams.js';
import { kubeConfig } from './client.js';
import { reportMissingPod, resolvePodTarget } from './pod-target.js';

const DEFAULT_TAIL_LINES = 500;
const LEVEL_PATTERN = /\b(ERROR|FATAL|WARN(?:ING)?|DEBUG|TRACE|INFO)\b/i;

/** Best-effort level from the message text; INFO when nothing recognisable appears. */
export function guessLevel(message: string): LogLevel {
    const token = message.match(LEVEL_PATTERN)?.[1]?.toUpperCase();
    if (token === 'ERROR' || token === 'FATAL') return 'ERROR';
    if (token === 'WARN' || token === 'WARNING') return 'WARN';
    if (token === 'DEBUG' || token === 'TRACE') return 'DEBUG';
    return 'INFO';
}

/** With `timestamps: true` each line is `<RFC3339> <message>`; a line without a space is all message. */
export function parseLogLine(line: string): LogLine {
    const space = line.indexOf(' ');
    const timestamp = space > 0 ? line.slice(0, space) : '';
    const message = space > 0 ? line.slice(space + 1) : line;
    return { level: guessLevel(message), timestamp, message };
}

/**
 * Split a chunked byte stream into complete lines. The trailing partial line is kept until the
 * next chunk completes it, so a line split across chunks arrives whole.
 */
export function createLineSplitter(onLine: (line: string) => void): {
    push: (chunk: string) => void;
    flush: () => void;
} {
    let buffer = '';
    return {
        push: (chunk) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) if (line.length > 0) onLine(line);
        },
        flush: () => {
            if (buffer.length > 0) onLine(buffer);
            buffer = '';
        },
    };
}

/** Follow a container's logs, pushing one parsed line per message until the container ends or the stream stops. */
export async function startPodLogStream(rawInput: unknown, send: StreamSend): Promise<StreamController> {
    const input = streamSchemas['pods.logs'].parse(rawInput);
    const target = await resolvePodTarget(input.name, input.namespace, input.container);
    if (!target) return reportMissingPod(send, input.name, input.namespace, input.container);

    const splitter = createLineSplitter((line) => send({ type: 'data', data: parseLogLine(line) }));
    const sink = new Writable({
        write(chunk: Buffer, _encoding, callback) {
            splitter.push(chunk.toString('utf8'));
            callback();
        },
    });
    sink.on('finish', () => {
        splitter.flush();
        send({ type: 'end' });
    });
    // A Writable that errors with no listener throws at the process level; report it instead.
    sink.on('error', (error) => send({ type: 'error', message: error.message }));

    const controller = await new Log(kubeConfig()).log(target.namespace, target.name, target.container, sink, {
        follow: true,
        tailLines: input.tailLines ?? DEFAULT_TAIL_LINES,
        sinceSeconds: input.sinceSeconds,
        timestamps: true,
    });
    return { stop: () => controller.abort() };
}
