import type { WeaponConfig, WeaponType } from "./types";

export const WEAPONS: Record<WeaponType, WeaponConfig> = {
  pistol: {
    name: "Pistol",
    magazineSize: 12,
    fireRate: 250,
    bulletSpeed: 10,
    bulletCount: 1,
    damage: 1,
  },

  rifle: {
    name: "Rifle",
    magazineSize: 30,
    fireRate: 90,
    bulletSpeed: 13,
    bulletCount: 1,
    damage: 1,
  },

  shotgun: {
    name: "Shotgun",
    magazineSize: 6,
    fireRate: 600,
    bulletSpeed: 9,
    bulletCount: 5,
    damage: 1,
  },
};