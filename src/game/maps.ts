export type MapObstacleKind =
    | "wall"
    | "crate"
    | "barrier"
    | "container";

export interface MapObstacle {
    x: number;
    y: number;
    width: number;
    height: number;
    kind: MapObstacleKind;
}

export interface ArenaMap {
    id: number;
    name: string;
    theme: string;
    accent: string;
    obstacles: MapObstacle[];
}

const o = (
    x: number,
    y: number,
    width: number,
    height: number,
    kind: MapObstacleKind = "wall"
): MapObstacle => ({ x, y, width, height, kind });

const MAPS: ArenaMap[] = [
    { id: 1, name: "Training Yard", theme: "industrial", accent: "#38bdf8", obstacles: [o(.18, .22, .18, .07), o(.64, .22, .18, .07), o(.18, .71, .18, .07), o(.64, .71, .18, .07)] },
    { id: 2, name: "Warehouse", theme: "warehouse", accent: "#f59e0b", obstacles: [o(.25, .12, .08, .28, "container"), o(.67, .12, .08, .28, "container"), o(.25, .60, .08, .28, "container"), o(.67, .60, .08, .28, "container"), o(.43, .38, .14, .24, "crate")] },
    { id: 3, name: "Crossroads", theme: "urban", accent: "#22d3ee", obstacles: [o(.08, .43, .28, .09, "barrier"), o(.64, .43, .28, .09, "barrier"), o(.43, .08, .09, .28, "barrier"), o(.43, .64, .09, .28, "barrier")] },
    { id: 4, name: "Four Blocks", theme: "urban", accent: "#60a5fa", obstacles: [o(.16, .16, .20, .16), o(.64, .16, .20, .16), o(.16, .68, .20, .16), o(.64, .68, .20, .16)] },
    { id: 5, name: "Fortress", theme: "military", accent: "#a3e635", obstacles: [o(.08, .08, .84, .06), o(.08, .86, .84, .06), o(.08, .08, .06, .84), o(.86, .08, .06, .84), o(.37, .37, .26, .26, "barrier")] },
    { id: 6, name: "Container Port", theme: "port", accent: "#fb923c", obstacles: [o(.12, .18, .32, .08, "container"), o(.56, .18, .32, .08, "container"), o(.12, .74, .32, .08, "container"), o(.56, .74, .32, .08, "container"), o(.46, .31, .08, .38, "container")] },
    { id: 7, name: "Market District", theme: "market", accent: "#f472b6", obstacles: [o(.12, .14, .16, .18, "crate"), o(.42, .14, .16, .18, "crate"), o(.72, .14, .16, .18, "crate"), o(.12, .68, .16, .18, "crate"), o(.42, .68, .16, .18, "crate"), o(.72, .68, .16, .18, "crate")] },
    { id: 8, name: "Canal Station", theme: "canal", accent: "#2dd4bf", obstacles: [o(.08, .35, .32, .10, "barrier"), o(.60, .35, .32, .10, "barrier"), o(.08, .55, .32, .10, "barrier"), o(.60, .55, .32, .10, "barrier"), o(.45, .20, .10, .60, "wall")] },
    { id: 9, name: "Power Grid", theme: "facility", accent: "#facc15", obstacles: [o(.14, .20, .18, .10), o(.68, .20, .18, .10), o(.14, .70, .18, .10), o(.68, .70, .18, .10), o(.40, .20, .20, .10, "barrier"), o(.40, .70, .20, .10, "barrier")] },
    { id: 10, name: "Command Base", theme: "military", accent: "#4ade80", obstacles: [o(.10, .12, .30, .08), o(.60, .12, .30, .08), o(.10, .80, .30, .08), o(.60, .80, .30, .08), o(.35, .32, .30, .08, "barrier"), o(.35, .60, .30, .08, "barrier")] },
    { id: 11, name: "Ruined Street", theme: "ruins", accent: "#fb7185", obstacles: [o(.08, .18, .22, .10), o(.38, .12, .12, .24), o(.70, .18, .22, .10), o(.18, .68, .24, .12), o(.58, .64, .12, .24), o(.78, .70, .14, .10)] },
    { id: 12, name: "Factory Floor", theme: "factory", accent: "#c084fc", obstacles: [o(.12, .12, .12, .76, "container"), o(.76, .12, .12, .76, "container"), o(.32, .18, .12, .24, "crate"), o(.56, .58, .12, .24, "crate"), o(.36, .42, .28, .10, "barrier")] },
    { id: 13, name: "Armory", theme: "military", accent: "#94a3b8", obstacles: [o(.10, .18, .22, .10), o(.68, .18, .22, .10), o(.10, .72, .22, .10), o(.68, .72, .22, .10), o(.38, .28, .24, .10), o(.38, .62, .24, .10), o(.45, .38, .10, .24, "barrier")] },
    { id: 14, name: "Metro Yard", theme: "metro", accent: "#818cf8", obstacles: [o(.10, .12, .80, .08, "barrier"), o(.10, .80, .80, .08, "barrier"), o(.18, .30, .24, .10, "container"), o(.58, .30, .24, .10, "container"), o(.18, .60, .24, .10, "container"), o(.58, .60, .24, .10, "container")] },
    { id: 15, name: "Dockyard", theme: "dock", accent: "#06b6d4", obstacles: [o(.08, .12, .26, .12, "container"), o(.66, .12, .26, .12, "container"), o(.08, .76, .26, .12, "container"), o(.66, .76, .26, .12, "container"), o(.40, .28, .20, .10, "barrier"), o(.40, .62, .20, .10, "barrier")] },
    { id: 16, name: "Night District", theme: "night-city", accent: "#e879f9", obstacles: [o(.12, .12, .10, .28), o(.32, .12, .10, .28), o(.58, .60, .10, .28), o(.78, .60, .10, .28), o(.48, .36, .10, .28, "barrier")] },
    { id: 17, name: "Checkpoint", theme: "checkpoint", accent: "#f97316", obstacles: [o(.08, .30, .30, .10, "barrier"), o(.62, .30, .30, .10, "barrier"), o(.08, .60, .30, .10, "barrier"), o(.62, .60, .30, .10, "barrier"), o(.44, .10, .12, .20, "crate"), o(.44, .70, .12, .20, "crate")] },
    { id: 18, name: "Foundry", theme: "foundry", accent: "#ef4444", obstacles: [o(.12, .12, .16, .16, "crate"), o(.72, .12, .16, .16, "crate"), o(.12, .72, .16, .16, "crate"), o(.72, .72, .16, .16, "crate"), o(.32, .28, .36, .10, "barrier"), o(.32, .62, .36, .10, "barrier")] },
    { id: 19, name: "Research Lab", theme: "lab", accent: "#67e8f9", obstacles: [o(.12, .12, .12, .76, "wall"), o(.76, .12, .12, .76, "wall"), o(.32, .16, .36, .08, "barrier"), o(.32, .76, .36, .08, "barrier"), o(.40, .34, .20, .32, "crate")] },
    { id: 20, name: "Bunker", theme: "bunker", accent: "#84cc16", obstacles: [o(.08, .08, .84, .08), o(.08, .84, .84, .08), o(.08, .08, .08, .84), o(.84, .08, .08, .84), o(.24, .24, .16, .16, "crate"), o(.60, .24, .16, .16, "crate"), o(.24, .60, .16, .16, "crate"), o(.60, .60, .16, .16, "crate")] },
    { id: 21, name: "Desert Outpost", theme: "desert", accent: "#fbbf24", obstacles: [o(.12, .18, .18, .12, "crate"), o(.70, .18, .18, .12, "crate"), o(.12, .70, .18, .12, "crate"), o(.70, .70, .18, .12, "crate"), o(.42, .34, .16, .32, "barrier")] },
    { id: 22, name: "Snow Base", theme: "snow", accent: "#bae6fd", obstacles: [o(.12, .12, .30, .08), o(.58, .12, .30, .08), o(.12, .80, .30, .08), o(.58, .80, .30, .08), o(.30, .30, .12, .40, "barrier"), o(.58, .30, .12, .40, "barrier")] },
    { id: 23, name: "Forest Camp", theme: "forest", accent: "#4ade80", obstacles: [o(.16, .16, .12, .12, "crate"), o(.38, .10, .12, .18, "crate"), o(.70, .16, .12, .12, "crate"), o(.16, .72, .12, .12, "crate"), o(.40, .70, .12, .18, "crate"), o(.70, .72, .12, .12, "crate"), o(.42, .38, .16, .16, "barrier")] },
    { id: 24, name: "Bridge", theme: "bridge", accent: "#38bdf8", obstacles: [o(.08, .10, .84, .10, "barrier"), o(.08, .80, .84, .10, "barrier"), o(.20, .30, .18, .40, "container"), o(.62, .30, .18, .40, "container")] },
    { id: 25, name: "Underground", theme: "underground", accent: "#a78bfa", obstacles: [o(.10, .14, .24, .10), o(.66, .14, .24, .10), o(.10, .76, .24, .10), o(.66, .76, .24, .10), o(.28, .32, .44, .10, "barrier"), o(.28, .58, .44, .10, "barrier")] },
    { id: 26, name: "City Plaza", theme: "plaza", accent: "#22d3ee", obstacles: [o(.10, .10, .16, .16), o(.74, .10, .16, .16), o(.10, .74, .16, .16), o(.74, .74, .16, .16), o(.38, .38, .24, .24, "barrier")] },
    { id: 27, name: "Storage Maze", theme: "storage", accent: "#f59e0b", obstacles: [o(.10, .12, .12, .28, "container"), o(.30, .12, .12, .28, "container"), o(.50, .12, .12, .28, "container"), o(.70, .12, .12, .28, "container"), o(.20, .60, .12, .28, "container"), o(.40, .60, .12, .28, "container"), o(.60, .60, .12, .28, "container"), o(.80, .60, .08, .28, "container")] },
    { id: 28, name: "Arena Core", theme: "arena", accent: "#f43f5e", obstacles: [o(.12, .12, .20, .10, "barrier"), o(.68, .12, .20, .10, "barrier"), o(.12, .78, .20, .10, "barrier"), o(.68, .78, .20, .10, "barrier"), o(.28, .30, .12, .40, "wall"), o(.60, .30, .12, .40, "wall")] },
    { id: 29, name: "Final Sector", theme: "final-sector", accent: "#fb7185", obstacles: [o(.08, .08, .84, .06), o(.08, .86, .84, .06), o(.08, .08, .06, .84), o(.86, .08, .06, .84), o(.20, .24, .20, .10, "crate"), o(.60, .24, .20, .10, "crate"), o(.20, .66, .20, .10, "crate"), o(.60, .66, .20, .10, "crate"), o(.42, .38, .16, .24, "barrier")] },
    { id: 30, name: "Last Stand", theme: "last-stand", accent: "#facc15", obstacles: [o(.08, .08, .24, .08), o(.68, .08, .24, .08), o(.08, .84, .24, .08), o(.68, .84, .24, .08), o(.08, .08, .08, .24), o(.84, .08, .08, .24), o(.08, .68, .08, .24), o(.84, .68, .08, .24), o(.32, .28, .36, .08, "barrier"), o(.32, .64, .36, .08, "barrier"), o(.42, .38, .16, .24, "crate")] },
];

export const TOTAL_MAPS = MAPS.length;

export const getMapForLevel = (level: number): ArenaMap => {
    const mapId = Math.min(
        TOTAL_MAPS,
        Math.max(1, Math.ceil(level / 2))
    );
    return MAPS[mapId - 1];
};

export const getMapById = (id: number): ArenaMap => {
    return MAPS[Math.min(TOTAL_MAPS, Math.max(1, Math.floor(id))) - 1];
};

export const getMapObstacles = (
    map: ArenaMap,
    width: number,
    height: number
): MapObstacle[] =>
    map.obstacles.map((obstacle) => ({
        ...obstacle,
        x: obstacle.x * width,
        y: obstacle.y * height,
        width: obstacle.width * width,
        height: obstacle.height * height,
    }));

export default MAPS;
