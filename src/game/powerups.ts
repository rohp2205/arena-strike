export type PowerUpType =
    | "health"
    | "ammo"
    | "speed"
    | "shield"
    | "damage";

export interface PowerUp {
    x: number;
    y: number;
    radius: number;
    type: PowerUpType;

    // Remaining lifetime in milliseconds.
    life: number;

    // Original lifetime in milliseconds.
    maxLife: number;
}

export const POWERUP_CONFIG: Record<
    PowerUpType,
    {
        label: string;
        color: string;
        duration: number;
    }
> = {
    health: {
        label: "HEALTH",
        color: "#22c55e",
        duration: 0,
    },

    ammo: {
        label: "AMMO",
        color: "#facc15",
        duration: 0,
    },

    speed: {
        label: "SPEED",
        color: "#38bdf8",
        duration: 8000,
    },

    shield: {
        label: "SHIELD",
        color: "#a855f7",
        duration: 8000,
    },

    damage: {
        label: "DAMAGE",
        color: "#ef4444",
        duration: 8000,
    },
};

export const POWERUP_TYPES: PowerUpType[] = [
    "health",
    "ammo",
    "speed",
    "shield",
    "damage",
];

export const getRandomPowerUpType =
    (): PowerUpType => {
        const index =
            Math.floor(
                Math.random() *
                POWERUP_TYPES.length
            );

        return POWERUP_TYPES[index];
    };