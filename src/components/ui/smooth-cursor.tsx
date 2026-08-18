"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useSpring,
  type SpringOptions,
} from "motion/react";

interface Position {
  x: number;
  y: number;
}

export interface SmoothCursorProps {
  cursor?: React.ReactNode;
  springConfig?: SpringOptions;
}

function DefaultCursorSVG() {
  return (
    <svg
      width="26"
      height="30"
      viewBox="0 0 50 54"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: "drop-shadow(0px 3px 6px rgba(0,0,0,0.25))" }}
    >
      <path
        d="M42.6817 41.1495L27.5103 6.79925C26.7269 5.02557 24.2082 5.02558 23.3927 6.79925L7.59814 41.1495C6.75833 42.9759 8.52712 44.8902 10.4125 44.1954L24.3757 39.0496C24.8829 38.8627 25.4385 38.8627 25.9422 39.0496L39.8121 44.1954C41.6849 44.8902 43.4884 42.9759 42.6817 41.1495Z"
        fill="var(--color-primary)"
        stroke="var(--color-background)"
        strokeWidth="2.25825"
      />
    </svg>
  );
}

export function SmoothCursor({
  cursor = <DefaultCursorSVG />,
  springConfig = { damping: 45, stiffness: 400, mass: 1, restDelta: 0.001 },
}: SmoothCursorProps) {
  const [isMoving, setIsMoving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const lastMousePos = useRef<Position>({ x: 0, y: 0 });
  const velocity = useRef<Position>({ x: 0, y: 0 });
  const lastUpdateTime = useRef(Date.now());
  const previousAngle = useRef(0);
  const accumulatedRotation = useRef(0);

  const cursorX = useSpring(0, springConfig);
  const cursorY = useSpring(0, springConfig);
  const rotation = useSpring(0, { ...springConfig, damping: 60, stiffness: 300 });
  const scale = useSpring(1, { ...springConfig, stiffness: 500, damping: 35 });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    setEnabled(true);

    let rafId: number | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const updatePosition = (e: MouseEvent) => {
      const currentPos = { x: e.clientX, y: e.clientY };
      const currentTime = Date.now();
      const deltaTime = currentTime - lastUpdateTime.current;

      if (deltaTime > 0) {
        velocity.current = {
          x: (currentPos.x - lastMousePos.current.x) / deltaTime,
          y: (currentPos.y - lastMousePos.current.y) / deltaTime,
        };
      }

      lastMousePos.current = currentPos;
      lastUpdateTime.current = currentTime;

      cursorX.set(currentPos.x);
      cursorY.set(currentPos.y);

      const speed = Math.hypot(velocity.current.x, velocity.current.y);
      if (speed > 0.1) {
        const currentAngle =
          Math.atan2(velocity.current.y, velocity.current.x) * (180 / Math.PI) + 90;
        let angleDiff = currentAngle - previousAngle.current;
        if (angleDiff > 180) angleDiff -= 360;
        if (angleDiff < -180) angleDiff += 360;
        accumulatedRotation.current += angleDiff;
        rotation.set(accumulatedRotation.current);
        previousAngle.current = currentAngle;
        scale.set(0.95);
        setIsMoving(true);
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          scale.set(1);
          setIsMoving(false);
        }, 150);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        updatePosition(e);
        rafId = null;
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (rafId) cancelAnimationFrame(rafId);
      if (timeout) clearTimeout(timeout);
    };
  }, [cursorX, cursorY, rotation, scale]);

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add("smooth-cursor-active");
    return () => document.documentElement.classList.remove("smooth-cursor-active");
  }, [enabled]);

  if (!enabled) return null;

  return (
    <motion.div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        x: cursorX,
        y: cursorY,
        rotate: rotation,
        scale,
        zIndex: 9999,
        pointerEvents: "none",
        willChange: "transform",
        translateX: "-50%",
        translateY: "-50%",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      aria-hidden="true"
      data-moving={isMoving}
    >
      {cursor}
    </motion.div>
  );
}

export default SmoothCursor;
