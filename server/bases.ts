// Базовые предметы для фильтра «тип предмета». Список расширяется правкой этого файла:
// shortname — как в Rust (см. /items в rust.wiki API). Если у предмета нет скинов, UI покажет пустой результат.
export type Group = 'weapon' | 'clothing' | 'build' | 'tool'
export interface Base { shortname: string; name: string; group: Group }
export const BASES: Base[] = [
  { shortname: 'rifle.ak', name: 'Assault Rifle (AK-47)', group: 'weapon' },
  { shortname: 'rifle.lr300', name: 'LR-300', group: 'weapon' },
  { shortname: 'rifle.m39', name: 'M39 Rifle', group: 'weapon' },
  { shortname: 'rifle.semiauto', name: 'Semi-Automatic Rifle', group: 'weapon' },
  { shortname: 'rifle.bolt', name: 'Bolt Action Rifle', group: 'weapon' },
  { shortname: 'lmg.m249', name: 'M249', group: 'weapon' },
  { shortname: 'smg.thompson', name: 'Thompson', group: 'weapon' },
  { shortname: 'smg.mp5', name: 'MP5A4', group: 'weapon' },
  { shortname: 'smg.2', name: 'Custom SMG', group: 'weapon' },
  { shortname: 'pistol.python', name: 'Python Revolver', group: 'weapon' },
  { shortname: 'pistol.revolver', name: 'Revolver', group: 'weapon' },
  { shortname: 'pistol.semiauto', name: 'Semi-Automatic Pistol', group: 'weapon' },
  { shortname: 'shotgun.pump', name: 'Pump Shotgun', group: 'weapon' },
  { shortname: 'rocket.launcher', name: 'Rocket Launcher', group: 'weapon' },
  { shortname: 'crossbow', name: 'Crossbow', group: 'weapon' },
  { shortname: 'metal.facemask', name: 'Metal Facemask', group: 'clothing' },
  { shortname: 'metal.plate.torso', name: 'Metal Chest Plate', group: 'clothing' },
  { shortname: 'roadsign.kilt', name: 'Road Sign Kilt', group: 'clothing' },
  { shortname: 'hazmatsuit', name: 'Hazmat Suit', group: 'clothing' },
  { shortname: 'door.hinged.metal', name: 'Sheet Metal Door', group: 'build' },
  { shortname: 'door.hinged.wood', name: 'Wooden Door', group: 'build' },
  { shortname: 'wall.frame.garagedoor', name: 'Garage Door', group: 'build' },
  { shortname: 'axe.salvaged', name: 'Salvaged Axe', group: 'tool' },
  { shortname: 'jackhammer', name: 'Jackhammer', group: 'tool' },
]
