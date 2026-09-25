import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./AuthContext.jsx";

export default function GateDoors() {
  const { gatePhase, openGate, finishGate, beginClose, completeLogout } = useAuth();

  useEffect(() => {
    if (gatePhase !== "closed") return undefined;
    const timer = window.setTimeout(() => openGate(), 450);
    return () => window.clearTimeout(timer);
  }, [gatePhase, openGate]);

  useEffect(() => {
    if (gatePhase !== "opening") return undefined;
    const timer = window.setTimeout(() => finishGate(), 1400);
    return () => window.clearTimeout(timer);
  }, [gatePhase, finishGate]);

  useEffect(() => {
    if (gatePhase !== "closing-prep") return undefined;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => beginClose());
    });
    return () => window.cancelAnimationFrame(frame);
  }, [gatePhase, beginClose]);

  useEffect(() => {
    if (gatePhase !== "closing") return undefined;
    const timer = window.setTimeout(() => completeLogout(), 1250);
    return () => window.clearTimeout(timer);
  }, [gatePhase, completeLogout]);

  if (gatePhase === "off") return null;

  const doorsOpen = gatePhase === "opening" || gatePhase === "closing-prep";

  return createPortal(
    <div className={`gate-overlay${doorsOpen ? " is-open" : ""}`} aria-hidden="true">
      <div className="gate-door gate-door-left">
        <span className="gate-panel-mark">Swastik</span>
        <span className="gate-handle" />
      </div>
      <div className="gate-door gate-door-right">
        <span className="gate-panel-mark">Marvella</span>
        <span className="gate-handle" />
      </div>
    </div>,
    document.body
  );
}
