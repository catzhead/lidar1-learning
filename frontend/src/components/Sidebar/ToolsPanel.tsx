import { useState } from "react";

export default function ToolsPanel() {
  const [open, setOpen] = useState(true);
  const tools = [
    { id: "distance", label: "Distance" },
    { id: "height", label: "Height" },
    { id: "profile", label: "Profile" },
    { id: "section", label: "Section" },
    { id: "area", label: "Area" },
    { id: "point", label: "Point" },
  ];
  return (
    <div className="panel">
      <div className="panel-header" onClick={() => setOpen(!open)}>{open ? "\u25be" : "\u25b8"} Tools</div>
      {open && (
        <div className="panel-body">
          <div className="tool-grid">
            {tools.map((t) => (<button key={t.id} className="tool-btn">{t.label}</button>))}
          </div>
        </div>
      )}
    </div>
  );
}
