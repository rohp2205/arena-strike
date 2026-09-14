"use client";

/* ================================================================
   STEP 39 // FINAL UI/UX & CAMPAIGN POLISH
   ----------------------------------------------------------------
   Adds the final presentation layer before release:
   - responsive tactical HUD shell
   - mission progress clarity
   - compact objective status instrumentation
   - accessibility-minded reduced-motion handling
   - consistent interaction feedback for tactical controls
   - campaign completion progress indicator

   Existing simulation, multiplayer authority, progression, weapons,
   objectives, bosses, maps and controls remain the source of truth.
   No new package dependency or server protocol is introduced.
   ================================================================ */



import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import type { GameState } from "../game/gameState";

import type {
  Player,
  Bullet,
  Enemy,
  EnemyType,
} from "../game/types";

import { WEAPONS } from "../game/weapons";

import {
  playShoot,
  playHit,
  playEnemyDeath,
  playTankDeath,
  playReload,
  playDash,
  playPlayerDamage,
  playWaveStart,
  playGameOver,
  playPowerUp,
  toggleMute,
  unlockAudio,
} from "../game/audio";

import {
  PowerUp,
  PowerUpType,
  POWERUP_CONFIG,
  getRandomPowerUpType,
} from "../game/powerups";

import LevelSelect from "../game/LevelSelect";
import { LEVELS } from "../game/levels";
import { getMapForLevel, getMapObstacles, type MapObstacle } from "../game/maps";

/* =========================================================
   GAME CONSTANTS
========================================================= */

const INITIAL_WAVE = 1;

const INITIAL_ENEMY_COUNT = 5;

const ENEMIES_PER_WAVE = 3;

const WAVE_DELAY = 2000;

const WAVE_MESSAGE_DURATION = 1500;

/* =========================================================
   ENEMY CONFIGURATION
========================================================= */

const ENEMY_CONFIG: Record<
  EnemyType,
  {
    radius: number;
    speed: number;
    health: number;
    damage: number;
    score: number;
  }
> = {
  basic: {
    radius: 18,
    speed: 1.2,
    health: 1,
    damage: 10,
    score: 10,
  },

  fast: {
    radius: 13,
    speed: 2.4,
    health: 1,
    damage: 7,
    score: 15,
  },

  tank: {
    radius: 28,
    speed: 0.65,
    health: 4,
    damage: 20,
    score: 30,
  },
};

type BossPhase = "assault" | "enraged" | "critical";
interface BossState {
  phase: BossPhase;
  nextAbilityTime: number;
  nextSummonTime: number;
  chargeUntil: number;
  chargeDirectionX: number;
  chargeDirectionY: number;
  flashUntil: number;
}
const BOSS_LEVELS = new Set([10, 20, 30, 40, 50, 60]);
const bossEnemies = new WeakSet<Enemy>();
const bossStates = new WeakMap<Enemy, BossState>();
const isBossLevel = (level: number) => BOSS_LEVELS.has(level);
const getBossName = (level: number) => {
  if (level === 60) return "WARLORD OMEGA";
  if (level === 50) return "NIGHTFALL";
  if (level === 40) return "IRON REAPER";
  if (level === 30) return "SIEGE COMMANDER";
  if (level === 20) return "VANGUARD PRIME";
  return "OVERWATCH TITAN";
};
const getBossState = (enemy: Enemy): BossState => {
  const existing = bossStates.get(enemy);
  if (existing) return existing;
  const state: BossState = { phase: "assault", nextAbilityTime: 0, nextSummonTime: 0, chargeUntil: 0, chargeDirectionX: 0, chargeDirectionY: 0, flashUntil: 0 };
  bossStates.set(enemy, state);
  return state;
};

/* =========================================================
   PARTICLE TYPE
========================================================= */

interface Particle {
  x: number;
  y: number;

  velocityX: number;
  velocityY: number;

  radius: number;

  life: number;
  maxLife: number;

  type:
  | "muzzle"
  | "hit"
  | "death"
  | "spark";
}

/* =========================================================
   WAVE FUNCTIONS
========================================================= */

const getEnemyCountForWave = (
  wave: number,
  levelNumber = 1
) => {
  const difficulty = getCampaignLevel(levelNumber)?.difficulty?.toLowerCase();

  switch (difficulty) {
    case "medium":
      return 6 + (wave - 1) * 2;
    case "hard":
      return 8 + (wave - 1) * 3;
    case "very-hard":
    case "very hard":
      return 10 + (wave - 1) * 3;
    case "expert":
      return 12 + (wave - 1) * 4;
    case "easy":
    default:
      return 5 + (wave - 1) * 2;
  }
};

const getWaveSpeedMultiplier = (
  wave: number
) => {
  return 1 + (wave - 1) * 0.08;
};

const getWaveHealthBonus = (
  wave: number
) => {
  return Math.floor(
    (wave - 1) / 3
  );
};

/* =========================================================
   ENEMY TYPE SELECTION
========================================================= */

const getEnemyTypeForWave = (
  wave: number,
  levelNumber = 1
): EnemyType => {
  const random = Math.random();
  const difficulty = getCampaignLevel(levelNumber)?.difficulty?.toLowerCase();

  // Easy: basic enemies only.
  if (difficulty === "easy") {
    return "basic";
  }

  // Medium: introduce fast enemies from wave 2.
  if (difficulty === "medium") {
    if (wave === 1 || random < 0.7) {
      return "basic";
    }
    return "fast";
  }

  // Hard: fast enemies become common and tanks start appearing on wave 3.
  if (difficulty === "hard") {
    if (wave <= 2) {
      return random < 0.6 ? "basic" : "fast";
    }
    if (random < 0.45) return "basic";
    if (random < 0.82) return "fast";
    return "tank";
  }

  // Very Hard: all enemy classes are available, with tanks becoming frequent.
  if (difficulty === "very-hard" || difficulty === "very hard") {
    if (wave === 1 && random < 0.55) return "basic";
    if (random < 0.3) return "basic";
    if (random < 0.68) return "fast";
    return "tank";
  }

  // Expert: aggressive composition across all five waves.
  if (random < 0.25) return "basic";
  if (random < 0.62) return "fast";
  return "tank";
};

/* =========================================================
   CAMPAIGN HELPERS
========================================================= */

interface CampaignLevelData {
  level?: number;
  name?: string;
  difficulty?: string;
  objective?: unknown;
  target?: number;
  waveCount?: number;
  enemyCount?: number;
  timeLimit?: number;
  map?: unknown;
  isBoss?: boolean;
  bossName?: string;
}

const CAMPAIGN_LEVELS =
  LEVELS as unknown as CampaignLevelData[];

const getCampaignLevel = (levelNumber: number) =>
  CAMPAIGN_LEVELS.find(
    (level) => level.level === levelNumber
  ) ?? CAMPAIGN_LEVELS[levelNumber - 1];

const getObjectiveInfo = (level?: CampaignLevelData) => {
  const raw = level?.objective;

  if (typeof raw === "string") {
    return {
      type: raw,
      target: level?.target ?? 10,
    };
  }

  if (raw && typeof raw === "object") {
    const value = raw as Record<string, unknown>;
    return {
      type:
        typeof value.type === "string"
          ? value.type
          : "eliminate",
      target:
        typeof value.target === "number"
          ? value.target
          : level?.target ?? 10,
    };
  }

  return {
    type: "eliminate",
    target: level?.target ?? 10,
  };
};

const getLevelWaveCount = (levelNumber: number) => {
  const difficulty = getCampaignLevel(levelNumber)?.difficulty?.toLowerCase();

  switch (difficulty) {
    case "easy":
      return 1;
    case "medium":
      return 2;
    case "hard":
      return 3;
    case "very-hard":
    case "very hard":
      return 4;
    case "expert":
      return 5;
    default:
      return 1;
  }
};

/* =========================================================
   PROGRESSION / REWARD SYSTEM
========================================================= */

const XP_PER_RANK = 1000;
const STARTING_XP = 0;
const STARTING_CREDITS = 0;
const STARTING_RANK = 1;

/* =========================================================
   STEP 31 // CAMPAIGN WORLD MAP INTELLIGENCE
   ========================================================= */
const CAMPAIGN_SECTORS = [
  { id: 1, name: "ECHO SECTOR", range: [1, 10] as const, theme: "TRAINING / URBAN" },
  { id: 2, name: "FRONTLINE", range: [11, 20] as const, theme: "INDUSTRIAL / COMMAND" },
  { id: 3, name: "BLACK ZONE", range: [21, 30] as const, theme: "OUTPOST / SNOW" },
  { id: 4, name: "IRON CURTAIN", range: [31, 40] as const, theme: "RUINS / FOUNDRY" },
  { id: 5, name: "NIGHTFALL", range: [41, 50] as const, theme: "NIGHT / RESEARCH" },
  { id: 6, name: "OMEGA THEATER", range: [51, 60] as const, theme: "FINAL / LAST STAND" },
] as const;

const getCampaignSector = (levelNumber: number) =>
  CAMPAIGN_SECTORS.find((sector) => levelNumber >= sector.range[0] && levelNumber <= sector.range[1]) ?? CAMPAIGN_SECTORS[0];

const getCampaignCompletionPercent = (completed: number[]) =>
  Math.round((new Set(completed.filter((level) => level >= 1 && level <= 60)).size / 60) * 100);

/* ================================================================
   STEP 33 // ADVANCED AUDIO & COMBAT FEEDBACK ENGINE
   ----------------------------------------------------------------
   A lightweight procedural audio layer sits above the existing
   weapon/gameplay sounds. It adds tactical ambience, musical beds,
   UI confirmations, impact emphasis, boss phase cues and wave
   transitions without requiring external audio assets.
   ================================================================ */

type CombatAudioCue =
  | "ui"
  | "confirm"
  | "warning"
  | "impact"
  | "kill"
  | "boss"
  | "wave"
  | "objective";

let combatAudioContext: AudioContext | null = null;
let combatMusicTimer: number | null = null;
let combatMusicGain: GainNode | null = null;
let combatAudioMuted = false;

const getCombatAudioContext = () => {
  if (typeof window === "undefined") return null;
  if (!combatAudioContext) {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    combatAudioContext = new AudioContextClass();
  }
  if (combatAudioContext.state === "suspended") {
    void combatAudioContext.resume();
  }
  return combatAudioContext;
};

const combatTone = (
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
  endFrequency?: number,
) => {
  if (combatAudioMuted) return;
  const ctx = getCombatAudioContext();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(1, frequency), ctx.currentTime);
  if (endFrequency !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, endFrequency),
      ctx.currentTime + duration,
    );
  }
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), ctx.currentTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + duration + 0.025);
};

const playCombatAudioCue = (cue: CombatAudioCue) => {
  switch (cue) {
    case "ui":
      combatTone(420, 0.045, 0.035, "square", 520);
      break;
    case "confirm":
      combatTone(520, 0.055, 0.045, "square", 760);
      window.setTimeout(() => combatTone(760, 0.075, 0.04, "square", 980), 55);
      break;
    case "warning":
      combatTone(180, 0.14, 0.055, "sawtooth", 95);
      window.setTimeout(() => combatTone(140, 0.14, 0.045, "sawtooth", 80), 150);
      break;
    case "impact":
      combatTone(105, 0.06, 0.045, "square", 55);
      break;
    case "kill":
      combatTone(240, 0.06, 0.045, "square", 420);
      break;
    case "boss":
      combatTone(72, 0.42, 0.07, "sawtooth", 38);
      window.setTimeout(() => combatTone(110, 0.24, 0.055, "triangle", 62), 120);
      break;
    case "wave":
      combatTone(330, 0.09, 0.04, "square", 440);
      window.setTimeout(() => combatTone(660, 0.14, 0.045, "square", 880), 110);
      break;
    case "objective":
      combatTone(600, 0.06, 0.04, "triangle", 800);
      window.setTimeout(() => combatTone(800, 0.09, 0.035, "triangle", 1100), 70);
      break;
  }
};

const stopCombatMusic = () => {
  if (combatMusicTimer) {
    window.clearInterval(combatMusicTimer);
    combatMusicTimer = null;
  }
  if (combatMusicGain && combatAudioContext) {
    const now = combatAudioContext.currentTime;
    combatMusicGain.gain.cancelScheduledValues(now);
    combatMusicGain.gain.setValueAtTime(Math.max(0.0001, combatMusicGain.gain.value), now);
    combatMusicGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
  }
  combatMusicGain = null;
};

const startCombatMusic = (intensity: "calm" | "combat" | "boss" = "combat") => {
  if (combatAudioMuted || typeof window === "undefined") return;
  const ctx = getCombatAudioContext();
  if (!ctx) return;
  stopCombatMusic();

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(intensity === "boss" ? 0.045 : 0.025, ctx.currentTime + 0.7);
  gain.connect(ctx.destination);
  combatMusicGain = gain;

  const notes = intensity === "boss" ? [55, 65.41, 73.42, 49] : intensity === "calm" ? [110, 130.81, 146.83, 164.81] : [82.41, 98, 110, 123.47];
  let index = 0;
  const tick = () => {
    if (combatAudioMuted) return;
    const note = notes[index % notes.length];
    const oscillator = ctx.createOscillator();
    const noteGain = ctx.createGain();
    oscillator.type = intensity === "boss" ? "sawtooth" : "triangle";
    oscillator.frequency.setValueAtTime(note, ctx.currentTime);
    noteGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    noteGain.gain.exponentialRampToValueAtTime(intensity === "boss" ? 0.026 : 0.014, ctx.currentTime + 0.035);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.48);
    oscillator.connect(noteGain);
    noteGain.connect(gain);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.52);
    index += 1;
  };
  tick();
  combatMusicTimer = window.setInterval(tick, intensity === "boss" ? 520 : 680);
};

const setCombatAudioMuted = (muted: boolean) => {
  combatAudioMuted = muted;
  if (muted) stopCombatMusic();
};


const getRankFromXp = (xp: number) =>
  Math.max(1, Math.floor(Math.max(0, xp) / XP_PER_RANK) + 1);

const getXpIntoRank = (xp: number) =>
  Math.max(0, xp) % XP_PER_RANK;

const getLevelXpReward = (levelNumber: number, stars: number) =>
  150 + levelNumber * 25 + stars * 100;

const getLevelCreditReward = (levelNumber: number, stars: number) =>
  100 + levelNumber * 20 + stars * 50;

const getDifficultyRewardMultiplier = (difficulty?: string) => {
  switch (difficulty) {
    case "medium":
      return 1.2;
    case "hard":
      return 1.5;
    case "very-hard":
      return 1.8;
    case "expert":
      return 2.2;
    default:
      return 1;
  }
};

const getRankReward = (rank: number) => {
  if (rank === 2) return "RIFLE MASTERY";
  if (rank === 3) return "FIELD OPERATIVE";
  if (rank === 5) return "SHOTGUN MASTERY";
  if (rank === 10) return "ELITE OPERATIVE";
  return null;
};

const WEAPON_UNLOCK_INFO: Record<Player["weapon"], { name: string; cost: number; requiredRank: number; description: string }> = {
  pistol: { name: "Pistol", cost: 0, requiredRank: 1, description: "Reliable sidearm with balanced handling." },
  rifle: { name: "Rifle", cost: 900, requiredRank: 2, description: "Fast automatic fire for sustained pressure." },
  shotgun: { name: "Shotgun", cost: 1800, requiredRank: 5, description: "High-impact close-range weapon with spread fire." },
};

const getWeaponUnlocksForRank = (playerRank: number): Player["weapon"][] => {
  const unlocked: Player["weapon"][] = ["pistol"];
  if (playerRank >= 2) unlocked.push("rifle");
  if (playerRank >= 5) unlocked.push("shotgun");
  return unlocked;
};

interface WeaponUpgradeLevels {
  damage: number;
  fireRate: number;
  magazine: number;
  reload: number;
}

type WeaponUpgradeMap = Record<Player["weapon"], WeaponUpgradeLevels>;

const MAX_WEAPON_UPGRADE_LEVEL = 5;
const WEAPON_UPGRADE_COSTS: Record<keyof WeaponUpgradeLevels, number> = {
  damage: 300,
  fireRate: 350,
  magazine: 250,
  reload: 300,
};

const getDefaultWeaponUpgrades = (): WeaponUpgradeMap => ({
  pistol: { damage: 0, fireRate: 0, magazine: 0, reload: 0 },
  rifle: { damage: 0, fireRate: 0, magazine: 0, reload: 0 },
  shotgun: { damage: 0, fireRate: 0, magazine: 0, reload: 0 },
});

const getUpgradedWeaponConfig = (
  weapon: Player["weapon"],
  upgrades: WeaponUpgradeMap
) => {
  const base = WEAPONS[weapon];
  const level = upgrades[weapon];
  return {
    ...base,
    damage: base.damage * (1 + level.damage * 0.15),
    fireRate: Math.max(120, base.fireRate * (1 - level.fireRate * 0.07)),
    magazineSize: base.magazineSize + level.magazine * 2,
    reloadDuration: Math.max(450, 1200 - level.reload * 100),
  };
};

const getUpgradeCost = (
  stat: keyof WeaponUpgradeLevels,
  currentLevel: number
) => WEAPON_UPGRADE_COSTS[stat] * (currentLevel + 1);

/* =========================================================
   STEP 30 // PERSISTENT OPERATOR PROFILE
========================================================= */

const PROFILE_STORAGE_KEY = "arena-strike-profile-v1";

type PersistentOperatorProfile = {
  version: 1;
  xp: number;
  credits: number;
  completedLevels: number[];
  levelStars: Record<number, number>;
  unlockedWeapons: Player["weapon"][];
  loadoutWeapon: Player["weapon"];
  weaponUpgrades: WeaponUpgradeMap;
};

const isValidWeapon = (value: unknown): value is Player["weapon"] =>
  value === "pistol" || value === "rifle" || value === "shotgun";

const sanitizeProfile = (value: unknown): PersistentOperatorProfile | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<PersistentOperatorProfile>;
  const xp = Number(raw.xp);
  const credits = Number(raw.credits);
  if (!Number.isFinite(xp) || xp < 0 || !Number.isFinite(credits) || credits < 0) return null;

  const completedLevels = Array.isArray(raw.completedLevels)
    ? Array.from(new Set(raw.completedLevels.filter((v): v is number =>
      Number.isInteger(v) && v >= 1 && v <= 60)))
      .sort((a, b) => a - b)
    : [];

  const levelStars: Record<number, number> = {};
  if (raw.levelStars && typeof raw.levelStars === "object") {
    for (const [key, value] of Object.entries(raw.levelStars as Record<string, unknown>)) {
      const level = Number(key);
      const stars = Number(value);
      if (Number.isInteger(level) && level >= 1 && level <= 60 && Number.isFinite(stars)) {
        levelStars[level] = Math.max(0, Math.min(3, Math.floor(stars)));
      }
    }
  }

  const unlockedWeapons = Array.from(new Set(
    (Array.isArray(raw.unlockedWeapons) ? raw.unlockedWeapons : []).filter(isValidWeapon)
  ));
  if (!unlockedWeapons.includes("pistol")) unlockedWeapons.unshift("pistol");

  const loadoutWeapon = isValidWeapon(raw.loadoutWeapon) && unlockedWeapons.includes(raw.loadoutWeapon)
    ? raw.loadoutWeapon
    : "pistol";

  const upgrades = getDefaultWeaponUpgrades();
  if (raw.weaponUpgrades && typeof raw.weaponUpgrades === "object") {
    for (const weapon of ["pistol", "rifle", "shotgun"] as Player["weapon"][]) {
      const source = (raw.weaponUpgrades as Partial<WeaponUpgradeMap>)[weapon];
      if (!source || typeof source !== "object") continue;
      for (const stat of ["damage", "fireRate", "magazine", "reload"] as (keyof WeaponUpgradeLevels)[]) {
        const level = Number(source[stat]);
        if (Number.isInteger(level)) upgrades[weapon][stat] = Math.max(0, Math.min(MAX_WEAPON_UPGRADE_LEVEL, level));
      }
    }
  }

  return {
    version: 1,
    xp: Math.floor(xp),
    credits: Math.floor(credits),
    completedLevels,
    levelStars,
    unlockedWeapons,
    loadoutWeapon,
    weaponUpgrades: upgrades,
  };
};

const buildDefaultProfile = (): PersistentOperatorProfile => ({
  version: 1,
  xp: STARTING_XP,
  credits: STARTING_CREDITS,
  completedLevels: [],
  levelStars: {},
  unlockedWeapons: ["pistol"],
  loadoutWeapon: "pistol",
  weaponUpgrades: getDefaultWeaponUpgrades(),
});

const getSquadBearing = (fromX: number, fromY: number, toX: number, toY: number) => {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const degrees = (angle * 180) / Math.PI;
  const normalized = (degrees + 360) % 360;
  const cardinals = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
  const index = Math.round(normalized / 45) % 8;
  return { degrees: Math.round(normalized), cardinal: cardinals[index] };
};

/* =========================================================
   MAIN GAME
========================================================= */

// STEP 40 // FINAL RELEASE HARDENING
const ARENA_STRIKE_RELEASE = "1.0.0";

export default function Home() {
  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null
    );

  /* =======================================================
     REACT STATE
  ======================================================= */

  const [health, setHealth] =
    useState(100);

  const [score, setScore] =
    useState(0);

  const [xp, setXp] = useState(STARTING_XP);

  const [credits, setCredits] = useState(STARTING_CREDITS);

  const [rank, setRank] = useState(STARTING_RANK);

  const [unlockedWeapons, setUnlockedWeapons] = useState<Player["weapon"][]>(["pistol"]);
  const [loadoutWeapon, setLoadoutWeapon] = useState<Player["weapon"]>("pistol");
  const [showArmory, setShowArmory] = useState(false);
  const [showOperatorProfile, setShowOperatorProfile] = useState(false);
  const unlockedWeaponsRef = useRef<Player["weapon"][]>(["pistol"]);
  const loadoutWeaponRef = useRef<Player["weapon"]>("pistol");
  const [weaponUpgrades, setWeaponUpgrades] = useState<WeaponUpgradeMap>(getDefaultWeaponUpgrades);
  const weaponUpgradesRef = useRef<WeaponUpgradeMap>(getDefaultWeaponUpgrades());
  const [armoryWeapon, setArmoryWeapon] = useState<Player["weapon"]>("pistol");
  const [showDeployment, setShowDeployment] = useState(false);

  /* =======================================================
     STEP 18 MULTIPLAYER LOBBY
  ======================================================= */

  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [multiplayerConnected, setMultiplayerConnected] = useState(false);
  const [multiplayerName, setMultiplayerName] = useState("Operator");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [isMultiplayerHost, setIsMultiplayerHost] = useState(false);
  const [multiplayerReady, setMultiplayerReady] = useState(false);
  const [multiplayerPlayers, setMultiplayerPlayers] = useState<Array<{ id: string; name: string; ready: boolean; host: boolean }>>([]);
  const [multiplayerStatus, setMultiplayerStatus] = useState("Offline");
  type LeaderboardEntry = {
    rank: number;
    name: string;
    score: number;
    level: number;
    stars: number;
    timestamp: number;
  };

  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [leaderboardStatus, setLeaderboardStatus] = useState("OFFLINE RECORD");
  const leaderboardSubmittedRef = useRef(false);

  type MultiplayerCombatStats = {
    kills: number;
    damage: number;
    shotsFired: number;
    shotsHit: number;
    revives: number;
    downs: number;
    duration: number;
  };

  const multiplayerStatsRef = useRef<MultiplayerCombatStats>({
    kills: 0,
    damage: 0,
    shotsFired: 0,
    shotsHit: 0,
    revives: 0,
    downs: 0,
    duration: 0,
  });
  const missionResultsReceivedRef = useRef(false);
  const missionResultPayloadRef = useRef<any>(null);
  const [showSquadResults, setShowSquadResults] = useState(false);
  const [squadResults, setSquadResults] = useState<any>(null);
  const localReviveEventRef = useRef<{ health: number; lives: number; wave: number } | null>(null);
  type RemoteOperator = {
    id: string;
    name: string;
    x: number;
    y: number;
    angle: number;
    health: number;
    maxHealth: number;
    weapon: Player["weapon"];
    score: number;
    downed?: boolean;
    lives?: number;
    respawning?: boolean;
    timestamp: number;
  };

  type RemoteProjectile = {
    id: string;
    ownerId: string;
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    radius: number;
    damage: number;
    life: number;
    weapon: Player["weapon"];
  };

  const [remoteOperators, setRemoteOperators] = useState<RemoteOperator[]>([]);
  const remoteOperatorsRef = useRef<RemoteOperator[]>([]);
  const remoteProjectilesRef = useRef<RemoteProjectile[]>([]);
  const playerDownedRef = useRef(false);
  const reviveTargetRef = useRef<string | null>(null);
  const reviveDeadlineRef = useRef(0);
  const reviveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reviveProgress, setReviveProgress] = useState(0);
  const [revivePrompt, setRevivePrompt] = useState<string | null>(null);

  type SharedEnemy = {
    id: string;
    x: number;
    y: number;
    radius: number;
    speed: number;
    health: number;
    maxHealth: number;
    damage: number;
    type: EnemyType;
    isBoss?: boolean;
    bossPhase?: BossPhase;
  };

  type MultiplayerMissionState = {
    level: number;
    wave: number;
    maxWaves: number;
    objectiveType: string;
    objectiveProgress: number;
    objectiveTarget: number;
    status: "playing" | "wave-transition" | "complete" | "failed";
    boss: {
      active: boolean;
      name: string;
      phase: BossPhase;
      health: number;
      maxHealth: number;
    } | null;
    timestamp: number;
  };

  const sharedEnemiesRef = useRef<SharedEnemy[]>([]);
  const sharedEnemyHitQueueRef = useRef<Array<{ enemyId: string; damage: number; shooterId: string }>>([]);
  const multiplayerHostRef = useRef(false);
  const multiplayerMatchRef = useRef(false);
  const lastEnemySyncRef = useRef(0);
  const lastMissionSyncRef = useRef(0);
  const multiplayerMissionStateRef = useRef<MultiplayerMissionState | null>(null);
  const remoteMissionEventRef = useRef<"complete" | "failed" | null>(null);

  const lastNetworkSyncRef = useRef(0);
  const scoreRef = useRef(0);

  const socketRef = useRef<Socket | null>(null);

  const multiplayerServerUrl =
    process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

  const [rewardSummary, setRewardSummary] = useState<{
    xp: number;
    credits: number;
    stars: number;
    rankUp: boolean;
    newRank: number;
    unlock: string | null;
  } | null>(null);

  const [ammoDisplay, setAmmoDisplay] =
    useState(12);

  const [currentWeapon, setCurrentWeapon] =
    useState<Player["weapon"]>(
      "pistol"
    );

  const [reloadingDisplay, setReloadingDisplay] =
    useState(false);

  const [gameOver, setGameOver] =
    useState(false);

  const [currentWave, setCurrentWave] =
    useState(INITIAL_WAVE);

  const [enemiesRemaining, setEnemiesRemaining] =
    useState(
      INITIAL_ENEMY_COUNT
    );

  const [audioMuted, setAudioMuted] =
    useState(false);

  const audioMutedRef = useRef(false);
  const lastBossPhaseAudioRef = useRef<BossPhase | null>(null);
  const lastWaveAudioRef = useRef(0);

  const [activePowerUp, setActivePowerUp] =
    useState<PowerUpType | null>(
      null
    );

  /* =======================================================
     STEP 8 GAME STATE
  ======================================================= */

  const [gameState, setGameState] =
    useState<GameState>(
      "menu"
    );

  /* =======================================================
     CAMPAIGN / LEVEL SELECT
  ======================================================= */

  const [showLevelSelect, setShowLevelSelect] =
    useState(false);

  const [campaignSector, setCampaignSector] = useState(0);

  const [selectedCampaignLevel, setSelectedCampaignLevel] =
    useState(1);

  const [lives, setLives] =
    useState(3);

  const [isRespawning, setIsRespawning] =
    useState(false);

  const [respawnWave, setRespawnWave] =
    useState(INITIAL_WAVE);

  const [killFeed, setKillFeed] = useState<
    Array<{ id: number; enemy: string; score: number }>
  >([]);

  const [damageFlash, setDamageFlash] = useState(false);

  /* =======================================================
     STEP 35 // TACTICAL THREAT AWARENESS
  ======================================================= */
  const [threatLevel, setThreatLevel] = useState(0);
  const [nearbyHostiles, setNearbyHostiles] = useState(0);
  const [playerPosition, setPlayerPosition] = useState({ x: 0, y: 0 });
  const [tacticalMapExpanded, setTacticalMapExpanded] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mobileControlsEnabled, setMobileControlsEnabled] = useState(false);
  const [mobileStick, setMobileStick] = useState({ x: 0, y: 0 });

  const lastThreatTelemetryRef = useRef(0);

  const [lastHitDirection, setLastHitDirection] = useState<
    "front" | "back" | "left" | "right" | null
  >(null);

  const killFeedIdRef = useRef(0);

  const respawnTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const [objectiveProgress, setObjectiveProgress] =
    useState(0);
  const missionStartTimeRef = useRef(0);
  const objectiveProgressRef = useRef(0);
  const objectiveCollectedRef = useRef(0);

  const [levelComplete, setLevelComplete] =
    useState(false);

  const [levelResultStars, setLevelResultStars] =
    useState(0);

  const selectedCampaignLevelRef =
    useRef(1);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => setReducedMotion(media.matches);

    syncMotionPreference();
    media.addEventListener?.("change", syncMotionPreference);

    return () => {
      media.removeEventListener?.("change", syncMotionPreference);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const detectTouch = () => {
      setMobileControlsEnabled(
        window.matchMedia("(pointer: coarse)").matches ||
        navigator.maxTouchPoints > 0
      );
    };
    detectTouch();
    window.addEventListener("resize", detectTouch);
    return () => window.removeEventListener("resize", detectTouch);
  }, []);

  useEffect(() => {
    setCampaignSector(CAMPAIGN_SECTORS.findIndex((sector) => selectedCampaignLevel >= sector.range[0] && selectedCampaignLevel <= sector.range[1]));
  }, [selectedCampaignLevel]);

  useEffect(() => {
    setCombatAudioMuted(audioMuted);
    if (gameState === "playing") {
      const levelData = getCampaignLevel(selectedCampaignLevelRef.current);
      startCombatMusic(isBossLevel(selectedCampaignLevelRef.current) ? "boss" : levelData ? "combat" : "calm");
    } else {
      stopCombatMusic();
    }
    return () => stopCombatMusic();
  }, [gameState, audioMuted]);

  // UI requests are queued here so a campaign launch cannot be lost
  // while the canvas game loop is transitioning between menu and combat.
  const pendingCampaignLevelRef =
    useRef<number | null>(null);

  const livesRef =
    useRef(3);

  const [completedLevels, setCompletedLevels] =
    useState<number[]>([]);

  const [levelStars, setLevelStars] =
    useState<Record<number, number>>({});

  const campaignCompletionPercent = Math.round(
    (completedLevels.length / 60) * 100
  );

  const gameStateRef =
    useRef<GameState>(
      "menu"
    );

  const changeGameState = (
    nextState: GameState
  ) => {
    gameStateRef.current =
      nextState;

    setGameState(
      nextState
    );
  };

  const gameOverRef =
    useRef(false);

  const respawningRef =
    useRef(false);

  const disconnectMultiplayer = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setMultiplayerConnected(false);
    setMultiplayerStatus("Offline");
    setRoomCode("");
    setMultiplayerPlayers([]);
    setIsMultiplayerHost(false);
    setMultiplayerReady(false);
    remoteOperatorsRef.current = [];
    setRemoteOperators([]);
  };

  const connectMultiplayer = () => {
    if (socketRef.current?.connected) return;

    setMultiplayerStatus("Connecting...");
    const socket = io(multiplayerServerUrl, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setMultiplayerConnected(true);
      setMultiplayerStatus("Connected");
    });

    socket.on("disconnect", () => {
      setMultiplayerConnected(false);
      setMultiplayerStatus("Disconnected");
      setMultiplayerPlayers([]);
      setRoomCode("");
      setIsMultiplayerHost(false);
      setMultiplayerReady(false);
      remoteOperatorsRef.current = [];
      setRemoteOperators([]);
      remoteProjectilesRef.current = [];
    });

    socket.on("connect_error", () => {
      setMultiplayerConnected(false);
      setMultiplayerStatus("Server unavailable");
    });

    socket.on("room-created", ({ code, players }: { code: string; players: Array<{ id: string; name: string; ready: boolean; host: boolean }> }) => {
      setRoomCode(code);
      setMultiplayerPlayers(players);
      setIsMultiplayerHost(true);
      multiplayerHostRef.current = true;
      setMultiplayerStatus("Room created");
    });

    socket.on("room-joined", ({ code, players }: { code: string; players: Array<{ id: string; name: string; ready: boolean; host: boolean }> }) => {
      setRoomCode(code);
      setMultiplayerPlayers(players);
      setIsMultiplayerHost(false);
      multiplayerHostRef.current = false;
      setMultiplayerStatus("Joined room");
    });

    socket.on("room-update", ({ players }: { players: Array<{ id: string; name: string; ready: boolean; host: boolean }> }) => {
      setMultiplayerPlayers(players);
    });

    socket.on("match-start", ({ code, level }: { code: string; level?: number }) => {
      setMultiplayerStatus(`MATCH LIVE · ROOM ${code}`);
      multiplayerMatchRef.current = true;
      const missionLevel = Math.max(1, Math.min(60, Math.floor(level ?? selectedCampaignLevelRef.current)));
      selectedCampaignLevelRef.current = missionLevel;
      setSelectedCampaignLevel(missionLevel);
      setShowMultiplayer(false);
      window.dispatchEvent(new CustomEvent("arena-start-campaign-level", { detail: { level: missionLevel } }));
    });

    socket.on("mission-state", (state: MultiplayerMissionState) => {
      if (!state || typeof state !== "object") return;
      const safeState: MultiplayerMissionState = {
        level: Math.max(1, Math.min(60, Math.floor(Number(state.level) || 1))),
        wave: Math.max(1, Math.floor(Number(state.wave) || 1)),
        maxWaves: Math.max(1, Math.min(5, Math.floor(Number(state.maxWaves) || 1))),
        objectiveType: typeof state.objectiveType === "string" ? state.objectiveType : "eliminate",
        objectiveProgress: Math.max(0, Math.floor(Number(state.objectiveProgress) || 0)),
        objectiveTarget: Math.max(0, Math.floor(Number(state.objectiveTarget) || 0)),
        status: state.status === "complete" || state.status === "failed" || state.status === "wave-transition" ? state.status : "playing",
        boss: state.boss ? {
          active: Boolean(state.boss.active),
          name: typeof state.boss.name === "string" ? state.boss.name : "UNKNOWN BOSS",
          phase: state.boss.phase === "enraged" || state.boss.phase === "critical" ? state.boss.phase : "assault",
          health: Math.max(0, Number(state.boss.health) || 0),
          maxHealth: Math.max(1, Number(state.boss.maxHealth) || 1),
        } : null,
        timestamp: Number(state.timestamp) || Date.now(),
      };
      multiplayerMissionStateRef.current = safeState;
      if (!multiplayerHostRef.current) {
        if (selectedCampaignLevelRef.current !== safeState.level) {
          selectedCampaignLevelRef.current = safeState.level;
          setSelectedCampaignLevel(safeState.level);
        }
        setCurrentWave(safeState.wave);
        objectiveProgressRef.current = safeState.objectiveProgress;
        setObjectiveProgress(safeState.objectiveProgress);
      }
    });

    socket.on("mission-complete", (state: MultiplayerMissionState) => {
      multiplayerMissionStateRef.current = { ...state, status: "complete" };
      remoteMissionEventRef.current = "complete";
    });

    socket.on("mission-failed", (state: MultiplayerMissionState) => {
      multiplayerMissionStateRef.current = { ...state, status: "failed" };
      remoteMissionEventRef.current = "failed";
    });

    socket.on("mission-results", (result: any) => {
      if (!result || typeof result !== "object") return;
      missionResultsReceivedRef.current = true;
      missionResultPayloadRef.current = result;
      setSquadResults(result);
      setShowSquadResults(true);
      if (result.completed && !multiplayerHostRef.current && result.reward) {
        const earnedXp = Math.max(0, Number(result.reward.xp) || 0);
        const earnedCredits = Math.max(0, Number(result.reward.credits) || 0);
        setXp((previousXp) => {
          const newTotalXp = previousXp + earnedXp;
          setRank(Math.max(1, Number(result.reward.newRank) || getRankFromXp(newTotalXp)));
          return newTotalXp;
        });
        setCredits((previous) => previous + earnedCredits);
        const missionLevel = Math.max(1, Math.min(60, Math.floor(Number(result.level) || selectedCampaignLevelRef.current)));
        const earnedStars = Math.max(1, Math.min(3, Number(result.reward.stars ?? result.stars) || 1));
        setCompletedLevels((previous) => previous.includes(missionLevel) ? previous : [...previous, missionLevel].sort((a, b) => a - b));
        setLevelStars((previous) => ({ ...previous, [missionLevel]: Math.max(previous[missionLevel] ?? 0, earnedStars) }));
      }
      if (result.completed) {
        setLevelComplete(true);
        setGameOver(false);
        changeGameState("gameOver");
        setLevelResultStars(Math.max(1, Math.min(3, Number(result.stars) || 1)));
        if (result.reward) {
          setRewardSummary({
            xp: Math.max(0, Number(result.reward.xp) || 0),
            credits: Math.max(0, Number(result.reward.credits) || 0),
            stars: Math.max(1, Math.min(3, Number(result.reward.stars) || 1)),
            rankUp: Boolean(result.reward.rankUp),
            newRank: Math.max(1, Number(result.reward.newRank) || rank),
            unlock: typeof result.reward.unlock === "string" ? result.reward.unlock : null,
          });
        }
      } else {
        setGameOver(true);
        setLevelComplete(false);
        changeGameState("gameOver");
      }
    });

    socket.on("host-migrated", ({ hostId, missionState }: { hostId: string; missionState?: MultiplayerMissionState | null }) => {
      const becameHost = hostId === socket.id;
      setIsMultiplayerHost(becameHost);
      multiplayerHostRef.current = becameHost;
      if (missionState) multiplayerMissionStateRef.current = missionState;
      setMultiplayerStatus(becameHost ? "HOST CONTROL // AUTHORITY TRANSFERRED" : "HOST MIGRATED // MISSION SYNCHRONIZED");
    });

    socket.on("state-update", (players: RemoteOperator[]) => {
      const others = players.filter((remote) => remote.id !== socket.id);
      remoteOperatorsRef.current = others;
      setRemoteOperators(others);
    });

    socket.on("player-down", (event: { playerId: string; lives: number; wave: number }) => {
      setRemoteOperators((current) => current.map((operator) =>
        operator.id === event.playerId
          ? { ...operator, health: 0, downed: true, lives: event.lives, respawning: false }
          : operator
      ));
    });

    socket.on("player-respawned", (event: { playerId: string; x: number; y: number; health: number; lives: number; wave: number }) => {
      setRemoteOperators((current) => current.map((operator) =>
        operator.id === event.playerId
          ? { ...operator, x: event.x, y: event.y, health: event.health, downed: false, lives: event.lives, respawning: false }
          : operator
      ));
    });

    socket.on("player-revive", (event: { playerId: string; reviverId: string; health: number; lives: number; wave: number }) => {
      if (!event?.playerId) {
        return;
      }
      if (event.reviverId === socket.id) {
        multiplayerStatsRef.current.revives += 1;
      }
      if (event.playerId === socket.id) {
        localReviveEventRef.current = { health: event.health, lives: event.lives, wave: event.wave };
        playerDownedRef.current = false;
        respawningRef.current = false;
        setIsRespawning(false);
        setHealth(event.health);
        if (reviveTimeoutRef.current) {
          clearTimeout(reviveTimeoutRef.current);
          reviveTimeoutRef.current = null;
        }
        reviveDeadlineRef.current = 0;
        setReviveProgress(0);
        setRevivePrompt(null);
        return;
      }

      setRemoteOperators((current) => current.map((operator) =>
        operator.id === event.playerId
          ? { ...operator, health: event.health, downed: false, lives: event.lives, respawning: false }
          : operator
      ));
    });

    socket.on("enemy-state", (enemiesSnapshot: SharedEnemy[]) => {
      if (!Array.isArray(enemiesSnapshot)) return;
      sharedEnemiesRef.current = enemiesSnapshot.filter((enemy) =>
        enemy && typeof enemy.id === "string"
      ).map((enemy) => ({
        id: enemy.id,
        x: Number(enemy.x) || 0,
        y: Number(enemy.y) || 0,
        radius: Math.max(5, Number(enemy.radius) || 18),
        speed: Math.max(0, Number(enemy.speed) || 0),
        health: Math.max(0, Number(enemy.health) || 0),
        maxHealth: Math.max(1, Number(enemy.maxHealth) || 1),
        damage: Math.max(0, Number(enemy.damage) || 0),
        type: enemy.type === "fast" || enemy.type === "tank" ? enemy.type : "basic",
        isBoss: Boolean(enemy.isBoss),
        bossPhase: enemy.bossPhase === "enraged" || enemy.bossPhase === "critical" ? enemy.bossPhase : "assault",
      }));
    });

    socket.on("enemy-hit", (payload: { enemyId: string; damage: number; shooterId: string }) => {
      if (!multiplayerHostRef.current) return;
      if (!payload?.enemyId) return;
      sharedEnemyHitQueueRef.current.push({
        enemyId: payload.enemyId,
        damage: Math.max(1, Math.min(200, Number(payload.damage) || 1)),
        shooterId: String(payload.shooterId || ""),
      });
    });

    socket.on("combat-shoot", (payload: {
      ownerId: string;
      weapon: Player["weapon"];
      bullets: Array<{ x: number; y: number; velocityX: number; velocityY: number; radius: number; damage: number; life: number }>;
    }) => {
      if (!payload?.ownerId || payload.ownerId === socket.id) return;
      const incoming = Array.isArray(payload.bullets) ? payload.bullets : [];
      for (const bullet of incoming) {
        remoteProjectilesRef.current.push({
          id: `${payload.ownerId}-${Date.now()}-${Math.random()}`,
          ownerId: payload.ownerId,
          x: Number(bullet.x) || 0,
          y: Number(bullet.y) || 0,
          velocityX: Number(bullet.velocityX) || 0,
          velocityY: Number(bullet.velocityY) || 0,
          radius: Math.max(2, Number(bullet.radius) || 4),
          damage: Math.max(1, Number(bullet.damage) || 1),
          life: Math.max(1, Number(bullet.life) || 60),
          weapon: payload.weapon === "rifle" || payload.weapon === "shotgun" ? payload.weapon : "pistol",
        });
      }
    });

    socket.on("leaderboard-data", (entries: LeaderboardEntry[]) => {
      if (!Array.isArray(entries)) return;
      setLeaderboardEntries(entries);
      setLeaderboardStatus("ONLINE RECORD // SYNCHRONIZED");
    });

    socket.on("leaderboard-submitted", ({ entries, rank }: { entries: LeaderboardEntry[]; rank: number }) => {
      if (Array.isArray(entries)) setLeaderboardEntries(entries);
      setLeaderboardStatus(rank > 0 ? `RECORDED // GLOBAL RANK #${rank}` : "RECORDED // TOP 50");
    });

    socket.on("leaderboard-error", ({ message }: { message: string }) => {
      setLeaderboardStatus(message || "RECORDING ERROR");
    });

    socket.on("room-error", ({ message }: { message: string }) => {
      setMultiplayerStatus(message);
    });
  };

  const requestLeaderboard = () => {
    if (!socketRef.current?.connected) {
      setLeaderboardStatus("CONNECTING TO COMBAT RECORD...");
      connectMultiplayer();
      window.setTimeout(() => {
        socketRef.current?.emit("leaderboard-get");
      }, 450);
      return;
    }
    setLeaderboardStatus("QUERYING GLOBAL RECORD...");
    socketRef.current.emit("leaderboard-get");
  };

  const submitLeaderboardScore = (levelNumber: number, stars: number, finalScore: number) => {
    if (leaderboardSubmittedRef.current) return;
    leaderboardSubmittedRef.current = true;

    if (!socketRef.current?.connected) {
      setLeaderboardStatus("RECORD NOT SYNCED // SERVER OFFLINE");
      return;
    }

    socketRef.current.emit("leaderboard-submit", {
      name: multiplayerName.trim() || "Operator",
      score: finalScore,
      level: levelNumber,
      stars,
    });
  };

  const createMultiplayerRoom = () => {
    if (!socketRef.current?.connected) {
      connectMultiplayer();
      setTimeout(() => createMultiplayerRoom(), 400);
      return;
    }
    const name = multiplayerName.trim() || "Operator";
    setMultiplayerName(name);
    socketRef.current.emit("create-room", { name });
  };

  const joinMultiplayerRoom = () => {
    if (!socketRef.current?.connected) {
      connectMultiplayer();
      setTimeout(() => joinMultiplayerRoom(), 400);
      return;
    }
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setMultiplayerStatus("Enter a room code");
      return;
    }
    const name = multiplayerName.trim() || "Operator";
    setMultiplayerName(name);
    socketRef.current.emit("join-room", { code, name });
  };

  const toggleMultiplayerReady = () => {
    if (!socketRef.current?.connected || !roomCode) return;
    const nextReady = !multiplayerReady;
    setMultiplayerReady(nextReady);
    socketRef.current.emit("set-ready", { ready: nextReady });
  };

  const startMultiplayerMatch = () => {
    if (!socketRef.current?.connected || !roomCode || !isMultiplayerHost) return;
    socketRef.current.emit("start-match", {
      level: selectedCampaignLevelRef.current,
      maxWaves: getLevelWaveCount(selectedCampaignLevelRef.current),
      objectiveType: getObjectiveInfo(getCampaignLevel(selectedCampaignLevelRef.current)).type,
      objectiveTarget: getObjectiveInfo(getCampaignLevel(selectedCampaignLevelRef.current)).target,
    });
  };

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  /* =======================================================
     LOAD CAMPAIGN PROGRESS
  ======================================================= */

  useEffect(() => {
    try {
      const savedCompleted =
        localStorage.getItem("arena-strike-completed-levels");

      const savedStars =
        localStorage.getItem("arena-strike-level-stars");

      if (savedCompleted) {
        const parsed = JSON.parse(savedCompleted);
        if (Array.isArray(parsed)) {
          setCompletedLevels(
            parsed.filter(
              (value): value is number =>
                typeof value === "number" &&
                Number.isInteger(value) &&
                value >= 1 &&
                value <= 60
            )
          );
        }
      }

      if (savedStars) {
        const parsed = JSON.parse(savedStars);
        if (parsed && typeof parsed === "object") {
          setLevelStars(parsed);
        }
      }
    } catch {
      // Ignore invalid local campaign data and keep defaults.
    }
  }, []);

  /* =======================================================
     LOAD PLAYER PROGRESSION
  ======================================================= */

  useEffect(() => {
    try {
      const savedXp = Number(localStorage.getItem("arena-strike-xp"));
      const savedCredits = Number(localStorage.getItem("arena-strike-credits"));
      const savedWeapons = localStorage.getItem("arena-strike-unlocked-weapons");
      const savedLoadout = localStorage.getItem("arena-strike-loadout");
      const savedUpgrades = localStorage.getItem("arena-strike-weapon-upgrades");

      const safeXp = Number.isFinite(savedXp) && savedXp >= 0 ? savedXp : STARTING_XP;
      const safeCredits = Number.isFinite(savedCredits) && savedCredits >= 0 ? savedCredits : STARTING_CREDITS;

      const safeRank = getRankFromXp(safeXp);
      let safeWeapons: Player["weapon"][] = ["pistol"];
      if (savedWeapons) {
        try {
          const parsed = JSON.parse(savedWeapons);
          if (Array.isArray(parsed)) safeWeapons = ["pistol", ...parsed.filter((v): v is Player["weapon"] => v === "rifle" || v === "shotgun")];
        } catch { }
      }
      safeWeapons = Array.from(new Set([...safeWeapons, ...getWeaponUnlocksForRank(safeRank)]));
      const safeLoadout: Player["weapon"] = (savedLoadout === "rifle" || savedLoadout === "shotgun") && safeWeapons.includes(savedLoadout) ? savedLoadout : "pistol";
      setXp(safeXp);
      setCredits(safeCredits);
      setRank(safeRank);
      setUnlockedWeapons(safeWeapons);
      unlockedWeaponsRef.current = safeWeapons;
      setLoadoutWeapon(safeLoadout);
      loadoutWeaponRef.current = safeLoadout;
      let safeUpgrades = getDefaultWeaponUpgrades();
      if (savedUpgrades) {
        try {
          const parsed = JSON.parse(savedUpgrades) as Partial<WeaponUpgradeMap>;
          for (const weapon of ["pistol", "rifle", "shotgun"] as Player["weapon"][]) {
            const value = parsed?.[weapon];
            if (value && typeof value === "object") {
              for (const stat of ["damage", "fireRate", "magazine", "reload"] as (keyof WeaponUpgradeLevels)[]) {
                const level = Number(value[stat]);
                if (Number.isInteger(level) && level >= 0) {
                  safeUpgrades[weapon][stat] = Math.min(MAX_WEAPON_UPGRADE_LEVEL, level);
                }
              }
            }
          }
        } catch { }
      }
      setWeaponUpgrades(safeUpgrades);
      weaponUpgradesRef.current = safeUpgrades;
    } catch {
      setXp(STARTING_XP);
      setCredits(STARTING_CREDITS);
      setRank(STARTING_RANK);
    }
  }, []);

  /* =======================================================
     STEP 30 // LOAD UNIFIED OPERATOR PROFILE
  ======================================================= */

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return;
      const parsed = sanitizeProfile(JSON.parse(raw));
      if (!parsed) return;

      const safeRank = getRankFromXp(parsed.xp);
      const rankWeapons = getWeaponUnlocksForRank(safeRank);
      const safeWeapons = Array.from(new Set([...parsed.unlockedWeapons, ...rankWeapons]));
      const safeLoadout = safeWeapons.includes(parsed.loadoutWeapon) ? parsed.loadoutWeapon : "pistol";

      setXp(parsed.xp);
      setCredits(parsed.credits);
      setRank(safeRank);
      setCompletedLevels(parsed.completedLevels);
      setLevelStars(parsed.levelStars);
      setUnlockedWeapons(safeWeapons);
      unlockedWeaponsRef.current = safeWeapons;
      setLoadoutWeapon(safeLoadout);
      loadoutWeaponRef.current = safeLoadout;
      setWeaponUpgrades(parsed.weaponUpgrades);
      weaponUpgradesRef.current = parsed.weaponUpgrades;
    } catch {
      // Keep the already-loaded legacy defaults when the unified profile is invalid.
    }
  }, []);

  /* =======================================================
     SAVE PLAYER PROGRESSION
  ======================================================= */

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    try {
      localStorage.setItem("arena-strike-xp", String(xp));
      localStorage.setItem("arena-strike-credits", String(credits));
    } catch {
      // Ignore storage errors.
    }
  }, [xp, credits]);

  useEffect(() => {
    try {
      localStorage.setItem("arena-strike-unlocked-weapons", JSON.stringify(unlockedWeapons));
      localStorage.setItem("arena-strike-loadout", loadoutWeapon);
    } catch { }
  }, [unlockedWeapons, loadoutWeapon]);

  useEffect(() => {
    weaponUpgradesRef.current = weaponUpgrades;
    try {
      localStorage.setItem("arena-strike-weapon-upgrades", JSON.stringify(weaponUpgrades));
    } catch { }
  }, [weaponUpgrades]);

  useEffect(() => {
    const rankUnlocks = getWeaponUnlocksForRank(rank);
    setUnlockedWeapons((previous) => {
      const merged = Array.from(new Set([...previous, ...rankUnlocks]));
      unlockedWeaponsRef.current = merged;
      return merged;
    });
  }, [rank]);

  /* =======================================================
     STEP 30 // SAVE UNIFIED OPERATOR PROFILE
  ======================================================= */

  useEffect(() => {
    try {
      const profile: PersistentOperatorProfile = {
        version: 1,
        xp: Math.max(0, Math.floor(xp)),
        credits: Math.max(0, Math.floor(credits)),
        completedLevels: Array.from(new Set(completedLevels)).filter((level) => level >= 1 && level <= 60).sort((a, b) => a - b),
        levelStars: Object.fromEntries(
          Object.entries(levelStars).map(([level, stars]) => [level, Math.max(0, Math.min(3, Math.floor(Number(stars) || 0)))])
        ),
        unlockedWeapons: Array.from(new Set(unlockedWeapons.filter(isValidWeapon))),
        loadoutWeapon: isValidWeapon(loadoutWeapon) && unlockedWeapons.includes(loadoutWeapon) ? loadoutWeapon : "pistol",
        weaponUpgrades: weaponUpgradesRef.current,
      };
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // Ignore storage quota/private-mode errors. Legacy keys remain active.
    }
  }, [xp, credits, completedLevels, levelStars, unlockedWeapons, loadoutWeapon, weaponUpgrades]);

  /* =======================================================
     SAVE CAMPAIGN PROGRESS
  ======================================================= */

  useEffect(() => {
    try {
      localStorage.setItem(
        "arena-strike-completed-levels",
        JSON.stringify(completedLevels)
      );

      localStorage.setItem(
        "arena-strike-level-stars",
        JSON.stringify(levelStars)
      );
    } catch {
      // Ignore storage errors.
    }
  }, [completedLevels, levelStars]);

  /* =======================================================
     ARMORY / LOADOUT
  ======================================================= */

  const openOperatorProfile = () => setShowOperatorProfile(true);
  const closeOperatorProfile = () => setShowOperatorProfile(false);

  const operatorProfileStats = {
    completion: Math.round((completedLevels.length / 60) * 100),
    totalStars: Object.values(levelStars).reduce((sum, value) => sum + Math.max(0, Math.min(3, Number(value) || 0)), 0),
    maxStars: 180,
    rankXp: getXpIntoRank(xp),
    nextRankXp: XP_PER_RANK,
  };

  const openArmory = () => setShowArmory(true);
  const closeArmory = () => setShowArmory(false);

  const resetOperatorProfile = () => {
    const confirmed = window.confirm("RESET ALL CAMPAIGN PROGRESS, XP, CREDITS, WEAPONS AND UPGRADES?");
    if (!confirmed) return;
    const profile = buildDefaultProfile();
    setXp(profile.xp);
    setCredits(profile.credits);
    setRank(getRankFromXp(profile.xp));
    setCompletedLevels([]);
    setLevelStars({});
    setUnlockedWeapons(["pistol"]);
    unlockedWeaponsRef.current = ["pistol"];
    setLoadoutWeapon("pistol");
    loadoutWeaponRef.current = "pistol";
    setWeaponUpgrades(profile.weaponUpgrades);
    weaponUpgradesRef.current = profile.weaponUpgrades;
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch { }
  };

  const unlockWeapon = (weapon: Player["weapon"]) => {
    const info = WEAPON_UNLOCK_INFO[weapon];
    if (unlockedWeapons.includes(weapon)) {
      loadoutWeaponRef.current = weapon;
      setLoadoutWeapon(weapon);
      return;
    }
    if (rank < info.requiredRank || credits < info.cost) return;
    setCredits((previous) => previous - info.cost);
    setUnlockedWeapons((previous) => {
      const next = Array.from(new Set([...previous, weapon]));
      unlockedWeaponsRef.current = next;
      return next;
    });
    loadoutWeaponRef.current = weapon;
    setLoadoutWeapon(weapon);
  };

  /* =======================================================
     LEVEL SELECT
  ======================================================= */

  const openLevelSelect = () => {
    setShowLevelSelect(true);
    setShowDeployment(false);
    setShowArmory(false);
    setShowOperatorProfile(false);
    setShowLeaderboard(false);
    setShowMultiplayer(false);
  };

  const activateMobileAction = (event: React.PointerEvent, action: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  };

  const closeLevelSelect = () => {
    setShowLevelSelect(false);
    changeGameState("menu");
  };

  const selectCampaignLevel = (levelNumber: number) => {
    const safeLevel = Math.max(1, Math.min(60, Math.floor(levelNumber)));
    selectedCampaignLevelRef.current = safeLevel;
    setSelectedCampaignLevel(safeLevel);
    setShowDeployment(true);
  };

  const requestCampaignLevelStart = (levelNumber: number) => {
    const safeLevel = Math.max(
      1,
      Math.min(60, Math.floor(levelNumber))
    );

    selectedCampaignLevelRef.current = safeLevel;
    setSelectedCampaignLevel(safeLevel);
    setLevelComplete(false);
    setGameOver(false);
    setRewardSummary(null);

    // Queue the request as well as dispatching the existing bridge.
    // The queue is consumed by the game loop as a hard fallback, so
    // NEXT LEVEL / DEPLOY cannot get stuck on the menu state.
    pendingCampaignLevelRef.current = safeLevel;

    window.dispatchEvent(
      new CustomEvent("arena-start-campaign-level", {
        detail: { level: safeLevel },
      })
    );
  };

  const deploySelectedLevel = () => {
    const levelNumber = Math.max(
      1,
      Math.min(60, Math.floor(selectedCampaignLevelRef.current))
    );

    setShowDeployment(false);
    setShowLevelSelect(false);
    requestCampaignLevelStart(levelNumber);
  };

  const closeDeployment = () => setShowDeployment(false);

  const upgradeWeapon = (stat: keyof WeaponUpgradeLevels) => {
    const weapon = armoryWeapon;
    if (!unlockedWeapons.includes(weapon)) return;
    const currentLevel = weaponUpgrades[weapon][stat];
    if (currentLevel >= MAX_WEAPON_UPGRADE_LEVEL) return;
    const cost = getUpgradeCost(stat, currentLevel);
    if (credits < cost) return;

    setCredits((previous) => previous - cost);
    setWeaponUpgrades((previous) => {
      const next = {
        ...previous,
        [weapon]: {
          ...previous[weapon],
          [stat]: currentLevel + 1,
        },
      };
      weaponUpgradesRef.current = next;
      return next;
    });
  };

  /* =======================================================
     GAME LOOP
  ======================================================= */

  useEffect(() => {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx =
      canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    /* =====================================================
       CANVAS
    ===================================================== */

    const resizeCanvas = () => {
      canvas.width =
        window.innerWidth;

      canvas.height =
        window.innerHeight;
    };

    resizeCanvas();

    window.addEventListener(
      "resize",
      resizeCanvas
    );

    /* =====================================================
       PLAYER
    ===================================================== */

    const player: Player = {
      x:
        canvas.width / 2,

      y:
        canvas.height / 2,

      radius: 20,

      speed: 4,

      angle: 0,

      health: 100,

      ammo:
        WEAPONS.pistol.magazineSize,

      maxAmmo:
        WEAPONS.pistol.magazineSize,

      reloading: false,

      weapon: "pistol",
    };

    /* =====================================================
       INPUT
    ===================================================== */

    const keys: Record<
      string,
      boolean
    > = {};

    const mouse = {
      x:
        canvas.width / 2,

      y:
        canvas.height / 2,

      clicked: false,
    };

    let dashRequested =
      false;

    /* =====================================================
       PAUSE
    ===================================================== */

    let paused =
      false;

    /* =====================================================
       GAME OBJECTS
    ===================================================== */

    const bullets: Bullet[] =
      [];

    const enemies: Enemy[] =
      [];

    const particles: Particle[] =
      [];

    /* =====================================================
       POWER-UPS
    ===================================================== */

    const powerUps: PowerUp[] =
      [];

    let activePowerUpLocal:
      | PowerUpType
      | null = null;

    let nextPowerUpSpawnTime =
      performance.now() + 7000;

    let speedBoostEndTime =
      0;

    let shieldEndTime =
      0;

    let damageBoostEndTime =
      0;

    const powerUpSpawnInterval =
      10000;

    const powerUpLifetime =
      15000;

    /* =====================================================
       EFFECT SETTINGS
    ===================================================== */

    let screenShake =
      0;

    let muzzleFlash =
      0;

    let weaponRecoil =
      0;

    let hitMarker =
      0;

    /* =====================================================
       DAMAGE AUDIO
    ===================================================== */

    let lastPlayerDamageSoundTime =
      0;

    const playerDamageSoundCooldown =
      250;

    /* =====================================================
       DASH
    ===================================================== */

    let lastDashTime =
      0;

    const dashCooldown =
      1000;

    const dashDistance =
      100;

    /* =====================================================
       STEP 19 REAL-TIME OPERATOR SYNC
    ===================================================== */

    const syncMultiplayerState = (time: number) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      if (time - lastNetworkSyncRef.current < 50) return;
      lastNetworkSyncRef.current = time;

      socket.emit("player-state", {
        x: player.x,
        y: player.y,
        angle: player.angle,
        health: player.health,
        maxHealth: 100,
        weapon: player.weapon,
        score: scoreRef.current,
        downed: playerDownedRef.current,
        lives: livesRef.current,
        respawning: respawningRef.current,
        combatStats: { ...multiplayerStatsRef.current },
      });
    };

    /* =====================================================
       RELOAD
    ===================================================== */

    let reloadStartTime =
      0;

    const reloadDuration =
      1200;

    /* =====================================================
       SHOOTING
    ===================================================== */

    let lastShotTime =
      0;

    /* =====================================================
       WAVE
    ===================================================== */

    let wave =
      INITIAL_WAVE;

    let waveStarting =
      false;

    // Final-wave kill objectives may exceed the base enemy count.
    // This flag prevents duplicate reinforcement batches in one check.
    let finalWaveObjectiveReinforcement = false;

    let nextWaveStartTime =
      0;

    let waveMessageEndTime =
      0;

    /* =====================================================
       DISTANCE
    ===================================================== */

    const distance = (
      x1: number,
      y1: number,
      x2: number,
      y2: number
    ) => {
      const dx =
        x1 - x2;

      const dy =
        y1 - y2;

      return Math.sqrt(
        dx * dx +
        dy * dy
      );
    };

    /* =====================================================
       MAP / COLLISION HELPERS
    ===================================================== */

    const getActiveMap = () =>
      getMapForLevel(
        selectedCampaignLevelRef.current
      );

    const getActiveObstacles = () =>
      getMapObstacles(
        getActiveMap(),
        canvas.width,
        canvas.height
      );

    const pointInsideObstacle = (
      x: number,
      y: number,
      obstacle: MapObstacle
    ) =>
      x >= obstacle.x &&
      x <= obstacle.x + obstacle.width &&
      y >= obstacle.y &&
      y <= obstacle.y + obstacle.height;

    const circleIntersectsObstacle = (
      x: number,
      y: number,
      radius: number,
      obstacle: MapObstacle
    ) => {
      const closestX = Math.max(
        obstacle.x,
        Math.min(x, obstacle.x + obstacle.width)
      );

      const closestY = Math.max(
        obstacle.y,
        Math.min(y, obstacle.y + obstacle.height)
      );

      const dx = x - closestX;
      const dy = y - closestY;

      return dx * dx + dy * dy < radius * radius;
    };

    const resolveCircleAgainstObstacles = (
      x: number,
      y: number,
      radius: number
    ) => {
      let resolvedX = x;
      let resolvedY = y;

      for (const obstacle of getActiveObstacles()) {
        if (
          !circleIntersectsObstacle(
            resolvedX,
            resolvedY,
            radius,
            obstacle
          )
        ) {
          continue;
        }

        const left = obstacle.x;
        const right = obstacle.x + obstacle.width;
        const top = obstacle.y;
        const bottom = obstacle.y + obstacle.height;

        const distances = [
          {
            side: "left",
            value: Math.abs(
              resolvedX - (left - radius)
            ),
          },
          {
            side: "right",
            value: Math.abs(
              resolvedX - (right + radius)
            ),
          },
          {
            side: "top",
            value: Math.abs(
              resolvedY - (top - radius)
            ),
          },
          {
            side: "bottom",
            value: Math.abs(
              resolvedY - (bottom + radius)
            ),
          },
        ].sort((a, b) => a.value - b.value);

        switch (distances[0].side) {
          case "left":
            resolvedX = left - radius;
            break;
          case "right":
            resolvedX = right + radius;
            break;
          case "top":
            resolvedY = top - radius;
            break;
          case "bottom":
            resolvedY = bottom + radius;
            break;
        }
      }

      resolvedX = Math.max(
        radius,
        Math.min(
          canvas.width - radius,
          resolvedX
        )
      );

      resolvedY = Math.max(
        radius,
        Math.min(
          canvas.height - radius,
          resolvedY
        )
      );

      return {
        x: resolvedX,
        y: resolvedY,
      };
    };

    const isSafeSpawn = (
      x: number,
      y: number,
      radius: number
    ) =>
      !getActiveObstacles().some(
        (obstacle) =>
          circleIntersectsObstacle(
            x,
            y,
            radius + 8,
            obstacle
          )
      );

    const getPlayerSpawn = () => {
      const candidates = [
        [canvas.width / 2, canvas.height / 2],
        [canvas.width * 0.18, canvas.height * 0.18],
        [canvas.width * 0.82, canvas.height * 0.18],
        [canvas.width * 0.18, canvas.height * 0.82],
        [canvas.width * 0.82, canvas.height * 0.82],
        [canvas.width * 0.5, canvas.height * 0.18],
        [canvas.width * 0.5, canvas.height * 0.82],
      ];

      for (const [x, y] of candidates) {
        if (isSafeSpawn(x, y, player.radius)) {
          return { x, y };
        }
      }

      return {
        x: canvas.width / 2,
        y: canvas.height / 2,
      };
    };

    /* =====================================================
       CREATE PARTICLE
    ===================================================== */

    const createParticle = (
      x: number,
      y: number,
      type:
        | "muzzle"
        | "hit"
        | "death"
        | "spark",
      count: number
    ) => {
      for (
        let i = 0;
        i < count;
        i++
      ) {
        const angle =
          Math.random() *
          Math.PI *
          2;

        const speed =
          type === "muzzle"
            ? 2 +
            Math.random() * 4
            : type === "death"
              ? 1 +
              Math.random() * 4
              : 1 +
              Math.random() * 3;

        const life =
          type === "death"
            ? 35 +
            Math.random() * 25
            : 15 +
            Math.random() * 15;

        particles.push({
          x,
          y,

          velocityX:
            Math.cos(angle) *
            speed,

          velocityY:
            Math.sin(angle) *
            speed,

          radius:
            type === "death"
              ? 3 +
              Math.random() * 3
              : 2 +
              Math.random() * 2,

          life,

          maxLife: life,

          type,
        });
      }
    };

    /* =====================================================
       CREATE ENEMY
    ===================================================== */

    const createEnemy = (
      waveNumber: number
    ) => {
      const side =
        Math.floor(
          Math.random() * 4
        );

      let x = 0;
      let y = 0;

      const margin =
        50;

      if (side === 0) {
        x =
          Math.random() *
          canvas.width;

        y =
          margin;
      } else if (
        side === 1
      ) {
        x =
          canvas.width -
          margin;

        y =
          Math.random() *
          canvas.height;
      } else if (
        side === 2
      ) {
        x =
          Math.random() *
          canvas.width;

        y =
          canvas.height -
          margin;
      } else {
        x =
          margin;

        y =
          Math.random() *
          canvas.height;
      }

      const spawn = (() => {
        let spawnX = x;
        let spawnY = y;

        for (let attempt = 0; attempt < 12; attempt++) {
          if (
            isSafeSpawn(
              spawnX,
              spawnY,
              30
            ) &&
            distance(
              spawnX,
              spawnY,
              player.x,
              player.y
            ) > 180
          ) {
            break;
          }

          const spawnSide =
            Math.floor(
              Math.random() * 4
            );

          const spawnMargin = 70;

          if (spawnSide === 0) {
            spawnX =
              Math.random() *
              canvas.width;
            spawnY =
              spawnMargin;
          } else if (spawnSide === 1) {
            spawnX =
              canvas.width -
              spawnMargin;
            spawnY =
              Math.random() *
              canvas.height;
          } else if (spawnSide === 2) {
            spawnX =
              Math.random() *
              canvas.width;
            spawnY =
              canvas.height -
              spawnMargin;
          } else {
            spawnX =
              spawnMargin;
            spawnY =
              Math.random() *
              canvas.height;
          }
        }

        return {
          x: spawnX,
          y: spawnY,
        };
      })();

      x = spawn.x;
      y = spawn.y;

      const type =
        getEnemyTypeForWave(
          waveNumber,
          selectedCampaignLevelRef.current
        );

      const config =
        ENEMY_CONFIG[type];

      const speed =
        config.speed *
        getWaveSpeedMultiplier(
          waveNumber
        );

      const healthValue =
        config.health +
        getWaveHealthBonus(
          waveNumber
        );

      const networkId = `${selectedCampaignLevelRef.current}-${waveNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      enemies.push({
        ...({ networkId } as Partial<Enemy>),
        x,
        y,

        radius:
          config.radius,

        speed,

        health:
          healthValue,

        maxHealth:
          healthValue,

        damage:
          config.damage,

        type,
      });
    };

    const applySharedEnemySnapshot = () => {
      if (!multiplayerMatchRef.current || multiplayerHostRef.current) return;
      const snapshot = sharedEnemiesRef.current;
      if (!snapshot.length && enemies.length > 0) {
        enemies.length = 0;
        return;
      }

      const existing = new Map<string, Enemy>();
      for (const enemy of enemies) {
        const id = (enemy as Enemy & { networkId?: string }).networkId;
        if (id) existing.set(id, enemy);
      }

      enemies.length = 0;
      for (const shared of snapshot) {
        enemies.push({
          ...(shared as unknown as Enemy),
          ...({
            networkId: shared.id,
            networkBoss: Boolean(shared.isBoss),
            networkBossPhase: shared.bossPhase || "assault",
          } as Partial<Enemy>),
        });
      }
      setEnemiesRemaining(enemies.length);
    };

    const processSharedEnemyHits = () => {
      if (!multiplayerMatchRef.current || !multiplayerHostRef.current) return;
      while (sharedEnemyHitQueueRef.current.length > 0) {
        const hit = sharedEnemyHitQueueRef.current.shift();
        if (!hit) break;
        const enemy = enemies.find((candidate) =>
          (candidate as Enemy & { networkId?: string }).networkId === hit.enemyId
        );
        if (!enemy || enemy.health <= 0) continue;
        multiplayerStatsRef.current.shotsHit += 1;
        multiplayerStatsRef.current.damage += Math.max(0, hit.damage);
        enemy.health -= hit.damage;
        createParticle(enemy.x, enemy.y, "hit", enemy.type === "tank" ? 10 : 6);
        hitMarker = 8;
        if (enemy.health <= 0) {
          const config = ENEMY_CONFIG[enemy.type];
          const killScore = config.score + wave * 5;
          multiplayerStatsRef.current.kills += 1;
          setScore((previous) => previous + killScore);
          addKillFeed(enemy.type, killScore);
          const objectiveInfo = getObjectiveInfo(getCampaignLevel(selectedCampaignLevelRef.current));
          if (
            objectiveInfo.type === "eliminate" ||
            objectiveInfo.type === "destroy" ||
            (objectiveInfo.type === "boss" && bossEnemies.has(enemy))
          ) {
            objectiveProgressRef.current = Math.min(
              objectiveInfo.target,
              objectiveProgressRef.current + 1
            );
            setObjectiveProgress(objectiveProgressRef.current);
          }
          createParticle(enemy.x, enemy.y, "death", enemy.type === "tank" ? 24 : 14);
          enemy.type === "tank" ? playTankDeath() : playEnemyDeath();
          enemies.splice(enemies.indexOf(enemy), 1);
          setEnemiesRemaining(enemies.length);
        }
      }
    };

    const broadcastSharedEnemies = (time: number) => {
      if (!multiplayerMatchRef.current || !multiplayerHostRef.current) return;
      if (time - lastEnemySyncRef.current < 50) return;
      lastEnemySyncRef.current = time;
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("enemy-state", enemies.map((enemy) => ({
        id: (enemy as Enemy & { networkId?: string }).networkId || `enemy-${enemies.indexOf(enemy)}`,
        x: enemy.x,
        y: enemy.y,
        radius: enemy.radius,
        speed: enemy.speed,
        health: enemy.health,
        maxHealth: enemy.maxHealth,
        damage: enemy.damage,
        type: enemy.type,
        isBoss: bossEnemies.has(enemy),
        bossPhase: bossEnemies.has(enemy) ? getBossState(enemy).phase : undefined,
      })));
    };

    const broadcastMissionState = (time: number, status: MultiplayerMissionState["status"] = "playing") => {
      if (!multiplayerMatchRef.current || !multiplayerHostRef.current) return;
      if (time - lastMissionSyncRef.current < 100) return;
      lastMissionSyncRef.current = time;
      const socket = socketRef.current;
      if (!socket?.connected) return;
      const levelNumber = selectedCampaignLevelRef.current;
      const objective = getObjectiveInfo(getCampaignLevel(levelNumber));
      const maxWaves = getLevelWaveCount(levelNumber);
      const boss = enemies.find((enemy) => bossEnemies.has(enemy));
      const state: MultiplayerMissionState = {
        level: levelNumber,
        wave,
        maxWaves,
        objectiveType: String(objective.type),
        objectiveProgress: objectiveProgressRef.current,
        objectiveTarget: Math.max(1, objective.target),
        status,
        boss: boss ? {
          active: true,
          name: getBossName(levelNumber),
          phase: getBossState(boss).phase,
          health: Math.max(0, boss.health),
          maxHealth: Math.max(1, boss.maxHealth),
        } : null,
        timestamp: Date.now(),
      };
      multiplayerMissionStateRef.current = state;
      socket.emit("mission-state", state);
    };

    const createBoss = (waveNumber: number) => {
      const levelNumber = selectedCampaignLevelRef.current;
      const spawn = getPlayerSpawn();
      const angle = Math.random() * Math.PI * 2;
      let x = canvas.width / 2 + Math.cos(angle) * 260;
      let y = canvas.height / 2 + Math.sin(angle) * 180;
      if (!isSafeSpawn(x, y, 50) || distance(x, y, player.x, player.y) < 260) {
        x = Math.max(60, Math.min(canvas.width - 60, spawn.x + 260));
        y = Math.max(60, Math.min(canvas.height - 60, spawn.y));
      }
      const difficulty = getCampaignLevel(levelNumber)?.difficulty?.toLowerCase();
      const difficultyMultiplier = difficulty === "expert" ? 1.55 : difficulty === "very-hard" || difficulty === "very hard" ? 1.4 : difficulty === "hard" ? 1.25 : difficulty === "medium" ? 1.1 : 1;
      const health = Math.round((55 + levelNumber * 2.5 + waveNumber * 8) * difficultyMultiplier);
      const networkId = `${levelNumber}-${waveNumber}-boss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const boss: Enemy = { ...({ networkId } as Partial<Enemy>), x, y, radius: 42, speed: 0.52 + levelNumber * 0.001, health, maxHealth: health, damage: 28 + Math.floor(levelNumber / 10) * 2, type: "tank" };
      enemies.push(boss);
      bossEnemies.add(boss);
      const state = getBossState(boss);
      state.nextAbilityTime = performance.now() + 1800;
      state.nextSummonTime = performance.now() + 5000;
      createParticle(boss.x, boss.y, "spark", 24);
    };

    /* =====================================================
       START WAVE
    ===================================================== */

    const startWave = (
      waveNumber: number
    ) => {
      const maxWaves = getLevelWaveCount(
        selectedCampaignLevelRef.current
      );

      if (waveNumber > maxWaves) {
        return;
      }

      wave =
        waveNumber;

      waveStarting =
        false;

      finalWaveObjectiveReinforcement = false;

      enemies.length =
        0;

      bullets.length =
        0;

      particles.length =
        0;

      if (
        waveNumber >
        INITIAL_WAVE
      ) {
        playWaveStart();
        if (lastWaveAudioRef.current !== waveNumber) {
          playCombatAudioCue("wave");
          lastWaveAudioRef.current = waveNumber;
        }
      }

      const enemyCount =
        getEnemyCountForWave(
          waveNumber,
          selectedCampaignLevelRef.current
        );

      for (
        let i = 0;
        i < enemyCount;
        i++
      ) {
        createEnemy(
          waveNumber
        );
      }

      if (
        isBossLevel(selectedCampaignLevelRef.current) &&
        waveNumber === maxWaves &&
        (!multiplayerMatchRef.current || multiplayerHostRef.current)
      ) {
        createBoss(waveNumber);
      }

      setCurrentWave(
        waveNumber
      );

      setEnemiesRemaining(
        enemies.length
      );

      waveMessageEndTime =
        performance.now() +
        WAVE_MESSAGE_DURATION;

      if (multiplayerMatchRef.current && multiplayerHostRef.current) {
        broadcastMissionState(performance.now(), "playing");
      }
    };

    /* =====================================================
       RESET GAME
    ===================================================== */

    const resetGame = () => {
      const spawn =
        getPlayerSpawn();

      player.x =
        spawn.x;

      player.y =
        spawn.y;

      player.health =
        100;

      const startingWeapon = loadoutWeaponRef.current;
      player.weapon = startingWeapon;

      player.ammo =
        getUpgradedWeaponConfig(startingWeapon, weaponUpgradesRef.current).magazineSize;

      player.maxAmmo =
        getUpgradedWeaponConfig(startingWeapon, weaponUpgradesRef.current).magazineSize;

      player.reloading =
        false;

      player.angle =
        0;

      bullets.length =
        0;

      enemies.length =
        0;

      particles.length =
        0;

      powerUps.length =
        0;

      wave =
        INITIAL_WAVE;

      waveStarting =
        false;

      nextWaveStartTime =
        0;

      waveMessageEndTime =
        0;

      nextPowerUpSpawnTime =
        performance.now() +
        7000;

      activePowerUpLocal =
        null;

      speedBoostEndTime =
        0;

      shieldEndTime =
        0;

      damageBoostEndTime =
        0;

      gameOverRef.current =
        false;

      setGameOver(
        false
      );

      paused =
        false;

      mouse.clicked =
        false;

      dashRequested =
        false;

      setHealth(100);

      setScore(0);

      setAmmoDisplay(
        getUpgradedWeaponConfig(startingWeapon, weaponUpgradesRef.current).magazineSize
      );

      setCurrentWeapon(
        startingWeapon
      );

      setReloadingDisplay(
        false
      );

      setCurrentWave(
        INITIAL_WAVE
      );

      setEnemiesRemaining(
        INITIAL_ENEMY_COUNT
      );

      setActivePowerUp(
        null
      );

      livesRef.current = 3;
      setLives(3);
      setIsRespawning(false);
      setRespawnWave(INITIAL_WAVE);
      if (respawnTimeoutRef.current) {
        clearTimeout(respawnTimeoutRef.current);
        respawnTimeoutRef.current = null;
      }
      setObjectiveProgress(0);
      objectiveProgressRef.current = 0;
      objectiveCollectedRef.current = 0;
      missionStartTimeRef.current = 0;
      setLevelComplete(false);
      setLevelResultStars(0);
      setRewardSummary(null);
      sharedEnemiesRef.current = [];
      sharedEnemyHitQueueRef.current = [];
      lastEnemySyncRef.current = 0;
      lastMissionSyncRef.current = 0;
      multiplayerMissionStateRef.current = null;
      remoteMissionEventRef.current = null;
      reviveTargetRef.current = null;
      reviveDeadlineRef.current = 0;
      if (reviveTimeoutRef.current) {
        clearTimeout(reviveTimeoutRef.current);
        reviveTimeoutRef.current = null;
      }
      setReviveProgress(0);
      setRevivePrompt(null);
    };

    /* =====================================================
       START GAME
    ===================================================== */

    const startGame = (levelNumber = 1) => {
      unlockAudio();

      const safeLevel = Math.max(
        1,
        Math.min(60, Math.floor(levelNumber))
      );

      selectedCampaignLevelRef.current = safeLevel;
      setSelectedCampaignLevel(safeLevel);
      setShowLevelSelect(false);
      setShowDeployment(false);
      leaderboardSubmittedRef.current = false;
      missionResultsReceivedRef.current = false;
      missionResultPayloadRef.current = null;
      localReviveEventRef.current = null;
      setShowSquadResults(false);
      setSquadResults(null);
      multiplayerStatsRef.current = {
        kills: 0, damage: 0, shotsFired: 0, shotsHit: 0,
        revives: 0, downs: 0, duration: 0,
      };

      resetGame();
      missionStartTimeRef.current = performance.now();

      // Enter PLAYING before spawning the first wave so the game loop
      // immediately switches from menu/UI rendering to combat updates.
      changeGameState(
        "playing"
      );

      startWave(
        INITIAL_WAVE
      );
    };

    /* =====================================================
       COMPLETE CAMPAIGN LEVEL
    ===================================================== */

    const completeCampaignLevel = (fromNetwork = false) => {
      if (levelComplete) {
        return;
      }

      if (multiplayerMatchRef.current && !multiplayerHostRef.current && !fromNetwork) {
        return;
      }

      const currentLives = livesRef.current;
      const currentLevel = selectedCampaignLevelRef.current;

      const stars =
        currentLives >= 3 && player.health >= 70
          ? 3
          : currentLives >= 2
            ? 2
            : 1;

      const levelData = getCampaignLevel(currentLevel);
      const difficultyMultiplier = getDifficultyRewardMultiplier(levelData?.difficulty);
      const earnedXp = Math.round(
        getLevelXpReward(currentLevel, stars) * difficultyMultiplier
      );
      const earnedCredits = Math.round(
        getLevelCreditReward(currentLevel, stars) * difficultyMultiplier
      );

      const previousRank = getRankFromXp(xp);
      const newTotalXp = xp + earnedXp;
      const newRank = getRankFromXp(newTotalXp);
      const unlockedReward = getRankReward(newRank);
      const rankUp = newRank > previousRank;

      setXp(newTotalXp);
      setCredits((previous) => previous + earnedCredits);
      setRank(newRank);
      setRewardSummary({
        xp: earnedXp,
        credits: earnedCredits,
        stars,
        rankUp,
        newRank,
        unlock: rankUp ? unlockedReward : null,
      });

      if (multiplayerMatchRef.current && multiplayerHostRef.current && !fromNetwork) {
        const socket = socketRef.current;
        if (socket?.connected) {
          socket.emit("mission-complete", {
            level: currentLevel,
            wave,
            maxWaves: getLevelWaveCount(currentLevel),
            objectiveType: String(getObjectiveInfo(levelData).type),
            objectiveProgress: objectiveProgressRef.current,
            objectiveTarget: Math.max(1, getObjectiveInfo(levelData).target),
            status: "complete",
            boss: null,
            score: scoreRef.current,
            stats: { ...multiplayerStatsRef.current },
            reward: {
              xp: earnedXp,
              credits: earnedCredits,
              stars,
              rankUp,
              newRank,
              unlock: rankUp ? unlockedReward : null,
            },
          });
        }
      }

      setLevelResultStars(stars);
      setLevelComplete(true);
      submitLeaderboardScore(currentLevel, stars, scoreRef.current);

      setCompletedLevels((previous) => {
        if (previous.includes(currentLevel)) {
          return previous;
        }
        return [...previous, currentLevel].sort(
          (a, b) => a - b
        );
      });

      setLevelStars((previous) => ({
        ...previous,
        [currentLevel]: Math.max(
          previous[currentLevel] ?? 0,
          stars
        ),
      }));

      mouse.clicked = false;
      dashRequested = false;
      gameOverRef.current = false;
      changeGameState("menu");
    };

    /* =====================================================
       RESUME GAME
    ===================================================== */

    const resumeGame = () => {
      if (
        gameStateRef.current ===
        "paused"
      ) {
        paused =
          false;

        changeGameState(
          "playing"
        );
      }
    };

    /* =====================================================
       EVENT HANDLERS
    ===================================================== */

    const handleStartGameEvent =
      () => {
        startGame(1);
      };

    const handleStartCampaignLevelEvent =
      (event: Event) => {
        const customEvent =
          event as CustomEvent<{ level?: number }>;

        const levelNumber =
          Math.max(1, Math.min(60, Math.floor(customEvent.detail?.level ?? 1)));

        pendingCampaignLevelRef.current = null;
        startGame(levelNumber);
      };

    const handleResumeGameEvent =
      () => {
        resumeGame();
      };

    window.addEventListener(
      "arena-start-game",
      handleStartGameEvent
    );

    window.addEventListener(
      "arena-start-campaign-level",
      handleStartCampaignLevelEvent
    );

    window.addEventListener(
      "arena-resume-game",
      handleResumeGameEvent
    );

    /* =====================================================
       KEYBOARD
    ===================================================== */

    const preventBrowserKeys = [
      " ",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
    ];

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      const key =
        event.key.toLowerCase();

      unlockAudio();

      if (
        preventBrowserKeys.includes(
          event.key
        )
      ) {
        event.preventDefault();
      }

      /* ================================================
         PAUSE / RESUME
      ================================================= */

      if (
        key === "p" ||
        key === "escape"
      ) {
        if (
          gameStateRef.current ===
          "playing"
        ) {
          paused =
            true;

          mouse.clicked =
            false;

          dashRequested =
            false;

          changeGameState(
            "paused"
          );
        } else if (
          gameStateRef.current ===
          "paused"
        ) {
          paused =
            false;

          changeGameState(
            "playing"
          );
        }

        return;
      }

      /* ================================================
         MUTE
      ================================================= */

      if (
        key === "m" &&
        !event.repeat
      ) {
        const mutedNow =
          toggleMute();

        audioMutedRef.current = mutedNow;
        setCombatAudioMuted(mutedNow);
        setAudioMuted(
          mutedNow
        );

        return;
      }

      /* ================================================
         GAMEPLAY INPUT
      ================================================= */

      if (
        gameStateRef.current !==
        "playing"
      ) {
        return;
      }

      /* ================================================
         DASH
      ================================================= */

      if (
        event.code ===
        "Space" &&
        !event.repeat
      ) {
        dashRequested =
          true;
      }

      /* ================================================
         WEAPON SWITCH
      ================================================= */

      if (
        key === "1" ||
        key === "2" ||
        key === "3"
      ) {
        let weapon:
          Player["weapon"];

        if (
          key === "1"
        ) {
          weapon =
            "pistol";
        } else if (
          key === "2"
        ) {
          weapon =
            "rifle";
        } else {
          weapon =
            "shotgun";
        }

        if (!unlockedWeaponsRef.current.includes(weapon)) return;

        player.weapon =
          weapon;

        const config =
          getUpgradedWeaponConfig(
            weapon,
            weaponUpgradesRef.current
          );

        player.maxAmmo =
          config.magazineSize;

        player.ammo =
          config.magazineSize;

        player.reloading =
          false;

        setCurrentWeapon(
          weapon
        );

        setAmmoDisplay(
          player.ammo
        );

        setReloadingDisplay(
          false
        );
      }

      if (key === "f" && multiplayerMatchRef.current && !playerDownedRef.current) {
        const candidates = remoteOperatorsRef.current
          .filter((operator) => operator.downed && (operator.lives ?? 0) > 0)
          .map((operator) => ({
            operator,
            distance: 0,
          }))
          .filter((candidate) => candidate.distance <= 95)
          .sort((a, b) => a.distance - b.distance);

        const target = candidates[0]?.operator;
        if (target) {
          socketRef.current?.emit("player-revive-request", {
            targetId: target.id,
            wave,
          });
        }
        return;
      }

      keys[key] =
        true;
    };

    const handleKeyUp = (
      event: KeyboardEvent
    ) => {
      const key =
        event.key.toLowerCase();

      if (
        preventBrowserKeys.includes(
          event.key
        )
      ) {
        event.preventDefault();
      }

      keys[key] =
        false;
    };

    /* =====================================================
       BLUR
    ===================================================== */

    const handleBlur = () => {
      for (
        const key in keys
      ) {
        keys[key] =
          false;
      }

      mouse.clicked =
        false;

      dashRequested =
        false;
    };

    /* =====================================================
       MOUSE
    ===================================================== */

    const handleMouseMove = (
      event: MouseEvent
    ) => {
      mouse.x =
        event.clientX;

      mouse.y =
        event.clientY;
    };

    const handleMouseDown = (
      event: MouseEvent
    ) => {
      unlockAudio();

      if (
        event.button ===
        0 &&
        gameStateRef.current ===
        "playing"
      ) {
        mouse.clicked =
          true;
      }
    };

    const handleMouseUp = (
      event: MouseEvent
    ) => {
      if (
        event.button ===
        0
      ) {
        mouse.clicked =
          false;
      }
    };

    /* =====================================================
       SHOOT
    ===================================================== */

    const shoot = () => {
      const weapon =
        getUpgradedWeaponConfig(
          player.weapon,
          weaponUpgradesRef.current
        );

      playShoot(
        player.weapon
      );
      playCombatAudioCue("impact");

      muzzleFlash =
        6;

      weaponRecoil =
        player.weapon ===
          "shotgun"
          ? 8
          : player.weapon ===
            "rifle"
            ? 3
            : 4;

      screenShake =
        player.weapon ===
          "shotgun"
          ? 8
          : player.weapon ===
            "rifle"
            ? 2
            : 3;

      const muzzleX =
        player.x +
        Math.cos(
          player.angle
        ) *
        38;

      const muzzleY =
        player.y +
        Math.sin(
          player.angle
        ) *
        38;

      createParticle(
        muzzleX,
        muzzleY,
        "muzzle",
        player.weapon ===
          "shotgun"
          ? 12
          : 6
      );

      const damageMultiplier =
        activePowerUpLocal ===
          "damage"
          ? 2
          : 1;

      const networkBullets: Array<{
        x: number;
        y: number;
        velocityX: number;
        velocityY: number;
        radius: number;
        damage: number;
        life: number;
      }> = [];

      for (
        let i = 0;
        i <
        weapon.bulletCount;
        i++
      ) {
        let angle =
          player.angle;

        if (
          weapon.bulletCount >
          1
        ) {
          const spread =
            (i -
              (weapon.bulletCount -
                1) /
              2) *
            0.12;

          angle +=
            spread;
        }

        const startX =
          player.x +
          Math.cos(angle) *
          30;

        const startY =
          player.y +
          Math.sin(angle) *
          30;

        const bulletRadius =
          player.weapon ===
            "shotgun"
            ? 4
            : 5;

        const bulletLife =
          player.weapon ===
            "rifle"
            ? 90
            : 100;

        const bulletDamage =
          weapon.damage *
          damageMultiplier;

        const velocityX =
          Math.cos(angle) *
          weapon.bulletSpeed;

        const velocityY =
          Math.sin(angle) *
          weapon.bulletSpeed;

        multiplayerStatsRef.current.shotsFired += 1;

        bullets.push({
          x: startX,
          y: startY,
          velocityX,
          velocityY,
          radius: bulletRadius,
          life: bulletLife,
          damage: bulletDamage,
        });

        networkBullets.push({
          x: startX,
          y: startY,
          velocityX,
          velocityY,
          radius: bulletRadius,
          life: bulletLife,
          damage: bulletDamage,
        });
      }

      const socket = socketRef.current;
      if (socket?.connected && networkBullets.length > 0) {
        socket.emit("combat-shoot", {
          weapon: player.weapon,
          bullets: networkBullets,
        });
      }
    };

    /* =====================================================
       RELOAD
    ===================================================== */

    const startReload = (
      time: number
    ) => {
      if (
        player.reloading ||
        player.ammo >=
        player.maxAmmo
      ) {
        return;
      }

      player.reloading =
        true;

      reloadStartTime =
        time;

      setReloadingDisplay(
        true
      );

      playReload();
    };

    /* =====================================================
       PLAYER MOVEMENT
    ===================================================== */

    const updatePlayerMovement = (
      time: number
    ) => {
      let moveX =
        0;

      let moveY =
        0;

      if (
        keys["w"] ||
        keys["arrowup"]
      ) {
        moveY -= 1;
      }

      if (
        keys["s"] ||
        keys["arrowdown"]
      ) {
        moveY += 1;
      }

      if (
        keys["a"] ||
        keys["arrowleft"]
      ) {
        moveX -= 1;
      }

      if (
        keys["d"] ||
        keys["arrowright"]
      ) {
        moveX += 1;
      }

      if (
        moveX !== 0 ||
        moveY !== 0
      ) {
        const length =
          Math.sqrt(
            moveX * moveX +
            moveY * moveY
          );

        moveX /=
          length;

        moveY /=
          length;
      }

      let speed =
        player.speed;

      if (
        keys["shift"]
      ) {
        speed *=
          1.7;
      }

      if (
        activePowerUpLocal ===
        "speed"
      ) {
        speed *=
          1.8;
      }

      const movedX =
        player.x +
        moveX * speed;

      const movedY =
        player.y +
        moveY * speed;

      const resolvedMove =
        resolveCircleAgainstObstacles(
          movedX,
          movedY,
          player.radius
        );

      player.x =
        resolvedMove.x;

      player.y =
        resolvedMove.y;

      /* ================================================
         DASH
      ================================================= */

      if (
        dashRequested &&
        time -
        lastDashTime >=
        dashCooldown
      ) {
        let dashX =
          moveX;

        let dashY =
          moveY;

        if (
          dashX === 0 &&
          dashY === 0
        ) {
          dashX =
            Math.cos(
              player.angle
            );

          dashY =
            Math.sin(
              player.angle
            );
        }

        const dashedX =
          player.x +
          dashX *
          dashDistance;

        const dashedY =
          player.y +
          dashY *
          dashDistance;

        const resolvedDash =
          resolveCircleAgainstObstacles(
            dashedX,
            dashedY,
            player.radius
          );

        player.x =
          resolvedDash.x;

        player.y =
          resolvedDash.y;

        lastDashTime =
          time;

        createParticle(
          player.x,
          player.y,
          "spark",
          12
        );

        screenShake =
          Math.max(
            screenShake,
            4
          );

        playDash();
      }

      dashRequested =
        false;

      /* ================================================
         BOUNDARIES
      ================================================= */

      player.x =
        Math.max(
          player.radius,
          Math.min(
            canvas.width -
            player.radius,
            player.x
          )
        );

      player.y =
        Math.max(
          player.radius,
          Math.min(
            canvas.height -
            player.radius,
            player.y
          )
        );

      /* ================================================
         AIM
      ================================================= */

      player.angle =
        Math.atan2(
          mouse.y -
          player.y,
          mouse.x -
          player.x
        );
    };

    /* =====================================================
       UPDATE RELOAD
    ===================================================== */

    const updateReload = (
      time: number
    ) => {
      if (
        keys["r"] &&
        !player.reloading &&
        player.ammo <
        player.maxAmmo
      ) {
        startReload(
          time
        );

        keys["r"] =
          false;
      }

      if (
        player.reloading &&
        time -
        reloadStartTime >=
        getUpgradedWeaponConfig(player.weapon, weaponUpgradesRef.current).reloadDuration
      ) {
        player.ammo =
          player.maxAmmo;

        player.reloading =
          false;

        setAmmoDisplay(
          player.ammo
        );

        setReloadingDisplay(
          false
        );
      }
    };

    /* =====================================================
       UPDATE SHOOTING
    ===================================================== */

    const updateShooting = (
      time: number
    ) => {
      const weapon =
        getUpgradedWeaponConfig(
          player.weapon,
          weaponUpgradesRef.current
        );

      if (
        mouse.clicked &&
        time -
        lastShotTime >=
        weapon.fireRate &&
        !player.reloading &&
        player.ammo > 0
      ) {
        shoot();

        player.ammo--;

        setAmmoDisplay(
          player.ammo
        );

        lastShotTime =
          time;

        if (
          player.ammo === 0
        ) {
          startReload(
            time
          );
        }
      }
    };

    /* =====================================================
       STEP 20 REMOTE COMBAT PROJECTILES
    ===================================================== */

    const updateRemoteProjectiles = () => {
      for (let i = remoteProjectilesRef.current.length - 1; i >= 0; i--) {
        const projectile = remoteProjectilesRef.current[i];

        projectile.x += projectile.velocityX;
        projectile.y += projectile.velocityY;
        projectile.life--;

        const hitWall = getActiveObstacles().some((obstacle) =>
          pointInsideObstacle(projectile.x, projectile.y, obstacle)
        );

        if (hitWall) {
          createParticle(projectile.x, projectile.y, "spark", 3);
          remoteProjectilesRef.current.splice(i, 1);
          continue;
        }

        const hitPlayer =
          distance(projectile.x, projectile.y, player.x, player.y) <
          projectile.radius + player.radius;

        if (hitPlayer && gameStateRef.current === "playing" && !respawningRef.current) {
          const shieldActive = activePowerUpLocal === "shield";

          if (!shieldActive) {
            player.health = Math.max(0, player.health - projectile.damage);
            setHealth(Math.floor(player.health));
            screenShake = Math.max(screenShake, projectile.damage >= 15 ? 5 : 2);
            playPlayerDamage();

            const remote = remoteOperatorsRef.current.find(
              (operator) => operator.id === projectile.ownerId
            );
            if (remote) {
              showDamageIndicator(remote.x, remote.y);
            }
          }

          createParticle(projectile.x, projectile.y, "hit", 5);
          remoteProjectilesRef.current.splice(i, 1);
          continue;
        }

        if (
          projectile.life <= 0 ||
          projectile.x < -40 ||
          projectile.x > canvas.width + 40 ||
          projectile.y < -40 ||
          projectile.y > canvas.height + 40
        ) {
          remoteProjectilesRef.current.splice(i, 1);
        }
      }
    };

    /* =====================================================
       UPDATE BULLETS
    ===================================================== */

    const updateBullets = () => {
      for (
        let i =
          bullets.length - 1;
        i >= 0;
        i--
      ) {
        const bullet =
          bullets[i];

        bullet.x +=
          bullet.velocityX;

        bullet.y +=
          bullet.velocityY;

        const bulletHitWall =
          getActiveObstacles().some(
            (obstacle) =>
              pointInsideObstacle(
                bullet.x,
                bullet.y,
                obstacle
              )
          );

        if (bulletHitWall) {
          createParticle(
            bullet.x,
            bullet.y,
            "spark",
            4
          );

          bullets.splice(
            i,
            1
          );

          continue;
        }

        bullet.life--;

        if (
          bullet.life <=
          0 ||
          bullet.x < -20 ||
          bullet.x >
          canvas.width +
          20 ||
          bullet.y < -20 ||
          bullet.y >
          canvas.height +
          20
        ) {
          bullets.splice(
            i,
            1
          );
        }
      }
    };

    /* =====================================================
       TACTICAL ENEMY AI
    ===================================================== */

    type EnemyAIState = {
      waypointX: number;
      waypointY: number;
      waypointUntil: number;
      flankUntil: number;
      flankSide: number;
    };

    const enemyAI = new WeakMap<Enemy, EnemyAIState>();

    const getEnemyAIState = (enemy: Enemy): EnemyAIState => {
      const existing = enemyAI.get(enemy);
      if (existing) return existing;

      const created: EnemyAIState = {
        waypointX: enemy.x,
        waypointY: enemy.y,
        waypointUntil: 0,
        flankUntil: 0,
        flankSide: Math.random() < 0.5 ? -1 : 1,
      };

      enemyAI.set(enemy, created);
      return created;
    };

    const segmentIntersectsRect = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      obstacle: MapObstacle,
      padding: number
    ) => {
      const left = obstacle.x - padding;
      const right = obstacle.x + obstacle.width + padding;
      const top = obstacle.y - padding;
      const bottom = obstacle.y + obstacle.height + padding;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const p = [-dx, dx, -dy, dy];
      const q = [
        x1 - left,
        right - x1,
        y1 - top,
        bottom - y1,
      ];

      let tMin = 0;
      let tMax = 1;

      for (let i = 0; i < 4; i++) {
        if (Math.abs(p[i]) < 0.00001) {
          if (q[i] < 0) return false;
          continue;
        }

        const t = q[i] / p[i];
        if (p[i] < 0) {
          tMin = Math.max(tMin, t);
        } else {
          tMax = Math.min(tMax, t);
        }

        if (tMin > tMax) return false;
      }

      return true;
    };

    const hasLineOfSight = (
      fromX: number,
      fromY: number,
      toX: number,
      toY: number,
      padding: number
    ) =>
      !getActiveObstacles().some((obstacle) =>
        segmentIntersectsRect(
          fromX,
          fromY,
          toX,
          toY,
          obstacle,
          padding
        )
      );

    const findTacticalWaypoint = (
      enemy: Enemy,
      targetX: number,
      targetY: number
    ) => {
      const obstacles = getActiveObstacles();
      const candidates: { x: number; y: number }[] = [];
      const padding = enemy.radius + 18;

      for (const obstacle of obstacles) {
        const points = [
          { x: obstacle.x - padding, y: obstacle.y - padding },
          { x: obstacle.x + obstacle.width + padding, y: obstacle.y - padding },
          { x: obstacle.x - padding, y: obstacle.y + obstacle.height + padding },
          { x: obstacle.x + obstacle.width + padding, y: obstacle.y + obstacle.height + padding },
        ];

        for (const point of points) {
          if (
            point.x < enemy.radius + 10 ||
            point.x > canvas.width - enemy.radius - 10 ||
            point.y < enemy.radius + 10 ||
            point.y > canvas.height - enemy.radius - 10
          ) {
            continue;
          }

          if (
            obstacles.some((other) =>
              circleIntersectsObstacle(
                point.x,
                point.y,
                enemy.radius + 3,
                other
              )
            )
          ) {
            continue;
          }

          if (
            !hasLineOfSight(
              enemy.x,
              enemy.y,
              point.x,
              point.y,
              enemy.radius
            )
          ) {
            continue;
          }

          candidates.push(point);
        }
      }

      if (candidates.length === 0) return null;

      candidates.sort((a, b) => {
        const distanceA =
          distance(enemy.x, enemy.y, a.x, a.y) +
          distance(a.x, a.y, targetX, targetY) * 0.7;
        const distanceB =
          distance(enemy.x, enemy.y, b.x, b.y) +
          distance(b.x, b.y, targetX, targetY) * 0.7;
        return distanceA - distanceB;
      });

      return candidates[0];
    };

    const getEnemyMovementTarget = (
      enemy: Enemy,
      time: number
    ) => {
      const state = getEnemyAIState(enemy);
      const directPath = hasLineOfSight(
        enemy.x,
        enemy.y,
        player.x,
        player.y,
        enemy.radius + 2
      );

      /* Fast enemies periodically flank instead of always taking the
         shortest straight line. This makes them feel more aggressive. */
      if (enemy.type === "fast") {
        if (time >= state.flankUntil) {
          state.flankSide *= -1;
          state.flankUntil = time + 1800 + Math.random() * 1800;
        }

        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const flankDistance = 110;
        const flankX =
          player.x - (dx / length) * 70 - (dy / length) * flankDistance * state.flankSide;
        const flankY =
          player.y - (dy / length) * 70 + (dx / length) * flankDistance * state.flankSide;

        if (
          flankX > enemy.radius + 10 &&
          flankX < canvas.width - enemy.radius - 10 &&
          flankY > enemy.radius + 10 &&
          flankY < canvas.height - enemy.radius - 10 &&
          !getActiveObstacles().some((obstacle) =>
            circleIntersectsObstacle(
              flankX,
              flankY,
              enemy.radius + 2,
              obstacle
            )
          )
        ) {
          if (hasLineOfSight(enemy.x, enemy.y, flankX, flankY, enemy.radius)) {
            return { x: flankX, y: flankY };
          }
        }
      }

      if (directPath) {
        state.waypointUntil = 0;
        return { x: player.x, y: player.y };
      }

      if (time >= state.waypointUntil) {
        const waypoint = findTacticalWaypoint(
          enemy,
          player.x,
          player.y
        );

        if (waypoint) {
          state.waypointX = waypoint.x;
          state.waypointY = waypoint.y;
          state.waypointUntil = time + 900;
        } else {
          state.waypointUntil = time + 300;
        }
      }

      if (state.waypointUntil > time) {
        return {
          x: state.waypointX,
          y: state.waypointY,
        };
      }

      return { x: player.x, y: player.y };
    };

    const addKillFeed = (enemyType: EnemyType, points: number) => {
      const id = ++killFeedIdRef.current;
      const enemyLabel =
        enemyType === "tank"
          ? "TANK"
          : enemyType === "fast"
            ? "FAST"
            : "HOSTILE";

      setKillFeed((previous) => [
        { id, enemy: enemyLabel, score: points },
        ...previous,
      ].slice(0, 4));

      window.setTimeout(() => {
        setKillFeed((previous) =>
          previous.filter((item) => item.id !== id)
        );
      }, 2600);
    };

    const showDamageIndicator = (enemyX: number, enemyY: number) => {
      const dx = enemyX - player.x;
      const dy = enemyY - player.y;

      if (Math.abs(dx) > Math.abs(dy)) {
        setLastHitDirection(dx > 0 ? "right" : "left");
      } else {
        setLastHitDirection(dy > 0 ? "back" : "front");
      }

      setDamageFlash(true);
      window.setTimeout(() => setDamageFlash(false), 140);
    };

    const updateEnemies = (
      time: number
    ) => {
      for (const enemy of enemies) {
        const isBoss = bossEnemies.has(enemy);

        if (isBoss) {
          const boss = getBossState(enemy);
          const healthRatio = enemy.health / Math.max(1, enemy.maxHealth);
          boss.phase = healthRatio <= 0.25 ? "critical" : healthRatio <= 0.55 ? "enraged" : "assault";
          if (lastBossPhaseAudioRef.current !== boss.phase) {
            if (boss.phase === "enraged" || boss.phase === "critical") {
              playCombatAudioCue("boss");
            }
            lastBossPhaseAudioRef.current = boss.phase;
          }

          if (time >= boss.nextAbilityTime && boss.chargeUntil <= time) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            boss.chargeDirectionX = dx / len;
            boss.chargeDirectionY = dy / len;
            boss.chargeUntil = time + (boss.phase === "critical" ? 900 : 650);
            boss.nextAbilityTime = time + (boss.phase === "critical" ? 2600 : 3600);
            boss.flashUntil = time + 350;
            createParticle(enemy.x, enemy.y, "muzzle", 14);
          }

          if (boss.chargeUntil > time) {
            const chargeSpeed = boss.phase === "critical" ? 3.2 : 2.5;
            const resolved = resolveCircleAgainstObstacles(enemy.x + boss.chargeDirectionX * chargeSpeed, enemy.y + boss.chargeDirectionY * chargeSpeed, enemy.radius);
            enemy.x = resolved.x;
            enemy.y = resolved.y;
          } else {
            const target = getEnemyMovementTarget(enemy, time);
            const dx = target.x - enemy.x;
            const dy = target.y - enemy.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length > 0) {
              const resolved = resolveCircleAgainstObstacles(enemy.x + (dx / length) * enemy.speed, enemy.y + (dy / length) * enemy.speed, enemy.radius);
              enemy.x = resolved.x;
              enemy.y = resolved.y;
            }
          }

          if (time >= boss.nextSummonTime && enemies.length < 18) {
            boss.nextSummonTime = time + (boss.phase === "critical" ? 4200 : 6500);
            const reinforcementCount = boss.phase === "critical" ? 2 : 1;
            for (let i = 0; i < reinforcementCount; i++) createEnemy(wave);
            createParticle(enemy.x, enemy.y, "spark", 18);
          }
        } else {
          const target = getEnemyMovementTarget(enemy, time);
          const dx = target.x - enemy.x;
          const dy = target.y - enemy.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          if (length > 0) {
            const resolvedEnemy = resolveCircleAgainstObstacles(enemy.x + (dx / length) * enemy.speed, enemy.y + (dy / length) * enemy.speed, enemy.radius);
            enemy.x = resolvedEnemy.x;
            enemy.y = resolvedEnemy.y;
          }
        }

        const playerDistance = distance(player.x, player.y, enemy.x, enemy.y);
        if (playerDistance < player.radius + enemy.radius) {
          const shieldActive = activePowerUpLocal === "shield";
          if (!shieldActive) {
            player.health -= enemy.damage * (isBoss ? 0.035 : 0.02);
            setHealth(Math.max(0, Math.floor(player.health)));
            showDamageIndicator(enemy.x, enemy.y);
            if (time - lastPlayerDamageSoundTime >= playerDamageSoundCooldown) {
              playPlayerDamage();
              lastPlayerDamageSoundTime = time;
            }
            screenShake = Math.max(screenShake, isBoss ? 8 : enemy.type === "tank" ? 5 : 2);
          }
          const pushDistance = Math.max(0.001, playerDistance);
          const resolvedEnemy = resolveCircleAgainstObstacles(enemy.x - ((player.x - enemy.x) / pushDistance) * 2, enemy.y - ((player.y - enemy.y) / pushDistance) * 2, enemy.radius);
          enemy.x = resolvedEnemy.x;
          enemy.y = resolvedEnemy.y;
        }
      }
    };

    /* =====================================================
       BULLET / ENEMY COLLISION
    ===================================================== */

    const updateBulletEnemyCollisions =
      () => {
        for (
          let bulletIndex =
            bullets.length - 1;
          bulletIndex >= 0;
          bulletIndex--
        ) {
          const bullet =
            bullets[
            bulletIndex
            ];

          let bulletHit =
            false;

          for (
            let enemyIndex =
              enemies.length - 1;
            enemyIndex >= 0;
            enemyIndex--
          ) {
            const enemy =
              enemies[
              enemyIndex
              ];

            const hitDistance =
              distance(
                bullet.x,
                bullet.y,
                enemy.x,
                enemy.y
              );

            if (
              hitDistance <
              bullet.radius +
              enemy.radius
            ) {
              const enemyNetworkId = (enemy as Enemy & { networkId?: string }).networkId;

              if (multiplayerMatchRef.current && !multiplayerHostRef.current && enemyNetworkId) {
                socketRef.current?.emit("enemy-hit", {
                  enemyId: enemyNetworkId,
                  damage: bullet.damage,
                  shooterId: socketRef.current?.id || "",
                });
                bullets.splice(bulletIndex, 1);
                bulletHit = true;
                createParticle(bullet.x, bullet.y, "hit", 5);
                playHit();
                break;
              }

              multiplayerStatsRef.current.shotsHit += 1;
              multiplayerStatsRef.current.damage += Math.max(0, bullet.damage);
              enemy.health -=
                bullet.damage;

              hitMarker =
                8;

              createParticle(
                bullet.x,
                bullet.y,
                "hit",
                enemy.type ===
                  "tank"
                  ? 10
                  : 6
              );

              playHit();
              playCombatAudioCue("impact");

              screenShake =
                Math.max(
                  screenShake,
                  enemy.type ===
                    "tank"
                    ? 3
                    : 1
                );

              bullets.splice(
                bulletIndex,
                1
              );

              bulletHit =
                true;

              if (
                enemy.health <=
                0
              ) {
                const config =
                  ENEMY_CONFIG[
                  enemy.type
                  ];
                const isBoss = bossEnemies.has(enemy);

                const killScore =
                  (isBoss ? 500 + selectedCampaignLevelRef.current * 10 : config.score) +
                  wave * 5;

                setScore(
                  previous =>
                    previous +
                    killScore
                );
                if (isBoss) {
                  addKillFeed(enemy.type, killScore);
                  setKillFeed((previous) => [
                    { id: ++killFeedIdRef.current, enemy: `BOSS ${getBossName(selectedCampaignLevelRef.current)}`, score: killScore },
                    ...previous,
                  ].slice(0, 4));
                } else {
                  addKillFeed(enemy.type, killScore);
                }

                const objectiveInfo =
                  getObjectiveInfo(
                    getCampaignLevel(
                      selectedCampaignLevelRef.current
                    )
                  );

                if (
                  objectiveInfo.type === "eliminate" ||
                  objectiveInfo.type === "destroy" ||
                  (objectiveInfo.type === "boss" && isBoss)
                ) {
                  objectiveProgressRef.current = Math.min(
                    objectiveInfo.target,
                    objectiveProgressRef.current + 1
                  );
                  setObjectiveProgress(objectiveProgressRef.current);
                }

                createParticle(
                  enemy.x,
                  enemy.y,
                  "death",
                  enemy.type ===
                    "tank"
                    ? 24
                    : 14
                );

                if (
                  enemy.type ===
                  "tank"
                ) {
                  screenShake =
                    Math.max(
                      screenShake,
                      10
                    );

                  playTankDeath();
                  playCombatAudioCue("kill");
                } else {
                  playEnemyDeath();
                  playCombatAudioCue("kill");
                }

                enemies.splice(
                  enemyIndex,
                  1
                );

                setEnemiesRemaining(
                  enemies.length
                );
              }

              break;
            }
          }

          if (
            bulletHit
          ) {
            continue;
          }
        }
      };

    /* =====================================================
       COLLECT POWER-UPS
    ===================================================== */

    const collectPowerUps = (
      time: number
    ) => {
      if (
        time >=
        nextPowerUpSpawnTime
      ) {
        const margin =
          100;

        const type =
          getRandomPowerUpType();

        powerUps.push({
          x:
            margin +
            Math.random() *
            Math.max(
              1,
              canvas.width -
              margin * 2
            ),

          y:
            margin +
            Math.random() *
            Math.max(
              1,
              canvas.height -
              margin * 2
            ),

          radius:
            16,

          type,

          life:
            powerUpLifetime,

          maxLife:
            powerUpLifetime,
        });

        nextPowerUpSpawnTime =
          time +
          powerUpSpawnInterval;
      }

      for (
        let i =
          powerUps.length - 1;
        i >= 0;
        i--
      ) {
        const powerUp =
          powerUps[i];

        powerUp.life--;

        const pickupDistance =
          distance(
            player.x,
            player.y,
            powerUp.x,
            powerUp.y
          );

        if (
          pickupDistance <
          player.radius +
          powerUp.radius
        ) {
          const type =
            powerUp.type;

          if (
            type ===
            "health"
          ) {
            player.health =
              Math.min(
                100,
                player.health +
                30
              );

            setHealth(
              Math.floor(
                player.health
              )
            );
          }

          if (
            type ===
            "ammo"
          ) {
            player.ammo =
              player.maxAmmo;

            player.reloading =
              false;

            setAmmoDisplay(
              player.ammo
            );

            setReloadingDisplay(
              false
            );
          }

          if (
            type ===
            "speed" ||
            type ===
            "shield" ||
            type ===
            "damage"
          ) {
            activePowerUpLocal =
              type;

            const duration =
              POWERUP_CONFIG[
                type
              ].duration;

            if (
              type ===
              "speed"
            ) {
              speedBoostEndTime =
                time +
                duration;
            }

            if (
              type ===
              "shield"
            ) {
              shieldEndTime =
                time +
                duration;
            }

            if (
              type ===
              "damage"
            ) {
              damageBoostEndTime =
                time +
                duration;
            }

            setActivePowerUp(
              type
            );
          }

          objectiveCollectedRef.current += 1;

          createParticle(
            powerUp.x,
            powerUp.y,
            "spark",
            16
          );

          playPowerUp();
          playCombatAudioCue("confirm");

          powerUps.splice(
            i,
            1
          );

          continue;
        }

        if (
          powerUp.life <=
          0
        ) {
          powerUps.splice(
            i,
            1
          );
        }
      }

      if (
        activePowerUpLocal ===
        "speed" &&
        time >=
        speedBoostEndTime
      ) {
        activePowerUpLocal =
          null;

        setActivePowerUp(
          null
        );
      }

      if (
        activePowerUpLocal ===
        "shield" &&
        time >=
        shieldEndTime
      ) {
        activePowerUpLocal =
          null;

        setActivePowerUp(
          null
        );
      }

      if (
        activePowerUpLocal ===
        "damage" &&
        time >=
        damageBoostEndTime
      ) {
        activePowerUpLocal =
          null;

        setActivePowerUp(
          null
        );
      }
    };

    /* =====================================================
       UPDATE PARTICLES
    ===================================================== */

    const updateParticles = () => {
      for (
        let i =
          particles.length - 1;
        i >= 0;
        i--
      ) {
        const particle =
          particles[i];

        particle.x +=
          particle.velocityX;

        particle.y +=
          particle.velocityY;

        particle.velocityX *=
          0.94;

        particle.velocityY *=
          0.94;

        particle.life--;

        if (
          particle.life <=
          0
        ) {
          particles.splice(
            i,
            1
          );
        }
      }
    };

    /* =====================================================
       UPDATE EFFECTS
    ===================================================== */

    const updateEffects = () => {
      muzzleFlash =
        Math.max(
          0,
          muzzleFlash - 1
        );

      weaponRecoil =
        Math.max(
          0,
          weaponRecoil -
          0.8
        );

      hitMarker =
        Math.max(
          0,
          hitMarker - 1
        );

      screenShake *=
        0.85;

      if (
        screenShake <
        0.1
      ) {
        screenShake =
          0;
      }
    };

    /* =====================================================
       UPDATE MISSION OBJECTIVE
    ===================================================== */

    const updateMissionObjective = (time: number) => {
      const objective = getObjectiveInfo(
        getCampaignLevel(selectedCampaignLevelRef.current)
      );
      const target = Math.max(1, objective.target);

      if (
        objective.type === "survive" ||
        objective.type === "time" ||
        objective.type === "defend"
      ) {
        if (!missionStartTimeRef.current) {
          missionStartTimeRef.current = time;
        }

        const elapsedSeconds = Math.floor(
          (time - missionStartTimeRef.current) / 1000
        );
        const nextProgress = Math.min(target, elapsedSeconds);

        if (nextProgress !== objectiveProgressRef.current) {
          objectiveProgressRef.current = nextProgress;
          setObjectiveProgress(nextProgress);
        }
      } else if (objective.type === "collect") {
        const nextProgress = Math.min(
          target,
          objectiveCollectedRef.current
        );

        if (nextProgress !== objectiveProgressRef.current) {
          objectiveProgressRef.current = nextProgress;
          setObjectiveProgress(nextProgress);
        }
      }

      if (multiplayerMatchRef.current && multiplayerHostRef.current) {
        broadcastMissionState(time, "playing");
      }
    };

    /* =====================================================
       CHECK WAVE
    ===================================================== */

    const checkWaveCompletion = (
      time: number
    ) => {
      if (multiplayerMatchRef.current && !multiplayerHostRef.current) {
        if (remoteMissionEventRef.current === "complete") {
          remoteMissionEventRef.current = null;
          if (!missionResultsReceivedRef.current) {
            setLevelComplete(true);
            changeGameState("gameOver");
          }
          return;
        }
        if (remoteMissionEventRef.current === "failed") {
          remoteMissionEventRef.current = null;
          gameOverRef.current = true;
          setGameOver(true);
          changeGameState("gameOver");
          return;
        }
        const remoteState = multiplayerMissionStateRef.current;
        if (remoteState) {
          if (remoteState.wave !== wave && remoteState.status === "playing") {
            wave = remoteState.wave;
            setCurrentWave(remoteState.wave);
            setEnemiesRemaining(sharedEnemiesRef.current.length);
            waveStarting = false;
          }
          if (remoteState.status === "wave-transition") {
            waveStarting = true;
          }
        }
        return;
      }

      if (multiplayerMatchRef.current && multiplayerHostRef.current) {
        broadcastMissionState(time, waveStarting ? "wave-transition" : "playing");
      }

      if (
        waveStarting
      ) {
        if (
          time >=
          nextWaveStartTime
        ) {
          startWave(
            wave + 1
          );
        }

        return;
      }

      if (
        enemies.length ===
        0
      ) {
        const maxWaves = getLevelWaveCount(
          selectedCampaignLevelRef.current
        );

        if (wave >= maxWaves) {
          const objective = getObjectiveInfo(
            getCampaignLevel(selectedCampaignLevelRef.current)
          );
          const objectiveTarget = Math.max(1, objective.target);
          const objectiveMet =
            objectiveProgressRef.current >= objectiveTarget;

          if (objectiveMet) {
            completeCampaignLevel();
            return;
          }

          // Kill/destroy missions can require more eliminations than the
          // base final-wave enemy count. Spawn the remaining target instead
          // of leaving the player with zero enemies and an impossible mission.
          const needsEliminations =
            objective.type === "eliminate" || objective.type === "destroy";
          const canAuthorFinalWave =
            !multiplayerMatchRef.current || multiplayerHostRef.current;

          if (
            needsEliminations &&
            canAuthorFinalWave &&
            !finalWaveObjectiveReinforcement
          ) {
            const remainingObjective = Math.max(
              0,
              objectiveTarget - objectiveProgressRef.current
            );

            if (remainingObjective > 0) {
              finalWaveObjectiveReinforcement = true;
              const reinforcementCount = Math.min(remainingObjective, 20);

              for (let i = 0; i < reinforcementCount; i++) {
                createEnemy(wave);
              }

              setEnemiesRemaining(enemies.length);
              return;
            }
          }

          return;
        }

        waveStarting =
          true;

        nextWaveStartTime =
          time +
          WAVE_DELAY;
      }
    };

    const startMultiplayerRespawnTimer = (deathX: number, deathY: number, waveAtDeath: number) => {
      if (reviveTimeoutRef.current) {
        clearTimeout(reviveTimeoutRef.current);
      }

      const deadline = performance.now() + 8000;
      reviveDeadlineRef.current = deadline;
      setRevivePrompt("DOWNED · F TO REVIVE A SQUADMATE");
      setReviveProgress(0);

      const tick = () => {
        if (!playerDownedRef.current) {
          reviveTimeoutRef.current = null;
          return;
        }

        const remaining = Math.max(0, deadline - performance.now());
        setReviveProgress(Math.max(0, Math.min(1, 1 - remaining / 8000)));

        if (remaining <= 0) {
          player.x = deathX;
          player.y = deathY;
          player.health = 100;
          playerDownedRef.current = false;
          respawningRef.current = false;
          setHealth(100);
          setIsRespawning(false);
          setRevivePrompt(null);
          setReviveProgress(0);
          reviveTimeoutRef.current = null;

          socketRef.current?.emit("player-respawned", {
            x: player.x,
            y: player.y,
            health: 100,
            lives: livesRef.current,
            wave: waveAtDeath,
          });

          startWave(waveAtDeath);
          return;
        }

        reviveTimeoutRef.current = setTimeout(tick, 100);
      };

      reviveTimeoutRef.current = setTimeout(tick, 100);
    };

    /* =====================================================
       GAME OVER
    ===================================================== */

    const checkGameOver = () => {
      if (
        player.health <=
        0 &&
        !gameOverRef.current
      ) {
        if (livesRef.current > 1) {
          const remainingLives = livesRef.current - 1;
          livesRef.current = remainingLives;
          playerDownedRef.current = true;
          multiplayerStatsRef.current.downs += 1;

          if (multiplayerMatchRef.current) {
            socketRef.current?.emit("player-down", {
              lives: remainingLives,
              wave,
            });
          }

          setLives(remainingLives);
          player.health = 100;
          setHealth(100);
          player.ammo = player.maxAmmo;
          player.reloading = false;
          setAmmoDisplay(player.ammo);
          setReloadingDisplay(false);

          bullets.length = 0;
          if (!multiplayerMatchRef.current) {
            enemies.length = 0;
            powerUps.length = 0;
          }
          particles.length = 0;

          activePowerUpLocal = null;
          setActivePowerUp(null);

          speedBoostEndTime = 0;
          shieldEndTime = 0;
          damageBoostEndTime = 0;

          gameOverRef.current = false;
          waveStarting = false;

          // Preserve the exact wave and death position when spending a life.
          // The player never goes back to Wave 1.
          const deathX = player.x;
          const deathY = player.y;
          const waveAtDeath = wave;

          respawningRef.current = true;
          setRespawnWave(waveAtDeath);
          setIsRespawning(true);
          mouse.clicked = false;
          dashRequested = false;

          if (multiplayerMatchRef.current) {
            startMultiplayerRespawnTimer(deathX, deathY, waveAtDeath);
          } else {
            respawnTimeoutRef.current = setTimeout(() => {
              player.x = deathX;
              player.y = deathY;
              player.health = 100;
              playerDownedRef.current = false;
              setHealth(100);

              player.ammo = player.maxAmmo;
              player.reloading = false;
              setAmmoDisplay(player.ammo);
              setReloadingDisplay(false);

              respawningRef.current = false;
              setIsRespawning(false);
              respawnTimeoutRef.current = null;

              startWave(waveAtDeath);
            }, 1400);
          }
          return;
        }

        gameOverRef.current =
          true;

        player.health =
          0;

        setHealth(0);
        setLives(0);

        setGameOver(
          true
        );

        if (multiplayerMatchRef.current && multiplayerHostRef.current) {
          const objective = getObjectiveInfo(getCampaignLevel(selectedCampaignLevelRef.current));
          socketRef.current?.emit("mission-failed", {
            level: selectedCampaignLevelRef.current,
            wave,
            maxWaves: getLevelWaveCount(selectedCampaignLevelRef.current),
            objectiveType: String(objective.type),
            objectiveProgress: objectiveProgressRef.current,
            objectiveTarget: Math.max(1, objective.target),
            status: "failed",
            boss: null,
          });
        }

        playGameOver();
        playCombatAudioCue("warning");
        stopCombatMusic();

        mouse.clicked =
          false;

        dashRequested =
          false;

        changeGameState(
          "gameOver"
        );
      }
    };

    /* =====================================================
       DRAW BACKGROUND
    ===================================================== */

    const drawBackground = () => {
      const map =
        getActiveMap();

      const themeStyles: Record<
        string,
        {
          background: string;
          grid: string;
        }
      > = {
        industrial: {
          background: "#07111a",
          grid: "#173247",
        },
        warehouse: {
          background: "#14110b",
          grid: "#33291a",
        },
        urban: {
          background: "#0a1018",
          grid: "#1b2b3c",
        },
        military: {
          background: "#0c140d",
          grid: "#213526",
        },
        port: {
          background: "#0b1218",
          grid: "#18313d",
        },
        market: {
          background: "#160d18",
          grid: "#34203a",
        },
        canal: {
          background: "#071715",
          grid: "#12332e",
        },
        facility: {
          background: "#11120b",
          grid: "#2d2c18",
        },
        ruins: {
          background: "#170c10",
          grid: "#3b1d25",
        },
        factory: {
          background: "#120d18",
          grid: "#302044",
        },
        metro: {
          background: "#0c0d18",
          grid: "#20234a",
        },
        dock: {
          background: "#07131a",
          grid: "#163643",
        },
        "night-city": {
          background: "#0b0714",
          grid: "#29123b",
        },
        checkpoint: {
          background: "#171009",
          grid: "#3d2817",
        },
        foundry: {
          background: "#180b08",
          grid: "#3c1c15",
        },
        lab: {
          background: "#071217",
          grid: "#173440",
        },
        bunker: {
          background: "#0b100b",
          grid: "#1f2c1f",
        },
        desert: {
          background: "#171109",
          grid: "#3a2b16",
        },
        snow: {
          background: "#0b1117",
          grid: "#223646",
        },
        forest: {
          background: "#07130b",
          grid: "#16351e",
        },
        bridge: {
          background: "#09131b",
          grid: "#183246",
        },
        underground: {
          background: "#0e0a18",
          grid: "#291d42",
        },
        plaza: {
          background: "#091219",
          grid: "#1b3442",
        },
        storage: {
          background: "#151109",
          grid: "#3a2b17",
        },
        arena: {
          background: "#150a11",
          grid: "#3b1b2c",
        },
        "final-sector": {
          background: "#16090d",
          grid: "#3c1822",
        },
        "last-stand": {
          background: "#151208",
          grid: "#3b3014",
        },
      };

      const style =
        themeStyles[map.theme] ??
        themeStyles.industrial;

      ctx.fillStyle =
        style.background;

      ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      const gridSize = 40;

      ctx.strokeStyle =
        style.grid;

      ctx.lineWidth = 1;

      for (
        let x = 0;
        x < canvas.width;
        x += gridSize
      ) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(
          x,
          canvas.height
        );
        ctx.stroke();
      }

      for (
        let y = 0;
        y < canvas.height;
        y += gridSize
      ) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(
          canvas.width,
          y
        );
        ctx.stroke();
      }

      /* Arena boundary */
      ctx.strokeStyle =
        `${map.accent}55`;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        8,
        8,
        canvas.width - 16,
        canvas.height - 16
      );

      /* Map obstacles */
      for (const obstacle of getActiveObstacles()) {
        ctx.save();

        const fillByKind: Record<
          string,
          string
        > = {
          wall: "#202a36",
          crate: "#5b4328",
          barrier: "#29333e",
          container: "#263e4a",
        };

        const strokeByKind: Record<
          string,
          string
        > = {
          wall: "#475569",
          crate: "#a16207",
          barrier: map.accent,
          container: "#38bdf8",
        };

        ctx.fillStyle =
          fillByKind[obstacle.kind] ??
          "#202a36";

        ctx.strokeStyle =
          strokeByKind[obstacle.kind] ??
          "#475569";

        ctx.lineWidth =
          obstacle.kind === "barrier"
            ? 2
            : 1.5;

        ctx.shadowBlur =
          obstacle.kind === "barrier"
            ? 8
            : 0;

        ctx.shadowColor =
          map.accent;

        ctx.fillRect(
          obstacle.x,
          obstacle.y,
          obstacle.width,
          obstacle.height
        );

        ctx.strokeRect(
          obstacle.x,
          obstacle.y,
          obstacle.width,
          obstacle.height
        );

        /* Tactical detail lines */
        if (
          obstacle.width > 55 ||
          obstacle.height > 55
        ) {
          ctx.globalAlpha = 0.35;
          ctx.beginPath();

          if (
            obstacle.width >=
            obstacle.height
          ) {
            for (
              let x =
                obstacle.x + 12;
              x <
              obstacle.x +
              obstacle.width;
              x += 24
            ) {
              ctx.moveTo(
                x,
                obstacle.y
              );
              ctx.lineTo(
                x,
                obstacle.y +
                obstacle.height
              );
            }
          } else {
            for (
              let y =
                obstacle.y + 12;
              y <
              obstacle.y +
              obstacle.height;
              y += 24
            ) {
              ctx.moveTo(
                obstacle.x,
                y
              );
              ctx.lineTo(
                obstacle.x +
                obstacle.width,
                y
              );
            }
          }

          ctx.stroke();
        }

        ctx.restore();
      }
    };

    /* =====================================================
       DRAW REMOTE COMBAT PROJECTILES
    ===================================================== */

    const drawRemoteProjectiles = () => {
      for (const projectile of remoteProjectilesRef.current) {
        const speed = Math.sqrt(
          projectile.velocityX * projectile.velocityX +
          projectile.velocityY * projectile.velocityY
        );
        const length = speed > 0 ? 12 : 0;
        const trailX = speed > 0 ? projectile.x - (projectile.velocityX / speed) * length : projectile.x;
        const trailY = speed > 0 ? projectile.y - (projectile.velocityY / speed) * length : projectile.y;

        ctx.save();
        ctx.strokeStyle = projectile.weapon === "shotgun" ? "#fbbf24" : "#fb7185";
        ctx.lineWidth = projectile.weapon === "shotgun" ? 4 : 3;
        ctx.shadowColor = projectile.weapon === "shotgun" ? "#f59e0b" : "#ef4444";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(trailX, trailY);
        ctx.lineTo(projectile.x, projectile.y);
        ctx.stroke();
        ctx.fillStyle = "#fff1f2";
        ctx.beginPath();
        ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };

    /* =====================================================
       DRAW BULLETS
    ===================================================== */

    const drawBullets = () => {
      for (
        const bullet of bullets
      ) {
        const velocityLength =
          Math.sqrt(
            bullet.velocityX *
            bullet.velocityX +
            bullet.velocityY *
            bullet.velocityY
          );

        if (
          velocityLength >
          0
        ) {
          const trailLength =
            14;

          const trailX =
            bullet.x -
            (bullet.velocityX /
              velocityLength) *
            trailLength;

          const trailY =
            bullet.y -
            (bullet.velocityY /
              velocityLength) *
            trailLength;

          ctx.beginPath();

          ctx.moveTo(
            trailX,
            trailY
          );

          ctx.lineTo(
            bullet.x,
            bullet.y
          );

          ctx.strokeStyle =
            "rgba(250, 204, 21, 0.45)";

          ctx.lineWidth =
            3;

          ctx.stroke();
        }

        ctx.beginPath();

        ctx.arc(
          bullet.x,
          bullet.y,
          bullet.radius,
          0,
          Math.PI * 2
        );

        ctx.fillStyle =
          "#facc15";

        ctx.fill();
      }
    };

    /* =====================================================
       DRAW BASIC ENEMY
    ===================================================== */

    const drawBasicEnemy = (
      enemy: Enemy
    ) => {
      ctx.beginPath();

      ctx.arc(
        enemy.x,
        enemy.y,
        enemy.radius,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        "#ef4444";

      ctx.fill();

      ctx.strokeStyle =
        "#ffffff";

      ctx.lineWidth =
        2;

      ctx.stroke();

      ctx.fillStyle =
        "#111827";

      ctx.beginPath();

      ctx.arc(
        enemy.x - 6,
        enemy.y - 3,
        3,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.beginPath();

      ctx.arc(
        enemy.x + 6,
        enemy.y - 3,
        3,
        0,
        Math.PI * 2
      );

      ctx.fill();
    };

    /* =====================================================
       DRAW FAST ENEMY
    ===================================================== */

    const drawFastEnemy = (
      enemy: Enemy
    ) => {
      ctx.save();

      ctx.translate(
        enemy.x,
        enemy.y
      );

      ctx.rotate(
        Math.PI / 4
      );

      ctx.fillStyle =
        "#facc15";

      ctx.fillRect(
        -enemy.radius,
        -enemy.radius,
        enemy.radius * 2,
        enemy.radius * 2
      );

      ctx.strokeStyle =
        "#ffffff";

      ctx.lineWidth =
        2;

      ctx.strokeRect(
        -enemy.radius,
        -enemy.radius,
        enemy.radius * 2,
        enemy.radius * 2
      );

      ctx.restore();
    };

    /* =====================================================
       DRAW TANK
    ===================================================== */

    const drawTankEnemy = (
      enemy: Enemy
    ) => {
      ctx.beginPath();

      ctx.arc(
        enemy.x,
        enemy.y,
        enemy.radius,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        "#a855f7";

      ctx.fill();

      ctx.strokeStyle =
        "#ffffff";

      ctx.lineWidth =
        3;

      ctx.stroke();

      ctx.beginPath();

      ctx.arc(
        enemy.x,
        enemy.y,
        enemy.radius *
        0.45,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        "#7e22ce";

      ctx.fill();

      const barWidth =
        enemy.radius *
        2;

      const barHeight =
        5;

      const barX =
        enemy.x -
        barWidth / 2;

      const barY =
        enemy.y -
        enemy.radius -
        10;

      ctx.fillStyle =
        "#1f2937";

      ctx.fillRect(
        barX,
        barY,
        barWidth,
        barHeight
      );

      const percentage =
        Math.max(
          0,
          enemy.health /
          enemy.maxHealth
        );

      ctx.fillStyle =
        "#22c55e";

      ctx.fillRect(
        barX,
        barY,
        barWidth *
        percentage,
        barHeight
      );
    };

    /* =====================================================
       DRAW ENEMIES
    ===================================================== */

    const drawEnemies = () => {
      for (const enemy of enemies) {
        if (bossEnemies.has(enemy) || (enemy as Enemy & { networkBoss?: boolean }).networkBoss) {
          const bossState = bossEnemies.has(enemy) ? getBossState(enemy) : ({ phase: ((enemy as Enemy & { networkBossPhase?: BossPhase }).networkBossPhase || "assault") as BossPhase } as BossState);
          const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.06;
          ctx.save();
          ctx.translate(enemy.x, enemy.y);
          ctx.scale(pulse, pulse);
          ctx.shadowBlur = 28;
          ctx.shadowColor = "#ef4444";
          ctx.fillStyle = "#3f0d18";
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius + 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = bossState.phase === "critical" ? "#f8fafc" : "#ef4444";
          ctx.lineWidth = 4;
          ctx.stroke();
          ctx.fillStyle = bossState.phase === "critical" ? "#f97316" : "#7f1d1d";
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius * 0.62, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#f8fafc";
          ctx.font = "bold 12px Arial";
          ctx.textAlign = "center";
          ctx.fillText("B", 0, 4);
          ctx.restore();

          const bossBarWidth = 180;
          const bossBarY = enemy.y - enemy.radius - 30;
          const bossHealth = Math.max(0, Math.min(1, enemy.health / Math.max(1, enemy.maxHealth)));
          ctx.save();
          ctx.fillStyle = "rgba(2,6,23,0.9)";
          ctx.fillRect(enemy.x - bossBarWidth / 2, bossBarY, bossBarWidth, 9);
          ctx.fillStyle = bossState.phase === "critical" ? "#f97316" : "#ef4444";
          ctx.fillRect(enemy.x - bossBarWidth / 2, bossBarY, bossBarWidth * bossHealth, 9);
          ctx.font = "bold 10px Arial";
          ctx.textAlign = "center";
          ctx.fillStyle = "#fecaca";
          ctx.fillText(`BOSS • ${getBossName(selectedCampaignLevelRef.current)}`, enemy.x, bossBarY - 5);
          ctx.restore();
          continue;
        }

        if (enemy.type === "basic") {
          drawBasicEnemy(enemy);
        } else if (enemy.type === "fast") {
          drawFastEnemy(enemy);
        } else {
          drawTankEnemy(enemy);
        }

        // Tactical enemy status bar.
        const barWidth = Math.max(34, enemy.radius * 2.2);
        const barHeight = 4;
        const barX = enemy.x - barWidth / 2;
        const barY = enemy.y - enemy.radius - 16;
        const percentage = Math.max(
          0,
          Math.min(1, enemy.health / enemy.maxHealth)
        );

        ctx.save();
        ctx.fillStyle = "rgba(2, 6, 23, 0.85)";
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle =
          enemy.type === "tank"
            ? "#a855f7"
            : enemy.type === "fast"
              ? "#facc15"
              : "#22c55e";
        ctx.fillRect(barX, barY, barWidth * percentage, barHeight);

        if (enemy.type !== "basic") {
          ctx.font = "bold 8px Arial";
          ctx.textAlign = "center";
          ctx.fillStyle = "#e2e8f0";
          ctx.fillText(
            enemy.type === "tank" ? "TANK" : "FAST",
            enemy.x,
            barY - 3
          );
        }
        ctx.restore();
      }
    };

    /* =====================================================
       DRAW PARTICLES
    ===================================================== */

    const drawParticles = () => {
      for (
        const particle of particles
      ) {
        const alpha =
          Math.max(
            0,
            particle.life /
            particle.maxLife
          );

        ctx.save();

        ctx.globalAlpha =
          alpha;

        ctx.beginPath();

        ctx.arc(
          particle.x,
          particle.y,
          particle.radius,
          0,
          Math.PI * 2
        );

        if (
          particle.type ===
          "muzzle"
        ) {
          ctx.fillStyle =
            "#fef08a";
        } else if (
          particle.type ===
          "death"
        ) {
          ctx.fillStyle =
            "#fb7185";
        } else if (
          particle.type ===
          "spark"
        ) {
          ctx.fillStyle =
            "#38bdf8";
        } else {
          ctx.fillStyle =
            "#ffffff";
        }

        ctx.fill();

        ctx.restore();
      }
    };

    /* =====================================================
       DRAW POWER-UPS
    ===================================================== */

    const drawPowerUps = (
      time: number
    ) => {
      for (
        const powerUp of powerUps
      ) {
        const config =
          POWERUP_CONFIG[
          powerUp.type
          ];

        const pulse =
          1 +
          Math.sin(
            time / 150
          ) *
          0.12;

        const alpha =
          Math.max(
            0,
            powerUp.life /
            powerUp.maxLife
          );

        ctx.save();

        ctx.globalAlpha =
          alpha;

        ctx.shadowBlur =
          20;

        ctx.shadowColor =
          config.color;

        ctx.beginPath();

        ctx.arc(
          powerUp.x,
          powerUp.y,
          powerUp.radius *
          pulse,
          0,
          Math.PI * 2
        );

        ctx.fillStyle =
          config.color;

        ctx.fill();

        ctx.shadowBlur =
          0;

        ctx.strokeStyle =
          "#ffffff";

        ctx.lineWidth =
          2;

        ctx.stroke();

        ctx.fillStyle =
          "#ffffff";

        ctx.font =
          "bold 10px Arial";

        ctx.textAlign =
          "center";

        ctx.textBaseline =
          "middle";

        ctx.fillText(
          config.label.charAt(
            0
          ),
          powerUp.x,
          powerUp.y
        );

        ctx.restore();
      }
    };

    /* =====================================================
       DRAW PLAYER
    ===================================================== */

    const drawPlayer = () => {
      ctx.save();

      ctx.translate(
        player.x,
        player.y
      );

      ctx.rotate(
        player.angle
      );

      /*
        Shield.
      */

      if (
        activePowerUpLocal ===
        "shield"
      ) {
        ctx.beginPath();

        ctx.arc(
          0,
          0,
          player.radius +
          9,
          0,
          Math.PI * 2
        );

        ctx.strokeStyle =
          "rgba(168, 85, 247, 0.85)";

        ctx.lineWidth =
          4;

        ctx.shadowBlur =
          18;

        ctx.shadowColor =
          "#a855f7";

        ctx.stroke();

        ctx.shadowBlur =
          0;
      }

      /*
        Gun.
      */

      const recoil =
        weaponRecoil;

      ctx.fillStyle =
        "#e5e7eb";

      ctx.fillRect(
        8 - recoil,
        -5,
        30,
        10
      );

      if (
        player.weapon ===
        "rifle"
      ) {
        ctx.fillStyle =
          "#64748b";

        ctx.fillRect(
          10 - recoil,
          -7,
          32,
          14
        );
      }

      if (
        player.weapon ===
        "shotgun"
      ) {
        ctx.fillStyle =
          "#a16207";

        ctx.fillRect(
          8 - recoil,
          -7,
          34,
          14
        );
      }

      /*
        Muzzle flash.
      */

      if (
        muzzleFlash >
        0
      ) {
        const flashSize =
          player.weapon ===
            "shotgun"
            ? 25
            : 16;

        ctx.beginPath();

        ctx.moveTo(
          38,
          0
        );

        ctx.lineTo(
          38 +
          flashSize,
          -flashSize /
          2
        );

        ctx.lineTo(
          38 +
          flashSize *
          0.6,
          0
        );

        ctx.lineTo(
          38 +
          flashSize,
          flashSize /
          2
        );

        ctx.closePath();

        ctx.fillStyle =
          "#fef08a";

        ctx.fill();
      }

      /*
        Player body.
      */

      ctx.beginPath();

      ctx.arc(
        0,
        0,
        player.radius,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        "#38bdf8";

      ctx.fill();

      ctx.strokeStyle =
        "#ffffff";

      ctx.lineWidth =
        2;

      ctx.stroke();

      ctx.restore();
    };

    /* =====================================================
       STEP 38 // SQUAD COMMAND BOARD & FIRETEAM AWARENESS
       -----------------------------------------------------
       Adds live fireteam status and directional awareness for
       multiplayer operators using the existing synchronized
       remote operator state. Downed teammates receive priority
       directional treatment while the existing F revive flow
       remains unchanged. No server protocol is added.
       ===================================================== */

    /* =====================================================
       STEP 37 // MISSION NAVIGATOR & OBJECTIVE WAYFINDING
       -----------------------------------------------------
       Adds a lightweight tactical navigator over the existing
       objective system. The navigator identifies the most relevant
       live mission target, shows its bearing and distance, and marks
       the same target on the tactical minimap. It is presentation
       only: no enemy AI, objective rules, damage, scoring or
       multiplayer authority are changed.
       ===================================================== */

    const getMissionNavigationTarget = () => {
      const objective = getObjectiveInfo(
        getCampaignLevel(selectedCampaignLevelRef.current)
      );

      if (
        objective.type === "survive" ||
        objective.type === "time" ||
        objective.type === "defend"
      ) {
        return null;
      }

      if (objective.type === "collect") {
        let closest: PowerUp | null = null;
        let closestDistance = Infinity;

        for (const powerUp of powerUps) {
          const distance = Math.hypot(
            powerUp.x - player.x,
            powerUp.y - player.y
          );
          if (distance < closestDistance) {
            closestDistance = distance;
            closest = powerUp;
          }
        }

        return closest
          ? {
            x: closest.x,
            y: closest.y,
            label: POWERUP_CONFIG[closest.type].label,
            priority: "collect" as const,
          }
          : null;
      }

      let closestEnemy: Enemy | null = null;
      let closestDistance = Infinity;

      if (objective.type === "boss") {
        for (const enemy of enemies) {
          if (!(
            bossEnemies.has(enemy) ||
            (enemy as Enemy & { networkBoss?: boolean }).networkBoss
          )) {
            continue;
          }

          const distance = Math.hypot(
            enemy.x - player.x,
            enemy.y - player.y
          );
          if (distance < closestDistance) {
            closestDistance = distance;
            closestEnemy = enemy;
          }
        }
      } else {
        for (const enemy of enemies) {
          const distance = Math.hypot(
            enemy.x - player.x,
            enemy.y - player.y
          );
          if (distance < closestDistance) {
            closestDistance = distance;
            closestEnemy = enemy;
          }
        }
      }

      return closestEnemy
        ? {
          x: closestEnemy.x,
          y: closestEnemy.y,
          label:
            bossEnemies.has(closestEnemy) ||
              (closestEnemy as Enemy & { networkBoss?: boolean }).networkBoss
              ? "BOSS TARGET"
              : "HOSTILE CONTACT",
          priority: objective.type === "boss" ? ("boss" as const) : ("hostile" as const),
        }
        : null;
    };

    const drawSquadAwareness = (time: number) => {
      if (!multiplayerMatchRef.current || gameStateRef.current !== "playing") {
        return;
      }

      const pulse = 0.5 + Math.sin(time * 0.007) * 0.5;

      for (const operator of remoteOperatorsRef.current) {
        const dx = operator.x - player.x;
        const dy = operator.y - player.y;
        const operatorDistance = Math.hypot(dx, dy);

        if (!operator.downed && operatorDistance > 300) {
          continue;
        }

        const angle = Math.atan2(dy, dx);
        const markerDistance = operator.downed ? 105 : 88;
        const markerX = player.x + Math.cos(angle) * markerDistance;
        const markerY = player.y + Math.sin(angle) * markerDistance;
        const markerColor = operator.downed ? "#fb923c" : "#38bdf8";

        ctx.save();
        ctx.translate(markerX, markerY);
        ctx.rotate(angle);
        ctx.globalAlpha = operator.downed
          ? 0.5 + pulse * 0.35
          : 0.18 + pulse * 0.16;
        ctx.fillStyle = markerColor;

        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-6, -5);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-6, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        if (operator.downed) {
          ctx.save();
          ctx.strokeStyle = `rgba(251,146,60,${0.18 + pulse * 0.18})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 6]);
          ctx.beginPath();
          ctx.moveTo(player.x, player.y);
          ctx.lineTo(
            player.x + Math.cos(angle) * Math.min(operatorDistance, 160),
            player.y + Math.sin(angle) * Math.min(operatorDistance, 160)
          );
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }
    };

    const drawMissionNavigator = (time: number) => {
      if (gameStateRef.current !== "playing") return;

      const objective = getObjectiveInfo(
        getCampaignLevel(selectedCampaignLevelRef.current)
      );
      const target = getMissionNavigationTarget();
      const width = 300;
      const height = 44;
      const x = canvas.width / 2 - width / 2;
      const y = 14;
      const pulse = 0.65 + Math.sin(time * 0.006) * 0.2;

      ctx.save();
      ctx.fillStyle = "rgba(2, 6, 23, 0.82)";
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = target?.priority === "boss"
        ? `rgba(248,113,113,${0.65 + pulse * 0.2})`
        : "rgba(34,211,238,0.34)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, width, height);

      ctx.textAlign = "left";
      ctx.fillStyle = "#64748b";
      ctx.font = "bold 8px Arial";
      ctx.fillText("MISSION NAVIGATOR", x + 12, y + 12);

      if (!target) {
        ctx.fillStyle = "#34d399";
        ctx.font = "bold 11px Arial";
        ctx.fillText(
          objective.type === "collect"
            ? "SEARCH AREA // NO SUPPLY SIGNAL"
            : "HOLD POSITION // MISSION TIMER ACTIVE",
          x + 12,
          y + 29
        );
        ctx.restore();
        return;
      }

      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const degrees = ((angle * 180) / Math.PI + 360) % 360;
      const cardinal =
        degrees >= 337.5 || degrees < 22.5
          ? "E"
          : degrees < 67.5
            ? "SE"
            : degrees < 112.5
              ? "S"
              : degrees < 157.5
                ? "SW"
                : degrees < 202.5
                  ? "W"
                  : degrees < 247.5
                    ? "NW"
                    : degrees < 292.5
                      ? "N"
                      : "NE";

      ctx.save();
      ctx.translate(x + 16, y + 28);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(13, 0);
      ctx.lineTo(0, 5);
      ctx.closePath();
      ctx.fillStyle = target.priority === "boss" ? "#f87171" : "#22d3ee";
      ctx.fill();
      ctx.restore();

      ctx.textAlign = "left";
      ctx.fillStyle = target.priority === "boss" ? "#fca5a5" : "#e2e8f0";
      ctx.font = "bold 11px Arial";
      ctx.fillText(`${target.label} // ${cardinal}`, x + 38, y + 29);

      ctx.textAlign = "right";
      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 9px Arial";
      ctx.fillText(`${Math.round(distance)}m`, x + width - 12, y + 29);
      ctx.restore();
    };

    /* =====================================================
          DRAW CROSSHAIR
       ===================================================== */

    const drawCrosshair = () => {
      const size =
        hitMarker > 0
          ? 14
          : 10;

      const gap =
        hitMarker > 0
          ? 5
          : 4;

      ctx.strokeStyle =
        hitMarker > 0
          ? "#ef4444"
          : "#ffffff";

      ctx.lineWidth =
        hitMarker > 0
          ? 3
          : 2;

      ctx.beginPath();

      ctx.moveTo(
        mouse.x,
        mouse.y -
        gap -
        size
      );

      ctx.lineTo(
        mouse.x,
        mouse.y -
        gap
      );

      ctx.moveTo(
        mouse.x,
        mouse.y +
        gap
      );

      ctx.lineTo(
        mouse.x,
        mouse.y +
        gap +
        size
      );

      ctx.moveTo(
        mouse.x -
        gap -
        size,
        mouse.y
      );

      ctx.lineTo(
        mouse.x -
        gap,
        mouse.y
      );

      ctx.moveTo(
        mouse.x +
        gap,
        mouse.y
      );

      ctx.lineTo(
        mouse.x +
        gap +
        size,
        mouse.y
      );

      ctx.stroke();
    };

    /* =====================================================
       DRAW REMOTE OPERATORS
    ===================================================== */

    const drawRemoteOperators = () => {
      for (const remote of remoteOperatorsRef.current) {
        ctx.save();
        ctx.translate(remote.x, remote.y);
        ctx.rotate(remote.angle);

        ctx.fillStyle = "#22d3ee";
        ctx.shadowColor = "#22d3ee";
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = "#082f49";
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#67e8f9";
        ctx.fillRect(8, -3, 20, 6);

        ctx.restore();

        const healthRatio = Math.max(0, Math.min(1, remote.health / Math.max(1, remote.maxHealth)));
        const barWidth = 48;
        ctx.fillStyle = "rgba(2, 6, 23, 0.85)";
        ctx.fillRect(remote.x - barWidth / 2, remote.y - 32, barWidth, 5);
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(remote.x - barWidth / 2, remote.y - 32, barWidth * healthRatio, 5);

        ctx.fillStyle = "#e0f2fe";
        ctx.font = "bold 11px Arial";
        ctx.textAlign = "center";
        ctx.fillText(remote.name, remote.x, remote.y - 40);
      }
    };


    /* =====================================================
       STEP 34 // ADVANCED COMBAT VFX
    ===================================================== */

    const drawAdvancedCombatVFX = (time: number) => {
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const lowHealth = Math.max(0, Math.min(1, 1 - health / 100));
      const dangerPulse = lowHealth > 0
        ? 0.035 + Math.sin(time * 0.008) * 0.025 * lowHealth
        : 0;

      ctx.save();

      // Tactical vignette: strengthens as the operator becomes wounded.
      const vignette = ctx.createRadialGradient(
        canvasWidth / 2,
        canvasHeight / 2,
        Math.min(canvasWidth, canvasHeight) * 0.24,
        canvasWidth / 2,
        canvasHeight / 2,
        Math.max(canvasWidth, canvasHeight) * 0.72
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(0.68, `rgba(0,0,0,${0.08 + lowHealth * 0.12})`);
      vignette.addColorStop(1, `rgba(0,0,0,${0.42 + lowHealth * 0.2})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Low-health pulse is intentionally restrained so it does not obscure play.
      if (dangerPulse > 0) {
        const edge = ctx.createRadialGradient(
          canvasWidth / 2,
          canvasHeight / 2,
          Math.min(canvasWidth, canvasHeight) * 0.3,
          canvasWidth / 2,
          canvasHeight / 2,
          Math.max(canvasWidth, canvasHeight) * 0.7
        );
        edge.addColorStop(0, "rgba(239,68,68,0)");
        edge.addColorStop(1, `rgba(239,68,68,${dangerPulse * 2.2})`);
        ctx.fillStyle = edge;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      }

      // Brief red directional feedback stays readable over the world.
      if (damageFlash) {
        ctx.fillStyle = "rgba(239,68,68,0.055)";
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      }

      // Lightweight tactical scanlines give the arena a monitor-like finish.
      ctx.globalAlpha = 0.055;
      ctx.fillStyle = "#cbd5e1";
      for (let y = 0; y < canvasHeight; y += 4) {
        ctx.fillRect(0, y, canvasWidth, 1);
      }

      ctx.restore();
    };

    /* =====================================================
       STEP 35 // TACTICAL THREAT AWARENESS
       -----------------------------------------------------
       Converts nearby hostile pressure into a restrained tactical
       telemetry layer. It is intentionally derived from the same
       enemy world used by combat, so it does not create a second
       gameplay authority or alter damage/AI behavior.
    ===================================================== */

    const updateThreatTelemetry = (time: number) => {
      if (time - lastThreatTelemetryRef.current < 180) return;
      lastThreatTelemetryRef.current = time;

      if (gameStateRef.current === "menu" || gameStateRef.current === "gameOver") {
        setThreatLevel(0);
        setNearbyHostiles(0);
        return;
      }

      let threat = 0;
      let nearby = 0;

      for (const enemy of enemies) {
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const distanceToEnemy = Math.hypot(dx, dy);
        const radius = enemy.radius || 16;
        const influence = Math.max(0, 1 - distanceToEnemy / 520);
        if (distanceToEnemy < 360) nearby += 1;

        const typeWeight = enemy.type === "tank" ? 1.35 : enemy.type === "fast" ? 1.15 : 0.85;
        threat += influence * typeWeight * 24;
        if (distanceToEnemy < radius + 80) threat += 10;
        if (bossEnemies.has(enemy) || (enemy as Enemy & { networkBoss?: boolean }).networkBoss) {
          threat += 28 * influence;
        }
      }

      const squadPressure = remoteOperatorsRef.current.filter((operator) => {
        if (operator.downed) return true;
        return false;
      }).length;
      threat += squadPressure * 7;

      setThreatLevel(Math.max(0, Math.min(100, Math.round(threat))));
      setNearbyHostiles(Math.min(99, nearby));
    };

    const drawThreatAwareness = (time: number) => {
      if (gameStateRef.current === "menu") return;

      const pulse = 0.5 + Math.sin(time * 0.006) * 0.5;
      const hostilePressure = Math.max(0, Math.min(1, threatLevel / 100));

      ctx.save();
      ctx.translate(player.x, player.y);

      // A subtle proximity ring makes high-pressure engagements readable
      // without putting markers directly on every enemy.
      if (hostilePressure > 0.08) {
        ctx.beginPath();
        ctx.arc(0, 0, 62 + hostilePressure * 18 + pulse * 2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(248,113,113,${0.05 + hostilePressure * 0.12})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.restore();

      // Directional hostile ticks around the operator.
      if (hostilePressure > 0.12) {
        ctx.save();
        ctx.translate(player.x, player.y);
        for (const enemy of enemies) {
          const dx = enemy.x - player.x;
          const dy = enemy.y - player.y;
          const distanceToEnemy = Math.hypot(dx, dy);
          if (distanceToEnemy > 260 || distanceToEnemy < 1) continue;
          const nx = dx / distanceToEnemy;
          const ny = dy / distanceToEnemy;
          const tickDistance = 76;
          const alpha = Math.max(0.05, (1 - distanceToEnemy / 260) * (0.18 + hostilePressure * 0.32));
          ctx.save();
          ctx.translate(nx * tickDistance, ny * tickDistance);
          ctx.rotate(Math.atan2(ny, nx) + Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(0, -5);
          ctx.lineTo(-3.5, 3);
          ctx.lineTo(3.5, 3);
          ctx.closePath();
          ctx.fillStyle = `rgba(248,113,113,${alpha})`;
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }
    };

    /* =====================================================
       DRAW WORLD
    ===================================================== */

    const drawGameObjects = (
      time: number
    ) => {
      drawBackground();

      ctx.save();

      if (
        screenShake > 0
      ) {
        const shakeX =
          (Math.random() -
            0.5) *
          screenShake;

        const shakeY =
          (Math.random() -
            0.5) *
          screenShake;

        ctx.translate(
          shakeX,
          shakeY
        );
      }

      drawPowerUps(
        time
      );

      drawBullets();

      drawEnemies();

      drawRemoteOperators();

      drawParticles();

      drawPlayer();

      drawThreatAwareness(time);
      drawSquadAwareness(time);

      ctx.restore();

      if (!reducedMotion) {
        drawAdvancedCombatVFX(time);
      }
      drawMissionNavigator(time);

      if (
        gameStateRef.current !==
        "menu"
      ) {
        drawMinimap();
      }

      if (
        gameStateRef.current ===
        "playing"
      ) {
        drawCrosshair();
      }
    };

    /* =====================================================
       DRAW MINIMAP
    ===================================================== */

    const drawMinimap = () => {
      const map =
        getActiveMap();

      const mapWidth = tacticalMapExpanded ? 300 : 190;
      const mapHeight = tacticalMapExpanded ? 190 : 120;
      const padding = tacticalMapExpanded ? 16 : 14;
      const x =
        canvas.width -
        mapWidth -
        20;
      const y = tacticalMapExpanded ? 150 : 170;

      ctx.save();

      ctx.fillStyle =
        "rgba(2, 6, 23, 0.82)";

      ctx.fillRect(
        x,
        y,
        mapWidth,
        mapHeight
      );

      ctx.strokeStyle =
        `${map.accent}88`;
      ctx.lineWidth = 1.5;

      ctx.strokeRect(
        x,
        y,
        mapWidth,
        mapHeight
      );

      ctx.fillStyle =
        "#94a3b8";
      ctx.font =
        "bold 10px Arial";
      ctx.textAlign =
        "left";

      ctx.fillText(
        `MAP ${map.id} · ${map.name.toUpperCase()}`,
        x + padding,
        y + 15
      );

      if (tacticalMapExpanded) {
        ctx.textAlign = "right";
        ctx.fillStyle = threatLevel >= 70 ? "#f87171" : threatLevel >= 35 ? "#facc15" : "#34d399";
        ctx.fillText(`THREAT ${threatLevel}% · HOSTILES ${nearbyHostiles}`, x + mapWidth - padding, y + 15);
        ctx.textAlign = "left";
      }

      const innerX =
        x + padding;
      const innerY =
        y + 24;
      const innerW =
        mapWidth -
        padding * 2;
      const innerH =
        mapHeight -
        34;

      ctx.fillStyle =
        "rgba(15, 23, 42, 0.9)";

      ctx.fillRect(
        innerX,
        innerY,
        innerW,
        innerH
      );

      for (
        const obstacle of getActiveObstacles()
      ) {
        ctx.fillStyle =
          obstacle.kind === "crate"
            ? "#a16207"
            : obstacle.kind === "container"
              ? "#2563eb"
              : map.accent;

        ctx.globalAlpha =
          obstacle.kind === "wall"
            ? 0.55
            : 0.85;

        ctx.fillRect(
          innerX +
          (obstacle.x /
            canvas.width) *
          innerW,
          innerY +
          (obstacle.y /
            canvas.height) *
          innerH,
          (obstacle.width /
            canvas.width) *
          innerW,
          (obstacle.height /
            canvas.height) *
          innerH
        );
      }

      ctx.globalAlpha = 1;

      /* Enemies */
      for (const enemy of enemies) {
        ctx.fillStyle =
          "#ef4444";

        ctx.beginPath();

        ctx.arc(
          innerX +
          (enemy.x /
            canvas.width) *
          innerW,
          innerY +
          (enemy.y /
            canvas.height) *
          innerH,
          enemy.type === "tank"
            ? 3
            : 2,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }

      /* Squad operators */
      if (multiplayerMatchRef.current) {
        for (const operator of remoteOperatorsRef.current) {
          const operatorX = innerX + (operator.x / canvas.width) * innerW;
          const operatorY = innerY + (operator.y / canvas.height) * innerH;
          ctx.globalAlpha = operator.downed ? 0.45 : 1;
          ctx.fillStyle = operator.downed ? "#f97316" : "#38bdf8";
          ctx.beginPath();
          ctx.arc(operatorX, operatorY, operator.downed ? 3 : 2.5, 0, Math.PI * 2);
          ctx.fill();
          if (tacticalMapExpanded && !operator.downed) {
            ctx.strokeStyle = "rgba(56,189,248,.45)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(operatorX, operatorY, 6, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }

      /* Mission target */
      const missionTarget = getMissionNavigationTarget();
      if (missionTarget) {
        const targetX = innerX + (missionTarget.x / canvas.width) * innerW;
        const targetY = innerY + (missionTarget.y / canvas.height) * innerH;
        const targetPulse = 5 + Math.sin(performance.now() * 0.006) * 1.5;
        ctx.save();
        ctx.strokeStyle = missionTarget.priority === "boss" ? "#f87171" : "#facc15";
        ctx.fillStyle = missionTarget.priority === "boss" ? "#f87171" : "#facc15";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(targetX, targetY, targetPulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(targetX, targetY, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      /* Player */
      ctx.fillStyle =
        "#22d3ee";

      ctx.shadowBlur = 8;
      ctx.shadowColor =
        "#22d3ee";

      ctx.beginPath();

      ctx.arc(
        innerX +
        (player.x /
          canvas.width) *
        innerW,
        innerY +
        (player.y /
          canvas.height) *
        innerH,
        4,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.restore();
    };

    /* =====================================================
       DRAW HUD
    ===================================================== */

    // HUD is rendered by the React tactical interface below.
    // Keeping canvas HUD drawing disabled prevents duplicate score,
    // weapon and control panels from stacking underneath the interface.
    const drawHUD = () => {
      /*
        The tactical HUD is intentionally rendered by React now.

        The game loop still calls drawHUD() during PLAYING, PAUSED and
        GAME OVER so the existing canvas architecture remains unchanged.
        We keep this function as the compatibility boundary between the
        simulation and presentation layers instead of removing the call
        sites from the loop.

        IMPORTANT: do not draw score / weapon / controls here. Those
        elements are owned by the React HUD below. Drawing them on canvas
        as well would create the exact duplicate/overlap seen in the old
        interface, especially in the upper-right weapon area.

        Canvas remains responsible for world-space presentation such as:
        - player and enemy rendering
        - projectiles and particles
        - minimap
        - crosshair
        - wave transition graphics
        React owns screen-space tactical information.
      */

      return;
    };

    /* =====================================================
       DRAW WAVE MESSAGE
    ===================================================== */

    const drawWaveMessage = (
      time: number
    ) => {
      if (
        time >=
        waveMessageEndTime
      ) {
        return;
      }

      ctx.save();

      ctx.textAlign =
        "center";

      ctx.fillStyle =
        "#ffffff";

      ctx.font =
        "bold 44px Arial";

      ctx.fillText(
        `WAVE ${wave}`,
        canvas.width /
        2,
        canvas.height /
        2 -
        20
      );

      ctx.font =
        "20px Arial";

      ctx.fillStyle =
        "#cbd5e1";

      ctx.fillText(
        `${enemies.length} enemies incoming`,
        canvas.width /
        2,
        canvas.height /
        2 +
        20
      );

      ctx.restore();
    };

    /* =====================================================
       DRAW WAVE COUNTDOWN
    ===================================================== */

    const drawNextWaveCountdown = (
      time: number
    ) => {
      if (
        !waveStarting
      ) {
        return;
      }

      const remaining =
        Math.max(
          0,
          nextWaveStartTime -
          time
        );

      const seconds =
        Math.ceil(
          remaining /
          1000
        );

      ctx.save();

      ctx.textAlign =
        "center";

      ctx.fillStyle =
        "#ffffff";

      ctx.font =
        "bold 42px Arial";

      ctx.fillText(
        "WAVE CLEARED",
        canvas.width /
        2,
        canvas.height /
        2 -
        25
      );

      ctx.font =
        "22px Arial";

      ctx.fillStyle =
        "#cbd5e1";

      ctx.fillText(
        `Next wave in ${seconds}`,
        canvas.width /
        2,
        canvas.height /
        2 +
        20
      );

      ctx.restore();
    };

    /* =====================================================
       PAUSE SCREEN
    ===================================================== */

    const drawPauseScreen = () => {
      ctx.fillStyle =
        "rgba(0, 0, 0, 0.65)";

      ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      ctx.textAlign =
        "center";

      ctx.fillStyle =
        "#ffffff";

      ctx.font =
        "bold 52px Arial";

      ctx.fillText(
        "PAUSED",
        canvas.width /
        2,
        canvas.height /
        2
      );

      ctx.font =
        "20px Arial";

      ctx.fillStyle =
        "#cbd5e1";

      ctx.fillText(
        "Press P or Esc to resume",
        canvas.width /
        2,
        canvas.height /
        2 +
        45
      );
    };

    /* =====================================================
       GAME OVER SCREEN
    ===================================================== */

    const drawGameOverScreen =
      () => {
        ctx.fillStyle =
          "rgba(0, 0, 0, 0.75)";

        ctx.fillRect(
          0,
          0,
          canvas.width,
          canvas.height
        );

        ctx.textAlign =
          "center";

        ctx.fillStyle =
          "#ef4444";

        ctx.font =
          "bold 58px Arial";

        ctx.fillText(
          "GAME OVER",
          canvas.width /
          2,
          canvas.height /
          2 -
          50
        );

        ctx.fillStyle =
          "#ffffff";

        ctx.font =
          "24px Arial";

        ctx.fillText(
          `Score: ${score}`,
          canvas.width /
          2,
          canvas.height /
          2
        );

        ctx.fillText(
          `Wave reached: ${wave}`,
          canvas.width /
          2,
          canvas.height /
          2 +
          40
        );

        ctx.fillStyle =
          "#cbd5e1";

        ctx.font =
          "18px Arial";

        ctx.fillText(
          "Use PLAY AGAIN to restart",
          canvas.width /
          2,
          canvas.height /
          2 +
          90
        );
      };

    /* =====================================================
       MOBILE TOUCH CONTROLS
       The touch layer translates mobile gestures into the same
       movement/aim/fire actions used by the desktop game loop.
    ===================================================== */

    const clearMobileStick = () => {
      keys["w"] = false;
      keys["a"] = false;
      keys["s"] = false;
      keys["d"] = false;
      setMobileStick({ x: 0, y: 0 });
    };

    const handleMobileJoystick = (event: Event) => {
      const detail = (event as CustomEvent<{ x?: number; y?: number }>).detail;
      const x = Math.max(-1, Math.min(1, Number(detail?.x) || 0));
      const y = Math.max(-1, Math.min(1, Number(detail?.y) || 0));

      keys["a"] = x < -0.28;
      keys["d"] = x > 0.28;
      keys["w"] = y < -0.28;
      keys["s"] = y > 0.28;
      setMobileStick({ x, y });
    };

    const handleMobileAction = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; pressed?: boolean; weapon?: string }>).detail;
      const action = detail?.action;
      const pressed = detail?.pressed !== false;

      if (action === "fire") {
        if (gameStateRef.current === "playing") {
          mouse.clicked = pressed;
        } else if (!pressed) {
          mouse.clicked = false;
        }
        return;
      }

      if (!pressed) return;

      if (action === "dash") {
        if (gameStateRef.current === "playing") dashRequested = true;
        return;
      }

      if (action === "reload") {
        keys["r"] = true;
        window.setTimeout(() => { keys["r"] = false; }, 80);
        return;
      }

      if (action === "pause") {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" }));
        return;
      }

      if (action === "revive") {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
        return;
      }

      if (action === "weapon") {
        const weapon = detail?.weapon;
        if (weapon === "pistol" || weapon === "rifle" || weapon === "shotgun") {
          window.dispatchEvent(new KeyboardEvent("keydown", { key: weapon === "pistol" ? "1" : weapon === "rifle" ? "2" : "3" }));
        }
      }
    };

    const handleMobileAim = (event: Event) => {
      const detail = (event as CustomEvent<{ x?: number; y?: number }>).detail;
      const x = Number(detail?.x);
      const y = Number(detail?.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        mouse.x = x;
        mouse.y = y;
      }
    };

    window.addEventListener("arena-mobile-joystick", handleMobileJoystick);
    window.addEventListener("arena-mobile-action", handleMobileAction);
    window.addEventListener("arena-mobile-aim", handleMobileAim);

    /* =====================================================
       EVENT LISTENERS
    ===================================================== */

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    window.addEventListener(
      "keyup",
      handleKeyUp
    );

    window.addEventListener(
      "blur",
      handleBlur
    );

    window.addEventListener(
      "mousemove",
      handleMouseMove
    );

    window.addEventListener(
      "mousedown",
      handleMouseDown
    );

    window.addEventListener(
      "mouseup",
      handleMouseUp
    );

    const applyPendingLocalRevive = () => {
      const event = localReviveEventRef.current;
      if (!event) return;

      localReviveEventRef.current = null;
      player.health = Math.max(1, Math.min(100, event.health));
      livesRef.current = Math.max(0, event.lives);
      wave = Math.max(1, event.wave);
      playerDownedRef.current = false;
      respawningRef.current = false;
      gameOverRef.current = false;
      setHealth(player.health);
      setLives(livesRef.current);
      setCurrentWave(wave);
      setIsRespawning(false);
      setReviveProgress(0);
      setRevivePrompt(null);
      reviveDeadlineRef.current = 0;
      if (reviveTimeoutRef.current) {
        clearTimeout(reviveTimeoutRef.current);
        reviveTimeoutRef.current = null;
      }
    };

    /* =====================================================
       GAME LOOP
    ===================================================== */

    let animationId =
      0;

    const gameLoop = (
      time: number
    ) => {
      applyPendingLocalRevive();
      syncMultiplayerState(time);
      updateThreatTelemetry(time);
      drawGameObjects(
        time
      );

      /*
        CAMPAIGN LAUNCH QUEUE.
        React UI can request a mission while the game is in MENU.
        Consume the request before the MENU early-return so the next
        mission always enters the same startGame path as deployment.
      */

      if (pendingCampaignLevelRef.current !== null) {
        const pendingLevel =
          pendingCampaignLevelRef.current;

        pendingCampaignLevelRef.current = null;
        startGame(pendingLevel);
      }

      /*
        MENU:
        Arena is rendered in the
        background, but gameplay
        does not update.
      */

      if (
        gameStateRef.current ===
        "menu"
      ) {
        animationId =
          requestAnimationFrame(
            gameLoop
          );

        return;
      }

      /*
        GAME OVER.
      */

      if (
        gameStateRef.current ===
        "gameOver" ||
        gameOverRef.current
      ) {
        drawHUD();

        drawGameOverScreen();

        animationId =
          requestAnimationFrame(
            gameLoop
          );

        return;
      }

      /*
        PAUSED.
      */

      if (
        gameStateRef.current ===
        "paused" ||
        paused
      ) {
        drawHUD();

        drawPauseScreen();

        animationId =
          requestAnimationFrame(
            gameLoop
          );

        return;
      }

      /*
        Only PLAYING reaches
        gameplay updates.
      */

      if (
        gameStateRef.current !==
        "playing"
      ) {
        animationId =
          requestAnimationFrame(
            gameLoop
          );

        return;
      }

      /*
        Respawn transition. Gameplay is frozen while the player
        gets a short cinematic respawn at the death position.
      */

      if (
        respawningRef.current
      ) {
        drawHUD();

        animationId =
          requestAnimationFrame(
            gameLoop
          );

        return;
      }

      /*
        Wave transition.
      */

      if (
        waveStarting
      ) {
        drawHUD();

        drawNextWaveCountdown(
          time
        );

        if (
          time >=
          nextWaveStartTime
        ) {
          startWave(
            wave + 1
          );
        }

        animationId =
          requestAnimationFrame(
            gameLoop
          );

        return;
      }

      /* ===================================================
         UPDATE
      =================================================== */

      applySharedEnemySnapshot();
      processSharedEnemyHits();

      updatePlayerMovement(
        time
      );

      updateReload(
        time
      );

      updateShooting(
        time
      );

      updateBullets();
      updateRemoteProjectiles();

      if (!multiplayerMatchRef.current || multiplayerHostRef.current) {
        updateEnemies(
          time
        );
      }

      if (!multiplayerMatchRef.current || multiplayerHostRef.current) {
        updateBulletEnemyCollisions();
      } else {
        // Remote clients still send hits to the host; the host owns the shared enemy world.
      }

      broadcastSharedEnemies(time);

      collectPowerUps(
        time
      );

      updateMissionObjective(time);

      updateParticles();

      updateEffects();

      checkGameOver();

      if (
        gameStateRef.current ===
        "playing"
      ) {
        checkWaveCompletion(
          time
        );
      }

      drawHUD();

      drawWaveMessage(
        time
      );

      animationId =
        requestAnimationFrame(
          gameLoop
        );
    };

    animationId =
      requestAnimationFrame(
        gameLoop
      );

    /* =====================================================
       CLEANUP
    ===================================================== */

    return () => {
      cancelAnimationFrame(
        animationId
      );

      if (respawnTimeoutRef.current) {
        clearTimeout(respawnTimeoutRef.current);
        respawnTimeoutRef.current = null;
      }

      if (reviveTimeoutRef.current) {
        clearTimeout(reviveTimeoutRef.current);
        reviveTimeoutRef.current = null;
      }

      respawningRef.current = false;
      reviveDeadlineRef.current = 0;

      window.removeEventListener("arena-mobile-joystick", handleMobileJoystick);
      window.removeEventListener("arena-mobile-action", handleMobileAction);
      window.removeEventListener("arena-mobile-aim", handleMobileAim);
      clearMobileStick();
      mouse.clicked = false;

      window.removeEventListener(
        "resize",
        resizeCanvas
      );

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );

      window.removeEventListener(
        "keyup",
        handleKeyUp
      );

      window.removeEventListener(
        "blur",
        handleBlur
      );

      window.removeEventListener(
        "mousemove",
        handleMouseMove
      );

      window.removeEventListener(
        "mousedown",
        handleMouseDown
      );

      window.removeEventListener(
        "mouseup",
        handleMouseUp
      );

      window.removeEventListener(
        "arena-start-game",
        handleStartGameEvent
      );

      window.removeEventListener(
        "arena-start-campaign-level",
        handleStartCampaignLevelEvent
      );

      window.removeEventListener(
        "arena-resume-game",
        handleResumeGameEvent
      );
    };
  }, []);

  /* =======================================================
     UI
  ======================================================= */

  return (
    <main className="arena-ui-theme relative h-screen w-screen overflow-hidden bg-black">
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_center,transparent_35%,rgba(2,6,23,0.38)_100%)]" />
      <div className="pointer-events-none absolute inset-0 z-[2] opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:48px_48px]" />

      {gameState === "playing" && (
        <button
          type="button"
          onClick={() => setTacticalMapExpanded((value) => !value)}
          className="absolute right-5 top-[122px] z-[45] border border-cyan-400/30 bg-slate-950/75 px-3 py-2 text-[8px] font-black tracking-[0.2em] text-cyan-300 backdrop-blur-sm hover:bg-cyan-400/10"
        >
          {tacticalMapExpanded ? "MINIMAP // COMPACT" : "TACTICAL MAP // EXPAND"}
        </button>
      )}

      {mobileControlsEnabled && gameState === "playing" && (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-[35] md:hidden"
            style={{ touchAction: "none" }}
          >
            <div
              className="pointer-events-auto absolute bottom-6 left-5 h-36 w-36 rounded-full border border-cyan-300/25 bg-slate-950/35 shadow-[0_0_35px_rgba(34,211,238,.08)]"
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                const rect = event.currentTarget.getBoundingClientRect();
                const dx = event.clientX - (rect.left + rect.width / 2);
                const dy = event.clientY - (rect.top + rect.height / 2);
                const distance = Math.min(Math.hypot(dx, dy), rect.width * 0.34);
                const angle = Math.atan2(dy, dx);
                const x = Math.cos(angle) * (distance / (rect.width * 0.34));
                const y = Math.sin(angle) * (distance / (rect.height * 0.34));
                window.dispatchEvent(new CustomEvent("arena-mobile-joystick", { detail: { x, y } }));
              }}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                const dx = event.clientX - (rect.left + rect.width / 2);
                const dy = event.clientY - (rect.top + rect.height / 2);
                const max = rect.width * 0.34;
                const distance = Math.min(Math.hypot(dx, dy), max);
                const angle = Math.atan2(dy, dx);
                const x = Math.cos(angle) * (distance / max);
                const y = Math.sin(angle) * (distance / max);
                window.dispatchEvent(new CustomEvent("arena-mobile-joystick", { detail: { x, y } }));
              }}
              onPointerUp={(event) => {
                event.preventDefault();
                event.currentTarget.releasePointerCapture(event.pointerId);
                window.dispatchEvent(new CustomEvent("arena-mobile-joystick", { detail: { x: 0, y: 0 } }));
              }}
              onPointerCancel={() => window.dispatchEvent(new CustomEvent("arena-mobile-joystick", { detail: { x: 0, y: 0 } }))}
            >
              <div className="absolute inset-[35%] rounded-full border border-cyan-300/35 bg-cyan-300/10" />
              <div
                className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/50 bg-cyan-300/20 shadow-[0_0_18px_rgba(34,211,238,.2)]"
                style={{ transform: `translate(calc(-50% + ${mobileStick.x * 38}px), calc(-50% + ${mobileStick.y * 38}px))` }}
              />
              <span className="absolute bottom-2 left-0 right-0 text-center text-[7px] font-black tracking-[0.25em] text-cyan-200/60">MOVE</span>
            </div>

            <div
              className="pointer-events-auto absolute right-3 top-20 h-[48%] w-[42%]"
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                window.dispatchEvent(new CustomEvent("arena-mobile-aim", { detail: { x: event.clientX, y: event.clientY } }));
              }}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                event.preventDefault();
                window.dispatchEvent(new CustomEvent("arena-mobile-aim", { detail: { x: event.clientX, y: event.clientY } }));
              }}
            >
              <div className="absolute right-4 top-4 border border-white/10 bg-black/20 px-2 py-1 text-[7px] font-black tracking-[0.2em] text-white/40">AIM</div>
            </div>

            <div className="pointer-events-none absolute bottom-7 right-4 flex items-end gap-2">
              <div className="flex flex-col gap-2">
                <button type="button" className="pointer-events-auto h-11 w-11 border border-white/15 bg-black/55 text-[7px] font-black text-white/70 active:bg-white/15" onPointerDown={(event) => { event.preventDefault(); window.dispatchEvent(new CustomEvent("arena-mobile-action", { detail: { action: "reload" } })); }}>R</button>
                <button type="button" className="pointer-events-auto h-11 w-11 border border-white/15 bg-black/55 text-[7px] font-black text-white/70 active:bg-white/15" onPointerDown={(event) => { event.preventDefault(); window.dispatchEvent(new CustomEvent("arena-mobile-action", { detail: { action: "dash" } })); }}>DASH</button>
              </div>
              <button
                type="button"
                className="arena-mobile-round pointer-events-auto h-24 w-24 rounded-full border border-red-300/40 bg-red-500/15 text-[10px] font-black tracking-[0.18em] text-red-200 shadow-[0_0_30px_rgba(239,68,68,.14)] active:scale-95 active:bg-red-500/30"
                onPointerDown={(event) => { event.preventDefault(); window.dispatchEvent(new CustomEvent("arena-mobile-action", { detail: { action: "fire", pressed: true } })); }}
                onPointerUp={(event) => { event.preventDefault(); window.dispatchEvent(new CustomEvent("arena-mobile-action", { detail: { action: "fire", pressed: false } })); }}
                onPointerCancel={() => window.dispatchEvent(new CustomEvent("arena-mobile-action", { detail: { action: "fire", pressed: false } }))}
              >
                FIRE
              </button>
            </div>

            <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 gap-1">
              {[
                ["pistol", "1"],
                ["rifle", "2"],
                ["shotgun", "3"],
              ].map(([weapon, label]) => (
                <button key={weapon} type="button" className="pointer-events-auto h-9 min-w-9 border border-white/10 bg-black/50 px-2 text-[8px] font-black text-white/60 active:bg-cyan-400/20" onPointerDown={(event) => { event.preventDefault(); window.dispatchEvent(new CustomEvent("arena-mobile-action", { detail: { action: "weapon", weapon } })); }}>{label}</button>
              ))}
              <button type="button" className="pointer-events-auto h-9 min-w-9 border border-white/10 bg-black/50 px-2 text-[8px] font-black text-white/60 active:bg-cyan-400/20" onPointerDown={(event) => { event.preventDefault(); window.dispatchEvent(new CustomEvent("arena-mobile-action", { detail: { action: "pause" } })); }}>II</button>
            </div>
          </div>
        </>
      )}

      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 h-full w-full"
        style={{
          touchAction: "none",
          cursor:
            gameState ===
              "playing"
              ? "none"
              : "default",
        }}
      />

      {/* ==================================================
          MAIN MENU
      ================================================== */}

      {/* MOBILE COMMAND TERMINAL */}
      {gameState === "menu" && (
        <div className="absolute inset-0 z-50 block overflow-hidden bg-[#02060b] text-white md:hidden" style={{ minHeight: "100dvh", touchAction: "pan-y" }}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(34,211,238,.16),transparent_27%),radial-gradient(circle_at_12%_76%,rgba(139,92,246,.13),transparent_30%),linear-gradient(145deg,#02050a_0%,#07121c_52%,#02060b_100%)]" />
          <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:44px_44px]" />
          <div className="absolute left-4 top-24 h-44 w-px bg-cyan-400/25 shadow-[0_0_28px_rgba(34,211,238,.3)]" />
          <div className="absolute right-4 top-32 h-64 w-px bg-white/10" />

          <div className="relative z-10 flex h-[100dvh] min-h-0 flex-col">
            <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-black/45 px-5 py-4 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 items-center justify-center border border-cyan-400/60 bg-cyan-400/10 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,.08)]">
                  <span className="text-sm font-black">AS</span>
                  <span className="absolute -right-1 -top-1 h-1.5 w-1.5 bg-cyan-300 shadow-[0_0_9px_rgba(34,211,238,.9)]" />
                </div>
                <div>
                  <p className="text-[8px] font-black tracking-[0.32em] text-cyan-400">TACTICAL OPERATIONS</p>
                  <p className="mt-0.5 text-[11px] font-black tracking-[0.16em] text-slate-200">ARENA STRIKE</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[8px] font-black tracking-[0.18em] text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.8)]" /> ONLINE
              </div>
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-8">
              <div className="mx-auto flex min-h-full max-w-md flex-col">
                <div className="flex items-center gap-2 text-[8px] font-black tracking-[0.28em] text-slate-600">
                  <span className="h-px w-7 bg-cyan-400/50" /> MISSION CONTROL / MOBILE
                </div>

                <section className="mt-8">
                  <p className="text-[9px] font-black tracking-[0.48em] text-cyan-300">CLASSIFIED // LIVE COMBAT</p>
                  <h1 className="mt-4 text-[clamp(3.8rem,17vw,5.6rem)] font-black leading-[0.82] tracking-[-0.065em] text-white">
                    ARENA<br /><span className="text-cyan-300 drop-shadow-[0_0_25px_rgba(34,211,238,.16)]">STRIKE</span>
                  </h1>
                  <div className="mt-6 border-l-2 border-cyan-400/60 pl-4">
                    <p className="text-xs font-bold uppercase leading-6 tracking-[0.05em] text-slate-400">TACTICAL SURVIVAL PLATFORM</p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">Deploy, survive escalating hostile waves and build your combat record.</p>
                  </div>
                </section>

                <section className="mt-8">
                  <button type="button" onClick={openLevelSelect} onPointerUp={(event) => activateMobileAction(event, openLevelSelect)} className="group flex min-h-16 w-full touch-manipulation select-none items-center justify-between border border-cyan-300/70 bg-cyan-300 px-5 py-4 text-left text-slate-950 shadow-[0_0_35px_rgba(34,211,238,.14)] active:bg-cyan-200">
                    <span>
                      <span className="block text-[7px] font-black tracking-[0.32em] opacity-60">PRIMARY MISSION</span>
                      <span className="mt-1 block text-sm font-black tracking-[0.18em]">ENTER CAMPAIGN</span>
                    </span>
                    <span className="text-2xl font-black">→</span>
                  </button>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => { setShowMultiplayer(true); connectMultiplayer(); }} onPointerUp={(event) => activateMobileAction(event, () => { setShowMultiplayer(true); connectMultiplayer(); })} className="min-h-14 touch-manipulation select-none border border-violet-400/45 bg-violet-400/10 px-4 py-3 text-left active:bg-violet-400/20">
                      <span className="block text-[7px] font-black tracking-[0.24em] text-violet-400">ONLINE</span>
                      <span className="mt-1 block text-[10px] font-black tracking-[0.12em] text-violet-100">FIRETEAM ↗</span>
                    </button>
                    <button type="button" onClick={openArmory} onPointerUp={(event) => activateMobileAction(event, openArmory)} className="min-h-14 touch-manipulation select-none border border-yellow-400/35 bg-yellow-400/5 px-4 py-3 text-left active:bg-yellow-400/10">
                      <span className="block text-[7px] font-black tracking-[0.24em] text-yellow-400/70">LOADOUT</span>
                      <span className="mt-1 block text-[10px] font-black tracking-[0.12em] text-yellow-100">ARMORY →</span>
                    </button>
                  </div>

                  <button type="button" onClick={() => { setShowLeaderboard(true); requestLeaderboard(); }} onPointerUp={(event) => activateMobileAction(event, () => { setShowLeaderboard(true); requestLeaderboard(); })} className="mt-3 flex min-h-12 w-full touch-manipulation select-none items-center justify-between border border-white/10 bg-white/[0.025] px-4 py-3 text-left active:bg-white/[0.06]">
                    <span className="text-[9px] font-black tracking-[0.22em] text-slate-300">GLOBAL COMBAT RECORD</span>
                    <span className="text-xs font-black text-emerald-300">LEADERBOARD →</span>
                  </button>
                </section>

                <section className="mt-8 grid grid-cols-3 border-y border-white/10">
                  <div className="px-3 py-4"><p className="text-[7px] font-black tracking-[0.2em] text-slate-600">RANK</p><p className="mt-1 text-xl font-black text-white">{String(rank).padStart(2, "0")}</p></div>
                  <div className="border-x border-white/10 px-3 py-4"><p className="text-[7px] font-black tracking-[0.2em] text-slate-600">XP</p><p className="mt-1 text-xl font-black text-cyan-300">{xp.toLocaleString()}</p></div>
                  <div className="px-3 py-4"><p className="text-[7px] font-black tracking-[0.2em] text-slate-600">CLEARED</p><p className="mt-1 text-xl font-black text-emerald-300">{completedLevels.length}<span className="text-xs text-slate-600">/60</span></p></div>
                </section>

                <div className="mt-auto pt-8">
                  <div className="flex items-center justify-between text-[7px] font-black tracking-[0.24em] text-slate-600">
                    <span>ARENA STRIKE // MOBILE OPS</span><span>v1.0.0</span>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
      )}

      {/* DESKTOP COMMAND TERMINAL */}
      <div className="hidden md:block">
        {gameState === "menu" && (
          <div className="absolute inset-0 z-50 overflow-hidden bg-[#03070d] text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_38%,rgba(34,211,238,0.13),transparent_25%),radial-gradient(circle_at_15%_80%,rgba(139,92,246,0.10),transparent_28%),linear-gradient(115deg,#02050a_0%,#07111b_48%,#03070d_100%)]" />
            <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:64px_64px]" />
            <div className="absolute left-[6%] top-[18%] h-[420px] w-px bg-cyan-400/20 shadow-[0_0_30px_rgba(34,211,238,.25)]" />
            <div className="absolute right-[9%] top-[13%] h-[72%] w-px bg-white/10" />
            <div className="absolute bottom-[12%] left-[6%] h-px w-[88%] bg-white/10" />

            <div className="relative z-10 flex h-full flex-col">
              <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-black/30 px-6 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                  <div className="relative flex h-9 w-9 items-center justify-center border border-cyan-400/50 bg-cyan-400/10 text-cyan-300">
                    <span className="text-sm font-black">AS</span>
                    <span className="absolute -right-1 -top-1 h-1.5 w-1.5 bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,.8)]" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black tracking-[0.42em] text-cyan-400">TACTICAL OPERATIONS NETWORK</p>
                    <p className="text-xs font-bold tracking-[0.22em] text-slate-300">ARENA STRIKE // COMMAND TERMINAL</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-[9px] font-black tracking-[0.22em] text-slate-500">
                  <span className="hidden sm:inline">SECURE CHANNEL</span>
                  <span className="flex items-center gap-2 text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.8)]" />SYSTEM ONLINE</span>
                  <span className="hidden md:inline">v1.0.0</span>
                </div>
              </header>

              <div className="flex min-h-0 flex-1">
                <aside className="hidden w-56 shrink-0 border-r border-white/10 bg-black/25 p-4 lg:flex lg:flex-col">
                  <p className="px-3 py-2 text-[9px] font-black tracking-[0.3em] text-slate-600">COMMAND</p>
                  <div className="space-y-1">
                    <button type="button" onClick={() => { playCombatAudioCue("ui"); openLevelSelect(); }} className="group flex w-full items-center gap-3 border-l-2 border-cyan-400 bg-cyan-400/10 px-3 py-3 text-left text-xs font-black tracking-[0.16em] text-cyan-300 transition hover:bg-cyan-400/15">
                      <span className="text-base">01</span><span>CAMPAIGN</span><span className="ml-auto text-cyan-400">›</span>
                    </button>
                    <button type="button" onClick={() => { setShowMultiplayer(true); connectMultiplayer(); }} className="group flex w-full items-center gap-3 border-l-2 border-transparent px-3 py-3 text-left text-xs font-black tracking-[0.16em] text-slate-400 transition hover:border-violet-400 hover:bg-violet-400/10 hover:text-white">
                      <span className="text-base">02</span><span>FIRETEAM</span><span className="ml-auto">›</span>
                    </button>
                    <button type="button" onClick={() => { setShowLeaderboard(true); requestLeaderboard(); }} className="group flex w-full items-center gap-3 border-l-2 border-transparent px-3 py-3 text-left text-xs font-black tracking-[0.16em] text-slate-400 transition hover:border-emerald-400 hover:bg-emerald-400/10 hover:text-white">
                      <span className="text-base">03</span><span>LEADERBOARD</span><span className="ml-auto">›</span>
                    </button>
                    <button type="button" onClick={openArmory} className="group flex w-full items-center gap-3 border-l-2 border-transparent px-3 py-3 text-left text-xs font-black tracking-[0.16em] text-slate-400 transition hover:border-yellow-400 hover:bg-yellow-400/10 hover:text-white">
                      <span className="text-base">04</span><span>ARMORY</span><span className="ml-auto">›</span>
                    </button>
                    <button type="button" onClick={() => { const mutedNow = toggleMute(); audioMutedRef.current = mutedNow; setCombatAudioMuted(mutedNow); setAudioMuted(mutedNow); }} className="group flex w-full items-center gap-3 border-l-2 border-transparent px-3 py-3 text-left text-xs font-black tracking-[0.16em] text-slate-400 transition hover:border-white/30 hover:bg-white/5 hover:text-white">
                      <span className="text-base">05</span><span>AUDIO</span><span className="ml-auto">{audioMuted ? "OFF" : "ON"}</span>
                    </button>
                  </div>
                  <div className="mt-auto border-t border-white/10 pt-4">
                    <p className="px-3 text-[8px] font-black tracking-[0.28em] text-slate-600">FIELD CONTROLS</p>
                    <div className="mt-3 space-y-2 px-3 text-[9px] font-bold text-slate-500">
                      <p><b className="text-slate-300">WASD</b> MOVE</p>
                      <p><b className="text-slate-300">SHIFT</b> SPRINT</p>
                      <p><b className="text-slate-300">SPACE</b> DASH</p>
                      <p><b className="text-slate-300">MOUSE</b> AIM / FIRE</p>
                      <p><b className="text-slate-300">R</b> RELOAD</p>
                      <p><b className="text-slate-300">1 / 2 / 3</b> WEAPON</p>
                    </div>
                  </div>
                </aside>

                <section className="min-w-0 flex-1 overflow-y-auto">
                  <div className="mx-auto grid min-h-full max-w-[1450px] gap-0 xl:grid-cols-[1fr_360px]">
                    <div className="relative flex min-h-full flex-col justify-center px-7 py-10 sm:px-12 xl:px-16">
                      <div className="absolute left-7 top-10 flex items-center gap-3 text-[9px] font-black tracking-[0.32em] text-slate-600 sm:left-12 xl:left-16">
                        <span className="h-px w-10 bg-cyan-400/50" />
                        MISSION CONTROL / HOME
                      </div>
                      <div className="max-w-4xl">
                        <p className="text-[11px] font-black tracking-[0.62em] text-cyan-300">CLASSIFIED // LIVE COMBAT SIMULATION</p>
                        <h1 className="mt-4 text-[clamp(3.4rem,8vw,7.8rem)] font-black leading-[0.82] tracking-[-0.055em] text-white drop-shadow-[0_0_45px_rgba(34,211,238,.12)]">
                          ARENA<br /><span className="text-cyan-300">STRIKE</span>
                        </h1>
                        <div className="mt-7 flex max-w-2xl items-start gap-4 border-l-2 border-cyan-400/60 pl-4">
                          <div className="h-2 w-2 shrink-0 bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,.8)]" />
                          <p className="text-sm leading-6 text-slate-400">TACTICAL SURVIVAL PLATFORM. Clear the operation zone, manage your loadout, survive escalating hostile waves and establish your position on the global combat record.</p>
                        </div>

                        <div className="mt-10 flex flex-wrap items-center gap-3">
                          <button type="button" onClick={openLevelSelect} className="group relative min-w-64 border border-cyan-300/70 bg-cyan-300 px-7 py-4 text-left text-xs font-black tracking-[0.24em] text-slate-950 shadow-[0_0_35px_rgba(34,211,238,.18)] transition hover:bg-cyan-200">
                            <span className="block text-[8px] tracking-[0.3em] opacity-60">PRIMARY ACTION</span>
                            <span className="mt-1 block">ENTER CAMPAIGN <span className="float-right text-lg">→</span></span>
                          </button>
                          <button type="button" onClick={() => { setShowMultiplayer(true); connectMultiplayer(); }} className="min-w-52 border border-violet-400/40 bg-violet-400/10 px-7 py-4 text-left text-xs font-black tracking-[0.24em] text-violet-200 transition hover:border-violet-300 hover:bg-violet-400/15">
                            <span className="block text-[8px] tracking-[0.3em] text-violet-400/70">ONLINE</span>
                            <span className="mt-1 block">OPEN FIRETEAM <span className="float-right text-lg">↗</span></span>
                          </button>
                        </div>

                        <div className="mt-10 grid max-w-4xl grid-cols-2 border-y border-white/10 sm:grid-cols-4">
                          <div className="border-r border-white/10 px-4 py-4 sm:px-5"><p className="text-[8px] font-black tracking-[0.25em] text-slate-600">RANK</p><p className="mt-1 text-2xl font-black text-white">{String(rank).padStart(2, "0")}</p></div>
                          <div className="border-r border-white/10 px-4 py-4 sm:px-5"><p className="text-[8px] font-black tracking-[0.25em] text-slate-600">XP</p><p className="mt-1 text-2xl font-black text-cyan-300">{xp.toLocaleString()}</p></div>
                          <div className="border-r border-white/10 px-4 py-4 sm:px-5"><p className="text-[8px] font-black tracking-[0.25em] text-slate-600">CREDITS</p><p className="mt-1 text-2xl font-black text-yellow-300">{credits.toLocaleString()}</p></div>
                          <div className="px-4 py-4 sm:px-5"><p className="text-[8px] font-black tracking-[0.25em] text-slate-600">CLEARED</p><p className="mt-1 text-2xl font-black text-emerald-300">{completedLevels.length}<span className="text-sm text-slate-600"> / 60</span></p></div>
                        </div>
                      </div>
                    </div>

                    <aside className="border-l border-white/10 bg-black/25 p-6 sm:p-8">
                      <div className="flex items-start justify-between">
                        <div><p className="text-[9px] font-black tracking-[0.35em] text-cyan-400">OPERATOR PROFILE</p><h2 className="mt-2 text-2xl font-black tracking-[0.12em]">FIELD ASSET</h2></div>
                        <div className="flex h-12 w-12 items-center justify-center border border-cyan-400/40 bg-cyan-400/10 text-lg font-black text-cyan-300">{rank}</div>
                      </div>
                      <div className="mt-8 border border-white/10 bg-slate-950/70 p-5">
                        <div className="flex items-end justify-between"><div><p className="text-[8px] font-black tracking-[0.28em] text-slate-600">RANK</p><p className="mt-1 text-4xl font-black">{String(rank).padStart(2, "0")}</p></div><p className="text-[9px] font-black tracking-widest text-cyan-400">ACTIVE</p></div>
                        <div className="mt-4 h-1 bg-white/10"><div className="h-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,.7)]" style={{ width: `${(getXpIntoRank(xp) / XP_PER_RANK) * 100}%` }} /></div>
                        <p className="mt-2 text-[9px] font-bold tracking-widest text-slate-500">{getXpIntoRank(xp)} / {XP_PER_RANK} XP TO NEXT RANK</p>
                      </div>

                      <div className="mt-5 border border-white/10 bg-slate-950/70 p-5">
                        <div className="flex items-center justify-between"><p className="text-[9px] font-black tracking-[0.3em] text-slate-600">ACTIVE LOADOUT</p><button type="button" onClick={openArmory} className="text-[9px] font-black tracking-widest text-yellow-300 hover:text-yellow-200">MODIFY →</button></div>
                        <p className="mt-4 text-3xl font-black uppercase tracking-tight text-white">{WEAPON_UNLOCK_INFO[loadoutWeapon].name}</p>
                        <p className="mt-1 text-xs text-slate-500">Primary combat platform</p>
                        <div className="mt-5 grid grid-cols-3 gap-1">
                          <div className="h-1 bg-cyan-400" /><div className="h-1 bg-cyan-400" /><div className="h-1 bg-white/10" />
                        </div>
                      </div>

                      <div className="mt-5 border border-white/10 bg-slate-950/70 p-5">
                        <div className="flex items-center justify-between"><p className="text-[9px] font-black tracking-[0.3em] text-slate-600">CAMPAIGN STATUS</p><span className="text-[9px] font-black text-emerald-400">{Math.round((completedLevels.length / 60) * 100)}%</span></div>
                        <div className="mt-5 grid grid-cols-6 gap-1">
                          {Array.from({ length: 30 }, (_, i) => <span key={i} className={`h-2 ${i < Math.ceil(completedLevels.length / 2) ? "bg-cyan-400" : "bg-white/10"}`} />)}
                        </div>
                        <div className="mt-5 flex items-center justify-between text-[9px] font-bold tracking-widest"><span className="text-slate-500">MISSIONS CLEARED</span><span className="text-white">{completedLevels.length} / 60</span></div>
                      </div>

                      <div className="mt-5 border border-white/10 bg-slate-950/70 p-5">
                        <p className="text-[9px] font-black tracking-[0.3em] text-slate-600">SYSTEM STATUS</p>
                        <div className="mt-4 space-y-3 text-[9px] font-bold tracking-widest">
                          <div className="flex justify-between"><span className="text-slate-500">COMBAT NETWORK</span><span className="text-emerald-400">READY</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">AUDIO LINK</span><span className={audioMuted ? "text-red-400" : "text-emerald-400"}>{audioMuted ? "MUTED" : "ONLINE"}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">FIRETEAM</span><span className={multiplayerConnected ? "text-emerald-400" : "text-slate-500"}>{multiplayerConnected ? "CONNECTED" : "STANDBY"}</span></div>
                        </div>
                      </div>
                    </aside>
                  </div>
                </section>
              </div>

              <footer className="flex min-h-9 shrink-0 items-center justify-between border-t border-white/10 bg-black/45 px-6 text-[8px] font-black tracking-[0.28em] text-slate-600">
                <span>ARENA STRIKE // TACTICAL SURVIVAL</span><span className="hidden sm:inline">ALL SYSTEMS NOMINAL · OPERATIONAL</span><span>SECURE</span>
              </footer>
            </div>
          </div>
        )}
      </div>

      {/* ==================================================
          MULTIPLAYER LOBBY
      ================================================== */}

      {showMultiplayer && (
        <div className="absolute inset-0 z-[80] overflow-hidden bg-[#02050a]/95 text-white backdrop-blur-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(139,92,246,.13),transparent_30%),linear-gradient(135deg,#02050a,#07101a)]" />
          <div className="absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:56px_56px]" />
          <div className="relative z-10 mx-auto flex h-full max-w-[1500px] flex-col border-x border-white/10 bg-black/20">
            <header className="flex min-h-16 items-center justify-between border-b border-white/10 px-6 sm:px-8">
              <div className="flex items-center gap-4"><div className="h-9 w-9 border border-violet-400/50 bg-violet-400/10 p-2 text-center text-[10px] font-black text-violet-300">02</div><div><p className="text-[9px] font-black tracking-[0.4em] text-violet-300">ONLINE OPERATIONS</p><h2 className="text-xl font-black tracking-[0.16em]">FIRETEAM COMMAND</h2></div></div>
              <button type="button" onClick={() => { setShowMultiplayer(false); disconnectMultiplayer(); }} className="border border-white/10 px-4 py-2 text-[9px] font-black tracking-widest text-slate-400 transition hover:border-white/30 hover:text-white">ESC / CLOSE</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
              <div className="mx-auto grid max-w-6xl gap-5 xl:grid-cols-[320px_1fr]">
                <section className="border border-white/10 bg-slate-950/75 p-5">
                  <div className="flex items-center justify-between"><p className="text-[9px] font-black tracking-[0.3em] text-slate-600">NETWORK</p><span className={`flex items-center gap-2 text-[9px] font-black tracking-widest ${multiplayerConnected ? "text-emerald-400" : "text-red-400"}`}><span className={`h-1.5 w-1.5 rounded-full ${multiplayerConnected ? "bg-emerald-400" : "bg-red-400"}`} />{multiplayerStatus.toUpperCase()}</span></div>
                  <label className="mt-6 block text-[9px] font-black tracking-[0.28em] text-slate-500">OPERATOR CALLSIGN</label>
                  <input value={multiplayerName} onChange={(e) => setMultiplayerName(e.target.value.slice(0, 18))} maxLength={18} placeholder="OPERATOR" className="mt-2 w-full border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none focus:border-violet-400/60" />
                  <button type="button" onClick={createMultiplayerRoom} className="mt-4 w-full border border-violet-300/60 bg-violet-400/15 px-4 py-3 text-[10px] font-black tracking-[0.2em] text-violet-200 transition hover:bg-violet-400/25">CREATE PRIVATE ROOM</button>
                  <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-white/10" /><span className="text-[8px] font-black text-slate-700">OR</span><span className="h-px flex-1 bg-white/10" /></div>
                  <div className="flex gap-2"><input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="ROOM CODE" className="min-w-0 flex-1 border border-white/10 bg-black/40 px-4 py-3 text-sm font-black tracking-[0.22em] text-white outline-none focus:border-cyan-400/60" /><button type="button" onClick={joinMultiplayerRoom} className="border border-cyan-400/30 bg-cyan-400/10 px-4 text-[9px] font-black tracking-widest text-cyan-300 hover:bg-cyan-400/20">JOIN</button></div>
                  <div className="mt-6 border-t border-white/10 pt-5"><p className="text-[9px] font-black tracking-[0.3em] text-slate-600">MISSION CHANNEL</p><div className="mt-3 flex items-center justify-between"><span className="text-xs font-bold text-slate-400">LEVEL</span><span className="text-xl font-black text-white">{String(selectedCampaignLevel).padStart(2, "0")}</span></div><p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-violet-300">{getCampaignLevel(selectedCampaignLevel)?.name ?? "MISSION"}</p></div>
                </section>

                <section className="border border-white/10 bg-slate-950/75 p-5 sm:p-7">
                  <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5"><div><p className="text-[9px] font-black tracking-[0.3em] text-slate-600">SQUAD ASSEMBLY</p><h3 className="mt-2 text-3xl font-black tracking-tight">{roomCode || "NO ACTIVE ROOM"}</h3></div>{roomCode && <div className="text-right"><p className="text-[8px] font-black tracking-[0.28em] text-slate-600">ROOM ACCESS</p><p className="mt-1 text-xs font-black tracking-[0.2em] text-violet-300">PRIVATE // {multiplayerPlayers.length}/4</p></div>}</div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {Array.from({ length: 4 }, (_, index) => { const player = multiplayerPlayers[index]; return <div key={player?.id ?? `slot-${index}`} className={`min-h-28 border p-4 ${player ? "border-white/15 bg-white/[0.025]" : "border-dashed border-white/10 bg-black/20"}`}><div className="flex items-start justify-between"><div className="flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center border text-xs font-black ${player ? "border-violet-400/40 bg-violet-400/10 text-violet-200" : "border-white/10 text-slate-700"}`}>{player ? player.name.slice(0, 1).toUpperCase() : "—"}</div><div>{player ? <><p className="text-sm font-black text-white">{player.name}</p><p className="mt-1 text-[8px] font-black tracking-[0.2em] text-slate-500">{player.host ? "FIRETEAM LEAD" : "FIELD OPERATOR"}</p></> : <><p className="text-sm font-black text-slate-600">EMPTY SLOT</p><p className="mt-1 text-[8px] font-black tracking-[0.2em] text-slate-700">AWAITING OPERATOR</p></>}</div></div>{player && <span className={`mt-1 h-2 w-2 rounded-full ${player.ready ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.7)]" : "bg-slate-700"}`} />}</div>{player && <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3"><span className="text-[8px] font-black tracking-widest text-slate-600">STATUS</span><span className={`text-[9px] font-black tracking-widest ${player.ready ? "text-emerald-400" : "text-slate-500"}`}>{player.ready ? "READY" : "STANDBY"}</span></div>}</div> })}
                  </div>
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5"><div className="text-[9px] font-bold tracking-widest text-slate-600">HOST CONTROLS · ALL OPERATORS SHOULD READY BEFORE DEPLOYMENT</div>{roomCode && <div className="flex gap-2"><button type="button" onClick={toggleMultiplayerReady} className={`border px-5 py-3 text-[9px] font-black tracking-widest ${multiplayerReady ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-white/15 bg-white/5 text-white hover:bg-white/10"}`}>{multiplayerReady ? "READY ✓" : "SET READY"}</button>{isMultiplayerHost && <button type="button" onClick={startMultiplayerMatch} className="border border-cyan-300/70 bg-cyan-300 px-6 py-3 text-[9px] font-black tracking-widest text-slate-950 hover:bg-cyan-200">DEPLOY FIRETEAM →</button>}</div>}</div>
                </section>
              </div>
            </div>
            <footer className="border-t border-white/10 px-6 py-3 text-[8px] font-black tracking-[0.28em] text-slate-600">REAL-TIME COMBAT NETWORK · 4 OPERATORS MAX · HOST-AUTHORITATIVE WORLD</footer>
          </div>
        </div>
      )}

      {/* ==================================================
          GAME HUD
      ================================================== */}

      {gameState !== "menu" && (
        <>
          {multiplayerMatchRef.current && playerDownedRef.current && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-[55] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 border border-red-400/40 bg-[#080b10]/92 p-5 text-center shadow-[0_0_60px_rgba(239,68,68,.12)] backdrop-blur-xl">
              <p className="text-[9px] font-black tracking-[0.42em] text-red-400">FIRETEAM CASUALTY</p>
              <p className="mt-2 text-3xl font-black tracking-[0.08em] text-white">OPERATOR DOWN</p>
              <div className="mt-4 h-1 bg-white/10"><div className="h-full bg-red-400" style={{ width: `${(1 - reviveProgress) * 100}%` }} /></div>
              <p className="mt-3 text-[9px] font-black tracking-[0.22em] text-slate-400">AUTO-RESPAWN WINDOW · {Math.max(0, Math.ceil((reviveDeadlineRef.current - performance.now()) / 1000))} SEC</p>
              <p className="mt-2 text-[10px] font-black tracking-[0.18em] text-cyan-300">A SQUADMATE CAN REVIVE YOU BEFORE THE TIMER EXPIRES</p>
            </div>
          )}

          {/* Mission identity rail */}
          <div
            className="pointer-events-none absolute left-5 top-5 z-20 w-[min(22rem,calc(100vw-2.5rem))] border border-cyan-400/20 bg-[#050b14]/88 shadow-[0_18px_55px_rgba(0,0,0,.42)] backdrop-blur-xl"
          >
            <div className="border-l-2 border-cyan-300 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-black tracking-[0.42em] text-cyan-300">
                    ARENA STRIKE // LIVE OPS
                  </p>
                  <p className="mt-1 text-lg font-black tracking-[0.08em] text-white">
                    LEVEL {selectedCampaignLevel} · {getCampaignLevel(selectedCampaignLevel)?.name ?? "SURVIVAL ARENA"}
                  </p>
                </div>
                <span className="shrink-0 border border-cyan-400/25 bg-cyan-400/5 px-2 py-1 text-[8px] font-black tracking-[0.18em] text-cyan-300">
                  LIVE
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-2 text-[9px] font-black tracking-[0.2em]">
                <span className="text-slate-500">MAP {getMapForLevel(selectedCampaignLevel).id}</span>
                <span className="text-slate-300">{getMapForLevel(selectedCampaignLevel).name.toUpperCase()}</span>
              </div>
              {roomCode && (
                <p className="mt-2 text-[8px] font-black tracking-[0.2em] text-emerald-400">
                  FIRETEAM LINK · {remoteOperators.length + 1} OPERATORS
                </p>
              )}
            </div>
          </div>

          {multiplayerMatchRef.current && !playerDownedRef.current && (() => {
            const nearby = remoteOperatorsRef.current
              .filter((operator) => operator.downed && (operator.lives ?? 0) > 0)
              .map((operator) => ({ operator, distance: 0 }))
              .sort((a, b) => a.distance - b.distance)[0]?.operator;
            return nearby ? (
              <div className="pointer-events-none absolute bottom-28 left-1/2 z-30 -translate-x-1/2 border border-cyan-300/35 bg-[#050b14]/92 px-5 py-3 text-center shadow-[0_0_35px_rgba(34,211,238,.1)] backdrop-blur-xl">
                <p className="text-[9px] font-black tracking-[0.28em] text-cyan-300">SQUADMATE DOWN · {nearby.name.toUpperCase()}</p>
                <p className="mt-1 text-[8px] font-bold tracking-[0.2em] text-slate-400">MOVE INTO RANGE · PRESS F TO REVIVE</p>
              </div>
            ) : null;
          })()}

          {/* Step 39 // Mission status strip */}
          {gameState === "playing" && (
            <div className="pointer-events-none absolute left-1/2 top-[5.1rem] z-30 w-[min(30rem,calc(100vw-3rem))] -translate-x-1/2">
              <div className="border border-white/10 bg-[#050b14]/78 px-4 py-2 shadow-[0_14px_45px_rgba(0,0,0,.25)] backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-[7px] font-black tracking-[0.34em] text-slate-500">
                      CAMPAIGN {selectedCampaignLevel.toString().padStart(2, "0")} // {getCampaignLevel(selectedCampaignLevel)?.name?.toUpperCase() ?? "MISSION"}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[8px] font-black tracking-[0.18em] text-cyan-300">
                        WAVE {currentWave}/{Math.max(1, getCampaignLevel(selectedCampaignLevel)?.waveCount ?? 1)}
                      </span>
                      <span className="h-1 w-1 bg-slate-700" />
                      <span className="text-[8px] font-black tracking-[0.16em] text-slate-400">
                        {getMapForLevel(selectedCampaignLevel).name.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-[7px] font-black tracking-[0.24em] text-slate-600">CAMPAIGN CLEARANCE</p>
                    <p className="mt-1 text-[10px] font-black tabular-nums text-slate-200">{campaignCompletionPercent}%</p>
                  </div>
                </div>

                <div className="mt-2 h-px bg-white/7">
                  <div
                    className="h-full bg-cyan-300/60 transition-all duration-500"
                    style={{ width: `${campaignCompletionPercent}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 38 // Fireteam command board */}
          {multiplayerMatchRef.current && remoteOperators.length > 0 && (
            <div className="pointer-events-none absolute bottom-5 left-5 z-30 w-[min(19rem,calc(100vw-2.5rem))] border border-cyan-400/15 bg-[#050b14]/90 shadow-[0_18px_55px_rgba(0,0,0,.38)] backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
                <div>
                  <p className="text-[7px] font-black tracking-[0.34em] text-cyan-300">FIRETEAM COMMAND</p>
                  <p className="mt-0.5 text-[8px] font-bold tracking-[0.16em] text-slate-600">
                    {remoteOperators.length + 1} OPERATORS LINKED
                  </p>
                </div>
                <span className="h-1.5 w-1.5 bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,.9)]" />
              </div>

              <div className="divide-y divide-white/5">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2">
                  <div>
                    <p className="text-[8px] font-black tracking-[0.18em] text-white">YOU</p>
                    <p className="mt-0.5 text-[7px] font-bold tracking-[0.14em] text-slate-600">LOCAL OPERATOR</p>
                  </div>
                  <span className="text-[8px] font-black text-cyan-300">{Math.max(0, Math.round(health))}%</span>
                  <span className="text-[7px] font-black tracking-widest text-emerald-400">ACTIVE</span>
                </div>

                {remoteOperators.map((operator) => {
                  const operatorDistance = Math.round(
                    Math.hypot(operator.x - playerPosition.x, operator.y - playerPosition.y)
                  );
                  const bearing = getSquadBearing(
                    playerPosition.x,
                    playerPosition.y,
                    operator.x,
                    operator.y
                  );
                  const operatorHealth = Math.max(
                    0,
                    Math.min(
                      100,
                      Math.round(
                        ((operator.health ?? 0) / Math.max(1, operator.maxHealth ?? 100)) * 100
                      )
                    )
                  );
                  const isDowned = Boolean(operator.downed);
                  const hasLives = (operator.lives ?? 0) > 0;

                  return (
                    <div
                      key={operator.id}
                      className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5 ${isDowned ? "bg-orange-400/[0.035]" : ""
                        }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 shrink-0 ${isDowned ? "bg-orange-400" : "bg-cyan-300"}`} />
                          <p className={`truncate text-[8px] font-black tracking-[0.16em] ${isDowned ? "text-orange-300" : "text-slate-200"}`}>
                            {operator.name.toUpperCase()}
                          </p>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1 w-16 bg-white/8">
                            <div
                              className={`h-full ${isDowned ? "bg-orange-400" : operatorHealth <= 30 ? "bg-red-400" : "bg-cyan-300"}`}
                              style={{ width: `${operatorHealth}%` }}
                            />
                          </div>
                          <span className="text-[7px] font-black tabular-nums text-slate-500">
                            {operatorHealth}%
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className={`text-[8px] font-black tabular-nums ${isDowned ? "text-orange-300" : "text-slate-300"}`}>
                          {operatorDistance}M
                        </p>
                        <p className="text-[6px] font-black tracking-widest text-slate-600">
                          {bearing.cardinal}
                        </p>
                      </div>

                      <div className="min-w-[3.4rem] text-right">
                        {isDowned ? (
                          <p className="text-[7px] font-black tracking-[0.16em] text-orange-300">
                            {hasLives ? "DOWNED" : "OUT"}
                          </p>
                        ) : (
                          <p className="text-[7px] font-black tracking-[0.16em] text-emerald-400">
                            READY
                          </p>
                        )}
                        <p className="mt-0.5 text-[6px] font-black tracking-widest text-slate-600">
                          {Math.max(0, operator.lives ?? 0)} LIVES
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {remoteOperators.some((operator) => operator.downed && (operator.lives ?? 0) > 0) && (
                <div className="border-t border-orange-400/10 bg-orange-400/[0.035] px-4 py-2 text-[7px] font-black tracking-[0.2em] text-orange-300">
                  PRIORITY CASUALTY · F REVIVE WHEN IN RANGE
                </div>
              )}
            </div>
          )}

          {/* Central wave telemetry */}
          <div
            className="pointer-events-none absolute left-1/2 top-5 z-20 w-36 -translate-x-1/2 border border-white/10 bg-[#050b14]/88 px-4 py-3 text-center shadow-[0_18px_55px_rgba(0,0,0,.35)] backdrop-blur-xl"
          >
            <p className="text-[8px] font-black tracking-[0.35em] text-slate-500">WAVE</p>
            <p className="mt-0.5 text-3xl font-black leading-none text-white">
              {String(currentWave).padStart(2, "0")}
            </p>
            <div className="mt-2 flex items-center justify-center gap-2 text-[8px] font-black tracking-[0.16em]">
              <span className="h-1.5 w-1.5 bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,.8)]" />
              <span className="text-slate-400">{enemiesRemaining} HOSTILES</span>
            </div>
          </div>

          {/* Right combat rail: score / progression / weapon. */}
          <div
            className="pointer-events-none absolute right-5 top-5 z-20 w-[min(19rem,calc(100vw-2.5rem))] border border-white/10 bg-[#050b14]/90 shadow-[0_18px_55px_rgba(0,0,0,.42)] backdrop-blur-xl"
          >
            <div className="grid grid-cols-2 border-b border-white/10">
              <div className="border-r border-white/10 px-4 py-3">
                <p className="text-[8px] font-black tracking-[0.28em] text-slate-500">SCORE</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-white">{score.toLocaleString()}</p>
              </div>
              <div className="px-4 py-3 text-right">
                <p className="text-[8px] font-black tracking-[0.28em] text-slate-500">RANK</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-cyan-300">{String(rank).padStart(2, "0")}</p>
              </div>
            </div>

            <div className="border-b border-white/10 px-4 py-3">
              <div className="flex items-center justify-between text-[8px] font-black tracking-[0.2em]">
                <span className="text-slate-600">RANK PROGRESS</span>
                <span className="text-slate-400">{getXpIntoRank(xp)} / {XP_PER_RANK} XP</span>
              </div>
              <div className="mt-2 h-1 bg-white/8">
                <div
                  className="h-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,.45)] transition-all"
                  style={{ width: `${Math.min(100, (getXpIntoRank(xp) / XP_PER_RANK) * 100)}%` }}
                />
              </div>
            </div>

            <div className="flex items-end justify-between px-4 py-3">
              <div>
                <p className="text-[8px] font-black tracking-[0.28em] text-yellow-400/80">WEAPON SYSTEM</p>
                <p className="mt-1 text-xl font-black uppercase tracking-[0.08em] text-white">
                  {WEAPONS[currentWeapon].name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black tabular-nums text-white">
                  {ammoDisplay}
                  <span className="text-sm text-slate-500"> / {WEAPONS[currentWeapon].magazineSize}</span>
                </p>
                {reloadingDisplay ? (
                  <p className="text-[8px] font-black tracking-[0.18em] text-yellow-300">RELOADING</p>
                ) : (
                  <p className="text-[8px] font-black tracking-[0.18em] text-slate-600">1 / 2 / 3 SELECT</p>
                )}
              </div>
            </div>
          </div>

          {/* Player survivability */}
          <div
            className="pointer-events-none absolute left-5 top-[9.4rem] z-20 w-[min(18rem,calc(100vw-2.5rem))] border border-white/10 bg-[#050b14]/88 shadow-[0_18px_55px_rgba(0,0,0,.38)] backdrop-blur-xl"
          >
            <div className="px-4 py-3">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[8px] font-black tracking-[0.3em] text-slate-500">OPERATOR CONDITION</p>
                  <p className="mt-1 text-xl font-black text-white">{Math.max(0, Math.floor(health))}<span className="ml-1 text-xs text-slate-600">/ 100</span></p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black tracking-[0.25em] text-slate-600">LIVES</p>
                  <p className="mt-1 text-sm font-black tracking-[0.18em] text-white">
                    {"●".repeat(lives)}<span className="text-slate-700">{"○".repeat(Math.max(0, 3 - lives))}</span>
                  </p>
                </div>
              </div>
              <div className="mt-2 h-1.5 bg-white/8">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.max(0, Math.min(100, health))}%`,
                    background: health > 50 ? "#22c55e" : health > 25 ? "#facc15" : "#ef4444",
                    boxShadow: health > 25 ? "0 0 10px rgba(34,197,94,.35)" : "0 0 10px rgba(239,68,68,.45)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Step 35 // Tactical threat telemetry */}
          <div className="pointer-events-none absolute left-5 top-[12.1rem] z-20 w-[min(18rem,calc(100vw-2.5rem))] border border-red-400/15 bg-[#050b14]/82 shadow-[0_18px_55px_rgba(0,0,0,.28)] backdrop-blur-xl">
            <div className="border-l-2 border-red-400/65 px-4 py-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[7px] font-black tracking-[0.34em] text-red-300">TACTICAL TELEMETRY</p>
                <span className={`text-[8px] font-black tracking-widest ${threatLevel >= 70 ? "text-red-300" : threatLevel >= 35 ? "text-amber-300" : "text-emerald-300"}`}>
                  {threatLevel >= 70 ? "CRITICAL" : threatLevel >= 35 ? "ELEVATED" : "STABLE"}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-1.5 flex-1 bg-white/8"><div className={`h-full transition-all ${threatLevel >= 70 ? "bg-red-400" : threatLevel >= 35 ? "bg-amber-300" : "bg-emerald-400"}`} style={{ width: `${threatLevel}%` }} /></div>
                <span className="w-8 text-right text-[8px] font-black text-slate-300">{threatLevel}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[7px] font-black tracking-[0.2em] text-slate-600">
                <span>HOSTILES IN PROXIMITY</span><span className="text-slate-300">{nearbyHostiles}</span>
              </div>
            </div>
          </div>

          {/* Mission objective */}
          <div
            className="pointer-events-none absolute left-5 top-[17.4rem] z-20 w-[min(18rem,calc(100vw-2.5rem))] border border-cyan-400/15 bg-[#050b14]/88 shadow-[0_18px_55px_rgba(0,0,0,.38)] backdrop-blur-xl"
          >
            <div className="border-l-2 border-cyan-400/70 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-[8px] font-black tracking-[0.32em] text-cyan-300">MISSION OBJECTIVE</p>
                <span className="text-[8px] font-black text-slate-500">
                  {Math.round(
                    (objectiveProgress /
                      Math.max(1, getObjectiveInfo(getCampaignLevel(selectedCampaignLevel)).target)) *
                    100
                  )}%
                </span>
              </div>
              <p className="mt-2 text-sm font-black uppercase tracking-[0.12em] text-white">
                {getObjectiveInfo(getCampaignLevel(selectedCampaignLevel)).type}
              </p>
              <div className="mt-2 h-1 bg-white/8">
                <div
                  className="h-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,.35)] transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      (objectiveProgress /
                        Math.max(1, getObjectiveInfo(getCampaignLevel(selectedCampaignLevel)).target)) *
                      100
                    )}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[8px] font-black tracking-[0.2em]">
                <span className="text-slate-600">PROGRESS</span>
                <span className="text-slate-300">
                  {objectiveProgress} / {getObjectiveInfo(getCampaignLevel(selectedCampaignLevel)).target}
                </span>
              </div>
            </div>
          </div>

          {/* Kill feed */}
          <div
            className="pointer-events-none absolute right-5 top-[15.8rem] z-20 w-[min(19rem,calc(100vw-2.5rem))] space-y-1.5"
          >
            {killFeed.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border-l-2 border-red-400/70 bg-[#050b14]/88 px-3 py-2 shadow-lg backdrop-blur-xl"
              >
                <span className="text-[8px] font-black tracking-[0.18em] text-red-200">
                  ELIMINATED {item.enemy.toUpperCase()}
                </span>
                <span className="text-[9px] font-black text-yellow-300">+{item.score}</span>
              </div>
            ))}
          </div>

          {/* Active power-up */}
          {activePowerUp && (
            <div className="pointer-events-none absolute bottom-16 left-1/2 z-20 -translate-x-1/2 border border-fuchsia-400/30 bg-[#050b14]/90 px-5 py-2.5 text-center shadow-[0_0_30px_rgba(168,85,247,.12)] backdrop-blur-xl">
              <p className="text-[7px] font-black tracking-[0.35em] text-fuchsia-300">ACTIVE BOOST</p>
              <p className="mt-0.5 text-xs font-black tracking-[0.18em] text-white">
                {POWERUP_CONFIG[activePowerUp].label}
              </p>
            </div>
          )}

          {/* Compact controls strip */}
          <div
            className="pointer-events-none absolute bottom-4 left-5 z-20 border border-white/8 bg-[#050b14]/72 px-3 py-2 shadow-lg backdrop-blur-md"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[8px] font-black tracking-[0.16em] text-slate-500">
              <span><b className="text-slate-300">WASD</b> MOVE</span>
              <span><b className="text-slate-300">SHIFT</b> SPRINT</span>
              <span><b className="text-slate-300">SPACE</b> DASH</span>
              <span><b className="text-slate-300">R</b> RELOAD</span>
              <span><b className="text-slate-300">P / ESC</b> PAUSE</span>
            </div>
          </div>

          {/* Audio status */}
          <div
            className="pointer-events-none absolute bottom-4 right-5 z-20 border border-white/8 bg-[#050b14]/72 px-3 py-2 text-right shadow-lg backdrop-blur-md"
          >
            <p className="text-[7px] font-black tracking-[0.3em] text-slate-600">AUDIO LINK</p>
            <p className={`mt-0.5 text-[9px] font-black tracking-[0.16em] ${audioMuted ? "text-red-300" : "text-emerald-300"}`}>
              {audioMuted ? "MUTED" : "ONLINE"} · M TOGGLE
            </p>
          </div>

          {/* Damage direction indicator */}
          {lastHitDirection && damageFlash && (
            <div
              className={[
                "pointer-events-none absolute z-30 flex items-center justify-center",
                lastHitDirection === "front"
                  ? "left-1/2 top-24 -translate-x-1/2"
                  : lastHitDirection === "back"
                    ? "bottom-28 left-1/2 -translate-x-1/2"
                    : lastHitDirection === "left"
                      ? "left-8 top-1/2 -translate-y-1/2"
                      : "right-8 top-1/2 -translate-y-1/2",
              ].join(" ")}
            >
              <div className="text-3xl font-black text-red-400 drop-shadow-[0_0_14px_rgba(248,113,113,.9)]">
                {lastHitDirection === "front"
                  ? "▼"
                  : lastHitDirection === "back"
                    ? "▲"
                    : lastHitDirection === "left"
                      ? "◀"
                      : "▶"}
              </div>
            </div>
          )}
        </>
      )}

      {damageFlash && (
        <div className="pointer-events-none absolute inset-0 z-[25] border-[3px] border-red-500/70 shadow-[inset_0_0_80px_rgba(239,68,68,0.22)]" />
      )}

      {/* ==================================================
          PAUSE MENU
      ================================================== */}

      {gameState ===
        "paused" && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/82 backdrop-blur-md">
            <div className="text-center">
              <p className="text-sm font-bold tracking-[0.4em] text-cyan-400">
                ARENA STRIKE
              </p>

              <h2 className="mt-3 text-6xl font-black tracking-widest text-white">
                PAUSED
              </h2>

              <p className="mt-5 text-slate-400">
                Press P or Esc to resume
              </p>

              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent(
                      "arena-resume-game"
                    )
                  )
                }
                className="mt-8 rounded-xl bg-cyan-500 px-8 py-3 text-sm font-black tracking-widest text-slate-950 transition hover:bg-cyan-300"
              >
                RESUME
              </button>
            </div>
          </div>
        )}

      {/* ==================================================
          RESPAWN TRANSITION
      ================================================== */}

      {isRespawning && (
        <div className="pointer-events-none absolute inset-0 z-[70] flex items-center justify-center bg-slate-950/65 backdrop-blur-[3px]">
          <div className="w-full max-w-md px-6 text-center">
            <p className="text-xs font-black tracking-[0.45em] text-red-400">
              OPERATOR DOWN
            </p>

            <h2 className="mt-3 text-5xl font-black tracking-[0.12em] text-white">
              RESPAWNING
            </h2>

            <div className="mx-auto mt-6 h-1.5 w-64 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-full origin-left animate-pulse rounded-full bg-cyan-400" />
            </div>

            <p className="mt-5 text-sm font-bold tracking-widest text-slate-300">
              LIFE {lives} / 3&nbsp;&nbsp; • &nbsp;&nbsp;WAVE {respawnWave}
            </p>

            <p className="mt-2 text-xs tracking-widest text-slate-500">
              POSITION RECOVERED · CONTINUE MISSION
            </p>
          </div>
        </div>
      )}

      {/* ==================================================
          GAME OVER
      ================================================== */}

      {gameState ===
        "gameOver" && (
          <div className="absolute inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-[#02050a]/92 p-5 backdrop-blur-xl">
            <div className="relative w-full max-w-3xl overflow-hidden border border-red-400/20 bg-slate-950/95 shadow-[0_0_100px_rgba(239,68,68,0.10)]">
              <div className="absolute inset-x-0 top-0 h-px bg-red-400/70" />
              <div className="absolute right-0 top-0 h-40 w-40 bg-red-500/5 blur-3xl" />
              <div className="relative grid lg:grid-cols-[1.15fr_.85fr]">
                <section className="border-b border-white/10 p-7 sm:p-10 lg:border-b-0 lg:border-r">
                  <div className="flex items-center gap-3 text-red-400">
                    <span className="h-2 w-2 bg-red-400 shadow-[0_0_12px_rgba(248,113,113,.8)]" />
                    <p className="text-[9px] font-black tracking-[0.38em]">MISSION STATUS // CRITICAL FAILURE</p>
                  </div>
                  <h2 className="mt-5 text-5xl font-black tracking-[-0.04em] text-white sm:text-7xl">MISSION<br />FAILED</h2>
                  <p className="mt-4 max-w-md text-sm leading-6 text-slate-500">All operator lives exhausted. The mission can be redeployed without losing your campaign progression.</p>
                  <div className="mt-8 grid grid-cols-2 gap-px border border-white/10 bg-white/10">
                    <div className="bg-slate-950 p-5"><p className="text-[8px] font-black tracking-[0.28em] text-slate-600">MISSION</p><p className="mt-2 text-xl font-black text-white">LEVEL {selectedCampaignLevel}</p><p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">{getCampaignLevel(selectedCampaignLevel)?.name ?? "Arena Mission"}</p></div>
                    <div className="bg-slate-950 p-5"><p className="text-[8px] font-black tracking-[0.28em] text-slate-600">WAVE REACHED</p><p className="mt-2 text-3xl font-black text-white">{currentWave}</p><p className="mt-1 text-[9px] font-bold tracking-widest text-slate-500">OPERATION TERMINATED</p></div>
                    <div className="bg-slate-950 p-5"><p className="text-[8px] font-black tracking-[0.28em] text-slate-600">FINAL SCORE</p><p className="mt-2 text-3xl font-black text-white">{score.toLocaleString()}</p></div>
                    <div className="bg-slate-950 p-5"><p className="text-[8px] font-black tracking-[0.28em] text-slate-600">LIVES</p><p className="mt-2 text-3xl font-black text-red-300">0 / 3</p></div>
                  </div>
                </section>
                <section className="flex flex-col justify-between p-7 sm:p-10">
                  <div>
                    <p className="text-[8px] font-black tracking-[0.32em] text-slate-600">AVAILABLE ACTIONS</p>
                    <div className="mt-5 space-y-2">
                      <button type="button" onClick={() => requestCampaignLevelStart(selectedCampaignLevel)} className="group w-full border border-cyan-400/40 bg-cyan-400/10 px-5 py-4 text-left transition hover:border-cyan-300 hover:bg-cyan-400/15"><div className="flex items-center justify-between"><span className="text-xs font-black tracking-[0.2em] text-cyan-300">REDEPLOY MISSION</span><span className="text-lg text-cyan-300 transition group-hover:translate-x-1">→</span></div><p className="mt-1 text-[9px] text-slate-500">Retry Level {selectedCampaignLevel} from the beginning.</p></button>
                      <button type="button" onClick={openLevelSelect} className="group w-full border border-white/10 bg-white/[0.03] px-5 py-4 text-left transition hover:border-white/25 hover:bg-white/5"><div className="flex items-center justify-between"><span className="text-xs font-black tracking-[0.2em] text-white">CAMPAIGN MAP</span><span className="text-lg text-slate-500 transition group-hover:translate-x-1">→</span></div><p className="mt-1 text-[9px] text-slate-500">Select another unlocked operation.</p></button>
                    </div>
                  </div>
                  <div className="mt-8 border-t border-white/10 pt-5"><p className="text-[8px] font-black tracking-[0.28em] text-slate-600">PROGRESSION PRESERVED</p><p className="mt-2 text-xs font-bold text-slate-400">Your unlocked weapons, upgrades, XP and completed missions remain intact.</p></div>
                </section>
              </div>
            </div>
          </div>
        )}

      {/* ==================================================
          LEVEL COMPLETE
      ================================================== */}

      {levelComplete && (() => {
        const mission = getCampaignLevel(selectedCampaignLevel);
        const map = getMapForLevel(selectedCampaignLevel);
        const isFinalMission = selectedCampaignLevel >= 60;
        const nextLevel = Math.min(60, selectedCampaignLevel + 1);

        return (
          <div className="absolute inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-[#02050a]/94 p-4 sm:p-6 backdrop-blur-xl">
            <div className="relative w-full max-w-5xl overflow-hidden border border-cyan-400/20 bg-slate-950/96 shadow-[0_0_120px_rgba(34,211,238,0.10)]">
              <div className="absolute inset-x-0 top-0 h-px bg-cyan-300/80" />
              <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-cyan-400/5 blur-3xl" />
              <header className="relative flex flex-col gap-4 border-b border-white/10 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
                <div>
                  <div className="flex items-center gap-3"><span className="h-2 w-2 bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,.9)]" /><p className="text-[9px] font-black tracking-[0.42em] text-cyan-300">AFTER ACTION REPORT // VERIFIED</p></div>
                  <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] text-white sm:text-6xl">MISSION COMPLETE</h2>
                  <p className="mt-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">LEVEL {selectedCampaignLevel} · {mission?.name ?? "Arena Mission"} · {map?.name ?? "Arena"}</p>
                </div>
                <div className="border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-right"><p className="text-[8px] font-black tracking-[0.3em] text-emerald-400">OPERATION STATUS</p><p className="mt-1 text-sm font-black tracking-widest text-white">OBJECTIVE SECURED</p></div>
              </header>

              <div className="relative grid lg:grid-cols-[1fr_1.35fr]">
                <aside className="border-b border-white/10 p-6 sm:p-8 lg:border-b-0 lg:border-r">
                  <p className="text-[8px] font-black tracking-[0.32em] text-slate-600">MISSION GRADE</p>
                  <div className="mt-4 flex items-center gap-2">
                    {[1, 2, 3].map((star) => <span key={star} className={`text-4xl ${star <= levelResultStars ? "text-yellow-300 drop-shadow-[0_0_12px_rgba(253,224,71,.35)]" : "text-slate-800"}`}>★</span>)}
                  </div>
                  <p className="mt-2 text-xs font-bold tracking-widest text-slate-500">{levelResultStars === 3 ? "EXCEPTIONAL PERFORMANCE" : levelResultStars === 2 ? "SOLID FIELD PERFORMANCE" : "MISSION ACCOMPLISHED"}</p>
                  <div className="mt-8 space-y-3">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3"><span className="text-[9px] font-black tracking-widest text-slate-600">SCORE</span><span className="text-lg font-black text-white">{score.toLocaleString()}</span></div>
                    <div className="flex items-center justify-between border-b border-white/10 pb-3"><span className="text-[9px] font-black tracking-widest text-slate-600">LIVES REMAINING</span><span className="text-lg font-black text-white">{lives} / 3</span></div>
                    <div className="flex items-center justify-between border-b border-white/10 pb-3"><span className="text-[9px] font-black tracking-widest text-slate-600">WAVES CLEARED</span><span className="text-lg font-black text-white">{getLevelWaveCount(selectedCampaignLevel)}</span></div>
                    <div className="flex items-center justify-between"><span className="text-[9px] font-black tracking-widest text-slate-600">DIFFICULTY</span><span className="text-[10px] font-black uppercase tracking-widest text-cyan-300">{mission?.difficulty ?? "Easy"}</span></div>
                  </div>
                </aside>

                <section className="p-6 sm:p-8">
                  <div className="flex items-end justify-between border-b border-white/10 pb-4"><div><p className="text-[8px] font-black tracking-[0.32em] text-slate-600">COMBAT PAYLOAD</p><h3 className="mt-2 text-2xl font-black text-white">REWARDS & PROGRESSION</h3></div><span className="text-[9px] font-black tracking-widest text-slate-500">AUTO-SAVED</span></div>
                  {rewardSummary && <div className="mt-5 grid grid-cols-3 gap-px border border-white/10 bg-white/10">
                    <div className="bg-slate-950 p-5"><p className="text-[8px] font-black tracking-widest text-slate-600">XP EARNED</p><p className="mt-2 text-2xl font-black text-cyan-300">+{rewardSummary.xp}</p><p className="mt-1 text-[9px] text-slate-600">OPERATOR EXPERIENCE</p></div>
                    <div className="bg-slate-950 p-5"><p className="text-[8px] font-black tracking-widest text-slate-600">CREDITS</p><p className="mt-2 text-2xl font-black text-yellow-300">+{rewardSummary.credits}</p><p className="mt-1 text-[9px] text-slate-600">EQUIPMENT FUND</p></div>
                    <div className="bg-slate-950 p-5"><p className="text-[8px] font-black tracking-widest text-slate-600">CURRENT RANK</p><p className="mt-2 text-2xl font-black text-white">{rewardSummary.newRank}</p><p className="mt-1 text-[9px] text-slate-600">OPERATOR STATUS</p></div>
                  </div>}
                  {rewardSummary?.rankUp && <div className="mt-4 flex items-center justify-between border border-yellow-400/20 bg-yellow-400/5 p-4"><div><p className="text-[8px] font-black tracking-[0.3em] text-yellow-300">PROMOTION CONFIRMED</p><p className="mt-1 text-sm font-black text-white">RANK {rewardSummary.newRank} ACHIEVED</p></div>{rewardSummary.unlock && <span className="border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-[8px] font-black tracking-widest text-cyan-300">UNLOCKED · {rewardSummary.unlock}</span>}</div>}

                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => { setLevelComplete(false); openLevelSelect(); }} className="border border-white/10 bg-white/[0.03] px-5 py-4 text-left transition hover:border-white/25 hover:bg-white/5"><p className="text-[9px] font-black tracking-[0.22em] text-white">CAMPAIGN MAP</p><p className="mt-1 text-[9px] text-slate-500">Review progression and select an operation.</p></button>
                    {!isFinalMission ? <button type="button" onClick={() => requestCampaignLevelStart(nextLevel)} className="border border-cyan-400/40 bg-cyan-400/10 px-5 py-4 text-left transition hover:border-cyan-300 hover:bg-cyan-400/15"><div className="flex items-center justify-between"><p className="text-[9px] font-black tracking-[0.22em] text-cyan-300">NEXT MISSION · LEVEL {nextLevel}</p><span className="text-lg text-cyan-300">→</span></div><p className="mt-1 text-[9px] text-slate-500">Proceed directly to the next unlocked operation.</p></button> : <button type="button" onClick={() => { setLevelComplete(false); openLevelSelect(); }} className="border border-yellow-400/30 bg-yellow-400/10 px-5 py-4 text-left transition hover:border-yellow-300 hover:bg-yellow-400/15"><p className="text-[9px] font-black tracking-[0.22em] text-yellow-300">CAMPAIGN COMPLETE</p><p className="mt-1 text-[9px] text-slate-500">All 60 missions have been cleared. Review the campaign map.</p></button>}
                  </div>
                </section>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==================================================
          STEP 29 // SQUAD AFTER-ACTION REPORT
      ================================================== */}

      {showSquadResults && squadResults && (
        <div className="absolute inset-0 z-[97] overflow-hidden bg-[#02050a]/96 text-white backdrop-blur-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_15%,rgba(34,211,238,.12),transparent_28%),linear-gradient(135deg,#02050a,#07111b)]" />
          <div className="relative z-10 mx-auto flex h-full max-w-[1180px] flex-col border-x border-white/10">
            <header className="flex min-h-16 items-center justify-between border-b border-white/10 px-6 sm:px-8">
              <div><p className="text-[9px] font-black tracking-[0.42em] text-cyan-400">NETWORK // AFTER ACTION</p><h2 className="text-xl font-black tracking-[0.16em]">SQUAD MISSION REPORT</h2></div>
              <button type="button" onClick={() => setShowSquadResults(false)} className="border border-white/10 px-4 py-2 text-[9px] font-black tracking-widest text-slate-400 hover:border-white/30 hover:text-white">CLOSE REPORT</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
              <div className="grid gap-px border border-white/10 bg-white/10 lg:grid-cols-[1.35fr_.65fr]">
                <section className="bg-slate-950 p-6 sm:p-8">
                  <div className="flex items-start justify-between gap-5"><div><p className={`text-[9px] font-black tracking-[0.35em] ${squadResults.completed ? "text-cyan-400" : "text-red-400"}`}>{squadResults.completed ? "MISSION SECURED" : "MISSION FAILED"}</p><h3 className="mt-3 text-4xl font-black tracking-tight">{squadResults.completed ? "FIRETEAM EXTRACTION SUCCESSFUL" : "FIRETEAM ELIMINATED"}</h3><p className="mt-2 text-[9px] font-black tracking-[0.2em] text-slate-500">MISSION {squadResults.level} · {squadResults.mapName || "TACTICAL SECTOR"}</p></div><div className="text-right"><p className="text-[8px] font-black tracking-widest text-slate-600">SQUAD SCORE</p><p className="mt-1 text-3xl font-black text-cyan-300">{Number(squadResults.score || 0).toLocaleString()}</p></div></div>
                  <div className="mt-7 grid grid-cols-2 gap-px border border-white/10 bg-white/10 sm:grid-cols-4"><div className="bg-slate-950 p-4"><p className="text-[8px] font-black tracking-widest text-slate-600">TIME</p><p className="mt-2 text-lg font-black">{Math.floor((Number(squadResults.duration) || 0) / 60)}:{String(Math.floor((Number(squadResults.duration) || 0) % 60)).padStart(2, "0")}</p></div><div className="bg-slate-950 p-4"><p className="text-[8px] font-black tracking-widest text-slate-600">KILLS</p><p className="mt-2 text-lg font-black">{squadResults.stats?.kills || 0}</p></div><div className="bg-slate-950 p-4"><p className="text-[8px] font-black tracking-widest text-slate-600">REVIVES</p><p className="mt-2 text-lg font-black">{squadResults.stats?.revives || 0}</p></div><div className="bg-slate-950 p-4"><p className="text-[8px] font-black tracking-widest text-slate-600">ACCURACY</p><p className="mt-2 text-lg font-black">{Math.round((Number(squadResults.stats?.shotsHit) || 0) / Math.max(1, Number(squadResults.stats?.shotsFired) || 0) * 100)}%</p></div></div>
                  <div className="mt-7"><p className="text-[8px] font-black tracking-[0.3em] text-slate-600">FIRETEAM PERFORMANCE</p><div className="mt-3 divide-y divide-white/[0.06] border border-white/10">{(squadResults.squad || []).map((member: any, i: number) => <div key={member.id || i} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 bg-white/[0.02] px-4 py-4"><div><p className="text-[10px] font-black tracking-widest text-white">{member.name || `OPERATOR ${i + 1}`}</p><p className="mt-1 text-[8px] font-black tracking-widest text-slate-600">{member.downedCount || 0} DOWNTIMES · {member.revives || 0} REVIVES</p></div><span className="text-xs font-black text-cyan-300">{member.kills || 0} KILLS</span><span className="text-xs font-black text-yellow-300">{member.lives ?? 0} LIVES</span></div>)}</div></div>
                </section>
                <aside className="bg-[#071019] p-6 sm:p-8"><p className="text-[8px] font-black tracking-[0.3em] text-slate-600">COMBAT PAYLOAD</p><h3 className="mt-2 text-2xl font-black">REWARD PACKAGE</h3>{squadResults.reward && <div className="mt-6 space-y-px border border-white/10 bg-white/10"><div className="bg-slate-950 p-5"><p className="text-[8px] font-black tracking-widest text-slate-600">XP EARNED</p><p className="mt-2 text-3xl font-black text-cyan-300">+{squadResults.reward.xp}</p></div><div className="bg-slate-950 p-5"><p className="text-[8px] font-black tracking-widest text-slate-600">CREDITS</p><p className="mt-2 text-3xl font-black text-yellow-300">+{squadResults.reward.credits}</p></div><div className="bg-slate-950 p-5"><p className="text-[8px] font-black tracking-widest text-slate-600">GRADE</p><p className="mt-2 text-2xl font-black text-white">{"★".repeat(Math.max(1, Math.min(3, Number(squadResults.reward.stars) || 1)))}</p></div></div>}<button type="button" onClick={() => setShowSquadResults(false)} className="mt-6 w-full border border-cyan-400/40 bg-cyan-400/10 px-5 py-4 text-[9px] font-black tracking-[0.22em] text-cyan-300 hover:bg-cyan-400/15">CONTINUE</button></aside>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================
          GLOBAL LEADERBOARD
      ================================================== */}

      {showLeaderboard && (
        <div className="absolute inset-0 z-[95] overflow-hidden bg-[#02050a]/96 text-white backdrop-blur-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(16,185,129,.10),transparent_28%),linear-gradient(135deg,#02050a,#06120f)]" />
          <div className="relative z-10 mx-auto flex h-full max-w-[1100px] flex-col border-x border-white/10">
            <header className="flex min-h-16 items-center justify-between border-b border-white/10 px-6 sm:px-8">
              <div><p className="text-[9px] font-black tracking-[0.4em] text-emerald-400">NETWORK // COMBAT RECORD</p><h2 className="text-xl font-black tracking-[0.16em]">GLOBAL LEADERBOARD</h2></div>
              <button type="button" onClick={() => setShowLeaderboard(false)} className="border border-white/10 px-4 py-2 text-[9px] font-black tracking-widest text-slate-400 hover:border-white/30 hover:text-white">ESC / BACK</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
              <div className="mx-auto max-w-5xl border border-white/10 bg-slate-950/80">
                <div className="grid grid-cols-[70px_1fr_120px_90px_90px] border-b border-white/10 bg-white/[0.03] px-4 py-3 text-[8px] font-black tracking-[0.24em] text-slate-600 sm:grid-cols-[80px_1fr_150px_100px_100px]">
                  <span>RANK</span><span>OPERATOR</span><span>SCORE</span><span>LEVEL</span><span>GRADE</span>
                </div>
                {leaderboardEntries.length > 0 ? leaderboardEntries.map((entry, index) => (
                  <div key={`${entry.name}-${entry.timestamp}-${index}`} className={`grid grid-cols-[70px_1fr_120px_90px_90px] items-center border-b border-white/[0.06] px-4 py-4 sm:grid-cols-[80px_1fr_150px_100px_100px] ${index === 0 ? "bg-emerald-400/[0.06]" : ""}`}>
                    <span className={`text-lg font-black ${index < 3 ? "text-emerald-300" : "text-slate-500"}`}>#{entry.rank || index + 1}</span>
                    <span className="min-w-0 truncate text-xs font-black uppercase tracking-widest text-white">{entry.name}</span>
                    <span className="text-sm font-black text-emerald-300">{entry.score.toLocaleString()}</span>
                    <span className="text-xs font-black text-slate-300">L{entry.level}</span>
                    <span className="text-yellow-300">{"★".repeat(Math.max(1, Math.min(3, entry.stars)))}</span>
                  </div>
                )) : (
                  <div className="px-6 py-20 text-center"><p className="text-xs font-black tracking-[0.28em] text-slate-500">NO GLOBAL RECORDS AVAILABLE</p><p className="mt-2 text-[10px] text-slate-700">Complete a mission while connected to the multiplayer server to establish a record.</p></div>
                )}
              </div>
              <div className="mx-auto mt-4 flex max-w-5xl items-center justify-between border border-white/10 bg-white/[0.02] px-4 py-3"><span className="text-[8px] font-black tracking-[0.28em] text-slate-600">{leaderboardStatus}</span><button type="button" onClick={requestLeaderboard} className="text-[8px] font-black tracking-widest text-emerald-400 hover:text-emerald-300">REFRESH RECORD ↻</button></div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================
          STEP 30 // OPERATOR PROFILE
      ================================================== */}

      {showOperatorProfile && (
        <div className="absolute inset-0 z-[91] overflow-hidden bg-[#02050a]/96 text-white backdrop-blur-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(34,211,238,.13),transparent_26%),linear-gradient(135deg,#02050a,#07111b)]" />
          <div className="relative z-10 mx-auto flex h-full max-w-[1200px] flex-col border-x border-white/10">
            <header className="flex min-h-16 items-center justify-between border-b border-white/10 px-6 sm:px-8">
              <div className="flex items-center gap-4"><div className="h-9 w-9 border border-cyan-400/50 bg-cyan-400/10 p-2 text-center text-[10px] font-black text-cyan-300">02</div><div><p className="text-[9px] font-black tracking-[0.4em] text-cyan-400">PERSONNEL // OPERATOR RECORD</p><h2 className="text-xl font-black tracking-[0.16em]">OPERATOR PROFILE</h2></div></div>
              <button type="button" onClick={() => setShowOperatorProfile(false)} className="border border-white/10 px-4 py-2 text-[9px] font-black tracking-widest text-slate-400 hover:border-white/30 hover:text-white">ESC / BACK</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
              <div className="grid gap-px border border-white/10 bg-white/10 lg:grid-cols-[1.2fr_.8fr]">
                <section className="bg-slate-950 p-6 sm:p-9">
                  <div className="flex items-end justify-between gap-6 border-b border-white/10 pb-7"><div><p className="text-[9px] font-black tracking-[0.35em] text-slate-600">FIELD DESIGNATION</p><h3 className="mt-2 text-4xl font-black tracking-tight">OPERATOR {String(rank).padStart(2, "0")}</h3><p className="mt-2 text-[9px] font-black tracking-[0.22em] text-cyan-400">ACTIVE SERVICE // RANK {rank}</p></div><div className="text-right"><p className="text-[8px] font-black tracking-widest text-slate-600">CREDITS</p><p className="mt-1 text-3xl font-black text-yellow-300">{credits.toLocaleString()}</p></div></div>
                  <div className="mt-7"><div className="flex items-center justify-between"><p className="text-[8px] font-black tracking-[0.3em] text-slate-600">RANK PROGRESSION</p><span className="text-[9px] font-black text-cyan-300">{getXpIntoRank(xp)} / {XP_PER_RANK} XP</span></div><div className="mt-3 h-2 border border-white/10 bg-black/50"><div className="h-full bg-cyan-400" style={{ width: `${Math.min(100, (getXpIntoRank(xp) / XP_PER_RANK) * 100)}%` }} /></div><p className="mt-2 text-[8px] font-bold tracking-widest text-slate-600">TOTAL XP // {xp.toLocaleString()}</p></div>
                  <div className="mt-8 grid grid-cols-2 gap-px border border-white/10 bg-white/10 sm:grid-cols-4"><div className="bg-slate-950 p-4"><p className="text-[8px] font-black tracking-widest text-slate-600">MISSIONS</p><p className="mt-2 text-2xl font-black">{completedLevels.length}<span className="text-sm text-slate-600">/60</span></p></div><div className="bg-slate-950 p-4"><p className="text-[8px] font-black tracking-widest text-slate-600">STARS</p><p className="mt-2 text-2xl font-black text-yellow-300">{Object.values(levelStars).reduce((sum, value) => sum + Number(value || 0), 0)}<span className="text-sm text-slate-600">/180</span></p></div><div className="bg-slate-950 p-4"><p className="text-[8px] font-black tracking-widest text-slate-600">WEAPONS</p><p className="mt-2 text-2xl font-black">{unlockedWeapons.length}<span className="text-sm text-slate-600">/3</span></p></div><div className="bg-slate-950 p-4"><p className="text-[8px] font-black tracking-widest text-slate-600">LOADOUT</p><p className="mt-2 text-2xl font-black uppercase">{loadoutWeapon}</p></div></div>
                  <div className="mt-8"><p className="text-[8px] font-black tracking-[0.3em] text-slate-600">CAMPAIGN CLEARANCE</p><div className="mt-4 grid grid-cols-6 gap-1">{Array.from({ length: 60 }, (_, i) => <span key={i} className={`h-2 ${completedLevels.includes(i + 1) ? "bg-cyan-400" : "bg-white/10"}`} />)}</div><div className="mt-3 flex justify-between text-[8px] font-bold tracking-widest text-slate-600"><span>MISSION 01</span><span>MISSION 60</span></div></div>
                </section>
                <aside className="bg-[#071019] p-6 sm:p-9">
                  <p className="text-[8px] font-black tracking-[0.3em] text-slate-600">SERVICE RECORD</p>
                  <div className="mt-5 space-y-3">
                    {(["pistol", "rifle", "shotgun"] as Player["weapon"][]).map((weapon) => <div key={weapon} className="border border-white/10 bg-slate-950 p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest">{weapon}</span><span className={`text-[8px] font-black tracking-widest ${unlockedWeapons.includes(weapon) ? "text-emerald-400" : "text-slate-600"}`}>{unlockedWeapons.includes(weapon) ? "AVAILABLE" : `RANK ${WEAPON_UNLOCK_INFO[weapon].requiredRank}`}</span></div><div className="mt-3 grid grid-cols-4 gap-1">{(["damage", "fireRate", "magazine", "reload"] as (keyof WeaponUpgradeLevels)[]).map((stat) => <span key={stat} className={`h-1.5 ${weaponUpgrades[weapon][stat] > 0 ? "bg-cyan-400" : "bg-white/10"}`} />)}</div></div>)}
                  </div>
                  <div className="mt-7 border border-red-400/20 bg-red-400/[0.03] p-5"><p className="text-[8px] font-black tracking-[0.28em] text-red-400">IRREVERSIBLE PROFILE ACTION</p><p className="mt-2 text-[9px] leading-relaxed text-slate-500">Resetting removes campaign completion, stars, XP, credits, weapon unlocks and upgrades from this browser profile.</p><button type="button" onClick={resetOperatorProfile} className="mt-5 border border-red-400/30 px-4 py-3 text-[8px] font-black tracking-[0.2em] text-red-300 hover:bg-red-400/10">RESET OPERATOR RECORD</button></div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================
          STEP 32 // OPERATOR PROFILE
      ================================================== */}
      {showOperatorProfile && (
        <div className="absolute inset-0 z-[92] overflow-hidden bg-[#02050a]/97 text-white backdrop-blur-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,.12),transparent_30%),linear-gradient(135deg,#02050a,#07111b)]" />
          <div className="relative z-10 mx-auto flex h-full max-w-[1250px] flex-col border-x border-white/10">
            <header className="flex min-h-16 items-center justify-between border-b border-white/10 px-6 sm:px-8">
              <div><p className="text-[9px] font-black tracking-[0.42em] text-cyan-400">PERSONNEL // OPERATOR RECORD</p><h2 className="text-xl font-black tracking-[0.16em]">OPERATOR PROFILE</h2></div>
              <button type="button" onClick={closeOperatorProfile} className="border border-white/10 px-4 py-2 text-[9px] font-black tracking-widest text-slate-400 hover:border-white/30 hover:text-white">ESC / BACK</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
              <div className="grid gap-px border border-white/10 bg-white/10 lg:grid-cols-[1.2fr_.8fr]">
                <section className="bg-slate-950 p-7 sm:p-10">
                  <div className="flex items-end justify-between gap-6 border-b border-white/10 pb-7">
                    <div><p className="text-[9px] font-black tracking-[0.35em] text-slate-600">ACTIVE CALLSIGN</p><h3 className="mt-2 text-4xl font-black tracking-tight">{multiplayerName || "OPERATOR"}</h3><p className="mt-2 text-[9px] font-black tracking-[0.2em] text-cyan-400">FIELD OPERATIVE · RANK {String(rank).padStart(2, "0")}</p></div>
                    <div className="text-right"><p className="text-[8px] font-black tracking-widest text-slate-600">TOTAL XP</p><p className="text-3xl font-black text-cyan-300">{xp.toLocaleString()}</p></div>
                  </div>
                  <div className="mt-8 grid grid-cols-2 gap-px border border-white/10 bg-white/10 sm:grid-cols-4">
                    <div className="bg-slate-950 p-5"><p className="text-[8px] font-black tracking-widest text-slate-600">MISSIONS</p><p className="mt-2 text-2xl font-black">{completedLevels.length}<span className="text-xs text-slate-600"> / 60</span></p></div>
                    <div className="bg-slate-950 p-5"><p className="text-[8px] font-black tracking-widest text-slate-600">STARS</p><p className="mt-2 text-2xl font-black text-yellow-300">{operatorProfileStats.totalStars}<span className="text-xs text-slate-600"> / 180</span></p></div>
                    <div className="bg-slate-950 p-5"><p className="text-[8px] font-black tracking-widest text-slate-600">CREDITS</p><p className="mt-2 text-2xl font-black text-yellow-300">{credits.toLocaleString()}</p></div>
                    <div className="bg-slate-950 p-5"><p className="text-[8px] font-black tracking-widest text-slate-600">CLEARANCE</p><p className="mt-2 text-2xl font-black text-emerald-300">{operatorProfileStats.completion}%</p></div>
                  </div>
                  <div className="mt-8"><div className="flex items-center justify-between"><p className="text-[8px] font-black tracking-[0.3em] text-slate-600">RANK PROGRESSION</p><p className="text-[9px] font-black text-cyan-300">{operatorProfileStats.rankXp.toLocaleString()} / {operatorProfileStats.nextRankXp.toLocaleString()} XP</p></div><div className="mt-3 h-2 border border-white/10 bg-white/5"><div className="h-full bg-cyan-400" style={{ width: `${Math.min(100, (operatorProfileStats.rankXp / operatorProfileStats.nextRankXp) * 100)}%` }} /></div></div>
                  <div className="mt-8"><p className="text-[8px] font-black tracking-[0.3em] text-slate-600">CAMPAIGN CLEARANCE</p><div className="mt-4 grid grid-cols-10 gap-1">{Array.from({ length: 60 }, (_, i) => <span key={i} className={`h-3 ${completedLevels.includes(i + 1) ? "bg-cyan-400" : "bg-white/10"}`} />)}</div></div>
                </section>
                <aside className="bg-[#071019] p-7 sm:p-10">
                  <p className="text-[8px] font-black tracking-[0.3em] text-slate-600">COMBAT CLEARANCE</p><h3 className="mt-2 text-2xl font-black">EQUIPMENT STATUS</h3>
                  <div className="mt-6 space-y-px border border-white/10 bg-white/10">{(["pistol", "rifle", "shotgun"] as Player["weapon"][]).map((weapon) => <div key={weapon} className="flex items-center justify-between bg-slate-950 px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-widest">{WEAPON_UNLOCK_INFO[weapon].name}</p><p className="mt-1 text-[8px] font-bold tracking-widest text-slate-600">{weapon === loadoutWeapon ? "CURRENT LOADOUT" : "TACTICAL PLATFORM"}</p></div><span className={`text-[8px] font-black tracking-widest ${unlockedWeapons.includes(weapon) ? "text-emerald-400" : "text-slate-600"}`}>{unlockedWeapons.includes(weapon) ? "AVAILABLE" : `RANK ${WEAPON_UNLOCK_INFO[weapon].requiredRank}`}</span></div>)}</div>
                  <div className="mt-6 border border-white/10 bg-slate-950 p-5"><p className="text-[8px] font-black tracking-widest text-slate-600">CURRENT LOADOUT</p><p className="mt-2 text-xl font-black uppercase text-cyan-300">{WEAPON_UNLOCK_INFO[loadoutWeapon].name}</p></div>
                  <button type="button" onClick={closeOperatorProfile} className="mt-6 w-full border border-cyan-400/40 bg-cyan-400/10 px-5 py-4 text-[9px] font-black tracking-[0.22em] text-cyan-300 hover:bg-cyan-400/15">RETURN TO COMMAND</button>
                </aside>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================
          ARMORY / LOADOUT
      ================================================== */}

      {showArmory && (
        <div className="absolute inset-0 z-[90] overflow-hidden bg-[#02050a]/96 text-white backdrop-blur-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_25%,rgba(34,211,238,.12),transparent_25%),linear-gradient(135deg,#02050a,#07111b)]" />
          <div className="relative z-10 mx-auto flex h-full max-w-[1450px] flex-col border-x border-white/10">
            <header className="flex min-h-16 items-center justify-between border-b border-white/10 px-6 sm:px-8"><div className="flex items-center gap-4"><div className="h-9 w-9 border border-yellow-400/50 bg-yellow-400/10 p-2 text-center text-[10px] font-black text-yellow-300">03</div><div><p className="text-[9px] font-black tracking-[0.4em] text-yellow-400">LOGISTICS // EQUIPMENT CONTROL</p><h2 className="text-xl font-black tracking-[0.16em]">OPERATOR ARMORY</h2></div></div><div className="flex items-center gap-5"><div className="text-right"><p className="text-[8px] font-black tracking-[0.28em] text-slate-600">AVAILABLE CREDITS</p><p className="text-xl font-black text-yellow-300">{credits.toLocaleString()}</p></div><button type="button" onClick={closeArmory} className="border border-white/10 px-4 py-2 text-[9px] font-black tracking-widest text-slate-400 hover:border-white/30 hover:text-white">ESC / BACK</button></div></header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8"><div className="mx-auto grid max-w-6xl gap-5 xl:grid-cols-[250px_1fr]">
              <aside className="border border-white/10 bg-slate-950/75 p-4"><p className="px-2 text-[8px] font-black tracking-[0.3em] text-slate-600">PLATFORMS</p><div className="mt-4 space-y-2">{(["pistol", "rifle", "shotgun"] as Player["weapon"][]).map((weapon) => { const unlocked = unlockedWeapons.includes(weapon); const active = armoryWeapon === weapon; return <button key={weapon} type="button" onClick={() => setArmoryWeapon(weapon)} className={`w-full border-l-2 px-4 py-4 text-left transition ${active ? "border-cyan-400 bg-cyan-400/10" : "border-transparent bg-white/[0.02] hover:border-white/20 hover:bg-white/5"}`}><div className="flex items-center justify-between"><span className={`text-sm font-black uppercase ${active ? "text-cyan-300" : "text-slate-300"}`}>{WEAPON_UNLOCK_INFO[weapon].name}</span><span className={`text-[8px] font-black tracking-widest ${unlocked ? "text-emerald-400" : "text-slate-600"}`}>{unlocked ? "READY" : `RANK ${WEAPON_UNLOCK_INFO[weapon].requiredRank}`}</span></div><p className="mt-1 text-[9px] text-slate-600">{unlocked ? WEAPON_UNLOCK_INFO[weapon].description : "ACCESS RESTRICTED"}</p></button> })}</div><div className="mt-6 border-t border-white/10 pt-5"><p className="text-[8px] font-black tracking-[0.3em] text-slate-600">PROGRESSION</p><p className="mt-2 text-3xl font-black">{rank}</p><p className="text-[8px] font-bold tracking-widest text-slate-600">OPERATOR RANK</p></div></aside>
              <section className="border border-white/10 bg-slate-950/75 p-5 sm:p-7"><div className="grid gap-7 lg:grid-cols-[.9fr_1.1fr]">
                <div className="relative min-h-[390px] overflow-hidden border border-white/10 bg-[linear-gradient(145deg,#0b1722,#03070d)] p-6"><div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:32px_32px]" /><div className="relative flex h-full flex-col justify-between"><div><p className="text-[9px] font-black tracking-[0.32em] text-cyan-400">WEAPON SYSTEM</p><h3 className="mt-3 text-5xl font-black uppercase tracking-[-0.03em]">{WEAPON_UNLOCK_INFO[armoryWeapon].name}</h3><p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">{WEAPON_UNLOCK_INFO[armoryWeapon].description}</p></div><div className="relative mx-auto w-full max-w-md py-10"><div className="absolute left-[10%] right-[10%] top-1/2 h-5 -translate-y-1/2 skew-x-[-18deg] border-y border-cyan-300/30 bg-cyan-300/5 shadow-[0_0_45px_rgba(34,211,238,.08)]" /><div className="absolute left-[26%] right-[18%] top-[46%] h-1 bg-cyan-300/50 shadow-[0_0_12px_rgba(34,211,238,.5)]" /><div className="absolute left-[18%] top-[34%] h-16 w-16 rounded-full border border-white/10 bg-black/30" /><div className="absolute right-[7%] top-[45%] h-2 w-14 bg-slate-600" /><div className="absolute bottom-[30%] left-[39%] h-12 w-16 -skew-x-[18deg] border border-white/10 bg-slate-900" /></div><div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-center"><div><p className="text-[8px] font-black tracking-widest text-slate-600">DAMAGE</p><p className="mt-1 text-lg font-black">{Math.round(getUpgradedWeaponConfig(armoryWeapon, weaponUpgrades).damage)}</p></div><div><p className="text-[8px] font-black tracking-widest text-slate-600">MAG</p><p className="mt-1 text-lg font-black">{getUpgradedWeaponConfig(armoryWeapon, weaponUpgrades).magazineSize}</p></div><div><p className="text-[8px] font-black tracking-widest text-slate-600">FIRE RATE</p><p className="mt-1 text-lg font-black">{getUpgradedWeaponConfig(armoryWeapon, weaponUpgrades).fireRate}ms</p></div></div></div></div>
                <div><div className="flex items-end justify-between border-b border-white/10 pb-4"><div><p className="text-[9px] font-black tracking-[0.3em] text-slate-600">PERFORMANCE MATRIX</p><h3 className="mt-2 text-2xl font-black">FIELD MODIFICATIONS</h3></div><span className="text-[9px] font-black tracking-widest text-yellow-300">{loadoutWeapon === armoryWeapon ? "EQUIPPED" : "AVAILABLE"}</span></div>{unlockedWeapons.includes(armoryWeapon) ? <><div className="mt-5 space-y-3">{([["damage", "DAMAGE", `+${weaponUpgrades[armoryWeapon].damage * 15}%`], ["fireRate", "FIRE RATE", `${weaponUpgrades[armoryWeapon].fireRate * 7}% FASTER`], ["magazine", "MAGAZINE", `+${weaponUpgrades[armoryWeapon].magazine * 2} ROUNDS`], ["reload", "RELOAD", `${weaponUpgrades[armoryWeapon].reload * 100}MS FASTER`]] as [keyof WeaponUpgradeLevels, string, string][]).map(([stat, label, effect]) => { const level = weaponUpgrades[armoryWeapon][stat]; const maxed = level >= MAX_WEAPON_UPGRADE_LEVEL; const cost = getUpgradeCost(stat, level); const canUpgrade = !maxed && credits >= cost; return <div key={stat} className="border border-white/10 bg-black/25 p-4"><div className="flex items-center justify-between"><div><p className="text-[9px] font-black tracking-[0.22em] text-slate-500">{label}</p><p className="mt-1 text-xs font-bold text-white">{effect}</p></div><span className="text-[9px] font-black text-cyan-300">LV {level}/{MAX_WEAPON_UPGRADE_LEVEL}</span></div><div className="mt-3 flex gap-1">{Array.from({ length: MAX_WEAPON_UPGRADE_LEVEL }, (_, i) => <span key={i} className={`h-1 flex-1 ${i < level ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,.45)]" : "bg-white/10"}`} />)}</div><button type="button" disabled={!canUpgrade} onClick={() => upgradeWeapon(stat)} className="mt-4 w-full border border-yellow-400/40 bg-yellow-400/10 px-4 py-3 text-[9px] font-black tracking-widest text-yellow-300 transition hover:bg-yellow-400/20 disabled:cursor-not-allowed disabled:opacity-30">{maxed ? "MAX LEVEL" : `UPGRADE // ${cost.toLocaleString()} CR`}</button></div> })}</div><button type="button" onClick={() => unlockWeapon(armoryWeapon)} className={`mt-4 w-full border px-4 py-3 text-[9px] font-black tracking-[0.2em] ${loadoutWeapon === armoryWeapon ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-300" : "border-white/15 bg-white/5 text-white hover:bg-white/10"}`}>{loadoutWeapon === armoryWeapon ? "ACTIVE LOADOUT" : "EQUIP AS PRIMARY"}</button></> : <div className="mt-5 border border-yellow-400/20 bg-yellow-400/5 p-8 text-center"><p className="text-[9px] font-black tracking-[0.3em] text-yellow-300">ACCESS RESTRICTED</p><p className="mt-3 text-sm font-bold text-white">RANK {WEAPON_UNLOCK_INFO[armoryWeapon].requiredRank} REQUIRED</p><p className="mt-2 text-xs text-slate-500">Continue campaign operations to unlock this weapon platform.</p></div>}</div>
              </div></section>
            </div></div>
            <footer className="border-t border-white/10 px-6 py-3 text-[8px] font-black tracking-[0.28em] text-slate-600">EQUIPMENT CONTROL · UPGRADES PERSIST LOCALLY · ACTIVE PLATFORM: {WEAPON_UNLOCK_INFO[loadoutWeapon].name.toUpperCase()}</footer>
          </div>
        </div>
      )}

      {/* ==================================================
          LEVEL SELECT
      ================================================== */}

      {showDeployment && (() => {
        const mission = getCampaignLevel(selectedCampaignLevel);
        const map = getMapForLevel(selectedCampaignLevel);
        const difficulty = mission?.difficulty ?? "Easy";
        const waves = getLevelWaveCount(selectedCampaignLevel);
        const objective = getObjectiveInfo(mission);
        const enemyCount = getEnemyCountForWave(waves, selectedCampaignLevel);
        const totalEnemies = Array.from({ length: waves }, (_, index) =>
          getEnemyCountForWave(index + 1, selectedCampaignLevel)
        ).reduce((sum, count) => sum + count, 0);
        const difficultyClass =
          difficulty.toLowerCase().includes("expert")
            ? "text-fuchsia-300 border-fuchsia-400/30 bg-fuchsia-500/10"
            : difficulty.toLowerCase().includes("very")
              ? "text-red-300 border-red-400/30 bg-red-500/10"
              : difficulty.toLowerCase().includes("hard")
                ? "text-orange-300 border-orange-400/30 bg-orange-500/10"
                : difficulty.toLowerCase().includes("medium")
                  ? "text-sky-300 border-sky-400/30 bg-sky-500/10"
                  : "text-emerald-300 border-emerald-400/30 bg-emerald-500/10";
        return (
          <div className="absolute inset-0 z-[85] flex items-center justify-center overflow-y-auto bg-slate-950/92 p-6 backdrop-blur-md">
            <div className="w-full max-w-6xl rounded-[28px] border border-cyan-400/20 bg-slate-950/96 p-7 shadow-[0_25px_100px_rgba(0,0,0,0.55)] shadow-2xl">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs font-black tracking-[0.35em] text-cyan-400">TACTICAL DEPLOYMENT</p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-white">
                    LEVEL {selectedCampaignLevel} — {mission?.name ?? "MISSION"}
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">Review mission intelligence before deployment.</p>
                </div>
                <button type="button" onClick={closeDeployment} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black tracking-widest text-slate-300 hover:bg-white/10">
                  BACK
                </button>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-[10px] font-black tracking-[0.25em] text-slate-500">MAP</p>
                  <p className="mt-2 text-xl font-black text-white">{map.name}</p>
                  <p className="mt-1 text-xs text-cyan-300">MAP {map.id}</p>
                </div>
                <div className={`rounded-2xl border p-5 ${difficultyClass}`}>
                  <p className="text-[10px] font-black tracking-[0.25em] opacity-70">THREAT LEVEL</p>
                  <p className="mt-2 text-xl font-black">{difficulty.toUpperCase()}</p>
                  <p className="mt-1 text-xs opacity-80">{waves} wave{waves === 1 ? "" : "s"} • {totalEnemies} estimated enemies</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-[10px] font-black tracking-[0.25em] text-slate-500">SURVIVAL KIT</p>
                  <p className="mt-2 text-xl font-black text-white">{lives} LIVES</p>
                  <p className="mt-1 text-xs text-slate-400">Current loadout: <span className="font-bold text-cyan-300">{loadoutWeapon.toUpperCase()}</span></p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
                  <p className="text-[10px] font-black tracking-[0.25em] text-cyan-400">MISSION OBJECTIVE</p>
                  <p className="mt-3 text-lg font-black uppercase text-white">{objective.type}</p>
                  <p className="mt-1 text-sm text-slate-400">Target: {objective.target}{objective.type === "survive" || objective.type === "time" || objective.type === "defend" ? " seconds" : " actions"}</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-cyan-400" style={{ width: "0%" }} />
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
                  <p className="text-[10px] font-black tracking-[0.25em] text-yellow-400">DEPLOYMENT LOADOUT</p>
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xl font-black text-white">{loadoutWeapon.toUpperCase()}</p>
                      <p className="text-xs text-slate-400">Selected in Armory</p>
                    </div>
                    <button type="button" onClick={() => { closeDeployment(); openArmory(); }} className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-xs font-black tracking-widest text-yellow-300 hover:bg-yellow-400/20">
                      CHANGE LOADOUT
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
                <div className="text-xs text-slate-500">Wave structure: <span className="font-bold text-slate-300">{waves} wave{waves === 1 ? "" : "s"}</span> • First wave: <span className="font-bold text-slate-300">{enemyCount} enemies</span></div>
                <button type="button" onClick={deploySelectedLevel} className="rounded-xl bg-cyan-500 px-8 py-4 text-sm font-black tracking-[0.2em] text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.25)] transition hover:scale-105 hover:bg-cyan-300 active:scale-95">
                  DEPLOY INTO LEVEL {selectedCampaignLevel}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showLevelSelect && (
        <div className="absolute inset-0 z-[70]">
          <div className="pointer-events-none absolute left-6 top-5 z-[75] hidden border border-cyan-400/20 bg-[#02050a]/80 px-4 py-3 backdrop-blur-md lg:block">
            <p className="text-[8px] font-black tracking-[0.32em] text-cyan-400">CAMPAIGN THEATER // {String(campaignSector + 1).padStart(2, "0")}</p>
            <p className="mt-1 text-xs font-black tracking-[0.16em] text-white">{CAMPAIGN_SECTORS[campaignSector]?.name}</p>
            <p className="mt-1 text-[8px] font-bold tracking-widest text-slate-500">{CAMPAIGN_SECTORS[campaignSector]?.theme} · {getCampaignCompletionPercent(completedLevels)}% CAMPAIGN CLEARED</p>
          </div>
          <LevelSelect
            completedLevels={completedLevels}
            levelStars={levelStars}
            onSelectLevel={selectCampaignLevel}
            onBack={closeLevelSelect}
          />
        </div>
      )}

      <style jsx global>{`
        .arena-ui-theme {
          --ui-cyan: #22d3ee;
          --ui-violet: #8b5cf6;
          --ui-panel: rgba(7, 15, 29, 0.94);
          --ui-line: rgba(148, 163, 184, 0.14);
          --ui-muted: #64748b;
        }
        .arena-ui-theme button {
          position: relative;
          overflow: hidden;
          letter-spacing: .12em;
        }
        .arena-ui-theme button:not(:disabled)::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-120%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.12), transparent);
          transition: transform .45s ease;
          pointer-events: none;
        }
        .arena-ui-theme button:not(:disabled):hover::after { transform: translateX(120%); }
        .arena-ui-theme input, .arena-ui-theme select {
          min-height: 44px;
          border-radius: 12px;
        }
        .arena-ui-theme input:focus, .arena-ui-theme select:focus {
          box-shadow: 0 0 0 3px rgba(34,211,238,.08), 0 0 30px rgba(34,211,238,.08);
        }
        .arena-ui-theme [class*="rounded-2xl"], .arena-ui-theme [class*="rounded-[28px]"], .arena-ui-theme [class*="rounded-3xl"] {
          backdrop-filter: blur(8px);
        }
        .arena-ui-theme [class*="border-white/10"] { border-color: rgba(148,163,184,.13); }
        .arena-ui-theme ::-webkit-scrollbar { width: 7px; height: 7px; }
        .arena-ui-theme ::-webkit-scrollbar-track { background: rgba(2,6,23,.5); }
        .arena-ui-theme ::-webkit-scrollbar-thumb { background: rgba(100,116,139,.45); border-radius: 999px; }
        .arena-ui-theme ::-webkit-scrollbar-thumb:hover { background: rgba(34,211,238,.5); }

        .arena-ui-theme .arena-panel { background: rgba(3,8,15,.82); border: 1px solid rgba(148,163,184,.13); box-shadow: 0 25px 80px rgba(0,0,0,.38); }
        .arena-ui-theme button { border-radius: 0 !important; }
        @media (max-width: 767px) {
          .arena-ui-theme button { -webkit-tap-highlight-color: transparent; }
          .arena-mobile-round { border-radius: 9999px !important; }
          .arena-mobile-game { height: 100dvh; min-height: 100dvh; }
          @media (max-width: 767px) {
            button, [role="button"] {
              touch-action: manipulation;
              -webkit-tap-highlight-color: transparent;
              -webkit-user-select: none;
              user-select: none;
            }
          }

        }
        .arena-ui-theme input { border-radius: 0 !important; }
        .arena-ui-theme button:focus-visible, .arena-ui-theme input:focus-visible { outline: 1px solid rgba(34,211,238,.7); outline-offset: 2px; }
        .arena-ui-theme ::selection { background: rgba(34,211,238,.28); color: #fff; }
        .arena-ui-theme .tactical-cut { clip-path: polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px)); }
      `}</style>
    </main>
  );
}

/* ================================================================
   STEP 24 // MISSION RESULTS & FAILURE FLOW
   ----------------------------------------------------------------
   Mission completion remains part of the existing campaign system.
   The combat loop is not replaced by this UI pass.
   Existing XP calculation remains authoritative.
   Existing credit calculation remains authoritative.
   Existing star calculation remains authoritative.
   Existing completed-level persistence remains authoritative.
   Existing level-star persistence remains authoritative.
   Existing rank calculation remains authoritative.
   Existing weapon unlock progression remains authoritative.
   Existing loadout persistence remains authoritative.
   Existing campaign level definitions remain authoritative.
   Existing map selection remains authoritative.
   Existing objective validation remains authoritative.
   Existing boss completion remains authoritative.
   Existing multiplayer enemy ownership remains authoritative.
   Existing Socket.IO room behavior remains untouched.
   Existing respawn behavior remains untouched.
   Existing wave progression remains untouched.
   Existing pause behavior remains untouched.
   Existing tactical HUD remains untouched.
   Existing canvas rendering remains untouched.
   Existing controls remain untouched.
   Existing audio behavior remains untouched.
   Existing power-up behavior remains untouched.
   Existing enemy AI remains untouched.
   Existing obstacle collision remains untouched.
   Existing projectile collision remains untouched.
   Existing campaign unlock rules remain untouched.
   The results screen is rendered after successful completion.
   The failure screen is rendered after all three lives are lost.
   Redeploy starts the same selected campaign mission again.
   Redeploy clears the stale failure state before starting.
   Redeploy also clears stale reward-summary display state.
   Campaign Map returns the operator to mission selection.
   Next Mission advances exactly one campaign level.
   Level 60 exposes a campaign-complete action instead of level 61.
   The results layout uses asymmetric tactical panels.
   Mission identity is separated from reward telemetry.
   Score remains visible in the after-action report.
   Lives remaining remain visible in the after-action report.
   Wave count remains visible in the after-action report.
   Difficulty remains visible in the after-action report.
   Map identity remains visible in the after-action report.
   Objective status is explicitly marked as secured.
   XP is presented as operator progression.
   Credits are presented as equipment funding.
   Rank is presented as operator status.
   Promotion state remains visible when a rank increases.
   Unlock state remains visible when a rank reward is granted.
   Auto-save status is communicated without changing storage behavior.
   Buttons remain keyboard/mouse compatible native buttons.
   The screen remains scrollable on smaller displays.
   Desktop presentation uses a two-column command layout.
   Mobile presentation collapses into a vertical command layout.
   Red failure styling is isolated to the failure state.
   Cyan completion styling is isolated to successful missions.
   Yellow styling remains reserved for grade/reward emphasis.
   No external asset dependency is introduced.
   No new package dependency is introduced.
   No multiplayer server change is required for this step.
   No campaign data migration is required for this step.
   No localStorage key migration is required for this step.
   The event bridge for campaign launch is preserved.
   The pending campaign-start fallback remains preserved.
   The current source remains the base for subsequent iterations.
   ----------------------------------------------------------------
   END STEP 24 NOTES
   ================================================================ */


/* ================================================================
   STEP 28 // SQUAD REVIVE & COOPERATIVE DOWNED SYSTEM
   ----------------------------------------------------------------
   Multiplayer casualties now enter an 8-second downed window.
   Nearby squadmates can press F to revive a downed operator.
   Multiplayer enemy and power-up worlds are no longer cleared when
   one operator is downed. Single-player respawn behavior remains
   unchanged. Revive state is synchronized through Socket.IO.
   Existing mission, boss, enemy, projectile, leaderboard and host
   authority systems remain the source of truth.
   ================================================================ */


/* ================================================================
   STEP 29 // CO-OP SQUAD RESULTS & SHARED PROGRESSION
   ----------------------------------------------------------------
   Multiplayer missions now publish one synchronized after-action
   result to the entire fireteam. The result contains the mission
   outcome, squad score, duration, aggregate combat statistics,
   per-operator performance and the shared reward package.

   Combat statistics tracked locally:
   - kills
   - damage
   - shots fired / shots hit
   - revives
   - downed events

   The multiplayer server accepts the host-authoritative completion
   or failure event once, builds the fireteam result, and broadcasts
   `mission-results`. Non-host operators consume the same reward
   package so progression stays synchronized across the squad.

   Existing campaign, enemy, boss, objective, revive, leaderboard,
   weapon and rendering systems remain intact.
   ================================================================ */


/* ================================================================
   STEP 30 // IMPLEMENTATION NOTES
   ----------------------------------------------------------------
   Persistent Operator Profile is now stored under
   `arena-strike-profile-v1` in localStorage. The profile combines
   campaign completion, best stars, XP, credits, weapon unlocks,
   loadout selection and weapon upgrade levels into one validated
   save object while preserving the existing legacy storage keys as
   a compatibility layer.

   The loader validates numeric ranges, weapon identifiers, level
   numbers, star values and upgrade levels before applying data.
   Invalid unified profile data is ignored without breaking the
   existing legacy progression system. Rank-based weapon unlocks
   are re-applied after loading so a valid XP total cannot leave the
   operator with an incorrectly locked weapon.

   Multiplayer mission-results now also persist completion and best
   stars for non-host operators, closing the Step 29 progression gap.
   The existing result de-duplication reference remains intact.

   Operator Profile provides a professional persistent service record
   and an explicit reset action. Reset requires browser confirmation
   and restores the complete profile to the starting state.

   No multiplayer server protocol change is required for Step 30.
   Existing mission, boss, enemy, objective, revive, leaderboard,
   armory and rendering systems remain intact.
   ================================================================ */


/* ================================================================
   STEP 31 // CAMPAIGN WORLD MAP INTELLIGENCE
   ----------------------------------------------------------------
   Campaign selection now exposes six tactical theaters covering
   the 60-level operation. The existing LevelSelect remains intact;
   this step adds sector intelligence and campaign-clear telemetry
   without replacing the established mission selection logic.
   Existing progression, stars, deployment, multiplayer and gameplay
   systems remain the source of truth.
   ================================================================ */


/* ================================================================
   STEP 33 // IMPLEMENTATION NOTES
   ----------------------------------------------------------------
   Advanced procedural audio now layers tactical ambience and
   contextual feedback over the existing audio module. Weapon fire,
   impacts, kills, power-up collection, wave transitions, boss phase
   escalation and mission failure receive additional audio emphasis.

   Combat music is generated with Web Audio and starts only after
   the browser audio context has been unlocked by player interaction.
   It automatically changes intensity for boss missions and stops
   outside active combat. Mute state is synchronized between the
   existing audio system and the new combat layer.

   No external audio assets or new dependencies are required.
   Existing gameplay, multiplayer authority, progression, campaign,
   boss, objective and rendering systems remain intact.
   ================================================================ */

/* ================================================================
   STEP 34 // ADVANCED COMBAT VFX & SCREEN FEEDBACK
   ----------------------------------------------------------------
   The combat presentation now adds a restrained tactical vignette,
   dynamic low-health edge pulsing, damage-state tinting and subtle
   scanline treatment over the existing canvas renderer. These effects
   are composited after world rendering so they remain consistent with
   camera shake, particles, projectiles, enemies and the player.

   Low-health feedback scales continuously from operator health and
   remains intentionally transparent enough to preserve visibility.
   Damage feedback is limited to the existing damage-flash window.
   The effect layer uses only Canvas 2D APIs and introduces no external
   assets, packages or runtime services. Existing gameplay, multiplayer,
   progression, objectives, bosses, audio and HUD systems remain intact.
   ----------------------------------------------------------------
   END STEP 34 NOTES
   ================================================================ */



/* ================================================================
   STEP 35 // TACTICAL THREAT AWARENESS & COMBAT TELEMETRY
   ----------------------------------------------------------------
   Added a lightweight tactical threat-awareness layer driven by the
   existing enemy world. Nearby hostile pressure is converted into a
   0-100 telemetry value and exposed through a compact HUD instrument.

   Combat presentation also receives restrained proximity rings and
   directional hostile ticks around the operator. Enemy types and boss
   presence influence awareness intensity without changing their AI,
   health, damage, movement, scoring or multiplayer authority.

   Telemetry is sampled at a controlled interval to avoid unnecessary
   React updates every animation frame. Menu and terminal states clear
   the instrument automatically. No new dependencies or assets were
   introduced, and all existing campaign, multiplayer, progression,
   audio, objectives, boss and rendering systems remain intact.
   ----------------------------------------------------------------
   END STEP 35 NOTES
   ================================================================ */


/* ================================================================
   STEP 36 // TACTICAL MAP & SQUAD AWARENESS
   ----------------------------------------------------------------
   The minimap now supports an expanded tactical view, displays
   squad operator positions in multiplayer, marks downed operators
   distinctly, and exposes live threat/hostile telemetry while the
   map is expanded. The existing map geometry, enemy world and
   multiplayer authority remain unchanged.
   ================================================================ */


/* ================================================================
   STEP 37 // MISSION NAVIGATOR & OBJECTIVE WAYFINDING
   ----------------------------------------------------------------
   Added a live mission navigator that points toward the most
   relevant active target for eliminate, destroy, boss and collect
   objectives. The navigator shows bearing, target class and
   distance while the tactical minimap receives an objective marker.
   Timer/survival/defend objectives instead show a hold-position
   directive because they have no world target.

   The feature is presentation-only and reads the existing objective,
   enemy, boss and power-up state. No objective completion rules, AI,
   scoring, progression, multiplayer authority or server protocol
   are changed. No external assets or dependencies are introduced.
   ================================================================ */


/* ================================================================
   STEP 38 // COMPLETION NOTES
   ----------------------------------------------------------------
   Fireteam Command Board and squad directional awareness are now
   integrated into the existing multiplayer HUD.

   No new Socket.IO event or server change is required.
   The feature consumes the already synchronized remote operator
   state and preserves the existing F revive interaction.
   Single-player HUD behavior remains unchanged.
   ================================================================ */

/* ================================================================
   STEP 39 // COMPLETION NOTES
   ----------------------------------------------------------------
   Final UI/UX polish is integrated without changing gameplay
   authority or multiplayer protocol.

   The presentation now exposes campaign clearance, mission context,
   responsive tactical information and a reduced-motion preference.
   ================================================================ */
