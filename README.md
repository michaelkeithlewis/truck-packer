# Truck Packer

Interactive 3D bin-packing visualizer for production road cases and truck loading. Upload a case list, choose a container type, tune packing rules, and see the results in a real-time 3D scene.

Built on [3d-bin-container-packing](https://github.com/skjolber/3d-bin-container-packing) with custom packing rules for real-world truck loading.

![Truck Packer Screenshot](docs/screenshot.png)

## Features

- **Multiple container types** — 53ft semi, 48ft semi, 26ft box truck, sprinter van
- **Section-based packing** — loads wall-by-wall from cab to door, like a real truck
- **Toggleable packing rules:**
  - Prefer same-type stacking
  - No overhang (full single-supporter support)
  - Group by category
  - Max stack height (2, 3, or unlimited)
- **Per-item constraints** via CSV columns:
  - `Can be stacked` — whether the item can go on top of another
  - `Can have item on top` — whether anything can be placed on this item
- **CSV upload wizard** — drag-and-drop a case list, preview, and pack
- **3D viewer** — orbit, zoom, click boxes for info, category color coding
- **Multi-truck layout** — side-by-side trailers with CAB/DOOR/TRUCK labels

## Quick Start

### Prerequisites

- Java 17+ (`brew install openjdk`)
- Maven 3.8+ (`brew install maven`)
- Node.js 18+ (`brew install node`)

### Setup

```bash
# Install Java dependencies and build the packing library
mvn install -DskipTests

# Install frontend dependencies
cd visualizer/viewer
npm install

# Generate packing configs (runs the bin packer for all rule combinations)
cd ../..
mvn test -pl visualizer/packaging -Dtest=CsvPackerTest#generateAllConfigs

# Start the dev server
cd visualizer/viewer
npm start
```

Open [http://localhost:3000](http://localhost:3000).

### Deploy as Static Site

```bash
cd visualizer/viewer
npm run build
```

The `build/` folder contains a fully self-contained static site with all pre-generated packing configs. Deploy it to any static host (Vercel, Netlify, GitHub Pages, S3, etc.).

> **Note:** The CSV upload feature requires the dev server with Java/Maven available locally. On a static deployment, you can switch between pre-generated container types and rule combinations, but uploading new case lists requires running the dev server.

## CSV Format

```
Name,Description,Manufacturer,Length,Width,Height,Weight,Category,Flip,Can be stacked,Can have item on top
Amp Head Case,,SKB,36,24,24,70,Amps,FALSE,TRUE,TRUE
Subwoofer Crate,,Calzone,48,30,36,180,PA,FALSE,TRUE,FALSE
```

| Column | Description |
|--------|-------------|
| Name | Case name (used for same-type stacking) |
| Description | Optional description |
| Manufacturer | Optional manufacturer |
| Length | Inches (truck depth direction) |
| Width | Inches (truck width direction) |
| Height | Inches (vertical) |
| Weight | Pounds |
| Category | Grouping label (PA, Amps, Control, RF, etc.) |
| Flip | `TRUE` if the case can be rotated in 3D |
| Can be stacked | `TRUE` if this case can be placed on top of another (`FALSE` = ground only) |
| Can have item on top | `TRUE` if other cases can go on top of this one (`FALSE` = nothing on top) |

## Project Structure

```
├── visualizer/
│   ├── viewer/              # React + Three.js frontend
│   │   ├── src/
│   │   │   ├── index.js     # Main app, controls panel, CSV wizard
│   │   │   ├── ThreeScene.js # 3D scene, container layout, labels
│   │   │   ├── api.ts       # Box/container rendering, color schemes
│   │   │   └── setupProxy.js # Dev-mode API for CSV upload
│   │   └── public/assets/   # Pre-generated packing JSON configs
│   └── packaging/
│       └── src/test/
│           ├── java/.../    # Custom packing rules
│           │   ├── CasePlacementControls.java      # Constraint enforcement
│           │   ├── CasePlacementComparator.java     # Section-based placement ranking
│           │   ├── CasePlacementControlsBuilderFactory.java
│           │   └── CsvPackerTest.java               # Config generation
│           └── resources/cases.csv                  # Default case list
├── core/                    # Bin-packing library (upstream)
├── api/                     # Packing API (upstream)
└── pom.xml                  # Maven parent POM
```

## Packing Rules

The algorithm fills trucks in **sections** (walls) from the cab toward the door:

1. **Section fill** — lower X (deeper in truck) is always preferred
2. **Category grouping** — within a section, cluster same-category cases together
3. **Same-type stacking** — prefer placing a case on top of an identical case type
4. **Floor-up fill** — within a section, fill from floor upward
5. **Width fill** — fill left to right across the truck

Hard constraints (never violated):
- **Gravity** — every elevated box must have physical support below
- **No overhang** — a box must fit entirely within one supporter's footprint
- **Max height** — limits how many cases can stack vertically
- **Can be stacked / Can have item on top** — per-item CSV constraints

## License

The upstream bin-packing library is licensed under Apache 2.0. See [LICENSE](LICENSE).
