export type GameState =
    | "menu"
    | "playing"
    | "paused"
    | "settings"
    | "gameOver";

export const GAME_STATES: Record<
    GameState,
    GameState
> = {
    menu: "menu",
    playing: "playing",
    paused: "paused",
    settings: "settings",
    gameOver: "gameOver",
};

export const isPlayingState = (
    state: GameState
) => {
    return state === "playing";
};

export const isPausedState = (
    state: GameState
) => {
    return state === "paused";
};

export const isMenuState = (
    state: GameState
) => {
    return state === "menu";
};

export const isSettingsState = (
    state: GameState
) => {
    return state === "settings";
};

export const isGameOverState = (
    state: GameState
) => {
    return state === "gameOver";
};

export const canStartGame = (
    state: GameState
) => {
    return (
        state === "menu" ||
        state === "gameOver"
    );
};

export const canPauseGame = (
    state: GameState
) => {
    return state === "playing";
};

export const canResumeGame = (
    state: GameState
) => {
    return state === "paused";
};