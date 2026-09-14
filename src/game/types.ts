export type WeaponType = "pistol" | "rifle" | "shotgun";

export type EnemyType = "basic" | "fast" | "tank";

export interface Player {
  x: number;
  y: number;
  radius: number;
  speed: number;
  angle: number;
  health: number;

  ammo: number;
  maxAmmo: number;
  reloading: boolean;

  weapon: WeaponType;
}

export interface Bullet {
  x: number;
  y: number;

  velocityX: number;
  velocityY: number;

  radius: number;
  life: number;

  damage: number;
}

export interface Enemy {
  x: number;
  y: number;

  radius: number;
  speed: number;

  health: number;
  maxHealth: number;

  damage: number;

  type: EnemyType;
}

export interface WeaponConfig {
  name: string;

  magazineSize: number;
  fireRate: number;
  bulletSpeed: number;
  bulletCount: number;

  damage: number;
}