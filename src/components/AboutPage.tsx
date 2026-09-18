// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import metadata from "../../package.json";
import license from "../../LICENSE?raw";

export function AboutPage() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const repository = metadata.homepage;
  const source = `${repository}/tree/v${metadata.version}`;
  const close = () => {
    dialog.current?.close();
    trigger.current?.focus({ preventScroll: true });
  };
  const open = async (kind: "repository" | "source") => {
    setError(null);
    try {
      if (isTauri()) await invoke("open_project_link", { kind });
      else window.open(kind === "source" ? source : repository, "_blank", "noopener,noreferrer");
    } catch {
      setError("Could not open the browser. Copy the link below to open it manually.");
    }
  };
  return <>
    <button ref={trigger} className="control" onClick={() => dialog.current?.showModal()}>About SideDeck</button>
    <dialog ref={dialog} className="settings-dialog" aria-labelledby="about-title"
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); close(); }}>
      <div className="page-nav">
        <button className="control" autoFocus onClick={close}>← Back to Settings</button>
        <h2 id="about-title" className="text-title">About SideDeck</h2>
      </div>
      <div className="settings-content">
        <img src="/favicon.png" width="32" height="32" alt="SideDeck" />
        <p>SideDeck {metadata.version}</p>
        <p>Copyright © 2026 Rayman Zhang</p>
        <p>AGPL-3.0-only</p>
        <div>
          <button className="control" onClick={() => void open("repository")}>Open repository</button>
          <p className="text-small" style={{ overflowWrap: "anywhere" }}>{repository}</p>
        </div>
        <div>
          <button className="control" onClick={() => void open("source")}>Open this version’s source</button>
          <p className="text-small" style={{ overflowWrap: "anywhere" }}>{source}</p>
          <p className="text-small">Available after this version’s tag is published.</p>
        </div>
        {error && <p role="alert">{error}</p>}
        <details>
          <summary className="control">Read license offline</summary>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} className="text-small">{license}</pre>
        </details>
      </div>
    </dialog>
  </>;
}
