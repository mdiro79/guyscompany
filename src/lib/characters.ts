import list from '../../assets/characters.json';

export interface Character {
  id: string;
  name: string;
  group: 'humans' | 'monsters-a' | 'monsters-b' | 'monsters-c' | 'kaykit';
  model: string;
}

export const CHARACTERS = list as Character[];
export const DEFAULT_CHARACTER_ID = CHARACTERS[0].id;

export const getCharacter = (id: string) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
export const isCharacterId = (id: string) => CHARACTERS.some((c) => c.id === id);

// KayKit characters share animation files; flying monsters have no walk cycle and hover instead.
export const KAYKIT_ANIMATIONS = ['/models/animations/Rig_Medium_General.glb', '/models/animations/Rig_Medium_MovementBasic.glb'];
export const isFlying = (c: Character) => c.group === 'monsters-c';
export const prettyName = (c: Character) => c.name.replace(/_/g, ' ').replace(/(\d)/, ' $1');
