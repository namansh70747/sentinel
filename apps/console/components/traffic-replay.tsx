'use client';

import { Activity, Pause, Play } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { chartValues } from '../../showcase/model';

const scenarios = { healthy: 'Normal traffic', deployment: 'Deployment regression' } as const;
type Replay = keyof typeof scenarios;

export function TrafficReplay() {
 const [scenario, setScenario] = useState<Replay>('deployment');
 const [playing, setPlaying] = useState(false);
 const [step, setStep] = useState(0);
 const gradient = useId();
 const values = chartValues(scenario, 'latency');
 const interval = values.length - 1;

 useEffect(() => {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sync = () => setPlaying(!preference.matches);
  sync();
  preference.addEventListener('change', sync);
  return () => preference.removeEventListener('change', sync);
 }, []);

 useEffect(() => {
  if (!playing) return;
  const timer = window.setInterval(() => setStep(value => (value + 1) % (interval + 1)), 800);
  return () => window.clearInterval(timer);
 }, [playing, interval]);

 const points = values.map((value, index) => [index * 640 / interval, 132 - value * 118 / 1500]);
 const [x, y] = points[step];
 const path = points.map(([px, py], index) => (index ? 'L' : 'M') + px + ' ' + py).join(' ');

 return <section className="traffic-replay" aria-labelledby="traffic-heading" data-playing={playing}>
  <header className="traffic-header">
   <div><span className="traffic-label"><Activity size={13} aria-hidden="true"/> Simulated telemetry</span><h2 id="traffic-heading">Checkout latency replay</h2></div>
   <button type="button" className="traffic-toggle" onClick={() => setPlaying(value => !value)} aria-label={playing ? 'Pause replay' : 'Play replay'}>{playing ? <Pause size={17}/> : <Play size={17}/>}</button>
  </header>
  <div className="traffic-measure"><strong key={scenario + step}>{Math.round(values[step])}</strong><span>ms · p99 latency</span></div>
  <svg className="traffic-chart" viewBox="0 0 640 148" role="img" aria-label={scenarios[scenario] + ' simulated latency trend'} preserveAspectRatio="none">
   <defs><linearGradient id={gradient} x2="0" y2="1"><stop stopColor="#8bf5bb" stopOpacity=".25"/><stop offset="1" stopColor="#8bf5bb" stopOpacity="0"/></linearGradient></defs>
   {[24, 60, 96, 132].map(line => <path key={line} d={'M0 ' + line + 'H640'} className="traffic-grid"/>)}
   <path d={path + ' L640 148 H0 Z'} fill={'url(#' + gradient + ')'}/>
   <path key={scenario} d={path} pathLength="1" className="traffic-line" vectorEffect="non-scaling-stroke"/>
   <line x1={x} x2={x} y1="0" y2="148" className="traffic-cursor"/>
   <circle cx={x} cy={y} r="5" className="traffic-dot"/>
  </svg>
  <div className="traffic-controls" role="group" aria-label="Telemetry scenario">
   {Object.entries(scenarios).map(([id, label]) => <button key={id} type="button" aria-pressed={scenario === id} onClick={() => {setScenario(id as Replay); setStep(0);}}>{label}</button>)}
  </div>
 </section>;
}
