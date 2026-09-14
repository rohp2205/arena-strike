type ShootWeapon = "pistol" | "rifle" | "shotgun";

let audioContext: AudioContext | null = null;

let masterVolume = 0.5;
let muted = false;

function getAudioContext() {
    if (typeof window === "undefined") {
        return null;
    }

    if (!audioContext) {
        const AudioContextClass =
            window.AudioContext ||
            (window as typeof window & {
                webkitAudioContext?: typeof AudioContext;
            }).webkitAudioContext;

        if (!AudioContextClass) {
            return null;
        }

        audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
        audioContext.resume();
    }

    return audioContext;
}

function playTone(
    frequency: number,
    duration: number,
    type: OscillatorType = "sine",
    volume = 0.1,
    endFrequency?: number
) {
    if (muted) return;

    const ctx = getAudioContext();

    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = type;

    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    if (endFrequency !== undefined) {
        oscillator.frequency.exponentialRampToValueAtTime(
            Math.max(endFrequency, 1),
            ctx.currentTime + duration
        );
    }

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);

    gain.gain.exponentialRampToValueAtTime(
        Math.max(volume * masterVolume, 0.0001),
        ctx.currentTime + 0.01
    );

    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + duration
    );

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start();

    oscillator.stop(ctx.currentTime + duration + 0.02);
}

export function playShoot(weapon: ShootWeapon) {
    if (weapon === "pistol") {
        playTone(180, 0.08, "square", 0.18, 80);
        return;
    }

    if (weapon === "rifle") {
        playTone(240, 0.055, "square", 0.12, 100);
        return;
    }

    // Shotgun
    playTone(110, 0.18, "sawtooth", 0.25, 45);
}

export function playHit() {
    playTone(700, 0.045, "square", 0.08, 450);
}

export function playEnemyDeath() {
    playTone(180, 0.16, "sawtooth", 0.12, 60);
}

export function playTankDeath() {
    playTone(90, 0.35, "sawtooth", 0.18, 25);
}

export function playReload() {
    playTone(500, 0.05, "square", 0.07);

    setTimeout(() => {
        playTone(750, 0.06, "square", 0.08);
    }, 80);

    setTimeout(() => {
        playTone(1000, 0.08, "square", 0.08);
    }, 170);
}

export function playDash() {
    playTone(160, 0.18, "triangle", 0.12, 700);
}

export function playPlayerDamage() {
    playTone(120, 0.18, "sawtooth", 0.16, 55);
}

export function playWaveStart() {
    playTone(440, 0.1, "square", 0.08);

    setTimeout(() => {
        playTone(660, 0.12, "square", 0.09);
    }, 120);
}

export function playGameOver() {
    playTone(300, 0.15, "sawtooth", 0.12, 180);

    setTimeout(() => {
        playTone(180, 0.3, "sawtooth", 0.14, 60);
    }, 180);
}

export function setMuted(value: boolean) {
    muted = value;
}

export function toggleMute() {
    muted = !muted;
    return muted;
}

export function isMuted() {
    return muted;
}

export function setVolume(value: number) {
    masterVolume = Math.max(0, Math.min(1, value));
}

export function getVolume() {
    return masterVolume;
}

export function unlockAudio() {
    getAudioContext();
}

export function playPowerUp() {
    playTone(
        500,
        0.08,
        "square",
        0.1,
        900
    );

    setTimeout(() => {
        playTone(
            900,
            0.12,
            "square",
            0.1,
            1200
        );
    }, 80);
}