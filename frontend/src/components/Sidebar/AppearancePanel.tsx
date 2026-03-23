import { useState } from "react";

interface Props {
  onSettingsChange: (settings: Record<string, unknown>) => void;
}

export default function AppearancePanel({ onSettingsChange }: Props) {
  const [open, setOpen] = useState(true);
  const [pointSize, setPointSize] = useState(1.0);
  const [pointBudget, setPointBudget] = useState(2.0);
  const [edl, setEdl] = useState(true);
  const [material, setMaterial] = useState("rgb");

  return (
    <div className="panel">
      <div className="panel-header" onClick={() => setOpen(!open)}>{open ? "\u25be" : "\u25b8"} Appearance</div>
      {open && (
        <div className="panel-body">
          <label className="panel-label">Material</label>
          <select className="panel-select" value={material} onChange={(e) => { setMaterial(e.target.value); onSettingsChange({ material: e.target.value }); }}>
            <option value="rgb">RGB</option>
            <option value="elevation">Elevation</option>
            <option value="intensity">Intensity</option>
            <option value="classification">Classification</option>
          </select>
          <label className="panel-label">Point Size: {pointSize.toFixed(1)}</label>
          <input type="range" min="0.1" max="5" step="0.1" value={pointSize} onChange={(e) => { const v = parseFloat(e.target.value); setPointSize(v); onSettingsChange({ pointSize: v }); }} />
          <label className="panel-label">Point Budget: {pointBudget.toFixed(1)}M</label>
          <input type="range" min="0.5" max="5" step="0.5" value={pointBudget} onChange={(e) => { const v = parseFloat(e.target.value); setPointBudget(v); onSettingsChange({ pointBudget: v * 1_000_000 }); }} />
          <label className="panel-checkbox">
            <input type="checkbox" checked={edl} onChange={(e) => { setEdl(e.target.checked); onSettingsChange({ edlEnabled: e.target.checked }); }} />
            Eye Dome Lighting
          </label>
        </div>
      )}
    </div>
  );
}
