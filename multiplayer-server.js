const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3001;
const MAX_PLAYERS = 4;
const ROOM_CODE_LENGTH = 6;

const leaderboardFile = path.join(
    __dirname,
    "arena-strike-leaderboard.json"
);

const MAX_LEADERBOARD_ENTRIES = 50;

const httpServer = http.createServer((req, res) => {
    if (req.url === "/health") {
        res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        });

        res.end(
            JSON.stringify({
                ok: true,
                service: "arena-strike-multiplayer-server",
                port: PORT,
                rooms: rooms.size,
                players: getTotalPlayers(),
                leaderboardEntries: leaderboard.length,
                timestamp: Date.now(),
            })
        );

        return;
    }

    res.writeHead(200, {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
    });

    res.end("Arena Strike multiplayer server is running.");
});

const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
});

const rooms = new Map();

/*
  Room structure:

  {
    code: string,
    hostId: string,
    started: boolean,
    level: number | null,
    missionState: object | null,
    missionResultIssued: boolean,

    players: Map(socketId, {
      id,
      name,
      ready
    }),

    playerStates: Map(socketId, {
      id,
      name,
      x,
      y,
      angle,
      health,
      maxHealth,
      weapon,
      score,
      downed,
      lives,
      respawning,
      combatStats,
      timestamp
    })
  }
*/

let leaderboard = loadLeaderboard();

/* ============================================================
   LEADERBOARD
   ============================================================ */

function loadLeaderboard() {
    try {
        if (!fs.existsSync(leaderboardFile)) {
            return [];
        }

        const raw = fs.readFileSync(
            leaderboardFile,
            "utf8"
        );

        if (!raw.trim()) {
            return [];
        }

        const parsed = JSON.parse(raw);

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .filter((entry) => {
                return (
                    entry &&
                    typeof entry.name === "string" &&
                    Number.isFinite(Number(entry.score)) &&
                    Number.isFinite(Number(entry.level)) &&
                    Number.isFinite(Number(entry.stars))
                );
            })
            .map((entry) => ({
                name: sanitizePlayerName(entry.name),
                score: Math.max(
                    0,
                    Math.floor(Number(entry.score))
                ),
                level: clamp(
                    Math.floor(Number(entry.level)),
                    1,
                    60
                ),
                stars: clamp(
                    Math.floor(Number(entry.stars)),
                    0,
                    3
                ),
                timestamp:
                    Number.isFinite(Number(entry.timestamp))
                        ? Number(entry.timestamp)
                        : Date.now(),
            }))
            .sort(compareLeaderboardEntries)
            .slice(
                0,
                MAX_LEADERBOARD_ENTRIES
            );
    } catch (error) {
        console.error(
            "[LEADERBOARD] Failed to load leaderboard:",
            error.message
        );

        return [];
    }
}

function saveLeaderboard() {
    try {
        fs.writeFileSync(
            leaderboardFile,
            JSON.stringify(
                leaderboard,
                null,
                2
            ),
            "utf8"
        );
    } catch (error) {
        console.error(
            "[LEADERBOARD] Failed to save leaderboard:",
            error.message
        );
    }
}

function compareLeaderboardEntries(
    a,
    b
) {
    if (b.score !== a.score) {
        return b.score - a.score;
    }

    if (b.level !== a.level) {
        return b.level - a.level;
    }

    if (b.stars !== a.stars) {
        return b.stars - a.stars;
    }

    return b.timestamp - a.timestamp;
}

function getLeaderboard() {
    return leaderboard.map(
        (entry, index) => ({
            rank: index + 1,
            name: entry.name,
            score: entry.score,
            level: entry.level,
            stars: entry.stars,
            timestamp: entry.timestamp,
        })
    );
}

function sanitizePlayerName(value) {
    const name = String(value || "")
        .replace(/[<>]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (!name) {
        return "Operator";
    }

    return name.slice(0, 24);
}

function submitLeaderboardEntry(
    payload
) {
    const name =
        sanitizePlayerName(
            payload?.name
        );

    const score =
        Number.isFinite(
            Number(payload?.score)
        )
            ? Math.max(
                0,
                Math.floor(
                    Number(
                        payload.score
                    )
                )
            )
            : 0;

    const level =
        Number.isFinite(
            Number(payload?.level)
        )
            ? clamp(
                Math.floor(
                    Number(
                        payload.level
                    )
                ),
                1,
                60
            )
            : 1;

    const stars =
        Number.isFinite(
            Number(payload?.stars)
        )
            ? clamp(
                Math.floor(
                    Number(
                        payload.stars
                    )
                ),
                0,
                3
            )
            : 0;

    const entry = {
        name,
        score,
        level,
        stars,
        timestamp: Date.now(),
    };

    leaderboard.push(entry);

    leaderboard.sort(
        compareLeaderboardEntries
    );

    leaderboard =
        leaderboard.slice(
            0,
            MAX_LEADERBOARD_ENTRIES
        );

    saveLeaderboard();

    return entry;
}

/* ============================================================
   UTILITY
   ============================================================ */

function clamp(
    value,
    min,
    max
) {
    return Math.max(
        min,
        Math.min(max, value)
    );
}

function generateRoomCode() {
    const alphabet =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

    for (
        let i = 0;
        i < ROOM_CODE_LENGTH;
        i += 1
    ) {
        code +=
            alphabet[
            Math.floor(
                Math.random() *
                alphabet.length
            )
            ];
    }

    return code;
}

function createUniqueRoomCode() {
    let code =
        generateRoomCode();

    while (rooms.has(code)) {
        code =
            generateRoomCode();
    }

    return code;
}

function getTotalPlayers() {
    let total = 0;

    for (
        const room of rooms.values()
    ) {
        total += room.players.size;
    }

    return total;
}

function getRoom(code) {
    if (!code) {
        return null;
    }

    return (
        rooms.get(
            String(code)
                .trim()
                .toUpperCase()
        ) || null
    );
}

function sanitizeRoomCode(
    value
) {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(
            0,
            ROOM_CODE_LENGTH
        );
}

function sanitizeLevel(value) {
    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return 1;
    }

    return clamp(
        Math.floor(number),
        1,
        60
    );
}

function sanitizeWave(value) {
    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return 1;
    }

    return clamp(
        Math.floor(number),
        1,
        5
    );
}

function sanitizeProgress(
    value
) {
    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return clamp(
        number,
        0,
        1000000
    );
}

function sanitizeObjectiveType(
    value
) {
    const allowed =
        new Set([
            "eliminate",
            "survive",
            "defend",
            "collect",
            "destroy",
            "time",
            "boss",
        ]);

    const type =
        String(value || "");

    return allowed.has(type)
        ? type
        : "eliminate";
}

function sanitizeMissionStatus(
    value
) {
    const allowed =
        new Set([
            "playing",
            "wave-transition",
            "complete",
            "failed",
        ]);

    const status =
        String(value || "");

    return allowed.has(status)
        ? status
        : "playing";
}

/* ============================================================
   PLAYER SERIALIZATION
   ============================================================ */

function serializePlayers(
    room
) {
    return Array.from(
        room.players.values()
    ).map((player) => ({
        id: player.id,
        name: player.name,
        ready: player.ready,
        host:
            player.id ===
            room.hostId,
    }));
}

function emitRoomUpdate(
    room
) {
    io.to(room.code).emit(
        "room-update",
        {
            code: room.code,
            hostId:
                room.hostId,
            started:
                room.started,
            level:
                room.level,
            players:
                serializePlayers(
                    room
                ),
        }
    );
}

/* ============================================================
   MISSION STATE
   ============================================================ */

function sanitizeBossState(
    boss
) {
    if (
        !boss ||
        typeof boss !==
        "object"
    ) {
        return null;
    }

    return {
        active:
            Boolean(
                boss.active
            ),

        name:
            typeof boss.name ===
                "string"
                ? boss.name.slice(
                    0,
                    48
                )
                : "UNKNOWN BOSS",

        phase:
            boss.phase ===
                "enraged" ||
                boss.phase ===
                "critical"
                ? boss.phase
                : "assault",

        health:
            Number.isFinite(
                Number(
                    boss.health
                )
            )
                ? Math.max(
                    0,
                    Number(
                        boss.health
                    )
                )
                : 0,

        maxHealth:
            Number.isFinite(
                Number(
                    boss.maxHealth
                )
            )
                ? Math.max(
                    1,
                    Number(
                        boss.maxHealth
                    )
                )
                : 1,
    };
}

function sanitizeMissionState(
    payload
) {
    const state =
        payload &&
            typeof payload ===
            "object"
            ? payload
            : {};

    const level =
        sanitizeLevel(
            state.level
        );

    const maxWaves =
        clamp(
            Number.isFinite(
                Number(
                    state.maxWaves
                )
            )
                ? Math.floor(
                    Number(
                        state.maxWaves
                    )
                )
                : 1,
            1,
            5
        );

    const wave =
        clamp(
            sanitizeWave(
                state.wave
            ),
            1,
            maxWaves
        );

    const objectiveTarget =
        Math.max(
            0,
            Math.floor(
                Number.isFinite(
                    Number(
                        state.objectiveTarget
                    )
                )
                    ? Number(
                        state.objectiveTarget
                    )
                    : 0
            )
        );

    const objectiveProgress =
        Math.max(
            0,
            Math.floor(
                sanitizeProgress(
                    state.objectiveProgress
                )
            )
        );

    return {
        level,

        wave,

        maxWaves,

        objectiveType:
            sanitizeObjectiveType(
                state.objectiveType
            ),

        objectiveProgress,

        objectiveTarget,

        status:
            sanitizeMissionStatus(
                state.status
            ),

        boss:
            sanitizeBossState(
                state.boss
            ),

        timestamp:
            Date.now(),
    };
}

/* ============================================================
   PLAYER STATE SNAPSHOT
   ============================================================ */

function emitPlayerStateSnapshot(
    room
) {
    if (
        !room ||
        !room.playerStates
    ) {
        return;
    }

    io.to(room.code).emit(
        "state-update",
        {
            players:
                Array.from(
                    room.playerStates.values()
                ),
            timestamp:
                Date.now(),
        }
    );
}

/* ============================================================
   SOCKET.IO
   ============================================================ */

io.on(
    "connection",
    (socket) => {
        console.log(
            `[CONNECT] ${socket.id}`
        );

        /* ------------------------------------------------------
           CREATE ROOM
           ------------------------------------------------------ */

        socket.on(
            "create-room",
            (payload = {}) => {
                if (
                    socket.data
                        .roomCode
                ) {
                    socket.emit(
                        "room-error",
                        {
                            message:
                                "You are already inside a room.",
                        }
                    );

                    return;
                }

                const code =
                    createUniqueRoomCode();

                const name =
                    sanitizePlayerName(
                        payload.name
                    );

                const room = {
                    code,
                    hostId:
                        socket.id,
                    started:
                        false,
                    level:
                        null,
                    missionState:
                        null,
                    missionResultIssued:
                        false,
                    players:
                        new Map(),
                    playerStates:
                        new Map(),
                };

                room.players.set(
                    socket.id,
                    {
                        id:
                            socket.id,
                        name,
                        ready:
                            false,
                    }
                );

                room.playerStates.set(
                    socket.id,
                    {
                        id:
                            socket.id,
                        name,
                        x: 0,
                        y: 0,
                        angle: 0,
                        health: 100,
                        maxHealth: 100,
                        weapon:
                            "pistol",
                        score: 0,
                        downed:
                            false,
                        lives: 3,
                        respawning:
                            false,
                        combatStats: {
                            kills: 0,
                            damage: 0,
                            shotsFired: 0,
                            shotsHit: 0,
                            revives: 0,
                            downs: 0,
                        },
                        timestamp:
                            Date.now(),
                    }
                );

                rooms.set(
                    code,
                    room
                );

                socket.join(
                    code
                );

                socket.data.roomCode =
                    code;

                socket.data.playerName =
                    name;

                socket.emit(
                    "room-created",
                    {
                        code,
                        hostId:
                            socket.id,
                        players:
                            serializePlayers(
                                room
                            ),
                    }
                );

                emitRoomUpdate(
                    room
                );

                console.log(
                    `[ROOM] Created ${code} by ${name} (${socket.id})`
                );
            }
        );

        /* ------------------------------------------------------
           JOIN ROOM
           ------------------------------------------------------ */

        socket.on(
            "join-room",
            (payload = {}) => {
                if (
                    socket.data
                        .roomCode
                ) {
                    socket.emit(
                        "room-error",
                        {
                            message:
                                "You are already inside a room.",
                        }
                    );

                    return;
                }

                const code =
                    sanitizeRoomCode(
                        payload.code
                    );

                const room =
                    getRoom(code);

                if (!room) {
                    socket.emit(
                        "room-error",
                        {
                            message:
                                "Room not found.",
                        }
                    );

                    return;
                }

                if (room.started) {
                    socket.emit(
                        "room-error",
                        {
                            message:
                                "Match already started.",
                        }
                    );

                    return;
                }

                if (
                    room.players.size >=
                    MAX_PLAYERS
                ) {
                    socket.emit(
                        "room-error",
                        {
                            message:
                                "Room is full.",
                        }
                    );

                    return;
                }

                const name =
                    sanitizePlayerName(
                        payload.name
                    );

                room.players.set(
                    socket.id,
                    {
                        id:
                            socket.id,
                        name,
                        ready:
                            false,
                    }
                );

                if (
                    !room.playerStates
                ) {
                    room.playerStates =
                        new Map();
                }

                room.playerStates.set(
                    socket.id,
                    {
                        id:
                            socket.id,
                        name,
                        x: 0,
                        y: 0,
                        angle: 0,
                        health: 100,
                        maxHealth: 100,
                        weapon:
                            "pistol",
                        score: 0,
                        downed:
                            false,
                        lives: 3,
                        respawning:
                            false,
                        combatStats: {
                            kills: 0,
                            damage: 0,
                            shotsFired: 0,
                            shotsHit: 0,
                            revives: 0,
                            downs: 0,
                        },
                        timestamp:
                            Date.now(),
                    }
                );

                socket.join(
                    room.code
                );

                socket.data.roomCode =
                    room.code;

                socket.data.playerName =
                    name;

                socket.emit(
                    "room-joined",
                    {
                        code:
                            room.code,
                        hostId:
                            room.hostId,
                        players:
                            serializePlayers(
                                room
                            ),
                        level:
                            room.level,
                        missionState:
                            room.missionState,
                    }
                );

                emitRoomUpdate(
                    room
                );

                if (
                    room.missionState
                ) {
                    socket.emit(
                        "mission-state",
                        room.missionState
                    );
                }

                emitPlayerStateSnapshot(
                    room
                );

                console.log(
                    `[ROOM] ${name} joined ${room.code}`
                );
            }
        );

        /* ------------------------------------------------------
           READY
           ------------------------------------------------------ */

        socket.on(
            "ready",
            (payload = {}) => {
                const room =
                    getRoom(
                        socket.data
                            .roomCode
                    );

                if (!room) {
                    socket.emit(
                        "room-error",
                        {
                            message:
                                "You are not inside a room.",
                        }
                    );

                    return;
                }

                const player =
                    room.players.get(
                        socket.id
                    );

                if (!player) {
                    return;
                }

                player.ready =
                    Boolean(
                        payload.ready
                    );

                emitRoomUpdate(
                    room
                );

                console.log(
                    `[READY] ${player.name}: ${player.ready}`
                );
            }
        );

        /* ------------------------------------------------------
           PLAYER STATE
           ------------------------------------------------------ */

        socket.on(
            "player-state",
            (payload = {}) => {
                const room =
                    getRoom(
                        socket.data
                            .roomCode
                    );

                if (!room) {
                    return;
                }

                const player =
                    room.players.get(
                        socket.id
                    );

                if (!player) {
                    return;
                }

                if (
                    !room.playerStates
                ) {
                    room.playerStates =
                        new Map();
                }

                const number =
                    (
                        value,
                        fallback = 0
                    ) =>
                        Number.isFinite(
                            Number(
                                value
                            )
                        )
                            ? Number(
                                value
                            )
                            : fallback;

                const combatStats =
                    payload.combatStats &&
                        typeof payload.combatStats ===
                        "object"
                        ? {
                            kills:
                                Math.max(
                                    0,
                                    Math.floor(
                                        number(
                                            payload
                                                .combatStats
                                                .kills
                                        )
                                    )
                                ),

                            damage:
                                Math.max(
                                    0,
                                    number(
                                        payload
                                            .combatStats
                                            .damage
                                    )
                                ),

                            shotsFired:
                                Math.max(
                                    0,
                                    Math.floor(
                                        number(
                                            payload
                                                .combatStats
                                                .shotsFired
                                        )
                                    )
                                ),

                            shotsHit:
                                Math.max(
                                    0,
                                    Math.floor(
                                        number(
                                            payload
                                                .combatStats
                                                .shotsHit
                                        )
                                    )
                                ),

                            revives:
                                Math.max(
                                    0,
                                    Math.floor(
                                        number(
                                            payload
                                                .combatStats
                                                .revives
                                        )
                                    )
                                ),

                            downs:
                                Math.max(
                                    0,
                                    Math.floor(
                                        number(
                                            payload
                                                .combatStats
                                                .downs
                                        )
                                    )
                                ),
                        }
                        : {
                            kills: 0,
                            damage: 0,
                            shotsFired: 0,
                            shotsHit: 0,
                            revives: 0,
                            downs: 0,
                        };

                const state = {
                    id:
                        socket.id,

                    name:
                        player.name,

                    x:
                        number(
                            payload.x
                        ),

                    y:
                        number(
                            payload.y
                        ),

                    angle:
                        number(
                            payload.angle
                        ),

                    health:
                        Math.max(
                            0,
                            number(
                                payload.health
                            )
                        ),

                    maxHealth:
                        Math.max(
                            1,
                            number(
                                payload.maxHealth,
                                100
                            )
                        ),

                    weapon:
                        typeof payload.weapon ===
                            "string"
                            ? payload.weapon.slice(
                                0,
                                32
                            )
                            : "pistol",

                    score:
                        Math.max(
                            0,
                            number(
                                payload.score
                            )
                        ),

                    downed:
                        Boolean(
                            payload.downed
                        ),

                    lives:
                        clamp(
                            Math.floor(
                                number(
                                    payload.lives,
                                    3
                                )
                            ),
                            0,
                            3
                        ),

                    respawning:
                        Boolean(
                            payload.respawning
                        ),

                    combatStats,

                    timestamp:
                        Date.now(),
                };

                room.playerStates.set(
                    socket.id,
                    state
                );

                socket
                    .to(room.code)
                    .emit(
                        "player-state",
                        state
                    );
            }
        );

        /* ------------------------------------------------------
           REQUEST CURRENT SQUAD STATE
           ------------------------------------------------------ */

        socket.on(
            "request-state",
            () => {
                const room =
                    getRoom(
                        socket.data
                            .roomCode
                    );

                if (!room) {
                    return;
                }

                emitPlayerStateSnapshot(
                    room
                );
            }
        );

        /* ------------------------------------------------------
           PLAYER REVIVE REQUEST
           ------------------------------------------------------ */

        socket.on(
            "player-revive-request",
            (payload = {}) => {
                const room =
                    getRoom(
                        socket.data
                            .roomCode
                    );

                if (
                    !room ||
                    !room.started
                ) {
                    return;
                }

                const targetId =
                    typeof payload.targetId ===
                        "string"
                        ? payload.targetId.slice(
                            0,
                            64
                        )
                        : "";

                if (
                    !targetId ||
                    targetId ===
                    socket.id
                ) {
                    return;
                }

                const requester =
                    room.playerStates.get(
                        socket.id
                    );

                const target =
                    room.playerStates.get(
                        targetId
                    );

                if (
                    !requester ||
                    !target
                ) {
                    return;
                }

                if (
                    requester.downed ||
                    requester.respawning
                ) {
                    return;
                }

                if (
                    !target.downed ||
                    target.respawning ||
                    target.lives <= 0
                ) {
                    return;
                }

                const dx =
                    requester.x -
                    target.x;

                const dy =
                    requester.y -
                    target.y;

                const distance =
                    Math.sqrt(
                        dx * dx +
                        dy * dy
                    );

                const REVIVE_DISTANCE =
                    95;

                if (
                    !Number.isFinite(
                        distance
                    ) ||
                    distance >
                    REVIVE_DISTANCE
                ) {
                    return;
                }

                const wave =
                    Number.isFinite(
                        Number(
                            payload.wave
                        )
                    )
                        ? clamp(
                            Math.floor(
                                Number(
                                    payload.wave
                                )
                            ),
                            1,
                            5
                        )
                        : 1;

                target.health =
                    Math.min(
                        50,
                        target.maxHealth ||
                        100
                    );

                target.downed =
                    false;

                target.respawning =
                    false;

                target.timestamp =
                    Date.now();

                target.combatStats = {
                    ...(target.combatStats ||
                        {}),
                };

                room.playerStates.set(
                    targetId,
                    target
                );

                io.to(
                    room.code
                ).emit(
                    "player-revive",
                    {
                        playerId:
                            targetId,

                        reviverId:
                            socket.id,

                        health:
                            target.health,

                        lives:
                            target.lives,

                        wave,

                        timestamp:
                            Date.now(),
                    }
                );

                emitPlayerStateSnapshot(
                    room
                );

                console.log(
                    `[LIFE] ${requester.name || socket.id} revived ${target.name || targetId}`
                );
            }
        );

        /* ------------------------------------------------------
           PLAYER PROJECTILE
           ------------------------------------------------------ */

        socket.on(
            "player-projectile",
            (payload = {}) => {
                const room =
                    getRoom(
                        socket.data
                            .roomCode
                    );

                if (!room) {
                    return;
                }

                const projectile = {
                    ownerId:
                        socket.id,

                    x:
                        Number.isFinite(
                            Number(
                                payload.x
                            )
                        )
                            ? Number(
                                payload.x
                            )
                            : 0,

                    y:
                        Number.isFinite(
                            Number(
                                payload.y
                            )
                        )
                            ? Number(
                                payload.y
                            )
                            : 0,

                    velocityX:
                        Number.isFinite(
                            Number(
                                payload.velocityX
                            )
                        )
                            ? Number(
                                payload.velocityX
                            )
                            : 0,

                    velocityY:
                        Number.isFinite(
                            Number(
                                payload.velocityY
                            )
                        )
                            ? Number(
                                payload.velocityY
                            )
                            : 0,

                    damage:
                        Number.isFinite(
                            Number(
                                payload.damage
                            )
                        )
                            ? clamp(
                                Number(
                                    payload.damage
                                ),
                                0,
                                500
                            )
                            : 0,

                    weapon:
                        typeof payload.weapon ===
                            "string"
                            ? payload.weapon.slice(
                                0,
                                32
                            )
                            : "pistol",

                    timestamp:
                        Date.now(),
                };

                socket
                    .to(room.code)
                    .emit(
                        "player-projectile",
                        projectile
                    );
            }
        );

        /* ------------------------------------------------------
           ENEMY STATE
           Host is authoritative.
           ------------------------------------------------------ */

        socket.on(
            "enemy-state",
            (payload = {}) => {
                const room =
                    getRoom(
                        socket.data
                            .roomCode
                    );

                if (!room) {
                    return;
                }

                if (
                    socket.id !==
                    room.hostId
                ) {
                    return;
                }

                if (
                    !Array.isArray(
                        payload.enemies
                    )
                ) {
                    return;
                }

                const enemies =
                    payload.enemies
                        .slice(
                            0,
                            200
                        )
                        .map(
                            (enemy) => {
                                return {
                                    networkId:
                                        typeof enemy.networkId ===
                                            "string"
                                            ? enemy.networkId.slice(
                                                0,
                                                64
                                            )
                                            : null,

                                    x:
                                        Number.isFinite(
                                            Number(
                                                enemy.x
                                            )
                                        )
                                            ? Number(
                                                enemy.x
                                            )
                                            : 0,

                                    y:
                                        Number.isFinite(
                                            Number(
                                                enemy.y
                                            )
                                        )
                                            ? Number(
                                                enemy.y
                                            )
                                            : 0,

                                    radius:
                                        Number.isFinite(
                                            Number(
                                                enemy.radius
                                            )
                                        )
                                            ? clamp(
                                                Number(
                                                    enemy.radius
                                                ),
                                                4,
                                                100
                                            )
                                            : 16,

                                    type:
                                        typeof enemy.type ===
                                            "string"
                                            ? enemy.type.slice(
                                                0,
                                                32
                                            )
                                            : "basic",

                                    health:
                                        Number.isFinite(
                                            Number(
                                                enemy.health
                                            )
                                        )
                                            ? Math.max(
                                                0,
                                                Number(
                                                    enemy.health
                                                )
                                            )
                                            : 0,

                                    maxHealth:
                                        Number.isFinite(
                                            Number(
                                                enemy.maxHealth
                                            )
                                        )
                                            ? Math.max(
                                                1,
                                                Number(
                                                    enemy.maxHealth
                                                )
                                            )
                                            : 100,

                                    angle:
                                        Number.isFinite(
                                            Number(
                                                enemy.angle
                                            )
                                        )
                                            ? Number(
                                                enemy.angle
                                            )
                                            : 0,

                                    isBoss:
                                        Boolean(
                                            enemy.isBoss
                                        ),

                                    bossPhase:
                                        enemy.bossPhase ===
                                            "enraged" ||
                                            enemy.bossPhase ===
                                            "critical"
                                            ? enemy.bossPhase
                                            : enemy.isBoss
                                                ? "assault"
                                                : undefined,
                                };
                            }
                        )
                        .filter(
                            (enemy) =>
                                enemy.networkId
                        );

                socket
                    .to(room.code)
                    .emit(
                        "enemy-state",
                        {
                            enemies,
                            timestamp:
                                Date.now(),
                        }
                    );
            }
        );

        /* ------------------------------------------------------
           ENEMY HIT
           Host is authoritative.
           ------------------------------------------------------ */

        socket.on(
            "enemy-hit",
            (payload = {}) => {
                const room =
                    getRoom(
                        socket.data
                            .roomCode
                    );

                if (!room) {
                    return;
                }

                if (
                    socket.id ===
                    room.hostId
                ) {
                    return;
                }

                const enemyId =
                    typeof payload.networkId ===
                        "string"
                        ? payload.networkId.slice(
                            0,
                            64
                        )
                        : "";

                if (!enemyId) {
                    return;
                }

                const damage =
                    Number.isFinite(
                        Number(
                            payload.damage
                        )
                    )
                        ? clamp(
                            Number(
                                payload.damage
                            ),
                            0,
                            500
                        )
                        : 0;

                if (damage <= 0) {
                    return;
                }

                const hit = {
                    playerId:
                        socket.id,

                    networkId:
                        enemyId,

                    damage,

                    weapon:
                        typeof payload.weapon ===
                            "string"
                            ? payload.weapon.slice(
                                0,
                                32
                            )
                            : "pistol",

                    timestamp:
                        Date.now(),
                };

                io.to(
                    room.hostId
                ).emit(
                    "enemy-hit",
                    hit
                );
            }
        );

        /* ------------------------------------------------------
           MISSION STATE
           Host is authoritative.
           ------------------------------------------------------ */

        socket.on(
            "mission-state",
            (payload = {}) => {
                const room =
                    getRoom(
                        socket.data
                            .roomCode
                    );

                if (!room) {
                    return;
                }

                if (
                    socket.id !==
                    room.hostId
                ) {
                    return;
                }

                const state =
                    sanitizeMissionState(
                        payload
                    );

                room.missionState =
                    state;

                room.level =
                    state.level;

                io.to(
                    room.code
                ).emit(
                    "mission-state",
                    state
                );
            }
        );
                /* ------------------------------------------------------
           BUILD MISSION RESULTS
           ------------------------------------------------------ */

        function buildMissionResults(
            room,
            state,
            completed
        ) {
            const players =
                room.playerStates
                    ? Array.from(
                          room.playerStates.values()
                      )
                    : [];

            const hostState =
                players.find(
                    (entry) =>
                        entry.id ===
                        room.hostId
                );

            const hostStats =
                hostState?.combatStats ||
                {};

            const payloadStats =
                state.stats &&
                typeof state.stats ===
                    "object"
                    ? state.stats
                    : {};

            const stats = {
                kills: Math.max(
                    0,
                    Math.floor(
                        Number(
                            payloadStats.kills ??
                                hostStats.kills
                        ) || 0
                    )
                ),

                damage: Math.max(
                    0,
                    Number(
                        payloadStats.damage ??
                            hostStats.damage
                    ) || 0
                ),

                shotsFired: Math.max(
                    0,
                    Math.floor(
                        Number(
                            payloadStats.shotsFired ??
                                hostStats.shotsFired
                        ) || 0
                    )
                ),

                shotsHit: Math.max(
                    0,
                    Math.floor(
                        Number(
                            payloadStats.shotsHit ??
                                hostStats.shotsHit
                        ) || 0
                    )
                ),

                revives: Math.max(
                    0,
                    Math.floor(
                        Number(
                            payloadStats.revives ??
                                hostStats.revives
                        ) || 0
                    )
                ),

                downs: Math.max(
                    0,
                    Math.floor(
                        Number(
                            payloadStats.downs ??
                                hostStats.downs
                        ) || 0
                    )
                ),
            };

            const squad =
                players.map(
                    (entry) => {
                        const combat =
                            entry.combatStats ||
                            {};

                        return {
                            id:
                                entry.id,

                            name:
                                sanitizePlayerName(
                                    entry.name
                                ),

                            kills:
                                Math.max(
                                    0,
                                    Math.floor(
                                        Number(
                                            combat.kills
                                        ) || 0
                                    )
                                ),

                            damage:
                                Math.max(
                                    0,
                                    Number(
                                        combat.damage
                                    ) || 0
                                ),

                            shotsFired:
                                Math.max(
                                    0,
                                    Math.floor(
                                        Number(
                                            combat.shotsFired
                                        ) || 0
                                    )
                                ),

                            shotsHit:
                                Math.max(
                                    0,
                                    Math.floor(
                                        Number(
                                            combat.shotsHit
                                        ) || 0
                                    )
                                ),

                            revives:
                                Math.max(
                                    0,
                                    Math.floor(
                                        Number(
                                            combat.revives
                                        ) || 0
                                    )
                                ),

                            downedCount:
                                Math.max(
                                    0,
                                    Math.floor(
                                        Number(
                                            combat.downs
                                        ) || 0
                                    )
                                ),

                            lives:
                                clamp(
                                    Math.floor(
                                        Number(
                                            entry.lives
                                        ) || 0
                                    ),
                                    0,
                                    3
                                ),
                        };
                    }
                );

            const duration =
                Math.max(
                    0,
                    Math.floor(
                        (
                            Date.now() -
                            (
                                room
                                    .missionState
                                    ?.startedAt ||
                                Date.now()
                            )
                        ) /
                            1000
                    )
                );

            const baseScore =
                Math.max(
                    0,
                    Math.floor(
                        Number(
                            state.score
                        ) || 0
                    )
                );

            const squadKills =
                squad.reduce(
                    (
                        sum,
                        entry
                    ) =>
                        sum +
                        entry.kills,
                    0
                );

            const squadRevives =
                squad.reduce(
                    (
                        sum,
                        entry
                    ) =>
                        sum +
                        entry.revives,
                    0
                );

            const remainingLives =
                squad.reduce(
                    (
                        sum,
                        entry
                    ) =>
                        sum +
                        entry.lives,
                    0
                );

            const squadScore =
                completed
                    ? baseScore +
                      squadKills *
                          25 +
                      squadRevives *
                          75 +
                      remainingLives *
                          100
                    : baseScore;

            const reward =
                state.reward &&
                typeof state.reward ===
                    "object"
                    ? {
                          xp: Math.max(
                              0,
                              Math.floor(
                                  Number(
                                      state
                                          .reward
                                          .xp
                                  ) || 0
                              )
                          ),

                          credits:
                              Math.max(
                                  0,
                                  Math.floor(
                                      Number(
                                          state
                                              .reward
                                              .credits
                                      ) || 0
                                  )
                              ),

                          stars:
                              clamp(
                                  Math.floor(
                                      Number(
                                          state
                                              .reward
                                              .stars
                                      ) || 0
                                  ),
                                  0,
                                  3
                              ),

                          rankUp:
                              Boolean(
                                  state
                                      .reward
                                      .rankUp
                              ),

                          newRank:
                              Math.max(
                                  1,
                                  Math.floor(
                                      Number(
                                          state
                                              .reward
                                              .newRank
                                      ) || 1
                                  )
                              ),

                          unlock:
                              typeof state
                                  .reward
                                  .unlock ===
                              "string"
                                  ? state.reward.unlock.slice(
                                        0,
                                        80
                                    )
                                  : null,
                      }
                    : null;

            return {
                level:
                    clamp(
                        Math.floor(
                            Number(
                                state.level
                            ) ||
                                room.level ||
                                1
                        ),
                        1,
                        60
                    ),

                mapName:
                    typeof state.mapName ===
                    "string"
                        ? state.mapName.slice(
                              0,
                              80
                          )
                        : "TACTICAL SECTOR",

                completed,

                score:
                    squadScore,

                duration,

                stars:
                    reward?.stars ||
                    0,

                stats,

                squad,

                reward,

                hostId:
                    room.hostId,

                timestamp:
                    Date.now(),
            };
        }

        /* ------------------------------------------------------
           MISSION COMPLETE
           Host is authoritative.
           ------------------------------------------------------ */

        socket.on(
            "mission-complete",
            (payload = {}) => {
                const room =
                    getRoom(
                        socket.data
                            .roomCode
                    );

                if (!room) {
                    return;
                }

                if (
                    socket.id !==
                    room.hostId
                ) {
                    return;
                }

                if (
                    room.missionResultIssued
                ) {
                    return;
                }

                const state =
                    sanitizeMissionState(
                        {
                            ...payload,
                            status:
                                "complete",
                        }
                    );

                state.score =
                    Number.isFinite(
                        Number(
                            payload.score
                        )
                    )
                        ? Math.max(
                              0,
                              Math.floor(
                                  Number(
                                      payload.score
                                  )
                              )
                          )
                        : 0;

                state.mapName =
                    typeof payload.mapName ===
                    "string"
                        ? payload.mapName.slice(
                              0,
                              80
                          )
                        : "TACTICAL SECTOR";

                state.reward =
                    payload.reward &&
                    typeof payload.reward ===
                        "object"
                        ? {
                              xp:
                                  Math.max(
                                      0,
                                      Math.floor(
                                          Number(
                                              payload
                                                  .reward
                                                  .xp
                                          ) || 0
                                      )
                                  ),

                              credits:
                                  Math.max(
                                      0,
                                      Math.floor(
                                          Number(
                                              payload
                                                  .reward
                                                  .credits
                                          ) || 0
                                      )
                                  ),

                              stars:
                                  clamp(
                                      Math.floor(
                                          Number(
                                              payload
                                                  .reward
                                                  .stars
                                          ) || 0
                                      ),
                                      0,
                                      3
                                  ),

                              rankUp:
                                  Boolean(
                                      payload
                                          .reward
                                          .rankUp
                                  ),

                              newRank:
                                  Math.max(
                                      1,
                                      Math.floor(
                                          Number(
                                              payload
                                                  .reward
                                                  .newRank
                                          ) || 1
                                      )
                                  ),

                              unlock:
                                  typeof payload
                                      .reward
                                      .unlock ===
                                  "string"
                                      ? payload.reward.unlock.slice(
                                            0,
                                            80
                                        )
                                      : null,
                          }
                        : null;

                state.stats =
                    payload.stats &&
                    typeof payload.stats ===
                        "object"
                        ? payload.stats
                        : {};

                state.startedAt =
                    room
                        .missionState
                        ?.startedAt ||
                    Date.now();

                room.missionState =
                    state;

                room.missionResultIssued =
                    true;

                const results =
                    buildMissionResults(
                        room,
                        state,
                        true
                    );

                io.to(
                    room.code
                ).emit(
                    "mission-complete",
                    {
                        ...state,
                        timestamp:
                            Date.now(),
                    }
                );

                io.to(
                    room.code
                ).emit(
                    "mission-results",
                    results
                );

                console.log(
                    `[MISSION] ${room.code} completed level ${results.level} | Squad score ${results.score}`
                );
            }
        );

        /* ------------------------------------------------------
           MISSION FAILED
           Host is authoritative.
           ------------------------------------------------------ */

        socket.on(
            "mission-failed",
            (payload = {}) => {
                const room =
                    getRoom(
                        socket.data
                            .roomCode
                    );

                if (!room) {
                    return;
                }

                if (
                    socket.id !==
                    room.hostId
                ) {
                    return;
                }

                if (
                    room.missionResultIssued
                ) {
                    return;
                }

                const state =
                    sanitizeMissionState(
                        {
                            ...payload,
                            status:
                                "failed",
                        }
                    );

                state.score =
                    Number.isFinite(
                        Number(
                            payload.score
                        )
                    )
                        ? Math.max(
                              0,
                              Math.floor(
                                  Number(
                                      payload.score
                                  )
                              )
                          )
                        : 0;

                state.mapName =
                    typeof payload.mapName ===
                    "string"
                        ? payload.mapName.slice(
                              0,
                              80
                          )
                        : "TACTICAL SECTOR";

                state.stats =
                    payload.stats &&
                    typeof payload.stats ===
                        "object"
                        ? payload.stats
                        : {};

                state.startedAt =
                    room
                        .missionState
                        ?.startedAt ||
                    Date.now();

                room.missionState =
                    state;

                room.missionResultIssued =
                    true;

                const results =
                    buildMissionResults(
                        room,
                        state,
                        false
                    );

                io.to(
                    room.code
                ).emit(
                    "mission-failed",
                    {
                        ...state,
                        timestamp:
                            Date.now(),
                    }
                );

                io.to(
                    room.code
                ).emit(
                    "mission-results",
                    results
                );

                console.log(
                    `[MISSION] ${room.code} failed level ${results.level} | Squad score ${results.score}`
                );
            }
        );

        /* ------------------------------------------------------
           START MATCH
           Host only.
           ------------------------------------------------------ */

        socket.on(
            "start-match",
            (payload = {}) => {
                const room =
                    getRoom(
                        socket.data
                            .roomCode
                    );

                if (!room) {
                    socket.emit(
                        "room-error",
                        {
                            message:
                                "Room not found.",
                        }
                    );

                    return;
                }

                if (
                    socket.id !==
                    room.hostId
                ) {
                    socket.emit(
                        "room-error",
                        {
                            message:
                                "Only the host can start the match.",
                        }
                    );

                    return;
                }

                const allReady =
                    room.players.size >
                        0 &&
                    Array.from(
                        room.players.values()
                    ).every(
                        (player) =>
                            player.ready
                    );

                if (!allReady) {
                    socket.emit(
                        "room-error",
                        {
                            message:
                                "All operators must be ready.",
                        }
                    );

                    return;
                }

                room.started =
                    true;

                room.missionResultIssued =
                    false;

                if (
                    !room.playerStates
                ) {
                    room.playerStates =
                        new Map();
                }

                for (
                    const player of
                        room.players.values()
                ) {
                    room.playerStates.set(
                        player.id,
                        {
                            id:
                                player.id,

                            name:
                                player.name,

                            x: 0,
                            y: 0,
                            angle: 0,

                            health: 100,
                            maxHealth: 100,

                            weapon:
                                "pistol",

                            score: 0,

                            downed:
                                false,

                            lives: 3,

                            respawning:
                                false,

                            combatStats: {
                                kills: 0,
                                damage: 0,
                                shotsFired: 0,
                                shotsHit: 0,
                                revives: 0,
                                downs: 0,
                            },

                            timestamp:
                                Date.now(),
                        }
                    );
                }

                room.level =
                    sanitizeLevel(
                        payload.level
                    );

                room.missionState =
                    {
                        level:
                            room.level,

                        wave: 1,

                        maxWaves:
                            clamp(
                                Number.isFinite(
                                    Number(
                                        payload.maxWaves
                                    )
                                )
                                    ? Math.floor(
                                          Number(
                                              payload.maxWaves
                                          )
                                      )
                                    : 1,
                                1,
                                5
                            ),

                        objectiveType:
                            sanitizeObjectiveType(
                                payload.objectiveType
                            ),

                        objectiveProgress:
                            0,

                        objectiveTarget:
                            Math.max(
                                0,
                                Math.floor(
                                    Number.isFinite(
                                        Number(
                                            payload.objectiveTarget
                                        )
                                    )
                                        ? Number(
                                              payload.objectiveTarget
                                          )
                                        : 0
                                )
                            ),

                        status:
                            "playing",

                        boss:
                            null,

                        startedAt:
                            Date.now(),

                        timestamp:
                            Date.now(),
                    };

                io.to(
                    room.code
                ).emit(
                    "match-start",
                    {
                        code:
                            room.code,

                        hostId:
                            room.hostId,

                        level:
                            room.level,

                        players:
                            serializePlayers(
                                room
                            ),
                    }
                );

                io.to(
                    room.code
                ).emit(
                    "mission-state",
                    room.missionState
                );

                emitPlayerStateSnapshot(
                    room
                );

                console.log(
                    `[MATCH] Started room ${room.code} at level ${room.level}`
                );
            }
        );

        /* ------------------------------------------------------
           LEADERBOARD GET
           ------------------------------------------------------ */

        socket.on(
            "leaderboard-get",
            () => {
                socket.emit(
                    "leaderboard-data",
                    {
                        entries:
                            getLeaderboard(),

                        timestamp:
                            Date.now(),
                    }
                );
            }
        );

        /* ------------------------------------------------------
           LEADERBOARD SUBMIT
           ------------------------------------------------------ */

        socket.on(
            "leaderboard-submit",
            (payload = {}) => {
                try {
                    const entry =
                        submitLeaderboardEntry(
                            payload
                        );

                    const entries =
                        getLeaderboard();

                    socket.emit(
                        "leaderboard-submitted",
                        {
                            success:
                                true,

                            entry,

                            entries,

                            timestamp:
                                Date.now(),
                        }
                    );

                    io.emit(
                        "leaderboard-data",
                        {
                            entries,

                            timestamp:
                                Date.now(),
                        }
                    );

                    console.log(
                        `[LEADERBOARD] ${entry.name} | ${entry.score} | Level ${entry.level} | ${entry.stars} stars`
                    );
                } catch (
                    error
                ) {
                    console.error(
                        "[LEADERBOARD] Submission error:",
                        error.message
                    );

                    socket.emit(
                        "leaderboard-error",
                        {
                            message:
                                "Unable to submit leaderboard record.",
                        }
                    );
                }
            }
        );

        /* ------------------------------------------------------
           LEAVE ROOM
           ------------------------------------------------------ */

        socket.on(
            "leave-room",
            () => {
                removeSocketFromRoom(
                    socket,
                    "left-room"
                );
            }
        );

        /* ------------------------------------------------------
           DISCONNECT
           ------------------------------------------------------ */

        socket.on(
            "disconnect",
            (reason) => {
                console.log(
                    `[DISCONNECT] ${socket.id} (${reason})`
                );

                removeSocketFromRoom(
                    socket,
                    "player-disconnected"
                );
            }
        );
    }
);

/* ============================================================
   ROOM CLEANUP / HOST MIGRATION
   ============================================================ */

function removeSocketFromRoom(
    socket,
    eventName
) {
    const code =
        socket.data.roomCode;

    if (!code) {
        return;
    }

    const room =
        getRoom(code);

    if (!room) {
        socket.data.roomCode =
            null;

        return;
    }

    const player =
        room.players.get(
            socket.id
        );

    room.players.delete(
        socket.id
    );

    if (
        room.playerStates
    ) {
        room.playerStates.delete(
            socket.id
        );
    }

    socket.leave(
        room.code
    );

    socket.data.roomCode =
        null;

    if (
        room.players.size === 0
    ) {
        rooms.delete(
            room.code
        );

        console.log(
            `[ROOM] Deleted empty room ${room.code}`
        );

        return;
    }

    let hostChanged =
        false;

    if (
        room.hostId ===
        socket.id
    ) {
        const nextHost =
            room.players
                .values()
                .next()
                .value;

        if (nextHost) {
            room.hostId =
                nextHost.id;

            hostChanged =
                true;

            console.log(
                `[HOST] ${room.code} migrated host to ${nextHost.name}`
            );
        }
    }

    io.to(
        room.code
    ).emit(
        eventName,
        {
            playerId:
                socket.id,

            playerName:
                player?.name ||
                "Operator",

            hostId:
                room.hostId,
        }
    );

    emitRoomUpdate(
        room
    );

    emitPlayerStateSnapshot(
        room
    );

    if (hostChanged) {
        io.to(
            room.code
        ).emit(
            "host-migrated",
            {
                hostId:
                    room.hostId,

                players:
                    serializePlayers(
                        room
                    ),

                missionState:
                    room.missionState,
            }
        );

        if (
            room.missionState
        ) {
            io.to(
                room.code
            ).emit(
                "mission-state",
                room.missionState
            );
        }
    }
}

/* ============================================================
   SERVER START
   ============================================================ */

httpServer.listen(
    PORT,
    () => {
        console.log("");

        console.log(
            "=============================================="
        );

        console.log(
            "        ARENA STRIKE MULTIPLAYER SERVER"
        );

        console.log(
            "=============================================="
        );

        console.log(
            `HTTP/WebSocket server: http://localhost:${PORT}`
        );

        console.log(
            `Health check:          http://localhost:${PORT}/health`
        );

        console.log(
            `Max players per room:  ${MAX_PLAYERS}`
        );

        console.log(
            `Leaderboard file:      ${leaderboardFile}`
        );

        console.log(
            "=============================================="
        );

        console.log("");
    }
);