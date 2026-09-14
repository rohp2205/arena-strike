/* =========================================================
   ARENA STRIKE
   LEVEL SYSTEM

   60 CAMPAIGN LEVELS
   30 MAPS
   5 DIFFICULTY MODES
   3 LIVES PER LEVEL
   ========================================================= */

export type Difficulty =
    | "easy"
    | "medium"
    | "hard"
    | "very-hard"
    | "expert";

export type ObjectiveType =
    | "eliminate"
    | "survive"
    | "defend"
    | "collect"
    | "destroy"
    | "time"
    | "boss";

export type MapTheme =
    | "grassland"
    | "forest"
    | "military"
    | "river"
    | "village"
    | "desert"
    | "canyon"
    | "industrial"
    | "factory"
    | "snow"
    | "coast"
    | "harbor"
    | "underground"
    | "city"
    | "prison"
    | "research"
    | "missile"
    | "warzone"
    | "burning-city"
    | "nuclear"
    | "blacksite"
    | "night"
    | "wasteland"
    | "stronghold"
    | "arctic"
    | "final";

export interface MapDefinition {
    id: number;
    name: string;
    theme: MapTheme;
    description: string;
    environment: string;
}

export interface LevelObjective {
    type: ObjectiveType;
    title: string;
    description: string;
    target: number;
}

export interface LevelDefinition {
    id: number;
    name: string;
    mapId: number;
    difficulty: Difficulty;

    waves: number;
    enemyCount: number;
    enemyHealthMultiplier: number;
    enemySpeedMultiplier: number;

    objectives: LevelObjective[];

    hasBoss: boolean;
    bossName?: string;

    timeLimit?: number;

    xpReward: number;
    creditReward: number;

    starRequirements: {
        first: string;
        second: string;
        third: string;
    };

    startingLives: number;
}

/* =========================================================
   GAME CONSTANTS
   ========================================================= */

export const TOTAL_LEVELS = 60;

export const TOTAL_MAPS = 30;

export const STARTING_LIVES = 3;

/* =========================================================
   DIFFICULTY CONFIGURATION
   ========================================================= */

export const DIFFICULTY_CONFIG: Record<
    Difficulty,
    {
        label: string;
        description: string;
        color: string;

        enemyHealthMultiplier: number;
        enemySpeedMultiplier: number;
        enemyCountMultiplier: number;

        baseWaves: number;
    }
> = {
    easy: {
        label: "EASY",
        description: "Learn the arena and master the basics.",
        color: "#22c55e",

        enemyHealthMultiplier: 1,
        enemySpeedMultiplier: 1,
        enemyCountMultiplier: 1,

        baseWaves: 3,
    },

    medium: {
        label: "MEDIUM",
        description: "Enemies become faster and more aggressive.",
        color: "#facc15",

        enemyHealthMultiplier: 1.15,
        enemySpeedMultiplier: 1.12,
        enemyCountMultiplier: 1.15,

        baseWaves: 4,
    },

    hard: {
        label: "HARD",
        description: "Tough enemies, dangerous waves, and difficult missions.",
        color: "#f97316",

        enemyHealthMultiplier: 1.35,
        enemySpeedMultiplier: 1.25,
        enemyCountMultiplier: 1.3,

        baseWaves: 6,
    },

    "very-hard": {
        label: "VERY HARD",
        description: "Only experienced players will survive.",
        color: "#ef4444",

        enemyHealthMultiplier: 1.6,
        enemySpeedMultiplier: 1.4,
        enemyCountMultiplier: 1.5,

        baseWaves: 8,
    },

    expert: {
        label: "EXPERT",
        description: "The ultimate Arena Strike challenge.",
        color: "#a855f7",

        enemyHealthMultiplier: 1.9,
        enemySpeedMultiplier: 1.55,
        enemyCountMultiplier: 1.7,

        baseWaves: 10,
    },
};

/* =========================================================
   30 MAPS
   ========================================================= */

export const MAPS: MapDefinition[] = [
    {
        id: 1,
        name: "Training Grounds",
        theme: "grassland",
        description: "A controlled combat arena for new recruits.",
        environment: "Grass, training barriers, crates",
    },

    {
        id: 2,
        name: "Forest Camp",
        theme: "forest",
        description: "A tactical camp hidden inside dense woodland.",
        environment: "Trees, bushes, rocks, wooden barriers",
    },

    {
        id: 3,
        name: "Supply Outpost",
        theme: "military",
        description: "A small military supply station under attack.",
        environment: "Military tents, crates, barriers",
    },

    {
        id: 4,
        name: "Riverside Base",
        theme: "river",
        description: "A remote base divided by a river.",
        environment: "River, bridges, grass, rocks",
    },

    {
        id: 5,
        name: "Abandoned Village",
        theme: "village",
        description: "A deserted village now occupied by hostile forces.",
        environment: "Houses, roads, fences, debris",
    },

    {
        id: 6,
        name: "Desert Outpost",
        theme: "desert",
        description: "A military outpost surrounded by endless desert.",
        environment: "Sand, rocks, tents, crates",
    },

    {
        id: 7,
        name: "Canyon Base",
        theme: "canyon",
        description: "A narrow combat zone surrounded by rocky cliffs.",
        environment: "Cliffs, rocks, narrow paths",
    },

    {
        id: 8,
        name: "Industrial Yard",
        theme: "industrial",
        description: "A large open yard filled with industrial equipment.",
        environment: "Containers, machinery, barriers",
    },

    {
        id: 9,
        name: "Factory Complex",
        theme: "factory",
        description: "A heavily guarded industrial factory.",
        environment: "Buildings, machinery, crates",
    },

    {
        id: 10,
        name: "Military Depot",
        theme: "military",
        description: "A heavily defended weapons storage facility.",
        environment: "Warehouses, containers, walls",
    },

    {
        id: 11,
        name: "Snow Camp",
        theme: "snow",
        description: "A frozen military camp surrounded by snow.",
        environment: "Snow, ice, tents, frozen trees",
    },

    {
        id: 12,
        name: "Frozen Facility",
        theme: "snow",
        description: "A research facility buried beneath the ice.",
        environment: "Ice, laboratories, metal structures",
    },

    {
        id: 13,
        name: "Coastal Base",
        theme: "coast",
        description: "A military installation overlooking the sea.",
        environment: "Coastline, rocks, buildings",
    },

    {
        id: 14,
        name: "Harbor District",
        theme: "harbor",
        description: "A dangerous harbor filled with enemy activity.",
        environment: "Ships, containers, warehouses",
    },

    {
        id: 15,
        name: "Underground Station",
        theme: "underground",
        description: "A dark underground facility with limited escape routes.",
        environment: "Tunnels, platforms, concrete walls",
    },

    {
        id: 16,
        name: "Ruined City",
        theme: "city",
        description: "A destroyed urban battlefield.",
        environment: "Ruined buildings, streets, debris",
    },

    {
        id: 17,
        name: "Downtown",
        theme: "city",
        description: "A dense urban combat zone.",
        environment: "Buildings, roads, vehicles, barricades",
    },

    {
        id: 18,
        name: "Prison Complex",
        theme: "prison",
        description: "A fortified prison controlled by hostile forces.",
        environment: "Walls, cells, towers, gates",
    },

    {
        id: 19,
        name: "Research Facility",
        theme: "research",
        description: "A secret laboratory containing dangerous technology.",
        environment: "Laboratories, corridors, equipment",
    },

    {
        id: 20,
        name: "Missile Base",
        theme: "missile",
        description: "A heavily protected military missile installation.",
        environment: "Launch areas, bunkers, military structures",
    },

    {
        id: 21,
        name: "Warzone",
        theme: "warzone",
        description: "A large battlefield filled with enemy forces.",
        environment: "Destroyed vehicles, trenches, barricades",
    },

    {
        id: 22,
        name: "Burning City",
        theme: "burning-city",
        description: "A city consumed by an ongoing battle.",
        environment: "Fire, ruined buildings, burning vehicles",
    },

    {
        id: 23,
        name: "Nuclear Facility",
        theme: "nuclear",
        description: "A dangerous nuclear facility with restricted zones.",
        environment: "Reactors, warning areas, industrial structures",
    },

    {
        id: 24,
        name: "Blacksite",
        theme: "blacksite",
        description: "A secret underground military installation.",
        environment: "Concrete rooms, security areas, corridors",
    },

    {
        id: 25,
        name: "Night Operations",
        theme: "night",
        description: "A dangerous battlefield under darkness.",
        environment: "Dark buildings, lights, shadows, barriers",
    },

    {
        id: 26,
        name: "Dead Zone",
        theme: "wasteland",
        description: "A ruined wasteland where few soldiers survive.",
        environment: "Wasteland, rocks, wreckage",
    },

    {
        id: 27,
        name: "Enemy Stronghold",
        theme: "stronghold",
        description: "A heavily fortified enemy fortress.",
        environment: "Walls, gates, towers, bunkers",
    },

    {
        id: 28,
        name: "Arctic Command",
        theme: "arctic",
        description: "The enemy's frozen command headquarters.",
        environment: "Snow, ice, military buildings",
    },

    {
        id: 29,
        name: "Final Warzone",
        theme: "warzone",
        description: "A massive battlefield preparing for the final confrontation.",
        environment: "Ruins, vehicles, bunkers, debris",
    },

    {
        id: 30,
        name: "Final Arena",
        theme: "final",
        description: "The ultimate battlefield where the final enemy awaits.",
        environment: "Fortress, arena walls, destroyed structures",
    },
];

/* =========================================================
   LEVEL RANGE HELPERS
   ========================================================= */

export const getDifficultyForLevel = (
    level: number
): Difficulty => {
    if (level >= 1 && level <= 10) {
        return "easy";
    }

    if (level >= 11 && level <= 30) {
        return "medium";
    }

    if (level >= 31 && level <= 40) {
        return "hard";
    }

    if (level >= 41 && level <= 50) {
        return "very-hard";
    }

    return "expert";
};

/* =========================================================
   MAP ASSIGNMENT
   ========================================================= */

export const getMapIdForLevel = (
    level: number
): number => {
    if (level < 1 || level > TOTAL_LEVELS) {
        return 1;
    }

    return Math.ceil(level / 2);
};

/* =========================================================
   LEVEL NAME GENERATOR
   ========================================================= */

const LEVEL_NAMES: Record<number, string> = {
    1: "First Contact",
    2: "Basic Training",
    3: "Into the Forest",
    4: "Hidden Threat",
    5: "Supply Run",
    6: "Hold the Outpost",
    7: "Riverside Assault",
    8: "Bridge Attack",
    9: "Village Sweep",
    10: "Easy Mode Finale",

    11: "Desert Arrival",
    12: "Desert Assault",
    13: "Canyon Strike",
    14: "Canyon Ambush",
    15: "Industrial Entry",
    16: "Yard Control",
    17: "Factory Breach",
    18: "Factory Lockdown",
    19: "Depot Assault",
    20: "Depot Commander",

    21: "Frozen Arrival",
    22: "Frozen Assault",
    23: "Ice Breaker",
    24: "Frozen Lockdown",
    25: "Coastal Strike",
    26: "Harbor Assault",
    27: "Underground Entry",
    28: "Tunnel Warfare",
    29: "Final Station",
    30: "Medium Mode Finale",

    31: "City Entry",
    32: "Urban Assault",
    33: "Downtown Siege",
    34: "Street Warfare",
    35: "Prison Break",
    36: "Prison Lockdown",
    37: "Research Breach",
    38: "Laboratory Siege",
    39: "Missile Threat",
    40: "Hard Mode Finale",

    41: "Warzone Arrival",
    42: "Battlefield",
    43: "Burning Streets",
    44: "City Inferno",
    45: "Nuclear Breach",
    46: "Radiation Zone",
    47: "Blacksite Entry",
    48: "Blacksite Siege",
    49: "Night Assault",
    50: "Very Hard Finale",

    51: "Dead Zone",
    52: "Wasteland Assault",
    53: "Enemy Fortress",
    54: "Stronghold Breach",
    55: "Arctic Command",
    56: "Frozen Command",
    57: "Final War",
    58: "Last Stand",
    59: "Final Approach",
    60: "The Final Battle",
};

/* =========================================================
   OBJECTIVE GENERATION
   ========================================================= */

const createObjectives = (
    level: number,
    difficulty: Difficulty
): LevelObjective[] => {
    const objectives: LevelObjective[] = [];

    const primaryTarget =
        difficulty === "easy"
            ? 10 + level
            : difficulty === "medium"
                ? 18 + Math.floor(level * 0.8)
                : difficulty === "hard"
                    ? 28 + Math.floor(level * 0.7)
                    : difficulty === "very-hard"
                        ? 35 + Math.floor(level * 0.8)
                        : 45 + Math.floor(level * 0.9);

    /*
      Every level has an elimination objective.
    */

    objectives.push({
        type: "eliminate",
        title: "Eliminate Enemies",
        description: `Eliminate ${primaryTarget} enemies.`,
        target: primaryTarget,
    });

    /*
      Every third level receives a secondary objective.
    */

    if (level % 3 === 0) {
        objectives.push({
            type: "survive",
            title: "Survive the Waves",
            description: "Survive every enemy wave.",
            target:
                difficulty === "easy"
                    ? 3
                    : difficulty === "medium"
                        ? 5
                        : difficulty === "hard"
                            ? 7
                            : difficulty === "very-hard"
                                ? 9
                                : 10,
        });
    } else if (level % 3 === 1) {
        objectives.push({
            type: "collect",
            title: "Collect Supplies",
            description: "Collect power-ups during the mission.",
            target:
                difficulty === "easy"
                    ? 1
                    : difficulty === "medium"
                        ? 2
                        : difficulty === "hard"
                            ? 3
                            : 4,
        });
    } else {
        objectives.push({
            type: "defend",
            title: "Protect the Arena",
            description: "Survive while keeping control of the arena.",
            target: 1,
        });
    }

    /*
      Special time challenge.
    */

    if (level % 5 === 0) {
        objectives.push({
            type: "time",
            title: "Speed Challenge",
            description: "Complete the mission within the time limit.",
            target: 1,
        });
    }

    return objectives;
};

/* =========================================================
   BOSS LEVELS
   ========================================================= */

export const BOSS_LEVELS = [
    10,
    20,
    30,
    40,
    50,
    60,
];

export const isBossLevel = (
    level: number
): boolean => {
    return BOSS_LEVELS.includes(level);
};

export const getBossName = (
    level: number
): string | undefined => {
    const bosses: Record<number, string> = {
        10: "Training Commander",
        20: "Desert Warlord",
        30: "Steel Commander",
        40: "Urban Destroyer",
        50: "Nightmare Commander",
        60: "The Arena Overlord",
    };

    return bosses[level];
};

/* =========================================================
   WAVE CALCULATION
   ========================================================= */

export const getWaveCountForLevel = (
    level: number
): number => {
    const difficulty =
        getDifficultyForLevel(level);

    const base =
        DIFFICULTY_CONFIG[difficulty].baseWaves;

    /*
      Gradually increase waves within each
      difficulty section.
    */

    if (difficulty === "easy") {
        return Math.min(
            5,
            base + Math.floor((level - 1) / 4)
        );
    }

    if (difficulty === "medium") {
        return Math.min(
            7,
            base + Math.floor((level - 11) / 5)
        );
    }

    if (difficulty === "hard") {
        return Math.min(
            9,
            base + Math.floor((level - 31) / 4)
        );
    }

    if (difficulty === "very-hard") {
        return Math.min(
            11,
            base + Math.floor((level - 41) / 4)
        );
    }

    return Math.min(
        13,
        base + Math.floor((level - 51) / 4)
    );
};

/* =========================================================
   ENEMY COUNT CALCULATION
   ========================================================= */

export const getEnemyCountForLevel = (
    level: number
): number => {
    const difficulty =
        getDifficultyForLevel(level);

    const config =
        DIFFICULTY_CONFIG[difficulty];

    const waveCount =
        getWaveCountForLevel(level);

    const basePerWave =
        5 +
        Math.floor(level / 5);

    return Math.max(
        5,
        Math.round(
            basePerWave *
            waveCount *
            config.enemyCountMultiplier
        )
    );
};

/* =========================================================
   LEVEL XP
   ========================================================= */

export const getXPRewardForLevel = (
    level: number
): number => {
    const difficulty =
        getDifficultyForLevel(level);

    const multiplier =
        difficulty === "easy"
            ? 1
            : difficulty === "medium"
                ? 1.5
                : difficulty === "hard"
                    ? 2
                    : difficulty === "very-hard"
                        ? 3
                        : 4;

    return Math.round(
        (250 + level * 50) *
        multiplier
    );
};

/* =========================================================
   LEVEL CREDIT REWARD
   ========================================================= */

export const getCreditRewardForLevel = (
    level: number
): number => {
    const difficulty =
        getDifficultyForLevel(level);

    const multiplier =
        difficulty === "easy"
            ? 1
            : difficulty === "medium"
                ? 1.5
                : difficulty === "hard"
                    ? 2
                    : difficulty === "very-hard"
                        ? 2.5
                        : 3;

    return Math.round(
        (100 + level * 25) *
        multiplier
    );
};

/* =========================================================
   TIME LIMIT
   ========================================================= */

export const getTimeLimitForLevel = (
    level: number
): number | undefined => {
    if (level % 5 !== 0) {
        return undefined;
    }

    const difficulty =
        getDifficultyForLevel(level);

    if (difficulty === "easy") {
        return 240;
    }

    if (difficulty === "medium") {
        return 300;
    }

    if (difficulty === "hard") {
        return 360;
    }

    if (difficulty === "very-hard") {
        return 420;
    }

    return 480;
};

/* =========================================================
   STAR REQUIREMENTS
   ========================================================= */

export const getStarRequirements = (
    level: number
) => {
    return {
        first: "Complete the mission",

        second:
            level % 2 === 0
                ? "Finish with at least 2 lives remaining"
                : "Eliminate the required enemies",

        third:
            level % 5 === 0
                ? "Complete the mission within the time limit"
                : "Finish with at least 1 life remaining",
    };
};

/* =========================================================
   CREATE ONE LEVEL
   ========================================================= */

export const createLevelDefinition = (
    level: number
): LevelDefinition => {
    const difficulty =
        getDifficultyForLevel(level);

    const mapId =
        getMapIdForLevel(level);

    const difficultyConfig =
        DIFFICULTY_CONFIG[difficulty];

    const waves =
        getWaveCountForLevel(level);

    const enemyCount =
        getEnemyCountForLevel(level);

    const hasBoss =
        isBossLevel(level);

    const bossName =
        getBossName(level);

    const timeLimit =
        getTimeLimitForLevel(level);

    return {
        id: level,

        name:
            LEVEL_NAMES[level] ??
            `Arena Mission ${level}`,

        mapId,

        difficulty,

        waves,

        enemyCount,

        enemyHealthMultiplier:
            difficultyConfig.enemyHealthMultiplier,

        enemySpeedMultiplier:
            difficultyConfig.enemySpeedMultiplier,

        objectives:
            createObjectives(
                level,
                difficulty
            ),

        hasBoss,

        bossName,

        timeLimit,

        xpReward:
            getXPRewardForLevel(level),

        creditReward:
            getCreditRewardForLevel(level),

        starRequirements:
            getStarRequirements(level),

        startingLives:
            STARTING_LIVES,
    };
};

/* =========================================================
   ALL 60 LEVELS
   ========================================================= */

export const LEVELS: LevelDefinition[] =
    Array.from(
        { length: TOTAL_LEVELS },
        (_, index) =>
            createLevelDefinition(
                index + 1
            )
    );

/* =========================================================
   LEVEL LOOKUP
   ========================================================= */

export const getLevel = (
    level: number
): LevelDefinition | undefined => {
    return LEVELS.find(
        (item) =>
            item.id === level
    );
};

/* =========================================================
   MAP LOOKUP
   ========================================================= */

export const getMap = (
    mapId: number
): MapDefinition | undefined => {
    return MAPS.find(
        (map) =>
            map.id === mapId
    );
};

/* =========================================================
   LEVEL UNLOCKING
   ========================================================= */

export const isLevelUnlocked = (
    level: number,
    completedLevels: number[]
): boolean => {
    if (level === 1) {
        return true;
    }

    return completedLevels.includes(
        level - 1
    );
};

/* =========================================================
   NEXT LEVEL
   ========================================================= */

export const getNextLevel = (
    currentLevel: number
): LevelDefinition | undefined => {
    if (
        currentLevel >=
        TOTAL_LEVELS
    ) {
        return undefined;
    }

    return getLevel(
        currentLevel + 1
    );
};

/* =========================================================
   PREVIOUS LEVEL
   ========================================================= */

export const getPreviousLevel = (
    currentLevel: number
): LevelDefinition | undefined => {
    if (
        currentLevel <= 1
    ) {
        return undefined;
    }

    return getLevel(
        currentLevel - 1
    );
};

/* =========================================================
   DIFFICULTY LEVEL RANGES
   ========================================================= */

export const DIFFICULTY_RANGES: Record<
    Difficulty,
    {
        start: number;
        end: number;
    }
> = {
    easy: {
        start: 1,
        end: 10,
    },

    medium: {
        start: 11,
        end: 30,
    },

    hard: {
        start: 31,
        end: 40,
    },

    "very-hard": {
        start: 41,
        end: 50,
    },

    expert: {
        start: 51,
        end: 60,
    },
};

/* =========================================================
   GET LEVELS BY DIFFICULTY
   ========================================================= */

export const getLevelsByDifficulty = (
    difficulty: Difficulty
): LevelDefinition[] => {
    return LEVELS.filter(
        (level) =>
            level.difficulty ===
            difficulty
    );
};

/* =========================================================
   GET MAP FOR LEVEL
   ========================================================= */

export const getMapForLevel = (
    level: number
): MapDefinition | undefined => {
    const mapId =
        getMapIdForLevel(level);

    return getMap(mapId);
};

/* =========================================================
   CAMPAIGN PROGRESS
   ========================================================= */

export const getCompletedLevelCount = (
    completedLevels: number[]
): number => {
    return completedLevels.filter(
        (level) =>
            level >= 1 &&
            level <= TOTAL_LEVELS
    ).length;
};

/* =========================================================
   CAMPAIGN COMPLETE
   ========================================================= */

export const isCampaignComplete = (
    completedLevels: number[]
): boolean => {
    return completedLevels.includes(
        TOTAL_LEVELS
    );
};

/* =========================================================
   STAR VALIDATION
   ========================================================= */

export const calculateStars = (
    level: number,
    livesRemaining: number,
    timeSeconds?: number
): number => {
    const levelDefinition =
        getLevel(level);

    if (!levelDefinition) {
        return 0;
    }

    /*
      Star 1:
      Mission completed.
    */

    let stars = 1;

    /*
      Star 2:
      Usually requires at least
      two lives remaining.
    */

    if (
        livesRemaining >= 2
    ) {
        stars++;
    }

    /*
      Star 3:
      Time-based levels require
      completion within the limit.
      Other levels require at least
      one life remaining.
    */

    if (
        levelDefinition.timeLimit !==
        undefined &&
        timeSeconds !== undefined
    ) {
        if (
            timeSeconds <=
            levelDefinition.timeLimit
        ) {
            stars++;
        }
    } else if (
        livesRemaining >= 1
    ) {
        stars++;
    }

    return Math.min(
        3,
        stars
    );
};

/* =========================================================
   DIFFICULTY LABEL
   ========================================================= */

export const getDifficultyLabel = (
    difficulty: Difficulty
): string => {
    return DIFFICULTY_CONFIG[
        difficulty
    ].label;
};

/* =========================================================
   MAP DESCRIPTION
   ========================================================= */

export const getMapDescription = (
    level: number
): string => {
    const map =
        getMapForLevel(level);

    return (
        map?.description ??
        "Enter the arena."
    );
};

/* =========================================================
   LEVEL SUMMARY
   ========================================================= */

export const getLevelSummary = (
    level: number
) => {
    const definition =
        getLevel(level);

    if (!definition) {
        return null;
    }

    const map =
        getMap(
            definition.mapId
        );

    return {
        level:
            definition.id,

        name:
            definition.name,

        map:
            map?.name ??
            "Unknown Map",

        difficulty:
            getDifficultyLabel(
                definition.difficulty
            ),

        waves:
            definition.waves,

        enemies:
            definition.enemyCount,

        lives:
            definition.startingLives,

        xp:
            definition.xpReward,

        credits:
            definition.creditReward,

        boss:
            definition.hasBoss
                ? definition.bossName
                : null,
    };
};