'use client';

import { Activity, Bell, FileCheck2, Fingerprint, Pause, Play, Server } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { scenarios, type Run } from '../../showcase/model';
import { resultLabels } from './showcase-investigation';
import type { ShowcasePlayback } from './showcase-replay';

export const investigationStages = [
  { name: 'Receive alert', label: 'Alert', Icon: Bell, x: .105, y: .48, description: 'Read the simulated Grafana alert for checkout-api.' },
  { name: 'Create incident', label: 'Incident', Icon: Fingerprint, x: .33, y: .48, description: 'Associate the alert with an investigation for checkout-api.' },
  { name: 'Collect metrics', label: 'Metrics', Icon: Activity, x: .59, y: .19, description: 'Collect availability and P99 latency observations.' },
  { name: 'Read ECS context', label: 'AWS ECS', Icon: Server, x: .59, y: .72, description: 'Check service tasks and deployment context.' },
  { name: 'Record evidence', label: 'Evidence', Icon: FileCheck2, x: .865, y: .48, description: 'Save the investigation findings and audit trail.' },
] as const;

const links = [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4]] as const;

export function InvestigationMap({ run, step, playback }: {
  run?: Run;
  step: number | null;
  playback: ShowcasePlayback;
}) {
  const [inspected, setInspected] = useState<number | null>(null);
  const selected = inspected ?? step ?? 2;
  const detailId = useId();
  const { reading } = playback;
  const metricsWarning = run?.scenario === 'stale' || reading.breached;
  const ecsWarning = run?.status === 'partial';
  const summaries = [
    'Simulated alert for checkout-api.',
    run ? scenarios[run.scenario].label : 'Waiting for a scenario.',
    run?.scenario === 'stale' ? 'Observations are 25 minutes old.' :
      reading.availability.toFixed(2) + '% availability · ' + Math.round(reading.latency).toLocaleString('en-IN') + ' ms p99',
    ecsWarning ? 'ECS read failed. See the evidence for details.' :
      run?.ecs ? run.ecs.runningCount + ' of ' + run.ecs.desiredCount + ' ECS tasks running' : 'Waiting for ECS observations.',
    run ? resultLabels[run.status] + ' · ' + run.audit.length + ' recorded events' : 'No evidence recorded yet.',
  ];

  useEffect(() => {
    if (step === 0) setInspected(null);
  }, [step]);

  return <section className="sc-investigation-map" aria-label="Investigation map" data-motion={playback.motion}>
    <header className="sc-map-header">
      <h2>Investigation map</h2>
      <button type="button" className="sc-control sc-map-toggle" onClick={playback.toggle}
        aria-label={playback.playing ? 'Pause map and chart replay' : 'Play map and chart replay'}
        title={playback.playing ? 'Pause map and chart replay' : 'Play map and chart replay'}>
        {playback.playing ? <Pause size={15} aria-hidden="true"/> : <Play size={15} aria-hidden="true"/>}
      </button>
    </header>
    <div className="sc-map-plot" role="group" aria-label="Inspect investigation stages">
      <MapLinks moving={playback.motion} step={step} metricsWarning={metricsWarning} ecsWarning={ecsWarning}/>
      {investigationStages.map(({ name, label, Icon, x, y }, index) => {
        const inProgress = step === index;
        const complete = step === null ? Boolean(run) : index < step;
        const warning = step === null && complete && ((index === 2 && metricsWarning) || (index === 3 && ecsWarning));
        const state = inProgress ? 'active' : warning ? 'warning' : complete ? 'complete' : 'queued';
        return <button type="button" className="sc-map-node" key={name} data-state={state}
          style={{ left: x * 100 + '%', top: y * 100 + '%' }}
          aria-label={name + ', ' + state} title={name} aria-current={inProgress ? 'step' : undefined}
          aria-pressed={index === selected} aria-controls={detailId} onClick={() => setInspected(index)}>
          <span className="sc-map-node-icon"><Icon size={18} aria-hidden="true"/></span>
          <span className="sc-map-node-label">{label}</span>
        </button>;
      })}
    </div>
    <div className="sc-map-detail" id={detailId}>
      <div className="sc-map-reading" key={selected}>
        <span>{investigationStages[selected].name}</span>
        <strong>{step === null && run ? summaries[selected] : investigationStages[selected].description}</strong>
      </div>
      <div className="sc-map-actions">
        <span role="status">{step !== null ? 'Step ' + (step + 1) + ' of ' + investigationStages.length : run ? resultLabels[run.status] : 'Ready'}</span>
        {step === null && run && <a href="#investigation-evidence">View evidence</a>}
      </div>
    </div>
  </section>;
}

function MapLinks({ moving, step, metricsWarning, ecsWarning }: {
  moving: boolean;
  step: number | null;
  metricsWarning: boolean;
  ecsWarning: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let inView = false;

    function draw(time: number) {
      if (!context || !width || !height) return;
      context.clearRect(0, 0, width, height);
      links.forEach(([from, to], index) => {
        const start = investigationStages[from];
        const end = investigationStages[to];
        const x0 = start.x * width;
        const y0 = start.y * height;
        const x1 = end.x * width;
        const y1 = end.y * height;
        const middle = (x0 + x1) / 2;
        const relevant = step === null || step === to || (step === 0 && from === 0);
        const warning = step === null && (
          (metricsWarning && (from === 2 || to === 2)) || (ecsWarning && (from === 3 || to === 3))
        );
        const color = warning ? '#ffc385' : '#72e6ce';

        context.beginPath();
        context.moveTo(x0, y0);
        context.bezierCurveTo(middle, y0, middle, y1, x1, y1);
        context.strokeStyle = relevant ? color : '#5c6489';
        context.globalAlpha = relevant ? .46 : .25;
        context.lineWidth = relevant ? 1.35 : 1;
        context.setLineDash(relevant ? [] : [3, 5]);
        context.stroke();
        if (!moving || !relevant) return;

        const position = (time / 1480 + index * .228) % 1;
        for (let trail = 3; trail >= 0; trail--) {
          const progress = Math.max(0, position - trail * .043);
          const remaining = 1 - progress;
          const x = remaining ** 3 * x0 + 3 * remaining * progress * middle + progress ** 3 * x1;
          const y = remaining ** 2 * (1 + 2 * progress) * y0 + progress ** 2 * (3 - 2 * progress) * y1;
          context.beginPath();
          context.arc(x, y, 3.35 - .54 * trail, 0, 2 * Math.PI);
          context.fillStyle = trail === 0 ? '#f5fffb' : color;
          context.globalAlpha = (1 - trail * .24) * Math.min(1, position * 11, (1 - position) * 13);
          context.fill();
        }
      });
      context.globalAlpha = 1;
      if (moving && inView) frame = window.requestAnimationFrame(draw);
    }

    function refresh() {
      window.cancelAnimationFrame(frame);
      draw(performance.now());
    }

    function resize() {
      if (!element || !context) return;
      width = element.clientWidth;
      height = element.clientHeight;
      const ratio = Math.min(window.devicePixelRatio, 2);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      refresh();
    }

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      refresh();
    });
    resizeObserver.observe(element);
    intersectionObserver.observe(element);
    resize();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [moving, step, metricsWarning, ecsWarning]);

  return <canvas aria-hidden="true" ref={canvas} className="sc-map-links"/>;
}
