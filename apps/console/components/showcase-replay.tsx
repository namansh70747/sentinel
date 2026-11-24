'use client';

import { Pause, Play } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type PointerEvent } from 'react';
import { chartValues, type Scenario } from '../../showcase/model';

const plot = { width: 560, height: 132, top: 10, bottom: 122 };
const deploymentSample = 24;

const signals = {
  availability: {
    label: 'Availability',
    min: 97,
    max: 100.2,
    target: 99.9,
    labels: ['100.2%', '98.6%', '97%'],
    objective: '99.9% objective',
    breach: 'Below objective',
    format: (value: number) => value.toFixed(2) + '%',
  },
  latency: {
    label: 'P99 latency',
    min: 0,
    max: 1500,
    target: 500,
    labels: ['1.5 s', '750 ms', '0 ms'],
    objective: '500 ms objective',
    breach: 'Above objective',
    format: (value: number) => Math.round(value).toLocaleString('en-IN') + ' ms',
  },
};

type Signal = keyof typeof signals;

export function ShowcaseReplay({ scenario }: { scenario: Scenario }) {
  const data = useMemo(() => ({
    availability: chartValues(scenario, 'availability'),
    latency: chartValues(scenario, 'latency'),
  }), [scenario]);
  const last = data.latency.length - 1;
  const [sample, setSample] = useState(scenario === 'deployment' ? 18 : 0);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(true);
  const scrubberId = useId();

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPlaying(!preference.matches);
    const handleMotion = () => { if (preference.matches) setPlaying(false); };
    const handleVisibility = () => setVisible(!document.hidden);
    handleVisibility();
    preference.addEventListener('change', handleMotion);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      preference.removeEventListener('change', handleMotion);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!playing || !visible) return;
    const timer = window.setInterval(() => setSample(current => current === last ? 0 : current + 1), 550);
    return () => window.clearInterval(timer);
  }, [playing, visible, last]);

  function seek(index: number) {
    setPlaying(false);
    setSample(index);
  }

  function seekFromChart(event: PointerEvent<SVGSVGElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    const { left, width } = event.currentTarget.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (event.clientX - left) / width));
    seek(Math.round(position * last));
  }

  return <section className="sc-replay" aria-label="Service signals" data-playing={playing && visible}>
    <header className="sc-replay-heading">
      <div>
        <h2>Service signals</h2>
        <p>checkout-api · {scenario === 'stale' ? 'observations 25 minutes old' : 'simulated 40-minute window'}</p>
      </div>
      <button type="button" className="sc-control" onClick={() => setPlaying(current => !current)}>
        {playing ? <Pause size={15} aria-hidden="true"/> : <Play size={15} aria-hidden="true"/>}
        {playing ? 'Pause replay' : 'Play replay'}
      </button>
    </header>
    <div className="sc-replay-charts">
      <SignalChart kind="availability" values={data.availability} sample={sample} scenario={scenario} onSeek={seekFromChart}/>
      <SignalChart kind="latency" values={data.latency} sample={sample} scenario={scenario} onSeek={seekFromChart}/>
    </div>
    <div className="sc-replay-controls">
      <label htmlFor={scrubberId}>Replay position</label>
      <input id={scrubberId} type="range" min={0} max={last} value={sample}
        aria-valuetext={String(sample + 1) + ' of ' + String(last + 1) + ' samples'}
        onChange={event => seek(Number(event.currentTarget.value))}/>
      <output htmlFor={scrubberId} aria-live="off">{sample + 1} / {last + 1}</output>
      {scenario === 'deployment' && <button type="button" className="sc-control sc-seek" onClick={() => seek(deploymentSample)}>Jump to deployment</button>}
    </div>
  </section>;
}

function SignalChart({ kind, values, sample, scenario, onSeek }: {
  kind: Signal;
  values: number[];
  sample: number;
  scenario: Scenario;
  onSeek: (event: PointerEvent<SVGSVGElement>) => void;
}) {
  const signal = signals[kind];
  const gradient = useId();
  const x = (index: number) => index * plot.width / (values.length - 1);
  const y = (value: number) => plot.bottom - (value - signal.min) * (plot.bottom - plot.top) / (signal.max - signal.min);
  const points = values.map((value, index) => x(index) + ',' + y(value)).join(' ');
  const value = values[sample];
  const breached = kind === 'availability' ? value < signal.target : value > signal.target;
  const isStale = scenario === 'stale';

  return <section className="sc-signal-chart" data-signal={kind}>
    <header>
      <div><h3>{signal.label}</h3><strong data-breach={breached && !isStale}>{signal.format(value)}</strong></div>
      <span className="sc-signal-state" data-tone={isStale ? 'notice' : breached ? 'warning' : 'good'}>
        {isStale ? 'Stale data' : breached ? signal.breach : 'Within objective'}
      </span>
    </header>
    <div className="sc-signal-plot">
      <div className="sc-signal-scale" aria-hidden="true">{signal.labels.map(label => <span key={label}>{label}</span>)}</div>
      <svg viewBox={'0 0 ' + plot.width + ' ' + plot.height} preserveAspectRatio="none" role="img"
        aria-label={signal.label + ' trend with ' + signal.objective} onPointerDown={onSeek}>
        <defs>
          <linearGradient id={gradient} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".26"/>
            <stop offset="100%" stopColor="currentColor" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[plot.top, 66, plot.bottom].map(line => <line key={line} x1="0" x2={plot.width} y1={line} y2={line} className="sc-signal-grid"/>)}
        {scenario === 'deployment' && <>
          <rect x={x(deploymentSample)} y="0" width={plot.width - x(deploymentSample)} height={plot.height} className="sc-deploy-window"/>
          <line x1={x(deploymentSample)} x2={x(deploymentSample)} y1="0" y2={plot.height} className="sc-deploy-line"/>
        </>}
        <line x1="0" x2={plot.width} y1={y(signal.target)} y2={y(signal.target)} className="sc-objective-line"/>
        <polygon points={'0,' + plot.height + ' ' + points + ' ' + plot.width + ',' + plot.height} fill={'url(#' + gradient + ')'}/>
        <polyline points={points} pathLength="1" vectorEffect="non-scaling-stroke" className="sc-signal-trace"/>
        <g className="sc-signal-cursor" data-first={sample === 0} style={{ transform: 'translateX(' + x(sample) + 'px)' }}>
          <line x1="0" x2="0" y1="0" y2={plot.height} vectorEffect="non-scaling-stroke"/>
          <g className="sc-signal-point" style={{ transform: 'translateY(' + y(value) + 'px)' }}>
            <circle r="7" className="sc-point-halo"/>
            <circle r="3.7" className="sc-point-core"/>
          </g>
        </g>
      </svg>
    </div>
    <footer><span>{signal.objective}</span>{scenario === 'deployment' && <span><i aria-hidden="true"/> Deployment :42</span>}</footer>
  </section>;
}
