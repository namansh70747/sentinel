"use client";

import { MeshGradient } from "@paper-design/shaders-react";
import { useEffect, useState } from "react";
import { useLive } from "../lib/live";

const calm = ["#2a120c", "#e25a12", "#f6c14d", "#6a2410", "#ffe0a6"];
const burn = ["#3a0a06", "#ff2a12", "#ff8a1a", "#ffd27a", "#7a140c"];

export function Field() {
  const { sli } = useLive();
  const availability = sli.at(-1)?.availability ?? 99.9;
  const hot = availability < 97;
  const [motion, setMotion] = useState(true);
  const [spot, setSpot] = useState({ x: 70, y: 30 });

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setMotion(!query.matches);
    apply();
    query.addEventListener("change", apply);
    const move = (event: PointerEvent) => {
      setSpot({ x: (event.clientX / window.innerWidth) * 100, y: (event.clientY / window.innerHeight) * 100 });
    };
    window.addEventListener("pointermove", move);
    return () => {
      query.removeEventListener("change", apply);
      window.removeEventListener("pointermove", move);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <MeshGradient
        colors={hot ? burn : calm}
        distortion={hot ? 0.85 : 0.5}
        swirl={hot ? 0.45 : 0.18}
        speed={motion ? (hot ? 0.7 : 0.28) : 0}
        grainOverlay={0.18}
        grainMixer={0.22}
        scale={1.15}
        minPixelRatio={1}
        maxPixelCount={1920 * 1080}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      <div className="aurora absolute -left-24 top-[-10%] h-[55vh] w-[55vw] rounded-full bg-[#ff5a1f] blur-[90px]" />
      <div className="aurora aurora-delay absolute right-[-8%] top-[8%] h-[48vh] w-[42vw] rounded-full bg-[#ffc14a] blur-[100px]" />
      <div className="aurora aurora-slow absolute bottom-[-18%] left-[20%] h-[50vh] w-[60vw] rounded-full bg-[#ff2d2d] blur-[110px]" />
      <div
        className="absolute inset-0 transition-[background] duration-700"
        style={{
          background: `radial-gradient(520px circle at ${spot.x}% ${spot.y}%, rgb(255 186 92 / 0.16), transparent 42%)`,
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgb(8_6_5/0.28)_58%,rgb(8_6_5/0.62)_100%)]" />
      <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(to_right,rgb(255_244_220/0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_244_220/0.07)_1px,transparent_1px)] [background-size:84px_84px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />
    </div>
  );
}
