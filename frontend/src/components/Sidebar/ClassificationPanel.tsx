import { useState } from "react";

const CLASSES = [
  { code: 2, name: "Ground", color: "#8B6914" },
  { code: 3, name: "Low Vegetation", color: "#3a7d3a" },
  { code: 4, name: "Medium Vegetation", color: "#2d8b2d" },
  { code: 5, name: "High Vegetation", color: "#1a6b1a" },
  { code: 6, name: "Buildings", color: "#cc3333" },
  { code: 9, name: "Water", color: "#3366cc" },
  { code: 7, name: "Noise", color: "#666" },
];

export default function ClassificationPanel() {
  const [open, setOpen] = useState(true);
  const [visible, setVisible] = useState<Record<number, boolean>>(
    Object.fromEntries(CLASSES.map((c) => [c.code, c.code !== 7]))
  );
  return (
    <div className="panel">
      <div className="panel-header" onClick={() => setOpen(!open)}>{open ? "\u25be" : "\u25b8"} Classification</div>
      {open && (
        <div className="panel-body">
          {CLASSES.map((cls) => (
            <label key={cls.code} className="class-row">
              <input type="checkbox" checked={visible[cls.code] ?? true} onChange={(e) => setVisible((v) => ({ ...v, [cls.code]: e.target.checked }))} />
              <span className="class-dot" style={{ background: cls.color }} />
              <span style={{ opacity: visible[cls.code] ? 1 : 0.5 }}>{cls.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
