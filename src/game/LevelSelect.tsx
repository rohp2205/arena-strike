"use client";

import { useMemo, useState } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Lock,
    MapPin,
    Play,
    Shield,
    Star,
    Trophy,
    Zap,
} from "lucide-react";

import {
    DIFFICULTY_CONFIG,
    DIFFICULTY_RANGES,
    Difficulty,
    getLevel,
    getMapForLevel,
    getDifficultyLabel,
    isBossLevel,
    isLevelUnlocked,
    LEVELS,
    TOTAL_LEVELS,
} from "./levels";

interface LevelSelectProps {
    completedLevels: number[];
    levelStars: Record<number, number>;
    onSelectLevel: (level: number) => void;
    onBack: () => void;
}

const DIFFICULTIES: Difficulty[] = [
    "easy",
    "medium",
    "hard",
    "very-hard",
    "expert",
];

const difficultyShortNames: Record<Difficulty, string> = {
    easy: "EASY",
    medium: "MEDIUM",
    hard: "HARD",
    "very-hard": "VERY HARD",
    expert: "EXPERT",
};

const difficultyDescriptions: Record<Difficulty, string> = {
    easy: "Learn the arena and master the basics.",
    medium: "Enemies become faster and more aggressive.",
    hard: "Tough enemies and dangerous missions.",
    "very-hard": "Only experienced players will survive.",
    expert: "The ultimate Arena Strike challenge.",
};

const getStars = (
    level: number,
    levelStars: Record<number, number>
) => {
    return Math.max(
        0,
        Math.min(3, levelStars[level] ?? 0)
    );
};

export default function LevelSelect({
    completedLevels,
    levelStars,
    onSelectLevel,
    onBack,
}: LevelSelectProps) {
    const [selectedDifficulty, setSelectedDifficulty] =
        useState<Difficulty>("easy");

    const [selectedLevel, setSelectedLevel] =
        useState<number>(1);

    const selectedLevelData = getLevel(selectedLevel);
    const selectedMap = selectedLevelData
        ? getMapForLevel(selectedLevel)
        : undefined;

    const completedCount = completedLevels.filter(
        (level) =>
            level >= 1 &&
            level <= TOTAL_LEVELS
    ).length;

    const totalStars = Object.values(
        levelStars
    ).reduce(
        (total, stars) =>
            total + Math.min(3, Math.max(0, stars)),
        0
    );

    const currentRange =
        DIFFICULTY_RANGES[selectedDifficulty];

    const visibleLevels = useMemo(() => {
        return LEVELS.filter(
            (level) =>
                level.id >= currentRange.start &&
                level.id <= currentRange.end
        );
    }, [currentRange]);

    const selectDifficulty = (
        difficulty: Difficulty
    ) => {
        setSelectedDifficulty(difficulty);

        const range =
            DIFFICULTY_RANGES[difficulty];

        const firstLevel = range.start;

        setSelectedLevel(firstLevel);
    };

    const selectLevel = (level: number) => {
        if (
            !isLevelUnlocked(
                level,
                completedLevels
            )
        ) {
            return;
        }

        setSelectedLevel(level);
    };

    const goPreviousDifficulty = () => {
        const index =
            DIFFICULTIES.indexOf(
                selectedDifficulty
            );

        const nextIndex =
            Math.max(0, index - 1);

        const difficulty =
            DIFFICULTIES[nextIndex];

        selectDifficulty(difficulty);
    };

    const goNextDifficulty = () => {
        const index =
            DIFFICULTIES.indexOf(
                selectedDifficulty
            );

        const nextIndex =
            Math.min(
                DIFFICULTIES.length - 1,
                index + 1
            );

        const difficulty =
            DIFFICULTIES[nextIndex];

        selectDifficulty(difficulty);
    };

    return (
        <div className="arena-campaign-terminal absolute inset-0 z-[70] overflow-hidden bg-[#020617] text-white">
            {/* =====================================================
          BACKGROUND
      ===================================================== */}

            <div className="pointer-events-none absolute inset-0">
                <div className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:56px_56px]" />

                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(14,165,233,0.16),transparent_45%)]" />

                <div className="absolute left-[-15%] top-[20%] h-[500px] w-[500px] rounded-none bg-cyan-500/5 blur-3xl" />

                <div className="absolute right-[-15%] bottom-[5%] h-[600px] w-[600px] rounded-none bg-violet-500/5 blur-3xl" />

                <div
                    className="absolute inset-0 opacity-[0.035]"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
                        backgroundSize: "48px 48px",
                    }}
                />
            </div>

            {/* =====================================================
          TOP BAR
      ===================================================== */}

            <div className="relative z-10 flex h-20 items-center justify-between border-b border-white/10 bg-black/30 px-6 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={onBack}
                        className="flex h-11 w-11 items-center justify-center rounded-none border border-white/10 bg-white/[0.025] text-slate-300 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-white"
                        aria-label="Back"
                    >
                        <ChevronLeft size={22} />
                    </button>

                    <div>
                        <p className="text-[10px] font-bold tracking-[0.4em] text-cyan-400">
                            CAMPAIGN
                        </p>

                        <h1 className="text-2xl font-black tracking-[0.16em]">
                            LEVEL SELECT
                        </h1>
                    </div>
                </div>

                <div className="hidden items-center gap-3 sm:flex">
                    <div className="rounded-none border border-white/10 bg-white/[0.025] px-5 py-2 text-right">
                        <p className="text-[9px] font-bold tracking-widest text-slate-500">
                            PROGRESS
                        </p>

                        <p className="text-sm font-black">
                            {completedCount}
                            <span className="text-slate-500">
                                {" "}
                                / {TOTAL_LEVELS}
                            </span>
                        </p>
                    </div>

                    <div className="flex items-center gap-2 rounded-none border border-yellow-400/20 bg-yellow-400/5 px-5 py-2">
                        <Star
                            size={16}
                            className="fill-yellow-400 text-yellow-400"
                        />

                        <div>
                            <p className="text-[9px] font-bold tracking-widest text-slate-500">
                                STARS
                            </p>

                            <p className="text-sm font-black text-yellow-300">
                                {totalStars}
                                <span className="text-slate-500">
                                    {" "}
                                    / {TOTAL_LEVELS * 3}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* =====================================================
          MAIN CONTENT
      ===================================================== */}

            <div className="relative z-10 flex h-[calc(100%-80px)] flex-col lg:flex-row">
                {/* ===================================================
            LEFT SIDE
        =================================================== */}

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-white/10 lg:border-b-0 lg:border-r">
                    {/* Difficulty selector */}

                    <div className="border-b border-white/10 bg-black/20 p-4">
                        <div className="mx-auto flex max-w-5xl items-center gap-2">
                            <button
                                type="button"
                                onClick={goPreviousDifficulty}
                                disabled={
                                    selectedDifficulty ===
                                    DIFFICULTIES[0]
                                }
                                className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-none border border-white/10 bg-white/[0.025] text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-20 sm:flex"
                            >
                                <ChevronLeft size={20} />
                            </button>

                            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-5">
                                {DIFFICULTIES.map(
                                    (difficulty) => {
                                        const config =
                                            DIFFICULTY_CONFIG[
                                            difficulty
                                            ];

                                        const active =
                                            selectedDifficulty ===
                                            difficulty;

                                        const range =
                                            DIFFICULTY_RANGES[
                                            difficulty
                                            ];

                                        return (
                                            <button
                                                key={difficulty}
                                                type="button"
                                                onClick={() =>
                                                    selectDifficulty(
                                                        difficulty
                                                    )
                                                }
                                                className="group relative overflow-hidden rounded-none border p-3 text-left transition"
                                                style={{
                                                    borderColor: active
                                                        ? `${config.color}88`
                                                        : "rgba(255,255,255,0.08)",
                                                    backgroundColor:
                                                        active
                                                            ? `${config.color}12`
                                                            : "rgba(255,255,255,0.025)",
                                                }}
                                            >
                                                {active && (
                                                    <div
                                                        className="absolute inset-x-0 top-0 h-[2px]"
                                                        style={{
                                                            backgroundColor:
                                                                config.color,
                                                        }}
                                                    />
                                                )}

                                                <div className="flex items-center justify-between">
                                                    <span
                                                        className="text-[10px] font-black tracking-widest"
                                                        style={{
                                                            color: active
                                                                ? config.color
                                                                : "#94a3b8",
                                                        }}
                                                    >
                                                        {
                                                            difficultyShortNames[
                                                            difficulty
                                                            ]
                                                        }
                                                    </span>

                                                    {difficulty ===
                                                        "expert" && (
                                                            <Trophy
                                                                size={13}
                                                                className="text-violet-400"
                                                            />
                                                        )}
                                                </div>

                                                <p className="mt-1 text-[10px] text-slate-500">
                                                    Lv. {range.start}–
                                                    {range.end}
                                                </p>
                                            </button>
                                        );
                                    }
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={goNextDifficulty}
                                disabled={
                                    selectedDifficulty ===
                                    DIFFICULTIES[
                                    DIFFICULTIES.length - 1
                                    ]
                                }
                                className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-none border border-white/10 bg-white/[0.025] text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-20 sm:flex"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Difficulty heading */}

                    <div className="border-b border-white/10 px-5 py-4">
                        <div className="mx-auto flex max-w-5xl items-end justify-between">
                            <div>
                                <div className="flex items-center gap-3">
                                    <span
                                        className="h-2.5 w-2.5 rounded-none"
                                        style={{
                                            backgroundColor:
                                                DIFFICULTY_CONFIG[
                                                    selectedDifficulty
                                                ].color,
                                            boxShadow: `0 0 14px ${DIFFICULTY_CONFIG[selectedDifficulty].color}`,
                                        }}
                                    />

                                    <h2 className="text-lg font-black tracking-widest">
                                        {
                                            DIFFICULTY_CONFIG[
                                                selectedDifficulty
                                            ].label
                                        }
                                    </h2>
                                </div>

                                <p className="mt-1 text-xs text-slate-500">
                                    {
                                        difficultyDescriptions[
                                        selectedDifficulty
                                        ]
                                    }
                                </p>
                            </div>

                            <p className="text-xs font-bold tracking-widest text-slate-600">
                                {visibleLevels.length} MISSIONS
                            </p>
                        </div>
                    </div>

                    {/* Level grid */}

                    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                        <div className="mx-auto grid max-w-5xl grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
                            {visibleLevels.map(
                                (level) => {
                                    const unlocked =
                                        isLevelUnlocked(
                                            level.id,
                                            completedLevels
                                        );

                                    const selected =
                                        selectedLevel ===
                                        level.id;

                                    const completed =
                                        completedLevels.includes(
                                            level.id
                                        );

                                    const stars =
                                        getStars(
                                            level.id,
                                            levelStars
                                        );

                                    const map =
                                        getMapForLevel(
                                            level.id
                                        );

                                    const config =
                                        DIFFICULTY_CONFIG[
                                        level.difficulty
                                        ];

                                    return (
                                        <button
                                            key={level.id}
                                            type="button"
                                            disabled={!unlocked}
                                            onClick={() =>
                                                selectLevel(
                                                    level.id
                                                )
                                            }
                                            className="group relative aspect-square overflow-hidden border text-left transition-all duration-200 hover:-translate-y-0.5"
                                            style={{
                                                borderColor:
                                                    selected
                                                        ? `${config.color}99`
                                                        : unlocked
                                                            ? "rgba(255,255,255,0.10)"
                                                            : "rgba(255,255,255,0.045)",
                                                backgroundColor:
                                                    selected
                                                        ? `${config.color}12`
                                                        : unlocked
                                                            ? "rgba(15,23,42,0.65)"
                                                            : "rgba(15,23,42,0.35)",
                                                boxShadow:
                                                    selected
                                                        ? `0 0 30px ${config.color}18`
                                                        : "none",
                                            }}
                                        >
                                            {/* Top accent */}

                                            <div
                                                className="absolute inset-x-0 top-0 h-[2px] opacity-70"
                                                style={{
                                                    backgroundColor:
                                                        unlocked
                                                            ? config.color
                                                            : "#334155",
                                                }}
                                            />

                                            {/* Level number */}

                                            <div className="absolute left-3 top-3">
                                                <p className="text-[9px] font-bold tracking-widest text-slate-500">
                                                    LEVEL
                                                </p>

                                                <p
                                                    className="text-2xl font-black"
                                                    style={{
                                                        color: unlocked
                                                            ? "#ffffff"
                                                            : "#475569",
                                                    }}
                                                >
                                                    {String(
                                                        level.id
                                                    ).padStart(2, "0")}
                                                </p>
                                            </div>

                                            {/* Boss */}

                                            {level.hasBoss && (
                                                <div className="absolute right-3 top-3 rounded-md border border-red-400/30 bg-red-400/10 px-1.5 py-1 text-[7px] font-black tracking-widest text-red-400">
                                                    BOSS
                                                </div>
                                            )}

                                            {/* Lock */}

                                            {!unlocked && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-none border border-white/10 bg-black/40">
                                                        <Lock
                                                            size={17}
                                                            className="text-slate-600"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {/* Map */}

                                            <div className="absolute bottom-3 left-3 right-3">
                                                <p
                                                    className="truncate text-[10px] font-bold"
                                                    style={{
                                                        color: unlocked
                                                            ? "#cbd5e1"
                                                            : "#475569",
                                                    }}
                                                >
                                                    {map?.name ??
                                                        "Unknown Map"}
                                                </p>

                                                <div className="mt-2 flex items-center gap-0.5">
                                                    {[1, 2, 3].map(
                                                        (star) => (
                                                            <Star
                                                                key={star}
                                                                size={11}
                                                                className={
                                                                    star <= stars
                                                                        ? "fill-yellow-400 text-yellow-400"
                                                                        : "text-slate-700"
                                                                }
                                                            />
                                                        )
                                                    )}
                                                </div>
                                            </div>

                                            {/* Completed indicator */}

                                            {completed && (
                                                <div
                                                    className="absolute bottom-3 right-3 h-2 w-2 rounded-none"
                                                    style={{
                                                        backgroundColor:
                                                            config.color,
                                                        boxShadow: `0 0 10px ${config.color}`,
                                                    }}
                                                />
                                            )}

                                            {/* Selected indicator */}

                                            {selected && (
                                                <div
                                                    className="absolute bottom-0 left-1/2 h-1 w-10 -translate-x-1/2 rounded-t-full"
                                                    style={{
                                                        backgroundColor:
                                                            config.color,
                                                        boxShadow: `0 0 14px ${config.color}`,
                                                    }}
                                                />
                                            )}
                                        </button>
                                    );
                                }
                            )}
                        </div>
                    </div>
                </div>

                {/* ===================================================
            RIGHT PREVIEW
        =================================================== */}

                <aside className="hidden w-[360px] shrink-0 flex-col bg-black/20 xl:flex">
                    <div className="border-b border-white/10 p-6">
                        <p className="text-[10px] font-bold tracking-[0.35em] text-cyan-400">
                            MISSION BRIEFING
                        </p>

                        <div className="mt-2 flex items-end justify-between gap-4">
                            <div>
                                <p className="text-sm font-bold text-slate-500">
                                    LEVEL
                                </p>

                                <h2 className="text-5xl font-black">
                                    {selectedLevel
                                        .toString()
                                        .padStart(2, "0")}
                                </h2>
                            </div>

                            {selectedLevelData?.hasBoss && (
                                <div className="rounded-none border border-red-400/30 bg-red-400/10 px-3 py-2 text-right">
                                    <p className="text-[8px] font-black tracking-widest text-red-400">
                                        BOSS MISSION
                                    </p>

                                    <p className="mt-1 text-xs font-bold text-red-300">
                                        {selectedLevelData.bossName}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        {selectedLevelData && (
                            <>
                                {/* Mission title */}

                                <h3 className="text-2xl font-black tracking-wide">
                                    {selectedLevelData.name}
                                </h3>

                                {/* Difficulty */}

                                <div className="mt-4 flex items-center gap-2">
                                    <span
                                        className="rounded-md px-2 py-1 text-[9px] font-black tracking-widest"
                                        style={{
                                            color:
                                                DIFFICULTY_CONFIG[
                                                    selectedLevelData
                                                        .difficulty
                                                ].color,
                                            backgroundColor: `${DIFFICULTY_CONFIG[
                                                selectedLevelData
                                                    .difficulty
                                            ].color
                                                }15`,
                                            border: `1px solid ${DIFFICULTY_CONFIG[
                                                selectedLevelData
                                                    .difficulty
                                            ].color
                                                }40`,
                                        }}
                                    >
                                        {getDifficultyLabel(
                                            selectedLevelData.difficulty
                                        )}
                                    </span>

                                    <span className="text-xs text-slate-600">
                                        MISSION {selectedLevel}
                                    </span>
                                </div>

                                {/* Map card */}

                                <div className="mt-6 overflow-hidden rounded-none border border-white/10 bg-white/[0.025]">
                                    <div className="relative h-32 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950">
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(34,211,238,0.14),transparent_35%)]" />

                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <MapPin
                                                size={38}
                                                className="text-cyan-400/50"
                                            />
                                        </div>

                                        <div className="absolute bottom-3 left-3">
                                            <p className="text-[9px] font-bold tracking-widest text-cyan-400">
                                                OPERATION AREA
                                            </p>

                                            <p className="text-lg font-black">
                                                {selectedMap?.name ??
                                                    "Unknown Map"}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="p-4">
                                        <p className="text-xs leading-5 text-slate-400">
                                            {selectedMap?.description ??
                                                "Enter the arena and complete the mission."}
                                        </p>

                                        <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                            Environment
                                        </p>

                                        <p className="mt-1 text-xs text-slate-500">
                                            {selectedMap?.environment ??
                                                "Combat arena"}
                                        </p>
                                    </div>
                                </div>

                                {/* Stats */}

                                <div className="mt-4 grid grid-cols-2 gap-2">
                                    <div className="rounded-none border border-white/10 bg-white/[0.025] p-3">
                                        <div className="flex items-center gap-2">
                                            <Zap
                                                size={14}
                                                className="text-yellow-400"
                                            />

                                            <span className="text-[9px] font-bold tracking-widest text-slate-500">
                                                WAVES
                                            </span>
                                        </div>

                                        <p className="mt-2 text-xl font-black">
                                            {selectedLevelData.waves}
                                        </p>
                                    </div>

                                    <div className="rounded-none border border-white/10 bg-white/[0.025] p-3">
                                        <div className="flex items-center gap-2">
                                            <Shield
                                                size={14}
                                                className="text-cyan-400"
                                            />

                                            <span className="text-[9px] font-bold tracking-widest text-slate-500">
                                                LIVES
                                            </span>
                                        </div>

                                        <p className="mt-2 text-xl font-black">
                                            {selectedLevelData.startingLives}
                                        </p>
                                    </div>

                                    <div className="rounded-none border border-white/10 bg-white/[0.025] p-3">
                                        <div className="flex items-center gap-2">
                                            <Trophy
                                                size={14}
                                                className="text-orange-400"
                                            />

                                            <span className="text-[9px] font-bold tracking-widest text-slate-500">
                                                ENEMIES
                                            </span>
                                        </div>

                                        <p className="mt-2 text-xl font-black">
                                            {selectedLevelData.enemyCount}
                                        </p>
                                    </div>

                                    <div className="rounded-none border border-white/10 bg-white/[0.025] p-3">
                                        <div className="flex items-center gap-2">
                                            <Star
                                                size={14}
                                                className="text-yellow-400"
                                            />

                                            <span className="text-[9px] font-bold tracking-widest text-slate-500">
                                                REWARD
                                            </span>
                                        </div>

                                        <p className="mt-2 text-xl font-black">
                                            {selectedLevelData.xpReward}
                                            <span className="text-xs text-slate-500">
                                                {" "}
                                                XP
                                            </span>
                                        </p>
                                    </div>
                                </div>

                                {/* Objectives */}

                                <div className="mt-6">
                                    <p className="text-[10px] font-black tracking-[0.3em] text-slate-500">
                                        OBJECTIVES
                                    </p>

                                    <div className="mt-3 space-y-2">
                                        {selectedLevelData.objectives.map(
                                            (
                                                objective,
                                                index
                                            ) => (
                                                <div
                                                    key={`${objective.type}-${index}`}
                                                    className="rounded-none border border-white/10 bg-white/[0.025] p-3"
                                                >
                                                    <div className="flex gap-3">
                                                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-[10px] font-black text-cyan-400">
                                                            {index + 1}
                                                        </div>

                                                        <div>
                                                            <p className="text-xs font-bold text-slate-200">
                                                                {objective.title}
                                                            </p>

                                                            <p className="mt-1 text-[10px] leading-4 text-slate-500">
                                                                {
                                                                    objective.description
                                                                }
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>

                                {/* Rewards */}

                                <div className="mt-6 rounded-none border border-yellow-400/10 bg-yellow-400/[0.025] p-4">
                                    <p className="text-[9px] font-black tracking-[0.3em] text-yellow-500">
                                        MISSION REWARDS
                                    </p>

                                    <div className="mt-3 flex items-center justify-between">
                                        <div>
                                            <p className="text-[9px] text-slate-500">
                                                EXPERIENCE
                                            </p>

                                            <p className="text-lg font-black text-yellow-300">
                                                +{selectedLevelData.xpReward} XP
                                            </p>
                                        </div>

                                        <div className="text-right">
                                            <p className="text-[9px] text-slate-500">
                                                CREDITS
                                            </p>

                                            <p className="text-lg font-black text-yellow-300">
                                                +{selectedLevelData.creditReward}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Play button */}

                    <div className="border-t border-white/10 p-5">
                        <button
                            type="button"
                            onClick={() =>
                                onSelectLevel(
                                    selectedLevel
                                )
                            }
                            disabled={
                                !isLevelUnlocked(
                                    selectedLevel,
                                    completedLevels
                                )
                            }
                            className="flex w-full items-center justify-center gap-3 rounded-none border border-cyan-400/40 bg-cyan-400/10 px-5 py-4 text-sm font-black tracking-[0.18em] text-cyan-300 transition hover:bg-cyan-400/20 hover:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-white/[0.025] disabled:text-slate-600"
                        >
                            <Play
                                size={18}
                                fill="currentColor"
                            />

                            PLAY LEVEL {selectedLevel}
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
}