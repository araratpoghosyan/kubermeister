interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    /** Any CSS color, e.g. `var(--primary)`. */
    color?: string;
    fill?: boolean;
    strokeWidth?: number;
    className?: string;
}

export function Sparkline({
    data,
    width = 70,
    height = 26,
    color = 'var(--primary)',
    fill = false,
    strokeWidth = 1.25,
    className,
}: SparklineProps) {
    if (data.length < 2) return null;

    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;

    const points = data.map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((v - min) / range) * (height - 2) - 1;
        return [x, y] as const;
    });

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
    const area = `${line} L${width},${height} L0,${height} Z`;

    return (
        <svg width={width} height={height} className={className} style={{ display: 'block' }}>
            {fill && <path d={area} fill={color} opacity={0.15} />}
            <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} />
        </svg>
    );
}
