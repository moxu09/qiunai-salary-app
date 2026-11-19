"use client";

import { useEffect, useRef, useState } from "react";
import { MotionDialog } from "./MotionUI";

type Request = { id: number; message: string; resolve: (value: boolean) => void };
const eventName = "ui-confirm-request";
let listeners = 0;
let sequence = 0;

export function confirmUI(message: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!listeners) return Promise.resolve(window.confirm(message));
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent<Request>(eventName, { detail: { id: ++sequence, message, resolve } }));
  });
}

export default function ConfirmationUI() {
  const [requests, setRequests] = useState<Request[]>([]);
  const pending = useRef<Request[]>([]);
  const answer = useRef(false);

  useEffect(() => {
    const accept = (event: Event) => {
      const request = (event as CustomEvent<Request>).detail;
      pending.current = [...pending.current, request];
      setRequests(pending.current);
    };
    listeners++;
    window.addEventListener(eventName, accept);
    return () => {
      listeners--;
      window.removeEventListener(eventName, accept);
      pending.current.forEach(request => request.resolve(false));
      pending.current = [];
    };
  }, []);

  const current = requests[0];
  if (!current) return null;
  const finish = (accepted: boolean) => {
    if (pending.current[0] !== current) return;
    pending.current = pending.current.slice(1);
    setRequests(pending.current);
    answer.current = false;
    current.resolve(accepted);
  };
  return <MotionDialog key={current.id} label="確認操作" onClose={() => finish(answer.current)}>
    {close => <div className="ui-motion-confirm">
      <h2>確認操作</h2>
      <p>{current.message}</p>
      <div className="ui-motion-confirm-actions">
        <button type="button" onClick={close}>取消</button>
        <button type="button" className="ui-motion-confirm-accept" onClick={() => { answer.current = true; close(); }}>確認</button>
      </div>
    </div>}
  </MotionDialog>;
}
