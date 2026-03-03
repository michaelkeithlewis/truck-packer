import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from 'react-dom/client';
import ThreeScene from "./ThreeScene";
import "./styles.css";

const CONTAINER_TYPES = [
  { code: "53ft", label: "53ft Semi Trailer", dims: "624 × 100 × 110 in" },
  { code: "48ft", label: "48ft Semi Trailer", dims: "576 × 100 × 110 in" },
  { code: "26ft", label: "26ft Box Truck",    dims: "312 × 96 × 96 in" },
  { code: "sprinter", label: "Sprinter Van",  dims: "170 × 70 × 64 in" },
];

function getConfigFile(containerType, sameType, noOverhang, groupCat, maxHeight) {
  let name = "pack-" + containerType;
  if (sameType)   name += "-sametype";
  if (noOverhang) name += "-nohang";
  if (groupCat)   name += "-grouped";
  if (maxHeight > 0) name += "-h" + maxHeight;
  return name + ".json";
}

function computeStats(data) {
  if (!data || !data.containers) return null;
  const placements = data.containers.flatMap(c => c.stack.placements);
  const total = placements.length;
  const stacked = placements.filter(p => p.z > 0);
  let overhang = 0;
  let sameTypeStacks = 0;

  for (const p of stacked) {
    const s = p.stackable;
    let fitsInSingle = false;
    let hasSameType = false;

    for (const below of placements) {
      if (below === p) continue;
      const bs = below.stackable;
      if (below.z + bs.dz !== p.z) continue;

      const containsX = below.x <= p.x && (below.x + bs.dx) >= (p.x + s.dx);
      const containsY = below.y <= p.y && (below.y + bs.dy) >= (p.y + s.dy);
      if (containsX && containsY) fitsInSingle = true;

      const ox = Math.max(0, Math.min(p.x + s.dx, below.x + bs.dx) - Math.max(p.x, below.x));
      const oy = Math.max(0, Math.min(p.y + s.dy, below.y + bs.dy) - Math.max(p.y, below.y));
      if (ox > 0 && oy > 0 && bs.name === s.name) hasSameType = true;
    }
    if (!fitsInSingle) overhang++;
    if (hasSameType) sameTypeStacks++;
  }
  return { total, trucks: data.containers.length, stacked: stacked.length, overhang, sameTypeStacks };
}

function parseCsv(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 9) continue;
    rows.push({
      name: cols[0].trim(),
      description: cols[1].trim(),
      manufacturer: cols[2].trim(),
      length: parseInt(cols[3]),
      width: parseInt(cols[4]),
      height: parseInt(cols[5]),
      weight: parseInt(cols[6]),
      category: cols[7].trim(),
      flip: cols[8].trim().toUpperCase() === "TRUE",
      canBeStacked: cols.length > 9 ? cols[9].trim().toUpperCase() !== "FALSE" : true,
      canHaveOnTop: cols.length > 10 ? cols[10].trim().toUpperCase() !== "FALSE" : true,
    });
  }
  return rows;
}

function UploadWizard({ onClose, onPacked }) {
  const [csvRows, setCsvRows] = useState(null);
  const [csvText, setCsvText] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [packing, setPacking] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      setCsvText(text);
      setCsvRows(parseCsv(text));
      setError(null);
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handlePack = async () => {
    setPacking(true);
    setError(null);
    try {
      const res = await fetch("/api/upload-csv", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: csvText,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Packing failed");
      setPacking(false);
      onPacked();
      onClose();
    } catch (err) {
      setError(err.message);
      setPacking(false);
    }
  };

  const overlay = {
    position: "fixed", inset: 0, zIndex: 1000,
    background: "rgba(0,0,0,0.7)", display: "flex",
    alignItems: "center", justifyContent: "center",
    backdropFilter: "blur(4px)",
  };
  const modal = {
    background: "#1e1e1e", borderRadius: 12, padding: "24px 28px",
    color: "#fff", width: 600, maxHeight: "80vh", overflow: "auto",
    fontFamily: "'Inter', -apple-system, sans-serif", fontSize: 13,
    boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
  };
  const dropZone = {
    border: `2px dashed ${dragOver ? "#4fc3f7" : "#555"}`,
    borderRadius: 8, padding: 32, textAlign: "center",
    cursor: "pointer", marginBottom: 16, transition: "border-color 0.2s",
    background: dragOver ? "rgba(79,195,247,0.05)" : "transparent",
  };
  const btnPrimary = {
    background: "#4fc3f7", color: "#000", border: "none", borderRadius: 6,
    padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    marginRight: 8, opacity: packing ? 0.6 : 1,
  };
  const btnSecondary = {
    background: "#333", color: "#fff", border: "1px solid #555",
    borderRadius: 6, padding: "8px 20px", fontSize: 13, cursor: "pointer",
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Upload Case List</div>
        <div style={{ color: "#999", marginBottom: 16, fontSize: 12 }}>
          CSV columns: Name, Description, Manufacturer, Length, Width, Height, Weight, Category, Flip
        </div>

        <div style={dropZone}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
            onChange={e => handleFile(e.target.files[0])} />
          {csvRows ? (
            <div style={{ color: "#69f0ae" }}>{csvRows.length} cases parsed</div>
          ) : (
            <div style={{ color: "#aaa" }}>Drag & drop CSV here, or click to browse</div>
          )}
        </div>

        {csvRows && csvRows.length > 0 && (
          <div style={{ maxHeight: 240, overflow: "auto", marginBottom: 16, border: "1px solid #333", borderRadius: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#2a2a2a", position: "sticky", top: 0 }}>
                  {["Name","L","W","H","Wt","Category","Flip","Stackable","Top OK"].map(h => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #444" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvRows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #333" }}>
                    <td style={{ padding: "4px 8px" }}>{r.name}</td>
                    <td style={{ padding: "4px 8px" }}>{r.length}</td>
                    <td style={{ padding: "4px 8px" }}>{r.width}</td>
                    <td style={{ padding: "4px 8px" }}>{r.height}</td>
                    <td style={{ padding: "4px 8px" }}>{r.weight}</td>
                    <td style={{ padding: "4px 8px" }}>{r.category}</td>
                    <td style={{ padding: "4px 8px" }}>{r.flip ? "Yes" : "No"}</td>
                    <td style={{ padding: "4px 8px", color: r.canBeStacked ? "#69f0ae" : "#ff6b6b" }}>{r.canBeStacked ? "Yes" : "No"}</td>
                    <td style={{ padding: "4px 8px", color: r.canHaveOnTop ? "#69f0ae" : "#ff6b6b" }}>{r.canHaveOnTop ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <div style={{ color: "#ff6b6b", marginBottom: 12, fontSize: 12 }}>{error}</div>}

        <div style={{ display: "flex", alignItems: "center" }}>
          {csvRows && (
            <button style={btnPrimary} onClick={handlePack} disabled={packing}>
              {packing ? "Packing cases..." : "Pack Cases"}
            </button>
          )}
          <button style={btnSecondary} onClick={onClose}>Cancel</button>
          {packing && <span style={{ marginLeft: 12, color: "#999", fontSize: 11 }}>Running bin packer (may take ~15s)...</span>}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [containerType, setContainerType] = useState("53ft");
  const [sameType, setSameType] = useState(true);
  const [noOverhang, setNoOverhang] = useState(true);
  const [groupCat, setGroupCat] = useState(true);
  const [maxHeight, setMaxHeight] = useState(3);
  const [stats, setStats] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [configVersion, setConfigVersion] = useState(0);
  const [fetchError, setFetchError] = useState(false);
  const configFile = getConfigFile(containerType, sameType, noOverhang, groupCat, maxHeight);

  useEffect(() => {
    setFetchError(false);
    fetch(`/assets/${configFile}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { setStats(computeStats(data)); setFetchError(false); })
      .catch(() => { setStats(null); setFetchError(true); });
  }, [configFile, configVersion]);

  const panelStyle = {
    position: "absolute", zIndex: 10, top: 12, left: 12,
    background: "rgba(0,0,0,0.8)", borderRadius: 8,
    padding: "14px 18px", color: "#fff",
    fontFamily: "'Inter', -apple-system, sans-serif", fontSize: 13,
    minWidth: 240, backdropFilter: "blur(8px)",
    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
    maxHeight: "calc(100vh - 24px)", overflowY: "auto",
  };

  const selectStyle = {
    background: "#333", color: "#fff", border: "1px solid #555",
    borderRadius: 4, padding: "3px 6px", fontSize: 13, cursor: "pointer",
  };

  return (
    <div className="App">
      <ThreeScene key={configFile + configVersion} dataSource={`/assets/${configFile}`} />

      {showUpload && (
        <UploadWizard
          onClose={() => setShowUpload(false)}
          onPacked={() => setConfigVersion(v => v + 1)}
        />
      )}

      <div style={panelStyle}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, letterSpacing: 0.5 }}>
          TRUCK PACKER
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: "#999", marginBottom: 4, letterSpacing: 0.5 }}>CONTAINER</div>
          <select value={containerType} onChange={e => setContainerType(e.target.value)}
            style={{ ...selectStyle, width: "100%" }}>
            {CONTAINER_TYPES.map(ct => (
              <option key={ct.code} value={ct.code}>{ct.label} ({ct.dims})</option>
            ))}
          </select>
        </div>

        <div style={{ borderTop: "1px solid #444", paddingTop: 10, marginBottom: 2 }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: "#999", marginBottom: 6, letterSpacing: 0.5 }}>PACK RULES</div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 6 }}>
          <input type="checkbox" checked={sameType}
            onChange={e => setSameType(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: "#4fc3f7", cursor: "pointer" }} />
          <span>Prefer same-type stacking</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 6 }}>
          <input type="checkbox" checked={noOverhang}
            onChange={e => setNoOverhang(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: "#4fc3f7", cursor: "pointer" }} />
          <span>No overhang (full support)</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 8 }}>
          <input type="checkbox" checked={groupCat}
            onChange={e => setGroupCat(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: "#4fc3f7", cursor: "pointer" }} />
          <span>Group by category</span>
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span>Max stack height:</span>
          <select value={maxHeight} onChange={e => setMaxHeight(Number(e.target.value))}
            style={selectStyle}>
            <option value={2}>2 high</option>
            <option value={3}>3 high</option>
            <option value={0}>No limit</option>
          </select>
        </div>

        {fetchError && (
          <div style={{ background: "rgba(255,107,107,0.15)", border: "1px solid #ff6b6b",
            borderRadius: 6, padding: "8px 10px", marginBottom: 10, fontSize: 12, color: "#ff6b6b" }}>
            Config not available for this combination. Cases may not fit in this container.
          </div>
        )}

        {stats && (
          <div style={{ borderTop: "1px solid #444", paddingTop: 10, fontSize: 12, lineHeight: 1.8 }}>
            <div>{stats.trucks} truck(s) &middot; {stats.total} cases &middot; {stats.stacked} stacked</div>
            <div style={{ color: stats.overhang > 0 ? "#ff6b6b" : "#69f0ae" }}>
              Overhang violations: {stats.overhang}
            </div>
            <div>Same-type stacks: {stats.sameTypeStacks}</div>
          </div>
        )}

        <div style={{ borderTop: "1px solid #444", paddingTop: 10, marginTop: 8 }}>
          <button onClick={() => setShowUpload(true)}
            style={{ width: "100%", background: "#4fc3f7", color: "#000", border: "none",
              borderRadius: 6, padding: "8px 0", fontSize: 13, fontWeight: 600,
              cursor: "pointer", letterSpacing: 0.3 }}>
            Upload Case List (CSV)
          </button>
        </div>

        <div style={{ borderTop: "1px solid #444", paddingTop: 10, marginTop: 8, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>CATEGORIES</div>
          {[["PA","#2979FF"],["Amps","#FF1744"],["Control","#00E676"],["RF","#FF9100"]].map(([cat, col]) => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: col, flexShrink: 0 }} />
              <span>{cat}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: "#888", borderTop: "1px solid #444", paddingTop: 8, marginTop: 8 }}>
          Click box for info &middot; Right-click to fit camera
        </div>
      </div>
    </div>
  );
}

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<App />);
